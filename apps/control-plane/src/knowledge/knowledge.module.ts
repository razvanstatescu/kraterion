import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { BucketsModule } from "../buckets/buckets.module.js";
import { EMBEDDINGS_QUEUE_NAME } from "./embeddings-queue.constants.js";
import { KnowledgeController } from "./knowledge.controller.js";
import { KnowledgeService } from "./knowledge.service.js";

/**
 * K2 module. Owns:
 *   - `KnowledgeService` (hybrid retrieval).
 *   - `KnowledgeController` (`/`, `/search`, `/ask` endpoints).
 *   - A BullMQ producer client for the `kraterion-embeddings` queue,
 *     used by the enable endpoint to backfill existing objects. The
 *     processor stays on the worker — this side is producer-only.
 */
@Module({
  imports: [
    BucketsModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
          // BullMQ requires this for the blocking subscriber. We don't
          // run a subscriber here (CP is producer-only) but the global
          // BullMQ connection contract still expects the value.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({
      name: EMBEDDINGS_QUEUE_NAME,
    }),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
