import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import {
  SESSION_ARCHIVE_QUEUE,
  SessionArchiveService,
} from "./session-archive.service.js";
import { SessionArchiveProcessor } from "./session-archive.processor.js";
import { SessionSweeperService } from "./session-sweeper.service.js";

/**
 * P9 — Replayable Agent Runs (worker side).
 *
 * Owns the `kraterion-session-archive` BullMQ queue: a sweeper (D5)
 * enqueues a job when an AgentSession goes idle / hits a cap / is
 * force-ended; the processor (D4) runs the Seal+Walrus+Sui anchor
 * sequence.
 *
 * BullMQ shares the `RedisModule` factory via `BullModule.forRoot` —
 * mirrors `EmbeddingsModule`. The BullMQ blocking-subscriber
 * requirement (`maxRetriesPerRequest: null`) is satisfied by the
 * dedicated connection it creates, not the shared cache client.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: SESSION_ARCHIVE_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 14 * 24 * 60 * 60 },
      },
    }),
  ],
  providers: [SessionArchiveService, SessionArchiveProcessor, SessionSweeperService],
  exports: [SessionArchiveService],
})
export class SessionsModule {}
