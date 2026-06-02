import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module.js";
import { SuiClientModule } from "../sui/sui-client.module.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

/**
 * P9 — Replayable Agent Runs (control-plane).
 *
 * Owns the `/v1/runs/:txDigest/replay` endpoint. Depends on:
 *   - `SuiClientModule` for `OperatorKeypairService` — the
 *     `api_decryption` sub-wallet that signs the SessionKey used to
 *     decrypt trace blobs.
 *   - `ProvidersModule` for `ProviderCredentialService` — the
 *     project's OpenAI key used at replay time to re-issue captured
 *     turns. Same `useDecrypted` pattern the chat endpoint uses.
 */
@Module({
  imports: [SuiClientModule, ProvidersModule],
  providers: [RunsService],
  controllers: [RunsController],
  exports: [RunsService],
})
export class RunsModule {}
