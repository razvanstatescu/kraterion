import { Module } from "@nestjs/common";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { CursorRepo } from "./cursor.repo.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { DispatcherService } from "./dispatcher.service.js";
import { IndexerService } from "./indexer.service.js";
import { suiGrpcClientProvider } from "./sui-grpc.client.provider.js";
import { BucketCreatedHandler } from "./handlers/bucket-created.handler.js";
import { ObjectCreatedHandler } from "./handlers/object-created.handler.js";
import { ObjectExtendedHandler } from "./handlers/object-extended.handler.js";
import { ApiAccessHandler } from "./handlers/api-access.handler.js";
import { BucketVisibilityChangedHandler } from "./handlers/bucket-visibility.handler.js";

@Module({
  // K1: `ObjectCreatedHandler` depends on `EmbeddingsService` to enqueue
  // index jobs for objects landing in knowledge-enabled buckets.
  imports: [EmbeddingsModule],
  providers: [
    suiGrpcClientProvider,
    CursorRepo,
    DeadLetterService,
    DispatcherService,
    IndexerService,
    // Active handlers — one per indexable event type.
    BucketCreatedHandler,
    ObjectCreatedHandler,
    ObjectExtendedHandler,
    ApiAccessHandler,
    BucketVisibilityChangedHandler,
  ],
})
export class IndexerModule {}
