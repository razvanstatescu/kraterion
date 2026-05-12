import { Module } from "@nestjs/common";
import { BucketsModule } from "../buckets/buckets.module.js";
import { KnowledgeController } from "./knowledge.controller.js";

/**
 * K1 stub module. Only ships the `KnowledgeBucketSettings` toggle —
 * K2 will fold `/search` and `/ask` into the same controller.
 */
@Module({
  imports: [BucketsModule],
  controllers: [KnowledgeController],
})
export class KnowledgeModule {}
