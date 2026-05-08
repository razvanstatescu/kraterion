/**
 * Wrapper around `@mysten/seal` configured with the testnet
 * Decentralized Committee key server. One trust unit from the SDK's
 * perspective; internally a 3-of-5 threshold across geo-distributed
 * operators (Mysten + Natsai + Overclock + NodeInfra + Ruby Nodes).
 *
 * What this package owns:
 *   - SealClient construction with the right key-server config
 *     (committee mode requires `aggregatorUrl`)
 *   - SessionKey lifecycle + Redis caching (the SDK's `SessionKey` exposes
 *     `create()`, `import()`, `export()` but no built-in persistence)
 *
 * What this package does NOT do (use SDK directly via `getSealClient()`):
 *   - encrypt / decrypt — call `client.encrypt({ packageId, id, threshold,
 *     data })` and `client.decrypt({ data, sessionKey, txBytes })` directly.
 *     `id` must be a hex string; convert a 48-byte identity with
 *     `toHex(...)` from `@mysten/sui/utils`.
 *   - generate the gateway's signer keypair (bootstrap script's job)
 *   - construct the `seal_approve` PTB (caller does that with the move-sdk)
 */

import { SealClient, SessionKey, type ExportedSessionKey } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";
import {
  KRATERION_PACKAGE_ID,
  SEAL_AGGREGATOR_URL,
  SEAL_KEY_SERVERS,
  SUI_TESTNET_RPC,
} from "@kraterion/shared";
import type { Redis } from "ioredis";

const SESSION_KEY_TTL_MIN = 25; // 5 min skew under Seal's 30-min ceiling (SDK 1.1)
const SESSION_KEY_REDIS_PREFIX = "seal:session:";

let _suiClient: SuiJsonRpcClient | null = null;
let _sealClient: SealClient | null = null;

function getSuiClientForSeal(): SuiJsonRpcClient {
  if (!_suiClient) {
    _suiClient = new SuiJsonRpcClient({ network: "testnet", url: SUI_TESTNET_RPC });
  }
  return _suiClient;
}

/**
 * Memoized SealClient against the decentralized testnet committee.
 * `aggregatorUrl` is required for committee-mode servers; without it the
 * SDK rejects fetchKeys with `InvalidKeyServerError`.
 */
export function getSealClient(): SealClient {
  if (!_sealClient) {
    _sealClient = new SealClient({
      suiClient: getSuiClientForSeal(),
      serverConfigs: SEAL_KEY_SERVERS.map((s) => ({
        objectId: s.objectId,
        weight: s.weight,
        aggregatorUrl: SEAL_AGGREGATOR_URL,
      })),
      verifyKeyServers: false, // testnet — fast startup; flip to true for mainnet
    });
  }
  return _sealClient;
}

/**
 * Get a SessionKey for `accountKey`, creating one if there isn't a fresh
 * cached value in Redis. The TTL on the Redis entry matches the
 * SessionKey's own TTL (25 min) so cache eviction matches Seal-side
 * expiry and we never serve a SessionKey that Seal will reject.
 *
 * `accountKey` is the cache namespace (e.g. `"gateway"` for the shared
 * gateway keypair, or `"account:${accountId}"` once we move to per-
 * account keys post-hackathon).
 *
 * `signer` must be the Sui keypair whose address is approved by
 * `seal_approve` for the buckets we'll decrypt — for the gateway, this
 * is the gateway's `api_decryption` keypair (the address present in
 * every bucket's `api_decryption_addresses` list).
 *
 * The first call signs the SessionKey's personal message via `signer`
 * and stores the exported representation in Redis. Subsequent calls
 * within the TTL window restore from Redis without re-signing.
 *
 * Note on serialization: `SessionKey.export()` returns an object whose
 * `toJSON` is hard-blocked by the SDK to prevent accidental leakage in
 * browser contexts. We pluck the fields manually so `JSON.stringify`
 * works. The exported `sessionKey` field contains secret material — no
 * more sensitive than the gateway's keypair seed already in Postgres,
 * so Redis on the trusted gateway host is an acceptable storage tier.
 */
export async function getOrCreateSessionKey(opts: {
  accountKey: string;
  signer: Signer;
  redis: Redis;
}): Promise<SessionKey> {
  const cacheKey = `${SESSION_KEY_REDIS_PREFIX}${opts.accountKey}`;
  const suiClient = getSuiClientForSeal();

  const cached = await opts.redis.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as ExportedSessionKey;
      const restored = SessionKey.import(parsed, suiClient, opts.signer);
      if (!restored.isExpired()) {
        return restored;
      }
      // Expired (clock skew or near-edge); fall through to create a fresh one.
    } catch {
      // Corrupted entry — drop and recreate.
      await opts.redis.del(cacheKey);
    }
  }

  // Create a new SessionKey. The constructor doesn't sign; we sign the
  // personal message with `signer` then attach the signature.
  const sessionKey = await SessionKey.create({
    address: opts.signer.toSuiAddress(),
    packageId: KRATERION_PACKAGE_ID,
    ttlMin: SESSION_KEY_TTL_MIN,
    suiClient,
    signer: opts.signer,
  });
  const personalMessage = sessionKey.getPersonalMessage();
  const { signature } = await opts.signer.signPersonalMessage(personalMessage);
  await sessionKey.setPersonalMessageSignature(signature);

  // Bypass the SDK's `toJSON` block by extracting fields manually.
  const exported = sessionKey.export();
  const serializable: ExportedSessionKey = {
    address: exported.address,
    packageId: exported.packageId,
    creationTimeMs: exported.creationTimeMs,
    ttlMin: exported.ttlMin,
    sessionKey: exported.sessionKey,
    ...(exported.mvrName !== undefined && { mvrName: exported.mvrName }),
    ...(exported.personalMessageSignature !== undefined && {
      personalMessageSignature: exported.personalMessageSignature,
    }),
  };
  await opts.redis.setex(cacheKey, SESSION_KEY_TTL_MIN * 60, JSON.stringify(serializable));
  return sessionKey;
}

export { SessionKey, SealClient };
export type { ExportedSessionKey };
