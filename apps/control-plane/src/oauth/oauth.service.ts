import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID } from "node:crypto";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyPkceS256 } from "./pkce.js";
import {
  DEFAULT_SCOPES,
  KNOWN_SCOPES,
  type AuthorizeQuery,
  type DcrRequest,
  type DcrResponse,
  type KnownScope,
  type TokenRequest,
  type TokenResponse,
} from "./oauth.types.js";

/**
 * OAuth 2.1 + DCR + Resource Indicators issuer for the MCP /mcp resource.
 *
 * Self-hosted Authorization Server (per the K3b ADR in
 * `docs/decisions.md`): we already have user identity (`Account`,
 * zkLogin) and the JWT signing infra; vendoring an AS would add a
 * dependency on the auth path that's hard to walk back.
 *
 * Token format: HS256-signed JWT, 15-min TTL, claims:
 *   - `iss` = our issuer URL
 *   - `aud` = the resource URL the client requested (RFC 8707)
 *   - `sub` = `account_id` (the consenting user)
 *   - `client_id` = the DCR-registered client_id
 *   - `project_id` = the project this grant is scoped to
 *   - `scope` = space-separated scope list
 *   - `jti` = unique token id (room for a revocation denylist later)
 *
 * Why HS256 and not EdDSA (despite the plan suggesting EdDSA):
 *   - The CP is the only verifier today (the MCP guard runs in the same
 *     process that signs). HS256 keeps the key surface tight (one
 *     secret in env, same JWT_SECRET pattern the dashboard session
 *     already uses).
 *   - Distributed verifier scenarios (a future gateway-side MCP route)
 *     are post-hackathon; swapping in an EdDSA keypair is a one-line
 *     change in `signAccessToken()`.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  private readonly issuer: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly codeTtlSeconds: number;

  /**
   * `request_id` (UUID) → stashed /authorize parameters, used to bridge
   * the dashboard consent screen. ~5 min TTL; in-memory because the
   * window is bounded and bouncing the CP between authorize and
   * decision is a "user gets bounced back to /authorize" failure mode,
   * not a destructive one. Production would back this with Redis.
   */
  private readonly authorizeRequests = new Map<
    string,
    { params: AuthorizeQuery; expires_at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.issuer = process.env["OAUTH_ISSUER"] ?? "http://localhost:4001";
    this.accessTokenTtlSeconds = 15 * 60;
    this.codeTtlSeconds = 60;
  }

  // === DCR (RFC 7591) ===========================================

  async registerClient(req: DcrRequest): Promise<DcrResponse> {
    // Generate a random URL-safe client_id. PKCE means we never issue a
    // client_secret (per MCP spec); the security comes from the
    // verifier round-trip.
    const clientId = `mcp_${randomBytes(16).toString("base64url")}`;
    const row = await this.prisma.oAuthClient.create({
      data: {
        client_id: clientId,
        ...(req.client_name ? { client_name: req.client_name } : {}),
        redirect_uris: req.redirect_uris,
      },
    });
    return {
      client_id: row.client_id,
      ...(row.client_name ? { client_name: row.client_name } : {}),
      redirect_uris: row.redirect_uris,
      client_id_issued_at: Math.floor(row.created_at.getTime() / 1000),
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    };
  }

  // === /authorize (params validation + consent-screen handoff) ===

  /**
   * Validate /authorize parameters, stash them under a `request_id`,
   * and return the dashboard consent URL. The actual decision happens
   * on the dashboard; on approve the dashboard POSTs to
   * `applyConsent()` below.
   */
  async stashAuthorizeRequest(
    params: AuthorizeQuery,
  ): Promise<{ request_id: string; client_name: string | null; scopes: KnownScope[] }> {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { client_id: params.client_id },
    });
    if (!client) {
      throw new ControlPlaneError("InvalidArgument", `Unknown client_id: ${params.client_id}`);
    }
    if (!client.redirect_uris.includes(params.redirect_uri)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `redirect_uri not registered for this client. Re-register via /oauth/register with the desired callback URL.`,
      );
    }
    const scopes = parseAndValidateScopes(params.scope);
    const requestId = randomUUID();
    this.authorizeRequests.set(requestId, {
      params,
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    this.gcAuthorizeRequests();
    return {
      request_id: requestId,
      client_name: client.client_name,
      scopes,
    };
  }

  /**
   * The consent screen has rendered, the user clicked "allow" (or
   * "deny"), the dashboard POSTed the decision with the user's CP
   * session JWT. We resolve the request, mint an authorization code,
   * and return the redirect URL the dashboard should bounce the user
   * to. (Bouncing back is the dashboard's responsibility — the
   * redirect URI is the MCP client's, not ours.)
   */
  async applyConsent(args: {
    requestId: string;
    approve: boolean;
    accountId: string;
    projectId: string;
    scopesOverride?: string[];
  }): Promise<{ redirect_uri: string }> {
    const stashed = this.authorizeRequests.get(args.requestId);
    if (!stashed) {
      throw new ControlPlaneError("NotFound", "Authorize request expired or unknown. Restart the flow.");
    }
    this.authorizeRequests.delete(args.requestId);
    if (Date.now() > stashed.expires_at) {
      throw new ControlPlaneError("NotFound", "Authorize request expired. Restart the flow.");
    }

    if (!args.approve) {
      // Per OAuth 2.1: redirect with `error=access_denied`. The MCP
      // client picks it up at its callback handler.
      const url = new URL(stashed.params.redirect_uri);
      url.searchParams.set("error", "access_denied");
      if (stashed.params.state) url.searchParams.set("state", stashed.params.state);
      return { redirect_uri: url.toString() };
    }

    const grantedScopes = args.scopesOverride
      ? args.scopesOverride.filter((s): s is KnownScope =>
          (KNOWN_SCOPES as readonly string[]).includes(s),
        )
      : parseAndValidateScopes(stashed.params.scope);
    if (grantedScopes.length === 0) {
      throw new ControlPlaneError("InvalidArgument", "No valid scopes granted.");
    }

    const code = randomBytes(32).toString("base64url");
    await this.prisma.oAuthGrant.create({
      data: {
        client_id: stashed.params.client_id,
        account_id: args.accountId,
        project_id: args.projectId,
        scopes: grantedScopes,
        code,
        code_challenge: stashed.params.code_challenge,
        resource: stashed.params.resource,
        redirect_uri: stashed.params.redirect_uri,
        expires_at: new Date(Date.now() + this.codeTtlSeconds * 1000),
      },
    });

    const url = new URL(stashed.params.redirect_uri);
    url.searchParams.set("code", code);
    if (stashed.params.state) url.searchParams.set("state", stashed.params.state);
    return { redirect_uri: url.toString() };
  }

  // === /token (code → access_token exchange) ====================

  async exchangeCode(req: TokenRequest): Promise<TokenResponse> {
    const grant = await this.prisma.oAuthGrant.findUnique({
      where: { code: req.code },
    });
    if (!grant) {
      throw new ControlPlaneError("InvalidArgument", "Unknown authorization code.");
    }
    if (grant.consumed_at) {
      // Already used — RFC 6749 §10.5 says revoke the entire grant on
      // double-spend (treat as an attack). We delete the row; the
      // attacker doesn't get a second shot.
      await this.prisma.oAuthGrant.delete({ where: { id: grant.id } });
      throw new ControlPlaneError("InvalidArgument", "Authorization code already used. Re-authorize.");
    }
    if (Date.now() > grant.expires_at.getTime()) {
      throw new ControlPlaneError("InvalidArgument", "Authorization code expired. Re-authorize.");
    }
    if (grant.client_id !== req.client_id) {
      throw new ControlPlaneError("InvalidArgument", "client_id mismatch.");
    }
    if (grant.redirect_uri !== req.redirect_uri) {
      throw new ControlPlaneError("InvalidArgument", "redirect_uri mismatch.");
    }
    if (req.resource && req.resource !== grant.resource) {
      // RFC 8707 — the token's `aud` must match the resource the
      // grant was for. Most clients omit `resource` at /token time
      // (it was already pinned at /authorize); but if they include
      // one, it must match.
      throw new ControlPlaneError("InvalidArgument", "resource mismatch with grant.");
    }
    if (!verifyPkceS256(req.code_verifier, grant.code_challenge)) {
      throw new ControlPlaneError("InvalidArgument", "PKCE verifier does not match challenge.");
    }

    // Mark consumed before signing — small race window in which the
    // sign throws and the grant is consumed-but-no-token. Acceptable
    // — the client just re-authorizes. The alternative (sign first,
    // mark consumed second) lets a fast re-submit get two tokens.
    await this.prisma.oAuthGrant.update({
      where: { id: grant.id },
      data: { consumed_at: new Date() },
    });
    await this.prisma.oAuthClient.update({
      where: { client_id: grant.client_id },
      data: { last_used_at: new Date() },
    });

    const accessToken = await this.signAccessToken({
      sub: grant.account_id,
      aud: grant.resource,
      client_id: grant.client_id,
      project_id: grant.project_id,
      scopes: grant.scopes,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: this.accessTokenTtlSeconds,
      scope: grant.scopes.join(" "),
    };
  }

  // === Token verification (consumed by mcp.auth.guard.ts) ========

  /**
   * Verifier for the MCP auth guard. Returns the parsed JWT payload
   * if signature + `aud` + `exp` check out; throws otherwise. The
   * caller maps `aud` against the live `/mcp` URL to enforce RFC 8707.
   */
  async verifyAccessToken(token: string, expectedAudience: string): Promise<{
    sub: string;
    aud: string;
    project_id: string;
    client_id: string;
    scope: string;
    exp: number;
  }> {
    const payload = await this.jwt.verifyAsync<{
      sub: string;
      aud: string | string[];
      project_id?: string;
      client_id?: string;
      scope?: string;
      iss?: string;
      typ?: string;
      exp: number;
    }>(token, { audience: expectedAudience, issuer: this.issuer });
    if (payload.typ !== "kraterion.mcp+jwt") {
      throw new Error("Unexpected token type");
    }
    if (!payload.project_id || !payload.client_id || !payload.scope) {
      throw new Error("OAuth access token missing required claims");
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0]! : payload.aud;
    return {
      sub: payload.sub,
      aud,
      project_id: payload.project_id,
      client_id: payload.client_id,
      scope: payload.scope,
      exp: payload.exp,
    };
  }

  // === Discovery (RFC 9728 + RFC 8414) ===========================

  getProtectedResourceMetadata(resource: string): Record<string, unknown> {
    return {
      resource,
      authorization_servers: [this.issuer],
      // We accept tokens via the standard `Authorization: Bearer ...`
      // header. RFC 9728 lets us list query-string tokens too — we
      // intentionally don't so token values can't end up in proxy
      // logs.
      bearer_methods_supported: ["header"],
      scopes_supported: [...KNOWN_SCOPES],
    };
  }

  getAuthorizationServerMetadata(): Record<string, unknown> {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth/authorize`,
      token_endpoint: `${this.issuer}/oauth/token`,
      registration_endpoint: `${this.issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      // PKCE S256 only; we reject `plain` (see `pkce.ts`).
      code_challenge_methods_supported: ["S256"],
      // Public clients per MCP spec — PKCE replaces client_secret.
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...KNOWN_SCOPES],
    };
  }

  /**
   * Read-only snapshot of a stashed /authorize request for the
   * dashboard consent screen. Does NOT consume the stash — the
   * decision POST does that.
   */
  async peekAuthorizeRequest(requestId: string): Promise<{
    client_id: string;
    client_name: string | null;
    redirect_uri: string;
    scopes: string[];
    resource: string;
  } | null> {
    const stashed = this.authorizeRequests.get(requestId);
    if (!stashed) return null;
    if (Date.now() > stashed.expires_at) {
      this.authorizeRequests.delete(requestId);
      return null;
    }
    const client = await this.prisma.oAuthClient.findUnique({
      where: { client_id: stashed.params.client_id },
    });
    return {
      client_id: stashed.params.client_id,
      client_name: client?.client_name ?? null,
      redirect_uri: stashed.params.redirect_uri,
      scopes: parseAndValidateScopes(stashed.params.scope),
      resource: stashed.params.resource,
    };
  }

  // === Internals =================================================

  private async signAccessToken(args: {
    sub: string;
    aud: string;
    client_id: string;
    project_id: string;
    scopes: string[];
  }): Promise<string> {
    // `expiresIn` overrides the AuthCoreModule default (7d session
    // JWTs) — OAuth access tokens are short-lived.
    return this.jwt.signAsync(
      {
        sub: args.sub,
        aud: args.aud,
        iss: this.issuer,
        // `typ` distinguishes OAuth access tokens from the dashboard
        // session JWTs (both signed with the same JWT_SECRET).
        typ: "kraterion.mcp+jwt",
        client_id: args.client_id,
        project_id: args.project_id,
        scope: args.scopes.join(" "),
      },
      { expiresIn: this.accessTokenTtlSeconds },
    );
  }

  /**
   * Sweep stale stashed /authorize requests. Cheap O(n) — n is
   * bounded by the simultaneously-in-flight consent screens, which
   * never gets large.
   */
  private gcAuthorizeRequests(): void {
    const now = Date.now();
    for (const [id, entry] of this.authorizeRequests) {
      if (now > entry.expires_at) this.authorizeRequests.delete(id);
    }
  }
}

function parseAndValidateScopes(scope: string | undefined): KnownScope[] {
  if (!scope) return DEFAULT_SCOPES;
  const tokens = scope.split(/\s+/).filter(Boolean);
  const out: KnownScope[] = [];
  for (const t of tokens) {
    if ((KNOWN_SCOPES as readonly string[]).includes(t)) {
      out.push(t as KnownScope);
    } else {
      throw new ControlPlaneError("InvalidArgument", `Unsupported scope: ${t}`);
    }
  }
  return out.length > 0 ? out : DEFAULT_SCOPES;
}
