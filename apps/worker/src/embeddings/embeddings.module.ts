import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { EmbeddingsProcessor } from "./embeddings.processor.js";
import { EmbeddingsService, EMBEDDINGS_QUEUE } from "./embeddings.service.js";

/**
 * BullMQ-backed embedding pipeline.
 *
 * The queue's BullMQ connection is configured here once; the processor
 * (`EmbeddingsProcessor`) uses the same `{REDIS}` singleton for its
 * own ioredis client implicitly via `@nestjs/bullmq`'s default
 * registration. BullMQ requires its blocking subscriber connection to
 * have `maxRetriesPerRequest: null`; we let `@nestjs/bullmq` create a
 * dedicated client for the worker so our shared cache client (in
 * `RedisModule`) can keep its tighter retry bounds.
 *
 * Re-exports `EmbeddingsService` so the indexer module can call
 * `maybeEnqueue` from its `ObjectCreatedHandler` without re-importing
 * Bull plumbing.
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
          // BullMQ requirement for its blocking subscriber.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({
      name: EMBEDDINGS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 14 * 24 * 60 * 60 },
      },
    }),
  ],
  providers: [EmbeddingsService, EmbeddingsProcessor],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
