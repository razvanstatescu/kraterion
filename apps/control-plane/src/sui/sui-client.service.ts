import { Injectable } from "@nestjs/common";
import { getSuiClient } from "@kraterion/walrus-client";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

/**
 * Nest-injectable wrapper around the workspace-shared `getSuiClient()`.
 * Exists so controllers/services can DI it; we don't recreate the
 * underlying client per request — it's memoized inside `@kraterion/walrus-client`.
 *
 * The control plane uses this for read-only queries (look up bucket
 * version refs at PTB-build time, sanity-check ownership) and never to
 * sign or submit — every on-chain mutation in Phase 3 is built unsigned
 * and handed to the dashboard wallet.
 */
@Injectable()
export class SuiClientService {
  private readonly client: SuiJsonRpcClient = getSuiClient();

  get(): SuiJsonRpcClient {
    return this.client;
  }
}
