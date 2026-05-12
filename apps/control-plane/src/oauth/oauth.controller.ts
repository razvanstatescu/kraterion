import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { McpScope } from "../mcp/mcp.types.js";
import { parseBody, parseQuery } from "../validation/zod-pipe.js";
import { OAuthService } from "./oauth.service.js";
import {
  authorizeQuerySchema,
  consentDecisionSchema,
  dcrRequestSchema,
  tokenRequestSchema,
  type AuthorizeQuery,
  type ConsentDecision,
  type DcrRequest,
  type TokenRequest,
} from "./oauth.types.js";

/**
 * OAuth 2.1 endpoints serving the MCP `/mcp` resource (K3b).
 *
 * Endpoints:
 *   - `POST /oauth/register`           — RFC 7591 Dynamic Client Registration.
 *                                        Anonymous, no UI.
 *   - `GET  /oauth/authorize`          — Validates params, stashes the
 *                                        request, redirects to the
 *                                        dashboard consent screen.
 *   - `POST /oauth/authorize/decision` — Dashboard posts the consent
 *                                        result here with the user's
 *                                        CP session JWT. Returns the
 *                                        client's redirect URL.
 *   - `POST /oauth/token`              — Authorization code → access
 *                                        token. PKCE verifier checked.
 *
 * Discovery (RFC 9728 + RFC 8414):
 *   - `GET /.well-known/oauth-protected-resource`
 *   - `GET /.well-known/oauth-authorization-server`
 *
 * The dashboard consent page is `apps/dashboard/src/app/(app)/oauth/consent/page.tsx`.
 */
