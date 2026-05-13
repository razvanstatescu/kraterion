import { Injectable, Logger } from "@nestjs/common";
import { BearerResolver } from "../auth/bearer-resolver.js";
import { OAuthService } from "../oauth/oauth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { McpPrincipal, McpScope } from "./mcp.types.js";

/**
 * Pluggable MCP auth guard.
 *
 * Two resolution paths, one `McpPrincipal` contract — tool handlers
 * never branch on which path produced the principal:
 *
 *   1. **OAuth 2.1 + PKCE (RFC 6749 / 7591 / 9728)**. Caller sends an
 *      `eyJ`-prefixed JWT minted by `/oauth/token`. We validate the
 *      signature + `aud` (RFC 8707) + `exp`. The granted scope list is
 *      taken verbatim from the JWT. This is the path the MCP spec
 *      mandates for remote servers and the one Claude Desktop / Cursor
 *      use via DCR + browser-consent.
 *
 *   2. **Bearer API token (`kr_live_…` / `kr_test_…`)**. Caller sends an
 *      opaque token minted by the dashboard. The same `BearerResolver`
 *      that powers the control plane's CRUD auth resolves it here, so
 *      one token works across CRUD, agent chat, knowledge, and MCP.
 *
 * The legacy `<AKIA>:<secret>` colon-format (K3a, pre-2026-05-13) is
 * gone — S3 access keys never reach this guard. See `docs/decisions.md`
 * for the rationale (drop the colon-format; unify on prefixed bearer
 * tokens à la Stripe/OpenAI/Anthropic).
 *
 * Why not a Nest `@UseGuards(...)` decorator on the controller: the MCP
 * Streamable HTTP transport hijacks the request/response cycle inside
 * `handleRequest(req, res)`, so Nest's interceptor pipeline never sees
 * the JSON-RPC envelope. This guard is invoked manually at the top of
 * `POST /mcp`; on failure the controller writes a
 * `401 WWW-Authenticate: Bearer realm="kraterion-mcp"` directly.
 */
@Injectable()
export class McpAuthGuard {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: OAuthService,
    private readonly bearer: BearerResolver,
  ) {}

  /**
   * Resolve the principal for an MCP request, or return null if the
   * `Authorization` header is missing / malformed / invalid.
   *
   * Returning null instead of throwing keeps the controller's 401
   * response handling in one place.
   */
  async authenticate(
    authorizationHeader: string | undefined,
    expectedAudience: string,
  ): Promise<McpPrincipal | null> {
    if (!authorizationHeader) return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
    if (!match) return null;
    const token = match[1]!.trim();
    if (!token) return null;

    // JWTs always start with the base64url of `{"alg":...}` which is
    // `eyJ`. Detection is cheap; if parse / verify fails we return null
    // and the controller serves 401.
    if (token.startsWith("eyJ") && token.split(".").length === 3) {
      return this.authenticateOAuth(token, expectedAudience);
    }
    return this.authenticateBearer(token);
  }

  private async authenticateOAuth(
    token: string,
    expectedAudience: string,
  ): Promise<McpPrincipal | null> {
    try {
      const payload = await this.oauth.verifyAccessToken(token, expectedAudience);
      const scopes = parseScopes(payload.scope);
      if (scopes.length === 0) return null;
      if (!(await this.isAccountActive(payload.sub))) {
        this.logger.debug(`OAuth token: account ${payload.sub} is not active`);
        return null;
      }
      return {
        account_id: payload.sub,
        project_id: payload.project_id,
        user_id: payload.sub,
        scopes,
      };
    } catch (err) {
      this.logger.debug(`OAuth token invalid: ${(err as Error).message}`);
      return null;
    }
  }

  private async authenticateBearer(token: string): Promise<McpPrincipal | null> {
    const resolved = await this.bearer.resolve(token);
    if (!resolved) return null;
    // Bearer tokens currently mint with empty `scopes` (full project
    // access); we map that to ['mcp:*'] so `principalSatisfies` keeps
    // working unchanged. When per-key scoping ships, narrow this to
    // the intersection of granted scopes ∩ KNOWN_MCP_SCOPES.
    const scopes: McpScope[] =
      resolved.scopes.length === 0
        ? ["mcp:*"]
        : resolved.scopes.filter((s): s is McpScope =>
            KNOWN_MCP_SCOPES.has(s as McpScope),
          );
    if (scopes.length === 0) return null;
    return {
      account_id: resolved.accountId,
      project_id: resolved.projectId,
      api_key_id: resolved.apiKeyId,
      scopes,
    };
  }

  /**
   * Single-row lookup on `Account.status`. Called from the OAuth path
   * so cancel-subscription cuts MCP access too. The bearer path already
   * checks account status inside `BearerResolver.resolve`.
   */
  private async isAccountActive(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { status: true },
    });
    return account?.status === "active";
  }
}

const KNOWN_MCP_SCOPES: ReadonlySet<McpScope> = new Set([
  "mcp:read",
  "mcp:write",
  "mcp:ask",
  "mcp:*",
]);

function parseScopes(scope: string | undefined): McpScope[] {
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .filter((s): s is McpScope => KNOWN_MCP_SCOPES.has(s as McpScope));
}
