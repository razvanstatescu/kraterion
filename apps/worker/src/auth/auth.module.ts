import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { KeyWrappingService } from "./key-wrapping.service.js";
import { KnowledgeIndexerKeypairService } from "./knowledge-indexer-keypair.service.js";

/**
 * Worker auth module. Owns the `knowledge_indexer` keypair lifecycle
 * and the master-key wrapper that decodes the persisted seed.
 *
 * Imported by `AppModule` and re-exported so the upcoming K1
 * `EmbeddingsModule` can inject `KnowledgeIndexerKeypairService` to
 * build SessionKeys without re-importing PrismaModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [KeyWrappingService, KnowledgeIndexerKeypairService],
  exports: [KeyWrappingService, KnowledgeIndexerKeypairService],
})
export class AuthModule {}
