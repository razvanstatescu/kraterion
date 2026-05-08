import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Same shape as `apps/gateway/src/prisma/prisma.service.ts` —
 * `OnModuleInit` connects, `OnModuleDestroy` disconnects, wired to
 * `app.enableShutdownHooks()` in `main.ts`.
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
