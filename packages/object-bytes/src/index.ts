/**
 * Framework-agnostic object decrypt pipeline.
 *
 * What this package owns:
 *   - Building the `seal_approve` PTB against the kraterion package.
 *   - Fetching ciphertext from the public Walrus aggregator.
 *   - Calling `SealClient.decrypt(...)` to recover plaintext.
 *
 * What this package does NOT own:
 *   - `SessionKey` construction / caching. Callers pass a pre-built
 *     `SessionKey`; the gateway uses `@kraterion/seal-client`'s
 *     Redis-cached helper, the worker can do the same with a different
 *     `accountKey`, the dashboard does its own browser-side derivation.
 *   - `SuiClient` construction. Callers inject a Sui-SDK client
 *     compatible with both `Transaction.build({ client })` and Seal's
 *     `SealCompatibleClient` typing.
 *   - HTTP response shaping. The gateway service still serializes
 *     `Content-Type`, ETag, `Last-Modified`, etc.; this package returns
 *     plaintext bytes only.
 *
 * Why a separate package: the gateway has done this work for months,
 * but the worker (and any future service that needs plaintext —
 * indexer-style content extraction, AI embedding, etc.) needs the same
 * pipeline. Carrying the logic in `apps/gateway/src/s3/` would force
 * every other consumer to bend toward NestJS. Extracting it pays for
 * itself the moment a second service needs it.
 */

import { Transaction } from "@mysten/sui/transactions";
import type { SealClient, SessionKey } from "@mysten/seal";
import { access } from "@kraterion/kraterion-move-sdk";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import { readBlobByBlobId } from "@kraterion/walrus-client";
import { PtbBuildError, SealDecryptError, WalrusReadError } from "./errors.js";

export { PtbBuildError, SealDecryptError, WalrusReadError } from "./errors.js";

/**
 * Loose structural type covering the SuiClient shapes both
 * `Transaction.build({ client })` and Seal's `SealClient` will accept.
 * Both real clients (`SuiJsonRpcClient` and the new `SuiClient` from
 * `@mysten/sui/client`) satisfy it; we don't bind a concrete class here
 * because the package consumers come from multiple SDK eras.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectBytesSuiClient = any;

export interface BuildSealApprovePtbArgs {
  /** Sui object id of the `KraterionBucket` shared object. */
  bucketObjectId: string;
  /** The 48-byte identity bytes stored on the `S3Object` row. */
  sealIdentity: Uint8Array;
  /** Address that should sign the PTB conceptually — the keypair whose
   *  SessionKey will be passed to `decrypt`. Seal key servers dry-run
   *  the PTB with this as `ctx.sender()`. */
  sender: string;
  suiClient: ObjectBytesSuiClient;
}

/**
 * Builds the `seal_approve` PTB the Seal key servers dry-run when a
 * client asks for decryption shares. The bytes are returned in
 * `onlyTransactionKind` form, matching what `client.decrypt({ txBytes })`
 * expects.
 */
export async function buildSealApprovePtb(
  args: BuildSealApprovePtbArgs,
): Promise<Uint8Array> {
  try {
    const tx = new Transaction();
    tx.add(
      access.sealApprove({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          id: Array.from(args.sealIdentity),
          bucket: args.bucketObjectId,
        },
      }),
    );
    tx.setSender(args.sender);
    return await tx.build({
      client: args.suiClient,
      onlyTransactionKind: true,
    });
  } catch (err) {
    throw new PtbBuildError(
      `Failed to build seal_approve PTB: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

export interface DecryptObjectBytesArgs {
  /** Sui object id of the `KraterionBucket` shared object. */
  bucketObjectId: string;
  /** The 48-byte identity bytes stored on the `S3Object` row. */
  sealIdentity: Uint8Array;
  /** Walrus blob id (URL-safe base64 of the u256). */
  walrusBlobId: string;
  /** Pre-built SessionKey (already personal-message-signed). */
  sessionKey: SessionKey;
  /** Memoized `SealClient` from the caller — both the gateway and worker
   *  hold one of these. We don't construct it here so callers control
   *  the key-server config + threshold + verification posture. */
  sealClient: SealClient;
  suiClient: ObjectBytesSuiClient;
  /** Optional abort signal for the Walrus fetch. Cancellation propagates
   *  cleanly because `readBlobByBlobId` already honors AbortSignal. */
  signal?: AbortSignal;
}

/**
 * Fetch + decrypt an object's plaintext.
 *
 * Flow:
 *   1. Build the `seal_approve` PTB with the SessionKey's address as
 *      sender (Seal key servers will dry-run this against the chain
 *      state to confirm decryption shares should be released).
 *   2. Fetch ciphertext from the public Walrus aggregator.
 *   3. Call `sealClient.decrypt({ data, sessionKey, txBytes })` to run
 *      the threshold IBE decapsulation + AES-GCM auth tag check.
 *
 * Throws:
 *   - `PtbBuildError` if step 1 fails (almost always a programming bug
 *     — the PTB shape is fixed).
 *   - `WalrusReadError` if step 2 fails (aggregator down, blob missing,
 *     network error). Callers commonly translate this to S3 503.
 *   - `SealDecryptError` if step 3 fails. The most common cause is
 *     on-chain access revocation: `seal_approve` aborts inside the key
 *     servers' dry-run and they refuse to release shares. Callers
 *     commonly translate this to S3 403 `KeyAccessRevoked`.
 */
export async function decryptObjectBytes(
  args: DecryptObjectBytesArgs,
): Promise<Uint8Array> {
  const txBytes = await buildSealApprovePtb({
    bucketObjectId: args.bucketObjectId,
    sealIdentity: args.sealIdentity,
    sender: args.sessionKey.getAddress(),
    suiClient: args.suiClient,
  });

  let encrypted: Uint8Array;
  try {
    encrypted = await readBlobByBlobId(args.walrusBlobId, args.signal);
  } catch (err) {
    throw new WalrusReadError(
      `Walrus aggregator read failed: ${err instanceof Error ? err.message : String(err)}`,
      args.walrusBlobId,
      err,
    );
  }

  try {
    return await args.sealClient.decrypt({
      data: encrypted,
      sessionKey: args.sessionKey,
      txBytes,
    });
  } catch (err) {
    throw new SealDecryptError(
      `Seal decrypt rejected: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