@Controller()
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly prisma: PrismaService,
  ) {}

  // === Discovery ================================================

  /**
   * RFC 9728: a protected resource publishes its authorization server
   * URL here so an unauthenticated client can find the OAuth flow.
   * The MCP guard's 401 response links to this URL via
   * `WWW-Authenticate: Bearer resource_metadata=...`.
   */
  @Get(".well-known/oauth-protected-resource")
  protectedResourceMetadata(@Req() req: FastifyRequest) {
    const resource = `${baseUrlFromRequest(req)}/mcp`;
    return this.oauth.getProtectedResourceMetadata(resource);
  }

  /**
   * RFC 8414: the authorization server publishes its endpoints +
   * supported parameters. MCP clients fetch this once after DCR to
   * locate `/authorize` and `/token`.
   */
  @Get(".well-known/oauth-authorization-server")
  authorizationServerMetadata() {
    return this.oauth.getAuthorizationServerMetadata();
  }

  // === DCR (RFC 7591) ===========================================

  @Post("oauth/register")
  @HttpCode(201)
  async register(@Body(parseBody(dcrRequestSchema)) dto: DcrRequest) {
    return this.oauth.registerClient(dto);
  }

  // === Authorization flow =======================================

  /**
   * Step 1 of the flow. Validate the OAuth params, stash them under
   * an opaque `request_id`, and redirect the browser to the dashboard
   * consent page. The dashboard reads `request_id` from the URL and
   * fetches the request details via `GET /oauth/authorize/state` (so
   * a tampered URL still hits validated state).
   */
  @Get("oauth/authorize")
  async authorize(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
    @Query(parseQuery(authorizeQuerySchema)) dto: AuthorizeQuery,
  ) {
    const { request_id } = await this.oauth.stashAuthorizeRequest(dto);
    const dashboardOrigin = process.env["DASHBOARD_ORIGIN"] ?? "http://localhost:3001";
    const consentUrl = new URL(`${dashboardOrigin}/oauth/consent`);
    consentUrl.searchParams.set("request_id", request_id);
    void reply.redirect(consentUrl.toString(), 302);
    void req; // route inspector marker
  }

  /**
   * Step 1.5 — the dashboard consent page fetches the stashed
   * request's display fields (client_name, requested scopes) before
   * showing the consent UI. This route requires the CP session
   * cookie/JWT so an attacker can't enumerate request_ids.
   */
  @Get("oauth/authorize/state")
  @UseGuards(AuthGuard)
  async authorizeState(
    @Req() req: FastifyRequest,
    @Query("request_id") requestId: string,
  ) {
    requireUser(req);
    if (!requestId || requestId.length < 8) {
      throw new ControlPlaneError("InvalidArgument", "Missing or malformed request_id.");
    }
    // We round-trip through the service so the stale-window check
    // happens here too — but we DON'T consume the stash; the decision
    // post does that.
    // For now, peek directly via a service-level helper if you'd rather
    // not expose the map. We expose just enough metadata:
    const peeked = await this.peek(requestId);
    if (!peeked) {
      throw new ControlPlaneError("NotFound", "Authorize request not found or expired.");
    }
    return peeked;
  }

  /**
   * Step 2. Dashboard posts the user's decision; CP issues the auth
   * code and returns the URL the dashboard should bounce the user to.
   */
  @Post("oauth/authorize/decision")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async decision(
    @Req() req: FastifyRequest,
    @Body(parseBody(consentDecisionSchema)) dto: ConsentDecision,
  ) {
    const user = requireUser(req);
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      include: { projects: { orderBy: { created_at: "asc" }, take: 1 } },
    });
    if (!account || account.projects.length === 0) {
      throw new ControlPlaneError("NotFound", "User has no project to scope the grant to.");
    }
    const project = account.projects[0]!;
    return this.oauth.applyConsent({
      requestId: dto.request_id,
      approve: dto.approve,
      accountId: account.id,
      projectId: project.id,
      ...(dto.scopes ? { scopesOverride: dto.scopes } : {}),
    });
  }

  // === /token ===================================================

  /**
   * Code → access_token exchange. PKCE verifier checked.
   *
   * MCP clients post `application/x-www-form-urlencoded` by default
   * (OAuth 2.1 §4.1.3). We register a Fastify parser for that in
   * `main.ts`; the parsed body lands in `dto` as a plain object.
   */
  @Post("oauth/token")
  @HttpCode(200)
  async token(@Body(parseBody(tokenRequestSchema)) dto: TokenRequest) {
    return this.oauth.exchangeCode(dto);
  }

  // === Management API (signed-in dashboard only) ================
  //
  // These power the Settings → Connected agents card. Listing is
  // O(grants for this account) which is bounded by the number of
  // MCP clients the user has ever consented to (~tens).

  /**
   * Lists every OAuth client that has at least one grant belonging to
   * the signed-in account, with the union of granted scopes, the most
   * recent consent timestamp, and the client's `last_used_at` from the
   * token endpoint. Used by the dashboard to render "Connected
   * agents".
   */
  @Get("v1/oauth/clients")
  @UseGuards(AuthGuard)
  async listClients(@Req() req: FastifyRequest) {
    const user = requireUser(req);
    const grants = await this.prisma.oAuthGrant.findMany({
      where: { account_id: user.accountId },
      orderBy: { created_at: "desc" },
      select: {
        client_id: true,
        scopes: true,
        resource: true,
        created_at: true,
      },
    });
    if (grants.length === 0) return { clients: [] };

    const clientIds = Array.from(new Set(grants.map((g) => g.client_id)));
    const clients = await this.prisma.oAuthClient.findMany({
      where: { client_id: { in: clientIds } },
      select: {
        client_id: true,
        client_name: true,
        created_at: true,
        last_used_at: true,
      },
    });
    const byClient = new Map(clients.map((c) => [c.client_id, c]));

    const grouped = new Map<
      string,
      {
        client_id: string;
        client_name: string | null;
        resource: string;
        scopes: McpScope[];
        last_consent_at: string;
        last_used_at: string | null;
        first_seen_at: string;
        grant_count: number;
      }
    >();
    for (const g of grants) {
      const meta = byClient.get(g.client_id);
      const entry = grouped.get(g.client_id);
      const scopeSet = new Set<string>(entry?.scopes ?? []);
      for (const s of g.scopes) scopeSet.add(s);
      const scopes = Array.from(scopeSet) as McpScope[];
      const created = g.created_at.toISOString();
      if (!entry) {
        grouped.set(g.client_id, {
          client_id: g.client_id,
          client_name: meta?.client_name ?? null,
          resource: g.resource,
          scopes,
          last_consent_at: created,
          last_used_at: meta?.last_used_at ? meta.last_used_at.toISOString() : null,
          first_seen_at: meta?.created_at.toISOString() ?? created,
          grant_count: 1,
        });
      } else {
        entry.scopes = scopes;
        entry.grant_count += 1;
      }
    }
    return { clients: Array.from(grouped.values()) };
  }

  /**
   * Disconnect a client from this account. Deletes the OAuthGrant rows
   * for (account × client) so the next /authorize request goes through
   * a fresh consent screen. Does NOT invalidate any access tokens
   * already issued — those are bearer JWTs, valid until `exp` (15 min).
   * A Redis denylist is the right durable revoke; tracked as a K3b
   * follow-up in `docs/decisions.md`.
   */
  @Delete("v1/oauth/clients/:clientId/grants")
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async revokeClient(
    @Req() req: FastifyRequest,
    @Param("clientId") clientId: string,
  ) {
    const user = requireUser(req);
    if (!clientId || clientId.length < 4) {
      throw new ControlPlaneError("InvalidArgument", "Missing or malformed client_id.");
    }
    const res = await this.prisma.oAuthGrant.deleteMany({
      where: { account_id: user.accountId, client_id: clientId },
    });
    return {
      client_id: clientId,
      grants_deleted: res.count,
      // Be honest about what's still alive.
      tokens_remain_valid_until_exp: true,
    };
  }

  // === Helpers ==================================================

  /**
   * Snapshot of the stashed /authorize request. Exposes only the
   * fields the consent UI needs to render. Implementation is here
   * (not on the service) so the in-memory stash stays private.
   */
  private async peek(requestId: string): Promise<{
    client_id: string;
    client_name: string | null;
    redirect_uri: string;
    scopes: string[];
    resource: string;
  } | null> {
    // Re-resolve via the service. We re-implement a tiny peek-only
    // helper rather than mutate the stash.
    const result = await this.oauth.peekAuthorizeRequest(requestId);
    return result;
  }
}

/**
 * Derive the resource URL from the request — supports localhost and
 * production behind a reverse proxy. `x-forwarded-*` headers are
 * trusted because the gateway/dashboard are deployed behind the same
 * load balancer; in production make sure your proxy strips client-set
 * variants.
 */
function baseUrlFromRequest(req: FastifyRequest): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    (req.headers["host"] as string | undefined) ??
    "localhost:4001";
  return `${proto}://${host}`;
}
