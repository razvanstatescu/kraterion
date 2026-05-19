import { Module } from "@nestjs/common";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { CursorRepo } from "./cursor.repo.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { DispatcherService } from "./dispatcher.service.js";
import { IndexerService } from "./indexer.service.js";
import { suiGrpcClientProvider } from "./sui-grpc.client.provider.js";
import { BucketCreatedHandler } from "./handlers/bucket-created.handler.js";
import { ApiAccessHandler } from "./handlers/api-access.handler.js";
import { BucketVisibilityChangedHandler } from "./handlers/bucket-visibility.handler.js";
import { VaultCreatedHandler } from "./handlers/vault-created.handler.js";
import { VaultRevokedHandler } from "./handlers/vault-revoked.handler.js";
import { PooledBlobRegisteredHandler } from "./handlers/pooled-blob-registered.handler.js";
import { PooledBlobCertifiedHandler } from "./handlers/pooled-blob-certified.handler.js";
import { PooledBlobDeletedHandler } from "./handlers/pooled-blob-deleted.handler.js";
import { PoolExtendedHandler } from "./handlers/pool-extended.handler.js";
import { PoolResizedHandler } from "./handlers/pool-resized.handler.js";

@Module({
  // `EmbeddingsModule` is imported so `PooledBlobRegisteredHandler` can
  // enqueue index jobs for objects landing in knowledge-enabled buckets.
  imports: [EmbeddingsModule],
  providers: [
    suiGrpcClientProvider,
    CursorRepo,
    DeadLetterService,
    DispatcherService,
    IndexerService,
    // Active handlers — one per indexable event type. 10 total:
    // 3 storage-backend-agnostic (bucket lifecycle + access) + 7 pool
    // model handlers.
    BucketCreatedHandler,
    ApiAccessHandler,
    BucketVisibilityChangedHandler,
    VaultCreatedHandler,
    VaultRevokedHandler,
    PooledBlobRegisteredHandler,
    PooledBlobCertifiedHandler,
    PooledBlobDeletedHandler,
    PoolExtendedHandler,
    PoolResizedHandler,
  ],
})
export class IndexerModule {}
