import { Global, Module } from "@nestjs/common";
import { MemwalService } from "./memwal.service.js";

/** P9 Feature 3 — single MemWal client pool shared by the agent tools.
 *  Global so the agents module (and any future MCP shim) can inject the
 *  service without re-exporting through every consumer. */
@Global()
@Module({
  providers: [MemwalService],
  exports: [MemwalService],
})
export class MemwalModule {}
