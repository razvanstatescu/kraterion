/**
 * Wrapper around `@mysten/walrus` configured with Kraterion's
 * Architecture-D defaults: SDK + Mysten public testnet upload-relay +
 * public testnet aggregator.
 *
 * Why this package exists rather than apps importing `@mysten/walrus`
 * directly: every consumer needs the same `WalrusClient` config (network,
 * relay host, tip cap), the same SuiClient, and the same way to compute
 * a few Walrus quantities the SDK doesn't expose publicly. Centralizing
 * the construction keeps that consistent and makes a future
 * "swap to mainnet" a one-line change.
 *
 * What this package does NOT do:
 *   - encryption (`@kraterion/seal-client`)
 *   - on-chain auth (`@kraterion/kraterion-move-sdk`)
 *   - retry policy across relay failures (caller's concern)
 *   - re-export of every WalrusClient method (use the client directly via
 *     `getWalrusClient()` for anything that's a 1:1 pass-through —
 *     `encodeBlob`, `computeBlobMetadata`, `writeBlobToUploadRelay`,
 *     `certifyBlob`, `sendUploadRelayTip`, etc.)
 */

import { WalrusClient } from "@mysten/walrus";
import { bcs } from "@mysten/sui/bcs";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  SUI_TESTNET_RPC,
  WALRUS_AGGREGATOR_URL,
  WALRUS_UPLOAD_RELAY_URL,
} from "@kraterion/shared";

let _suiClient: SuiJsonRpcClient | null = null;
let _walrusClient: WalrusClient | null = null;

/** Memoized SuiClient pointed at testnet. */
export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    _suiClient = new SuiJsonRpcClient({ network: "testnet", url: SUI_TESTNET_RPC });
  }
  return _suiClient;
}

/**
 * Memoized WalrusClient configured for testnet, pointed at the public
 * upload-relay. The Mysten public testnet relay REQUIRES a tip; we cap
 * it at ~0.01 WAL (10_000_000 MIST) per upload — well above current
 * actual tip costs. The caller pays the tip via
 * `client.sendUploadRelayTip(...)` composed into the same PTB as
 * `register_blob_for_bucket`.
 */
export function getWalrusClient(): WalrusClient {
  if (!_walrusClient) {
    _walrusClient = new WalrusClient({
      network: "testnet",
      suiClient: getSuiClient(),
      uploadRelay: {
        host: WALRUS_UPLOAD_RELAY_URL,
        sendTip: { max: 10_000_000 },
      },
    });
  }
  return _walrusClient;
}

/**
 * Read raw blob bytes from the public Walrus testnet aggregator over
 * HTTP. Deliberately *not* using `client.readBlob()` — the SDK method
 * does storage-node fanout (decode primary slivers + quorum logic),
 * which costs the gateway hundreds of outbound requests per read. The
 * aggregator is a single HTTP GET. For our case (encrypted blobs that
 * are no more sensitive in transit than at rest) this is the right
 * trade-off.
 *
 * @returns the raw bytes the caller hands to `seal-client.decrypt`.
 */
export async function readBlobByBlobId(
  blobId: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const url = `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(
      `Walrus aggregator returned ${res.status} for blob ${blobId}: ${await res.text().catch(() => "")}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Convert a 32-byte root hash (`Uint8Array`, returned by
 * `client.computeBlobMetadata().rootHash`) into a BigInt for passing
 * as `u256` to our Move calls. Uses BCS little-endian decoding to match
 * Walrus's on-chain convention.
 *
 * The Walrus SDK doesn't export an equivalent helper. Track upstream
 * for future inclusion: https://github.com/MystenLabs/ts-sdks
 */
export function rootHashBytesToU256(rootHash: Uint8Array): bigint {
  if (rootHash.length !== 32) {
    throw new Error(`Expected 32-byte root hash; got ${rootHash.length}.`);
  }
  return BigInt(bcs.u256().parse(rootHash));
}

/**
 * Compute the encoded blob length for RS2 — the number of bytes Walrus
 * actually allocates for storage given an unencoded blob of `size` bytes
 * and a committee with `nShards` shards. Mirrors the SDK's internal
 * `encodedBlobLength` (used inside `client.storageCost()` and
 * `client.registerBlob()` — but not exported). Required when we build
 * our own register PTB via `kraterion::register_blob_for_bucket` instead
 * of letting the SDK build it.
 *
 * Use `(await getWalrusClient().systemState()).committee.n_shards` to
 * source the current `nShards`.
 */
export function getEncodedBlobLength(unencodedLength: number, nShards: number): number {
  const DIGEST_LEN = 32;
  const BLOB_ID_LEN = 32;
  const maxFaulty = Math.floor((nShards - 1) / 3);
  const minCorrect = nShards - maxFaulty;
  // Conservative safety limit; matches what we observed against testnet
  // (1000 shards). Surfaces as `EResourceSize` abort if wrong.
  const safetyLimit = 0;
  const primarySymbols = minCorrect - maxFaulty - safetyLimit;
  const secondarySymbols = minCorrect - safetyLimit;
  let symbolSize =
    Math.floor((Math.max(unencodedLength, 1) - 1) / (primarySymbols * secondarySymbols)) + 1;
  if (symbolSize % 2 === 1) symbolSize += 1; // RS2 requires even symbol sizes
  const sliverSize = (primarySymbols + secondarySymbols) * symbolSize * nShards;
  return nShards * (nShards * DIGEST_LEN * 2 + BLOB_ID_LEN) + sliverSize;
}

// === Re-exports of public SDK helpers callers will want ===

/**
 * Re-exported from `@mysten/walrus`. Converts a Walrus URL-safe-base64
 * blobId string to a BigInt for use as a `u256` Move argument.
 */
export { blobIdToInt as blobIdStringToU256 } from "@mysten/walrus";

export type { WalrusClient };
