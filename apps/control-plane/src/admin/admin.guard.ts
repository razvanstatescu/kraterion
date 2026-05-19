/**
 * Admin gate for the `/admin/*` routes. Sits BEHIND the regular
 * `AuthGuard` — the request must already have a valid
 * `SessionPrincipal` attached. We then check the session email against
 * the comma-separated `ADMIN_EMAILS` env var.
 *
 * Why email and not on-chain role: the testnet build has no on-chain
 * admin object; admin is "ops team", not "user with a special token".
 * Email matches the existing session-auth identity surface and lets
 * ops keys land via the same zkLogin flow as everyone else. Mainnet
 * may swap this for a Move-level cap; the guard interface stays
 * stable.
 *
 * If `ADMIN_EMAILS` is unset, the guard refuses ALL admin requests
 * with 403 — safer default than allowing anyone or implicitly
 * granting the first signed-in user.
 *
 * `kr_live_*` / `kr_test_*` bearer tokens are rejected: admin
 * operations affect platform state, not a single project, and
 * bearer tokens lack the human-user identity to attribute the action.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { principalIsSession } from "../auth/principal.js";

const ADMIN_EMAILS_ENV = "ADMIN_EMAILS";

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private readonly allowed: Set<string>;

  constructor() {
    const raw = process.env[ADMIN_EMAILS_ENV] ?? "";
    this.allowed = new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    if (this.allowed.size === 0) {
      this.logger.warn(
        `${ADMIN_EMAILS_ENV} is empty — all /admin/* requests will be rejected.`,
      );
    } else {
      this.logger.log(
        `Admin allowlist loaded with ${this.allowed.size} email${this.allowed.size === 1 ? "" : "s"}.`,
      );
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & {
      principal?: { kind: string; email?: string };
    }>();
    const principal = req.principal;
    if (!principal) {
      throw new ForbiddenException("Admin endpoint requires authentication.");
    }
    if (!principalIsSession(principal as never)) {
      throw new ForbiddenException(
        "Admin endpoint requires a session credential (bearer tokens not accepted).",
      );
    }
    const email = principal.email?.toLowerCase();
    if (!email || !this.allowed.has(email)) {
      this.logger.warn(`Admin access denied for email=${email ?? "(none)"}`);
      throw new ForbiddenException("Email not on the admin allowlist.");
    }
    return true;
  }
}
