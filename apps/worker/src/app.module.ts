import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { EmbeddingsModule } from "./embeddings/embeddings.module.js";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { IndexerModule } from "./indexer/indexer.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { SessionsModule } from "./sessions/sessions.module.js";

@Module({
  // - AuthModule loads the `knowledge_indexer` SubWallet at boot.
  // - RedisModule is `@Global` and provides the shared `ioredis` for
  //   Seal SessionKey caching + anything else that needs cache state.
  // - EmbeddingsModule owns the BullMQ queue + processor; its service
  //   is consumed by `ObjectCreatedHandler` to enqueue on new objects.
  // - IndexerModule (the gRPC checkpoint reader) imports
  //   `EmbeddingsModule` via its own module imports so the handler can
  //   call `EmbeddingsService.maybeEnqueue(...)`.
  // - SessionsModule (P9): owns the session-archive BullMQ queue +
  //   processor. The sweeper module (D5) imports SessionsModule to call
  //   `SessionArchiveService.enqueue(...)` on idle sessions.
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    EmbeddingsModule,
    IndexerModule,
    SessionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
