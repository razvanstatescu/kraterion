import { Global, Inject, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

/** Injection token for the shared `ioredis` instance. */
export const REDIS = Symbol("REDIS");

/**
 * Worker-side `ioredis`. Same construction shape as the gateway's
 * `apps/gateway/src/redis/redis.module.ts` — duplication kept until a
 * post-K0 follow-up promotes both to a shared workspace package.
 *
 * The worker uses Redis for two things:
 *   1. Seal SessionKey cache (via `@kraterion/seal-client`).
 *   2. BullMQ queues (`@nestjs/bullmq` + the `kraterion-embeddings`
 *      queue). BullMQ requires `maxRetriesPerRequest: null` for its
 *      blocking subscriber connection, but only on the queue's
 *      dedicated client — *this* singleton stays bounded for the
 *      caching workload.
 *
 * Eager connect: fail-fast at boot if Redis is unreachable.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        const client = new Redis(url, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          reconnectOnError: (err) => err.message.includes("READONLY"),
        });
        client.on("error", (err) => {
          new Logger("Redis").error(err.message);
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log("Redis disconnected");
  }
}
