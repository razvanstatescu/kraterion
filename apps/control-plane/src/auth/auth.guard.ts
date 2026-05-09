import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { cpAuthFailuresTotal } from "../metrics.js";
import { TokensService } from "./tokens.service.js";

/**
 * Bearer JWT guard. Reads `Authorization: Bearer <token>` (cookie fallback
 * left for a future phase). Verifies via `TokensService` and stows the
 * resolved identity on `req.user` so controllers can pull it via
 * `requireUser(req)`.
 *
 * Failure modes — every one increments `cp_auth_failures_total{reason}`:
 *   - missing-header
 *   - malformed-header
 *   - invalid-token (caught inside TokensService.verify)
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  canActivate(ctx: ExecutionContext): boolean {
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

    try {
      req.user = this.tokens.verify(token);
    } catch (err) {
      cpAuthFailuresTotal.inc({ reason: "invalid-token" });
      throw err;
    }
    return true;
  }
}
