import { Global, Inject, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

/** Injection token for the shared `ioredis` instance — same shape as
 *  the gateway's `redis.module.ts` so processors that read Redis
 *  counters written by the gateway can `@Inject(REDIS)` the
 *  conventional way. */
export const REDIS = Symbol("REDIS");

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
