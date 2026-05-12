"use client";

/**
 * Browser-side Seal flow — implements the dashboard path of plan §7.5.
 *
 * The gateway can't read your private files after API revocation. This
 * module exists so you can: the browser pulls ciphertext directly from
 * the public Walrus aggregator, then decrypts with a SessionKey the
 * user signed via zkLogin. Seal's threshold key servers approve the
 * release because the user is the bucket owner — not the platform.
 *
 * What this is NOT: a port of `@kraterion/seal-client`. That package is
 * server-side (Redis cache, Sui keypair signers). Here the cache is
 * `sessionStorage` and the signer is a React hook callback returning
 * `{ signature: string }`.
 *
 * SessionKey TTL: the Seal SDK enforces a 30-min ceiling
 * (`session-key.mjs` line 79). We take 25 min to leave room for clock
 * skew, matching the server-side cache window.
 */

import { SealClient, SessionKey, type ExportedSessionKey } from "@mysten/seal";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { access } from "@kraterion/kraterion-move-sdk";
import {
  KRATERION_PACKAGE_ID,
  SEAL_AGGREGATOR_URL,
  SEAL_KEY_SERVERS,
} from "@kraterion/shared";
import { env } from "./env";
import type { BucketJson, S3ObjectJson } from "./api";

const SESSION_KEY_TTL_MIN = 25;
const SESSION_STORAGE_PREFIX = "kraterion.seal.session.";

/**
 * `useSuiClient()` from dApp Kit returns a `SuiJsonRpcClient`, which is
 * structurally compatible with Seal's `SealCompatibleClient` type
 * (`ClientWithExtensions<{ core: CoreClient }>`).
 */
export type SealSuiClient = SuiJsonRpcClient;

/**
 * Async callback that signs a personal-message payload — typically wired
 * straight to dApp Kit's `useSignPersonalMessage().mutateAsync`. Returning
 * just the signature string keeps the contract minimal.
 */
export type SignPersonalMessage = (message: Uint8Array) => Promise<{ signature: string }>;

let _sealClient: { client: SealClient; suiClientRef: SealSuiClient } | null = null;

/**
 * Memoized `SealClient` keyed on the `SuiClient` instance reference.
 * dApp Kit usually hands us the same client across renders, but if the
 * provider remounts we transparently rebuild rather than miss the
 * network swap.
 */
export function getSealClient(suiClient: SealSuiClient): SealClient {
  if (_sealClient && _sealClient.suiClientRef === suiClient) {
    return _sealClient.client;
  }
  const client = new SealClient({
    suiClient,
    serverConfigs: SEAL_KEY_SERVERS.map((s) => ({
      objectId: s.objectId,
      weight: s.weight,
      aggregatorUrl: SEAL_AGGREGATOR_URL,
    })),
    verifyKeyServers: false,
  });
  _sealClient = { client, suiClientRef: suiClient };
  return client;
}

interface SessionKeyDeps {
  accountAddress: string;
  suiClient: SealSuiClient;
  signPersonalMessage: SignPersonalMessage;
}

/**
 * Returns a fresh-or-cached `SessionKey` scoped to KRATERION_PACKAGE_ID.
 *
 * Cache strategy: `sessionStorage` keyed by Sui address. The exported
 * payload contains the ephemeral Ed25519 secret + the personal-message
 * signature; same sensitivity as the JWT we already store in
 * `localStorage`, scoped to the current tab and gone on sign-out.
 *
 * On cache miss or expiry the user gets a wallet prompt to sign the
 * Seal personal message — Enoki's zkLogin signer handles it without a
 * popup if the OAuth session is still valid.
 */
export async function getOrCreateSessionKey(deps: SessionKeyDeps): Promise<SessionKey> {
  const cacheKey = SESSION_STORAGE_PREFIX + deps.accountAddress.toLowerCase();
  const cached = readCachedSession(cacheKey);
  if (cached) {
    try {
      const restored = SessionKey.import(cached, deps.suiClient);
      if (!restored.isExpired() && restored.getAddress() === deps.accountAddress) {
        return restored;
      }
    } catch {
      // Corrupted cache entry — drop it and fall through to fresh creation.
    }
    clearCachedSession(cacheKey);
  }

  const sessionKey = await SessionKey.create({
    address: deps.accountAddress,
    packageId: KRATERION_PACKAGE_ID,
    ttlMin: SESSION_KEY_TTL_MIN,
    suiClient: deps.suiClient,
  });
  const personalMessage = sessionKey.getPersonalMessage();
  const { signature } = await deps.signPersonalMessage(personalMessage);
  await sessionKey.setPersonalMessageSignature(signature);

  writeCachedSession(cacheKey, sessionKey);
  return sessionKey;
}

