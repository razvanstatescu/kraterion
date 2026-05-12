import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module.js";
import { BucketsModule } from "../buckets/buckets.module.js";
import { PresignController } from "./presign.controller.js";
import { PresignService } from "./presign.service.js";

@Module({
  imports: [BucketsModule, ApiKeysModule],
  controllers: [PresignController],
  providers: [PresignService],
  // Re-export so `McpModule` (K3a) can inject `PresignService` into
  // `McpToolsService` for the read_object / write_object MCP tools.
  exports: [PresignService],
})
export class ObjectsModule {}
