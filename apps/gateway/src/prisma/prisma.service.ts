import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient as a Nest provider. Extends the client directly so callers
 * inject `PrismaService` and use the full Prisma API.
 *
 * Lifecycle:
 *   - `onModuleInit`: open the connection pool (fail-fast at boot).
 *   - `onModuleDestroy`: drain and close. Wired up by `app.enableShutdownHooks()`
 *     in `main.ts` — without that, container stop leaks connections.
 *
 * Pool sizing: configured via `?connection_limit=...&pool_timeout=...` on
 * `DATABASE_URL` in `.env`. Defaults are `connection_limit=40,
 * pool_timeout=20`. Tune up for higher gateway RPS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Eagerly warm the pool, but DON'T make boot fatal on failure. During
    // a rolling deploy the previous (still-running) instances can briefly
    // hold every DB connection slot; a fatal $connect would crash the new
    // container before the old ones drain, deadlocking the rollout (and
    // its rollback). Prisma connects lazily on first query and /health is
    // DB-free, so the container goes healthy and connects once slots free.
    try {
      await this.$connect();
      this.logger.log("Prisma connected");
    } catch (err) {
      this.logger.warn(
        `Prisma eager connect failed (${(err as Error).message}); ` +
          "will connect lazily on first query",
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma disconnected");
  }
}
