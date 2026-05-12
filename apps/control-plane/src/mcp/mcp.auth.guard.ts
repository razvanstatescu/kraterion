import { Injectable, Logger } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { OAuthService } from "../oauth/oauth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { McpPrincipal, McpScope } from "./mcp.types.js";

/**
 * Pluggable MCP auth guard.
 *
 * K3a implements only the **bearer/API-key** branch. The `eyJ`-prefixed
 * detection + OAuth-JWT branch is wired in K3b without touching tool
 * handlers (per `docs/ai-features-plan.md` §6.4.0 — same guard, two
 * resolution paths, one `McpPrincipal` contract).
 *
 * Why not a Nest `@UseGuards(...)` decorator on the controller:
 *
 *   The MCP Streamable HTTP transport hijacks the
 *   request/response cycle inside `handleRequest(req, res)` —
 *   Nest's interceptor pipeline never sees the JSON-RPC envelope.
 *   So this guard is invoked **manually** at the top of
 *   `POST /mcp` before the transport gets the request. On failure
 *   we write a `401 WWW-Authenticate: Bearer realm="kraterion-mcp"`
 *   response ourselves (K3b extends with `resource_metadata=...`).
 *
 * Bearer format: `<AKIA>:<secret>`. We pick AKIA-prefixed because:
 *   - existing Kraterion API keys already render as that pair in the
 *     dashboard's keys page,
 *   - AKIA is uniquely indexed on `ApiKey.access_key_id` so the
 *     lookup is O(1) — no scan,
 *   - the secret is in a uniformly-wrapped DB column, unwrap +
 *     `timingSafeEqual` is the same pattern the SigV4 verifier uses.
 *
 * A cleaner "single-token" variant (just the secret, with an HMAC
 * fingerprint column on `ApiKey` for O(1) lookup) is a follow-up; the
 * AKIA-prefixed form is fine for hackathon scope and matches what the
 * dashboard already shows the user.
 */
@Injectable()
export class McpAuthGuard {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrapping: KeyWrappingService,
    private readonly oauth: OAuthService,
  ) {}

  /**
   * Resolve the principal for an MCP request, or return null if the
   * `Authorization` header is missing / malformed / invalid.
   *
   * Dispatch:
   *   - JWT (`eyJ`-prefixed) → K3b OAuth branch. Validates signature,
   *     `aud` against the live MCP URL (RFC 8707), and `exp`.
   *   - Anything else → K3a API-key branch (`<AKIA>:<secret>`).
   *
   * Returning null instead of throwing keeps the controller's 401
   * response handling in one place (auth guard branch in the
   * controller's `handle()` early-return).
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
    // `eyJ`. Detection is cheap; if the parse / verify fails we
    // return null and the controller serves 401.
    if (token.startsWith("eyJ") && token.split(".").length === 3) {
      return this.authenticateOAuth(token, expectedAudience);
    }
    return this.authenticateApiKey(token);
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

  private async authenticateApiKey(token: string): Promise<McpPrincipal | null> {
    const colon = token.indexOf(":");
    if (colon < 0) {
      this.logger.debug("bearer token missing AKIA:secret separator");
      return null;
    }
    const akia = token.slice(0, colon);
    const presented = token.slice(colon + 1);
    if (!akia || !presented) return null;

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { access_key_id: akia },
      include: {
        project: {
          select: {
            id: true,
            account_id: true,
            account: { select: { status: true } },
          },
        },
      },
    });
    if (!apiKey || apiKey.revoked_at !== null) {
      this.logger.debug(`unknown or revoked AKIA: ${akia}`);
      return null;
    }
    if (apiKey.project.account.status !== "active") {
      // Cancel-subscription (twist 1) flips status to "cancelled". The
      // MCP surface must follow the same "account is over" semantics as
      // the gateway's SDK paths — without this, connected agents keep
      // working until the API key is manually revoked.
      this.logger.debug(
        `API-key auth: account ${apiKey.project.account_id} is ${apiKey.project.account.status}`,
      );
      return null;
    }

    let actualSecret: string;
    try {
      actualSecret = this.keyWrapping.unwrap(apiKey.secret_wrapped).toString("utf8");
    } catch (err) {
      this.logger.error(`secret unwrap failed for ${akia}: ${(err as Error).message}`);
      return null;
    }

    const presentedBuf = Buffer.from(presented, "utf8");
    const actualBuf = Buffer.from(actualSecret, "utf8");
    if (
      presentedBuf.length !== actualBuf.length ||
      !timingSafeEqual(presentedBuf, actualBuf)
    ) {
      this.logger.debug(`secret mismatch for ${akia}`);
      return null;
    }

    return {
      account_id: apiKey.project.account_id,
      project_id: apiKey.project.id,
      api_key_id: apiKey.id,
      scopes: ["mcp:*"],
    };
  }

  /**
   * Single-row lookup on `Account.status`. Called from both auth
   * branches so cancel-subscription (twist 1) cuts MCP access too — not
   * just gateway SDK access. Fail-closed on missing or non-"active"
   * accounts.
   *
   * Cost: one indexed PK lookup per MCP request. At hackathon traffic
   * this is sub-millisecond. If MCP load grows past low-100s req/s, the
   * right fix is a 30-second Redis cache keyed by `account:<id>:status`
   * with invalidation on the cancel-subscription endpoint.
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
