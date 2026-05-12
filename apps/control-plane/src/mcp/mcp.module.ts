import { Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { BucketsModule } from "../buckets/buckets.module.js";
import { KnowledgeModule } from "../knowledge/knowledge.module.js";
import { ObjectsModule } from "../objects/presign.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { McpAuthGuard } from "./mcp.auth.guard.js";
import { McpController } from "./mcp.controller.js";
import { McpToolsService } from "./mcp.tools.js";

/**
 * MCP host module (K3a).
 *
 * Imports the services the tools call:
 *   - `BucketsModule` — bucket + object listings, ownership checks.
 *   - `KnowledgeModule` — `KnowledgeService` (hybrid retrieval +
 *     `KnowledgeQuery` audit row writer).
 *   - `ObjectsModule` — `PresignService` for read/write_object
 *     gateway-proxied I/O.
 *
 * `KeyWrappingService` is registered locally (the same pattern
 * `api-keys.module.ts` uses) — it's just an `EnvKeyWrapper`
 * thin-wrapper, no DI dependencies of its own, so providing it
 * per-module is fine.
 *
 * The `McpAuthGuard` is provided here rather than `@Global` because
 * it's only consumed by the MCP controller; K3b will extend the same
 * guard with the OAuth JWT branch.
 */
@Module({
  imports: [BucketsModule, KnowledgeModule, ObjectsModule, OAuthModule],
  providers: [KeyWrappingService, McpAuthGuard, McpToolsService],
  controllers: [McpController],
})
export class McpModule {}
