import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module.js";
import { BucketsModule } from "../buckets/buckets.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { ObjectsModule } from "../objects/presign.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { ProvidersModule } from "../providers/providers.module.js";
import { McpAuthGuard } from "./mcp.auth.guard.js";
import { McpController } from "./mcp.controller.js";
import { McpToolsService } from "./mcp.tools.js";

/**
 * MCP host module.
 *
 * Imports the services the tools call:
 *   - `BucketsModule` — bucket + object listings, ownership checks.
 *   - `KnowledgeModule` — `KnowledgeService` (hybrid retrieval +
 *     `KnowledgeQuery` audit row writer).
 *   - `ObjectsModule` — `PresignService` for read/write_object
 *     gateway-proxied I/O.
 *
 * `McpAuthGuard` resolves principals via the globally-exported
 * `BearerResolver` (`AuthCoreModule`) and `OAuthService`; the legacy
 * `<AKIA>:<secret>` colon-format is gone.
 */
@Module({
  imports: [
    BucketsModule,
    KnowledgeModule,
    ObjectsModule,
    OAuthModule,
    ProvidersModule,
    AgentsModule,
  ],
  providers: [McpAuthGuard, McpToolsService],
  controllers: [McpController],
})
export class McpModule {}
