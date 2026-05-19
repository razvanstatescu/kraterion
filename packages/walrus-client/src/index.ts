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

// === Storage pool pricing helpers (Phase B — see /docs/storage-pool-migration.md) ===

/**
 * Walrus's smallest storage-unit size — every blob's encoded length is
 * rounded UP to a whole multiple of this when computing storage cost.
 * Mirrors `walrus::system_state_inner::BYTES_PER_UNIT_SIZE` (1 MiB).
 */
const BYTES_PER_UNIT_SIZE = 1024 * 1024;

/**
 * Storage price per MiB per epoch on Walrus testnet v3. Read off the
 * deployed System object's inner state via the testnet smoke (2026-05-18):
 * `storage_price_per_unit_size = 1446`. Governance-set; pegged to
 * $0.023/GB-month via the storage-node price vote. Re-confirm with the
 * baseline calibration before assuming this is current — source of truth
 * lives on-chain at `system_state_inner.storage_price_per_unit_size`.
 *
 * We hard-code WELL ABOVE the observed value (3000 vs 1446) so peg drift
 * doesn't immediately abort PTBs. Combined with the SAFETY_MULTIPLIER
 * below, this gives ~4× headroom over current. Bump or move to live
 * reads if the gap closes.
 */
const STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST = 3000n;

/**
 * One-time write fee per encoded MiB. Observed testnet value:
 * `write_price_per_unit_size = 2891`. Hard-coded at 5000 for the same
 * peg-drift headroom rationale.
 */
const WRITE_PRICE_PER_MIB_FROST = 5_000n;

/**
 * Safety multiplier applied to every WAL-cost estimate. Over-pulled WAL
 * is returned to the reserve via `reserve::deposit_wal`, so over-budgeting
 * is free. Under-budgeting aborts the PTB with `EInsufficientReserve` (or
 * Walrus's own balance assertion). 2× absorbs:
 *   - peg drift between governance votes (~10–20%)
 *   - any rounding mismatch between our off-chain estimate and Walrus's
 *     on-chain compute
 *   - future modest price increases
 */
const SAFETY_MULTIPLIER = 2n;

function encodedBytesToMib(encodedSizeBytes: number | bigint): bigint {
  const bytes = typeof encodedSizeBytes === "bigint" ? encodedSizeBytes : BigInt(encodedSizeBytes);
  // Divide-and-round-up. Walrus does the same in `storage_units_from_size!`.
  const unit = BigInt(BYTES_PER_UNIT_SIZE);
  return (bytes + unit - 1n) / unit;
}

/**
 * Per-blob write fee in FROST, suitable as the `payment_budget_frost`
 * argument to `pool_vault::register_blob`. Includes the safety multiplier.
 *
 * The caller passes ENCODED size (what `getEncodedBlobLength()` returns).
 * Walrus rounds up to whole MiB internally, so we mirror that.
 */
export function getWriteFeeFrost(encodedSizeBytes: number | bigint): bigint {
  const mib = encodedBytesToMib(encodedSizeBytes);
  return mib * WRITE_PRICE_PER_MIB_FROST * SAFETY_MULTIPLIER;
}

/**
 * WAL cost in FROST to reserve `reservedEncodedBytes` of pool capacity
 * for `epochs` epochs. Suitable as the `payment_budget_frost` argument
 * to `pool_vault::create_vault` (with `epochs = epochs_ahead`) and
 * `pool_vault::resize_grow` (with `epochs = remaining epochs in pool's
 * lifetime`). Includes the safety multiplier.
 */
export function getPoolStorageCostFrost(
  reservedEncodedBytes: number | bigint,
  epochs: number | bigint,
): bigint {
  const mib = encodedBytesToMib(reservedEncodedBytes);
  const epochsBig = typeof epochs === "bigint" ? epochs : BigInt(epochs);
  return mib * STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST * epochsBig * SAFETY_MULTIPLIER;
}

/**
 * Combined budget for `pool_vault::extend` — extending the pool's
 * end_epoch by `additionalEpochs` over its already-reserved capacity.
 * Identical formula to `getPoolStorageCostFrost`; named separately for
 * intent.
 */
export function getPoolExtendCostFrost(
  reservedEncodedBytes: number | bigint,
  additionalEpochs: number | bigint,
): bigint {
  return getPoolStorageCostFrost(reservedEncodedBytes, additionalEpochs);
}

/**
 * Pack a list of committee signer indices into the bitmap format
 * `walrus::system::certify_pooled_blob` expects. Inlined from the
 * SDK's private `utils/signersToBitmap` (the SDK uses it internally
 * for `walrus.certifyBlob` against SharedBlobs but doesn't export it
 * for callers who build their own PTBs against the pool primitives).
 *
 * `committeeSize` = `systemState.committee.members.length` (the
 * `members` array length, NOT `n_shards`). Verify with
 * `(await getWalrusClient().systemState()).committee.members.length`.
 */
export function signersToBitmap(signers: number[], committeeSize: number): Uint8Array {
  const bitmapSize = Math.ceil(committeeSize / 8);
  const bitmap = new Uint8Array(bitmapSize);
  for (const signer of signers) {
    const byteIndex = Math.floor(signer / 8);
    const bitIndex = signer % 8;
    // `bitmap` is freshly allocated with `bitmapSize` bytes; `signer < committeeSize`
    // is the precondition. `byteIndex` is in-bounds; non-null assertion silences
    // tsconfig's `noUncheckedIndexedAccess`.
    bitmap[byteIndex]! |= 1 << bitIndex;
  }
  return bitmap;
}

// === Re-exports of public SDK helpers callers will want ===

/**
 * Re-exported from `@mysten/walrus`. Converts a Walrus URL-safe-base64
 * blobId string to a BigInt for use as a `u256` Move argument.
 */
export { blobIdToInt as blobIdStringToU256 } from "@mysten/walrus";

/**
 * Re-exported from `@mysten/walrus`. The inverse of `blobIdStringToU256`:
 * converts a `u256` (as bigint) from an on-chain event payload back into
 * Walrus's canonical URL-safe-base64 blobId string. Used by the indexer
 * to write `S3Object.walrus_blob_id` in the form that walruscan and the
 * aggregator both expect (anything else and the dashboard links 404).
 */
export { blobIdFromInt as blobIdU256ToString } from "@mysten/walrus";

export type { WalrusClient };
