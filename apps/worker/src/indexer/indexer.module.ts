import { Module } from "@nestjs/common";
import { CursorRepo } from "./cursor.repo.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { DispatcherService } from "./dispatcher.service.js";
import { IndexerService } from "./indexer.service.js";
import { suiGrpcClientProvider } from "./sui-grpc.client.provider.js";
import { BucketCreatedHandler } from "./handlers/bucket-created.handler.js";

@Module({
  providers: [
    suiGrpcClientProvider,
    CursorRepo,
    DeadLetterService,
    DispatcherService,
    IndexerService,
    BucketCreatedHandler,
  ],
})
export class IndexerModule {}
