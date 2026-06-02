import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { BucketsModule } from "../buckets/buckets.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { ObjectsModule } from "../objects/presign.module.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ProvidersModule } from "../providers/providers.module.js";
import { SuiClientModule } from "../sui/sui-client.module.js";
import { AgentsController } from "./agents.controller.js";
import { AgentsService } from "./agents.service.js";
import { SessionService } from "./session.service.js";
import { SESSION_ARCHIVE_QUEUE } from "./session-archive-queue.constants.js";
import { ShareTokensService } from "./share-tokens.service.js";
import { ShareTokenUsageService } from "./share-token-usage.js";
import { AgentToolRegistry } from "./tools/registry.js";

/**
 * P3 + P4 — Agents resource with tool dispatch.
 *
 * Owns CRUD for `KraterionAgent`, sub-wallet provisioning at create
 * time, the OpenAI Chat-Completions-compatible `/chat/completions`
 * endpoint, and the built-in tool registry. Tool handlers reuse the
 * same services the dashboard's REST routes call (BucketsService,
 * KnowledgeService, PresignService) so tool execution is byte-equivalent
 * with direct API hits — revocation, audit, knowledge gating all apply.
 *
 * `AgentToolRegistry` is exported so the MCP module can dispatch
 * through the same catalog (one source, two callers).
 */
@Module({
  imports: [
    BucketsModule,
    KnowledgeModule,
    ObjectsModule,
    ProvidersModule,
    SuiClientModule,
    // P9 — producer-only Bull connection to the worker's
    // `kraterion-session-archive` queue. Used by the
    // `POST /v1/agents/:agentId/sessions/:sid/end` force-flush endpoint
    // so users (or SDK middleware) can anchor a session immediately
    // without waiting for the worker's 60s idle sweep.
    BullModule.registerQueue({ name: SESSION_ARCHIVE_QUEUE }),
  ],
  providers: [
    AgentsService,
    ProjectsService,
    KeyWrappingService,
    AgentToolRegistry,
    SessionService,
    ShareTokenUsageService,
    ShareTokensService,
  ],
  controllers: [AgentsController],
  exports: [AgentsService, AgentToolRegistry, SessionService, ShareTokenUsageService],
})
export class AgentsModule {}
