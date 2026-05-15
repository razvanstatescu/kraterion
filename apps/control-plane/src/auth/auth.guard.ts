import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { looksLikeBearer } from "../api-keys/bearer.js";
import { looksLikeShareToken } from "../agents/share-token.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { cpAuthFailuresTotal } from "../metrics.js";
import { BearerResolver } from "./bearer-resolver.js";
import { ShareTokenResolver } from "./share-token-resolver.js";
import { TokensService } from "./tokens.service.js";

/**
 * Unified bearer guard. Accepts either:
 *   - a session JWT minted by `/v1/auth/dev-sign-in` (browser dashboard),
 *   - a `kr_live_…` / `kr_test_…` token minted via the dashboard "API
 *     tokens" page (scripts, CI, third-party agents).
 *
 * On success the guard populates `req.principal` with the unified union
 * and, for session auth, also stows `req.user` so legacy `requireUser`
 * call-sites keep working without changes. Bearer-authenticated requests
 * leave `req.user` undefined; routes that need a real human (account
 * settings, key minting, OAuth consent) call `requireUser` and reject
 * bearer auth implicitly.
 *
 * Failure modes — every one increments `cp_auth_failures_total{reason}`:
 *   - missing-header
 *   - malformed-header
 *   - invalid-token (session JWT verification failed)
 *   - invalid-bearer (kr_* token didn't resolve)
 *   - unknown-scheme (didn't match JWT or kr_* shape)
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly bearer: BearerResolver,
    private readonly shareTokens: ShareTokenResolver,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers["authorization"];
    if (!header || typeof header !== "string") {
      cpAuthFailuresTotal.inc({ reason: "missing-header" });
      throw new ControlPlaneError("Unauthorized", "Missing Authorization header");
    }
    const [scheme, token] = header.split(" ", 2);
    if (scheme !== "Bearer" || !token) {
      cpAuthFailuresTotal.inc({ reason: "malformed-header" });
      throw new ControlPlaneError("Unauthorized", "Malformed Authorization header", {
        expected: "Bearer <token>",
      });
    }

    // JWT path — heuristic on the JWS header prefix. Anything else falls
    // through to the bearer-token branch.
    if (token.startsWith("eyJ")) {
      try {
        const verified = this.tokens.verify(token);
        req.user = verified;
        req.principal = {
          kind: "session",
          accountId: verified.accountId,
          email: verified.email,
          suiAddress: verified.suiAddress,
        };
        return true;
      } catch (err) {
        cpAuthFailuresTotal.inc({ reason: "invalid-token" });
        throw err;
      }
    }

    if (looksLikeShareToken(token)) {
      // P6 — embed widget. The principal authorizes ONLY the agent
      // chat endpoint; non-chat handlers branch on `principal.kind`
      // and refuse this kind (same posture as `requireUser` rejecting
      // api-key principals).
      const resolved = await this.shareTokens.resolve(token);
      if (!resolved) {
        cpAuthFailuresTotal.inc({ reason: "invalid-share-token" });
        throw new ControlPlaneError("Unauthorized", "Invalid or revoked share token");
      }
      req.principal = resolved;
      return true;
    }

    if (looksLikeBearer(token)) {
      const resolved = await this.bearer.resolve(token);
      if (!resolved) {
        cpAuthFailuresTotal.inc({ reason: "invalid-bearer" });
        throw new ControlPlaneError("Unauthorized", "Invalid or revoked API token");
      }
      req.principal = resolved;
      return true;
    }

    cpAuthFailuresTotal.inc({ reason: "unknown-scheme" });
    throw new ControlPlaneError("Unauthorized", "Unrecognized credential format");
  }
}
