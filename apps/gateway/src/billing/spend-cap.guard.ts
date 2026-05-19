import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

/**
 * B1 scaffold for the spend-cap enforcement that ships in B6.
 *
 * Today the guard:
 *   1. Reads `entitlements:{project_id}` from Redis (set by the
 *      hourly entitlements recompute, not yet implemented — so the key
 *      is always absent in B1 and the guard short-circuits to allow).
 *   2. Logs a one-time warning when it would have blocked, so we can
 *      see the enforcement footprint without breaking real traffic.
 *
 * The guard is wired but inert. In B6 we'll:
 *   - Switch the `allow` default to a `S3Error` 507/429 with
 *     `X-Kraterion-Reason: spend_cap` header.
 *   - Add the hourly worker that writes the entitlements cache.
 *
 * Mounted globally in `main.ts` — runs after SigV4 so it can read
 * `req.kraterion.identity.projectId` without re-parsing auth.
 */
@Injectable()
export class SpendCapGuard implements CanActivate {
  private readonly logger = new Logger(SpendCapGuard.name);
  private readonly enforce = process.env["KRATERION_SPEND_CAP_ENFORCE"] === "true";

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const projectId = req.kraterion?.identity.projectId;
    if (!projectId) return true; // not yet authenticated; let the auth guard handle it

    const raw = await this.redis.get(`entitlements:${projectId}`).catch(() => null);
    if (!raw) return true; // no cache → no decision yet (entitlements worker lands in B6)

    let state: { over_hard_cap?: boolean } | null = null;
    try {
      state = JSON.parse(raw);
    } catch {
      return true; // bad payload, fail open in scaffold mode
    }

    if (state?.over_hard_cap) {
      if (this.enforce) {
        // B6 will replace this with a thrown S3Error.
        this.logger.warn(
          `would-block: project=${projectId} method=${req.method} url=${req.url} (KRATERION_SPEND_CAP_ENFORCE=true)`,
        );
        return false;
      }
      this.logger.debug(
        `would-block: project=${projectId} method=${req.method} url=${req.url} (scaffold; not enforcing)`,
      );
    }
    return true;
  }
}