function readCachedSession(cacheKey: string): ExportedSessionKey | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(cacheKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExportedSessionKey;
  } catch {
    return null;
  }
}

function clearCachedSession(cacheKey: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(cacheKey);
}

/**
 * Persist the SessionKey for later restoration in this tab. The SDK
 * blocks `toJSON` on its export to discourage accidental network
 * serialization; we pluck the fields explicitly so `JSON.stringify`
 * doesn't trip the guard. Same pattern as the server-side wrapper.
 */
function writeCachedSession(cacheKey: string, sessionKey: SessionKey): void {
  if (typeof window === "undefined") return;
  const exported = sessionKey.export();
  // Drop undefined keys so `JSON.stringify` produces a minimal blob and
  // the parsed shape doesn't carry undefined-typed fields that the
  // SDK's `import` doesn't expect.
  const serializable: Record<string, unknown> = {
    address: exported.address,
    packageId: exported.packageId,
    creationTimeMs: exported.creationTimeMs,
    ttlMin: exported.ttlMin,
    sessionKey: exported.sessionKey,
  };
  if (exported.personalMessageSignature) {
    serializable["personalMessageSignature"] = exported.personalMessageSignature;
  }
  if (exported.mvrName) {
    serializable["mvrName"] = exported.mvrName;
  }
  window.sessionStorage.setItem(cacheKey, JSON.stringify(serializable));
}

/**
 * Fetch ciphertext for a Walrus blob from the public aggregator. No
 * auth, no SigV4, no gateway involvement — the aggregator is publicly
 * readable HTTP and the bytes are Seal-encrypted anyway.
 */
export async function fetchWalrusCiphertext(blobId: string): Promise<Uint8Array> {
  const url = `${env.walrusAggregatorUrl}/v1/blobs/${blobId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Walrus aggregator can't find this blob (${blobId}). It may not have propagated yet.`
        : `Walrus aggregator returned ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Build the `seal_approve` PTB with the user's address as sender. Seal
 * dry-runs this against the live chain; the entry function asserts
 * `caller == bucket.owner || caller in api_decryption_addresses`. The
 * user is the bucket owner, so approval flows even when the platform's
 * sub-wallet has been removed.
 *
 * `setSender` is mandatory: without it, the SDK builds a PTB with a
 * zero-address sender and key servers return `NoAccessError`.
 */
async function buildSealApprovePtb(
  suiClient: SealSuiClient,
  accountAddress: string,
  object: S3ObjectJson,
  bucket: BucketJson,
): Promise<Uint8Array> {
  const sealIdentity = fromBase64(object.seal_identity_b64);
  const tx = new Transaction();
  tx.add(
    access.sealApprove({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        id: Array.from(sealIdentity),
        bucket: bucket.kraterion_bucket_object_id,
      },
    }),
  );
  tx.setSender(accountAddress);
  return tx.build({ client: suiClient, onlyTransactionKind: true });
}

/**
 * End-to-end: fetch ciphertext from Walrus, build the PTB, ask Seal to
 * release the symmetric key, run AES-GCM, return plaintext.
 *
 * Throws on any failure. Callers should surface a friendly toast — Seal
 * errors typically mean the on-chain ACL doesn't grant the caller (or
 * the bucket was put into a state the SDK doesn't know how to handle).
 */
export async function decryptObjectInBrowser(args: {
  suiClient: SealSuiClient;
  accountAddress: string;
  signPersonalMessage: SignPersonalMessage;
  object: S3ObjectJson;
  bucket: BucketJson;
}): Promise<Uint8Array> {
  const sessionKey = await getOrCreateSessionKey({
    accountAddress: args.accountAddress,
    suiClient: args.suiClient,
    signPersonalMessage: args.signPersonalMessage,
  });
  const [encrypted, txBytes] = await Promise.all([
    fetchWalrusCiphertext(args.object.walrus_blob_id),
    buildSealApprovePtb(args.suiClient, args.accountAddress, args.object, args.bucket),
  ]);
  const sealClient = getSealClient(args.suiClient);
  return sealClient.decrypt({ data: encrypted, sessionKey, txBytes });
}
