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
    await this.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma disconnected");
  }
}
