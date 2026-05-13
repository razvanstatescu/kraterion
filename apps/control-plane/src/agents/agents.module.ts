import { Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { BucketsModule } from "../buckets/buckets.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ProvidersModule } from "../providers/providers.module.js";
import { AgentsController } from "./agents.controller.js";
import { AgentsService } from "./agents.service.js";

/**
 * P3 — First-class Agents resource.
 *
 * Owns CRUD for `KraterionAgent`, sub-wallet provisioning at create
 * time, and the OpenAI Chat-Completions-compatible
 * `/v1/agents/:id/chat/completions` endpoint. Inherits Knowledge
 * retrieval via `KnowledgeModule`, decryption-credential gating via
 * `ProvidersModule`, and bucket ownership via `BucketsModule`.
 */
@Module({
  imports: [BucketsModule, KnowledgeModule, ProvidersModule],
  providers: [AgentsService, ProjectsService, KeyWrappingService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
