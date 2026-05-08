import { Global, Inject, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

/** Injection token for the shared `ioredis` instance. */
export const REDIS = Symbol("REDIS");

/**
 * Single shared `ioredis` connection used by:
 *   - `seal-client`'s SessionKey cache
 *   - SigV4 nonce-replay protection (Phase 3b, future)
 *   - any future feature that needs Redis
 *
 * One client per process is enough for the gateway. If we add BullMQ
 * blocking commands later (renewal worker), they need their OWN client
 * (not this one) so cache traffic isn't starved.
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
