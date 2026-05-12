/**
 * PutObject + DeleteObject — the S3 write path.
 *
 * Flow (PutObject):
 *   1. SigV4 guard resolves identity + bucket + key.
 *   2. Validate the body — Content-Length present, body within size cap,
 *      Content-MD5 matches MD5(body) if header set, x-amz-content-sha256
 *      matches SHA-256(body) if not UNSIGNED-PAYLOAD.
 *   3. Reject S3 features we explicitly don't support yet
 *      (`x-amz-tagging`, `x-amz-meta-*`). Silently accept-and-ignore the
 *      `x-amz-acl`, `x-amz-storage-class`, `x-amz-server-side-encryption`
 *      headers that boto3/aws-cli send by default.
 *   4. Postgres: load bucket by (account, name, not deleted), assert
 *      `api_access_granted`.
 *   5. Mint a fresh `object_uuid` (16 bytes); seal_identity is
 *      `bucket_object_id_bytes (32) || object_uuid (16)` = 48 bytes.
 *   6. Seal-encrypt plaintext; encrypted blob is what we hand to Walrus.
 *   7. Walrus `computeBlobMetadata` → blobId + rootHash + nonce.
 *   8. PTB 1 (gateway-signed):
 *        - `walrus.sendUploadRelayTip` (FIRST so the auth payload is
 *          input slot 0; relay verifier requires that)
 *        - `kraterion.registerBlobForBucket` → `Blob` object
 *        - transfer the resulting `Blob` to the gateway address
 *      Parse effects → `blobObjectId`.
 *   9. POST encoded slivers to Mysten testnet upload-relay → certificate.
 *  10. PTB 2 (gateway-signed):
 *        - `walrus.certifyBlob`
 *        - `kraterion.wrapInSharedBlob` → `SharedBlob`
 *      Parse effects → `sharedBlobObjectId`.
 *  11. Upsert `S3Object` row keyed on (bucket_id, s3_key). On overwrite,
 *      log the previous walrus_blob_id + shared_blob_object_id so a
 *      future reaper can refund WAL from the orphaned SharedBlob.
 *  12. Return 200 with empty body and canonical S3 response headers.
 *
 * Failure modes (logged but never auto-recovered in v1):
 *   - PTB 1 fails → no on-chain state, just return error.
 *   - Relay POST or PTB 2 fails after PTB 1 succeeded → orphan `Blob`
 *     owned by the gateway with no SharedBlob wrapper. Logged at
 *     ERROR; reaper job is post-hackathon.
 *   - DB insert fails after PTB 2 succeeded → orphan `SharedBlob` on
 *     chain with no DB record. Logged at ERROR; same reaper.
 *
 * Flow (DeleteObject):
 *   Soft delete the row (`deleted_at = NOW()`). The on-chain SharedBlob
 *   persists — that's the whole product point. 204 no body.
 */

import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { GatewayKeypairService } from "../auth/gateway-keypair.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { S3Error } from "./s3-error.js";
import { requireKraterion, requireBucket, requireKey } from "./request-context.js";
import { waitForS3Object } from "../indexer-wait/wait-for-row.js";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  SEAL_THRESHOLD,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { kraterion } from "@kraterion/kraterion-move-sdk";
import {
  blobIdStringToU256,
  getEncodedBlobLength,
  getSuiClient,
  getWalrusClient,
  rootHashBytesToU256,
} from "@kraterion/walrus-client";
import { getSealClient } from "@kraterion/seal-client";

const MAX_PUT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB; matches GET cap.
const EPOCHS_AHEAD = 5;
// Generous WAL budget for register_blob_for_bucket. Walrus testnet
// pricing is tiny (a few thousand MIST per epoch); leftover is auto-
// returned to the reserve.
const PAYMENT_AMOUNT_MIST = 200_000_000n; // 0.2 WAL
const ENCODING_TYPE_RS2 = 1;
const DEFAULT_CONTENT_TYPE = "binary/octet-stream"; // AWS-canonical S3 default

// Suppress unused — kept inline for future header-debug logs.
void toHex;

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsWriteController {
  private readonly logger = new Logger(ObjectsWriteController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayKeypair: GatewayKeypairService,
    @Inject(REDIS) _redis: Redis,
  ) {
    void _redis; // SessionKey caching is read-side only; PutObject doesn't need Redis.
  }

  @Put(":bucket/*")
  @HttpCode(200)
  async putObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
    @Body() body: Buffer | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    const bucketName = requireBucket(ctx);
    const s3Key = requireKey(ctx);

    rejectUnsupportedWriteHeaders(headers);
    // Parse `x-amz-meta-*` ahead of the (expensive) Walrus+Seal+PTB flow
    // so an over-sized metadata payload fails fast without wasting a
    // round-trip.
    const metadata = pickMetadata(headers);

    // Fastify's catch-all parser yields a Buffer for any body; an empty
    // PUT (`Body=b""`) becomes `Buffer.alloc(0)`. A missing body
    // entirely (no Content-Length, no body) yields `undefined` — we
    // require a Content-Length per RFC 9110 §8.6.
    const plaintext = body ?? Buffer.alloc(0);
    validateContentLength(headers, plaintext);
    if (plaintext.byteLength > MAX_PUT_BYTES) {
      throw new S3Error(
        "EntityTooLarge",
        `This gateway version caps PutObject at ${MAX_PUT_BYTES} bytes; ` +
          `chunked Seal envelopes for larger objects are post-hackathon.`,
      );
    }
    validateContentMd5(headers, plaintext);
    validateContentSha256(headers, plaintext);

    // ETag is plaintext MD5, per the S3 spec for single-part uploads.
    // Compute once as raw bytes (passed to the Move event so the
    // indexer can populate `S3Object.etag`) and as lowercase hex
    // (returned in the response `ETag:` header, stored in DB).
    const etagRaw = createHash("md5").update(plaintext).digest();
    const etag = etagRaw.toString("hex");
    const contentType = pickContentType(headers);

    // Bucket lookup — same shape as GetObject. Reject revoked access at
    // the DB layer to save a Seal/chain round-trip.
    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: {
        id: true,
        name: true,
        kraterion_bucket_object_id: true,
        api_access_granted: true,
      },
    });
    if (!bucketRow) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }
    if (!bucketRow.api_access_granted) {
      throw new S3Error(
        "KeyAccessRevoked",
        "The platform's access to write to this bucket has been revoked.",
      );
    }

    // Build a fresh seal_identity. The 32-byte bucket prefix binds the
    // ciphertext to this bucket's seal_approve policy; the 16-byte
    // suffix is per-object so each file has a unique IBE identity.
    const objectUuid = randomBytes(16);
    const sealIdentity = new Uint8Array(48);
    sealIdentity.set(hexToBytes(bucketRow.kraterion_bucket_object_id), 0);
    sealIdentity.set(objectUuid, 32);

    // Seal does the AES envelope internally — `encryptedObject` is the
    // full ciphertext to push to Walrus.
    const { encryptedObject: encrypted } = await getSealClient().encrypt({
      threshold: SEAL_THRESHOLD,
      packageId: KRATERION_PACKAGE_ID,
      id: toHex(sealIdentity),
      data: plaintext,
    });

    // Compute blob metadata + encoded size locally (Walrus expects the
    // *encoded* size as the storage_amount, not the raw byte count).
    // The Walrus storage end-epoch is derived in Move from the inner
    // Blob (via `walrus::blob::end_epoch`) and surfaced via the
    // `KraterionObjectCreated` event — gateway no longer needs it.
    const walrus = getWalrusClient();
    const meta = await walrus.computeBlobMetadata({ bytes: encrypted });
    const systemState = await walrus.systemState();
    const nShards = systemState.committee.n_shards;
    const encodedSize = getEncodedBlobLength(encrypted.length, nShards);

    const gatewayKp = this.gatewayKeypair.getKeypair();
    const gatewayAddress = this.gatewayKeypair.getAddress();
    const suiClient = getSuiClient();

    // === PTB 1: relay tip + register_blob_for_bucket ===
    // The relay's verifier requires the auth payload be input slot 0,
    // hence the tip command is added BEFORE register.
    const tx1 = new Transaction();
    tx1.add(
      walrus.sendUploadRelayTip({
        size: encrypted.length,
        blobDigest: meta.blobDigest,
        nonce: meta.nonce,
      }),
    );
    const blobArg = tx1.add(
      kraterion.registerBlobForBucket({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          reserve: KRATERION_RESERVE_ID,
          bucket: bucketRow.kraterion_bucket_object_id,
          system: WALRUS_SYSTEM_OBJECT_ID,
          paymentAmount: PAYMENT_AMOUNT_MIST,
          storageAmount: BigInt(encodedSize),
          epochsAhead: EPOCHS_AHEAD,
          blobId: blobIdStringToU256(meta.blobId),
          rootHash: rootHashBytesToU256(meta.rootHash),
          size: BigInt(encrypted.length),
          encodingType: ENCODING_TYPE_RS2,
        },
      }),
    );
    // PTB result must be consumed; transfer the registered Blob back to
    // the gateway so it lands as an owned object we can certify in PTB2.
    tx1.transferObjects([blobArg], gatewayAddress);

    let r1;
    try {
      r1 = await suiClient.signAndExecuteTransaction({
        transaction: tx1,
        signer: gatewayKp,
        options: { showEffects: true, showObjectChanges: true },
      });
    } catch (e) {
      this.logger.warn(
        `PutObject PTB1 RPC failed (bucket=${bucketName} key=${s3Key}): ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "Could not register the blob on-chain; please retry.",
      );
    }
    if (r1.effects?.status?.status !== "success") {
      throw new S3Error(
        "InternalError",
        `register_blob_for_bucket failed: ${r1.effects?.status?.error ?? "unknown"}`,
      );
    }
    const blobObjectId = pickCreatedObjectId(r1, "::blob::Blob");
    if (!blobObjectId) {
      throw new S3Error("InternalError", "PTB1 produced no Blob object.");
    }

    // === Relay upload ===
    // From here on, any failure = orphan blob. Log loudly.
    let certificate;
    try {
      const relayResult = await walrus.writeBlobToUploadRelay({
        blob: encrypted,
        blobId: meta.blobId,
        nonce: meta.nonce,
        txDigest: r1.digest,
        blobObjectId,
        deletable: false,
      });
      certificate = relayResult.certificate;
    } catch (e) {
      this.logger.error(
        `ORPHAN BLOB (relay POST failed): blobObjectId=${blobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "Storage upload failed; please retry.",
      );
    }

    // === PTB 2: certifyBlob + wrap_in_shared_blob ===
    const tx2 = new Transaction();
    tx2.add(
      walrus.certifyBlob({
        blobId: meta.blobId,
        blobObjectId,
        certificate,
        deletable: false,
      }),
    );
    tx2.add(
      kraterion.wrapInSharedBlob({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          bucket: bucketRow.kraterion_bucket_object_id,
          blob: blobObjectId,
          s3Key: Array.from(new TextEncoder().encode(s3Key)),
          contentType: Array.from(new TextEncoder().encode(contentType)),
          // 48-byte IBE identity — gateway-minted, must travel via the
          // event so the indexer can populate `S3Object.seal_identity`
          // (used to reconstruct the `seal_approve` PTB at GET time).
          sealIdentity: Array.from(sealIdentity),
          // PLAINTEXT byte count — the value S3 returns as
          // `Content-Length`. Distinct from the encrypted/Walrus-blob
          // size; passed explicitly because the inner Blob only carries
          // the encrypted size.
          sizeBytes: BigInt(plaintext.byteLength),
          // 16-byte raw MD5 of the plaintext = the S3 ETag's underlying
          // hash. Indexer hex-encodes it for `S3Object.etag`.
          etagMd5: Array.from(etagRaw),
        },
      }),
    );

    let r2;
    try {
      r2 = await suiClient.signAndExecuteTransaction({
        transaction: tx2,
        signer: gatewayKp,
        options: { showEffects: true, showObjectChanges: true },
      });
    } catch (e) {
      this.logger.error(
        `ORPHAN BLOB (PTB2 RPC failed): blobObjectId=${blobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "Storage commit failed; please retry.",
      );
    }
    if (r2.effects?.status?.status !== "success") {
      this.logger.error(
        `ORPHAN BLOB (PTB2 reverted): blobObjectId=${blobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${r2.effects?.status?.error}`,
      );
      throw new S3Error(
        "InternalError",
        `certify_blob failed: ${r2.effects?.status?.error ?? "unknown"}`,
      );
    }
    const sharedBlobObjectId = pickCreatedObjectId(r2, "::shared_blob::SharedBlob");
    if (!sharedBlobObjectId) {
      this.logger.error(
        `ORPHAN BLOB (no SharedBlob in effects): blobObjectId=${blobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}`,
      );
      throw new S3Error("InternalError", "PTB2 produced no SharedBlob object.");
    }

    // === Hand off to indexer ===
    // The indexer is now the single writer of `S3Object` (per ADR
    // "DB writes are gateway-direct today; replace with event-driven
    // indexer when the dashboard lands"). Wait for the row to appear,
    // then return success. If the indexer is down or far behind, we
    // 503 — the data IS on chain, boto3 retries, by then the
    // indexer has caught up.
    await waitForS3Object(this.prisma, sharedBlobObjectId);

    // `metadata` is the one column on `S3Object` that does NOT flow
    // through the indexer — the on-chain `KraterionObjectCreated` event
    // carries no metadata because it isn't consensus-critical. So we
    // patch it here, scoped to the row the indexer just wrote.
    if (metadata) {
      await this.prisma.s3Object.update({
        where: { shared_blob_object_id: sharedBlobObjectId },
        data: { metadata },
      });
    }

    setWriteResponseHeaders(reply, etag);
    void reply.status(200).send();
  }

  @Delete(":bucket/*")
  @HttpCode(204)
  async deleteObject(@Req() req: FastifyRequest): Promise<void> {
    const ctx = requireKraterion(req);
    const bucketName = requireBucket(ctx);
    const s3Key = requireKey(ctx);

    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: { id: true },
    });
    if (!bucketRow) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }

    // Idempotent — DELETE on a missing key returns 204 (S3 spec).
    await this.prisma.s3Object.updateMany({
      where: { bucket_id: bucketRow.id, s3_key: s3Key, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    this.logger.log(`object soft-deleted: bucket=${bucketName} key=${s3Key}`);
  }
}

// === Helpers ===

function rejectUnsupportedWriteHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  const get = (k: string): string | undefined => {
    const v = headers[k.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  if (get("x-amz-tagging")) {
    throw new S3Error(
      "NotImplemented",
      "Object tagging is not supported in this phase.",
    );
  }
  // x-amz-acl, x-amz-storage-class, x-amz-server-side-encryption: AWS
  // accepts a fixed enum for each. We always encrypt + don't expose
  // ACLs or storage classes, so silently accept-and-ignore — matches
  // what rclone/aws-cli send by default; rejecting them breaks both.
  //
  // x-amz-meta-* is now supported — see `pickMetadata` below.
}

/**
 * AWS S3 user-metadata cap: the total serialized size of `x-amz-meta-*`
 * headers (each `name + value`, sum across all entries) must not exceed
 * 2 KiB for PUT requests. Mirroring the spec keeps us drop-in compatible
 * with the AWS Java/Python SDKs that already validate against this.
 */
const MAX_METADATA_BYTES = 2 * 1024;

/**
 * Parse `x-amz-meta-*` headers into a flat key→value map.
 *
 * Returns `null` if no metadata headers were sent (so the column stays
 * NULL on the row instead of `{}`). Throws `MetadataTooLarge` when the
 * combined header bytes exceed the AWS cap.
 *
 * Keys are lowercased and prefix-stripped (`X-Amz-Meta-Author` →
 * `author`). Values are taken verbatim. Duplicate headers collapse
 * last-wins, matching what Node's lowercased header bag already does.
 */
function pickMetadata(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  let total = 0;
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (!name.startsWith("x-amz-meta-")) continue;
    const key = name.slice("x-amz-meta-".length);
    if (!key) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(",") : (rawValue ?? "");
    total += Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
    out[key] = value;
  }
  if (total === 0) return null;
  if (total > MAX_METADATA_BYTES) {
    throw new S3Error(
      "MetadataTooLarge",
      `Your metadata headers exceed the maximum allowed metadata size.`,
    );
  }
  return out;
}

function validateContentLength(
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
): void {
  const cl = headers["content-length"];
  const value = Array.isArray(cl) ? cl[0] : cl;
  if (!value) {
    throw new S3Error(
      "MissingContentLength",
      "You must provide the Content-Length HTTP header.",
    );
  }
  let declared: number;
  try {
    declared = Number(value);
    if (!Number.isFinite(declared) || declared < 0) throw new Error("not a non-negative integer");
  } catch {
    throw new S3Error("InvalidArgument", "Invalid Content-Length value.");
  }
  if (declared !== body.byteLength) {
    // Fastify's parser will normally reject mismatches before this
    // runs — this catches anything that slipped through (e.g. a proxy
    // mangling the header).
    throw new S3Error(
      "IncompleteBody",
      "The number of bytes specified by the Content-Length HTTP header was not provided.",
    );
  }
}

function validateContentMd5(
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
): void {
  const v = headers["content-md5"];
  const value = Array.isArray(v) ? v[0] : v;
  if (!value) return;
  // RFC 1864 §2: base64-encoded 128-bit MD5 (24 chars, ends in `=`).
  const expected = createHash("md5").update(body).digest("base64");
  if (value !== expected) {
    throw new S3Error(
      "BadDigest",
      "The Content-MD5 you specified did not match what we received.",
    );
  }
}

function validateContentSha256(
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
): void {
  const v = headers["x-amz-content-sha256"];
  const value = Array.isArray(v) ? v[0] : v;
  // Already gated by the SigV4 guard — when present it's either
  // UNSIGNED-PAYLOAD or hex sha256. STREAMING-* is rejected upstream.
  if (!value || value === "UNSIGNED-PAYLOAD") return;
  const expected = createHash("sha256").update(body).digest("hex");
  if (value.toLowerCase() !== expected) {
    throw new S3Error(
      "XAmzContentSHA256Mismatch",
      "The provided 'x-amz-content-sha256' header does not match what was computed.",
    );
  }
}

function pickContentType(headers: Record<string, string | string[] | undefined>): string {
  const v = headers["content-type"];
  const value = Array.isArray(v) ? v[0] : v;
  if (!value || value.length === 0) return DEFAULT_CONTENT_TYPE;
  return value;
}

function pickCreatedObjectId(
  result: { objectChanges?: unknown[] | null },
  typeSuffix: string,
): string | null {
  const changes = result.objectChanges ?? [];
  for (const c of changes as Array<Record<string, unknown>>) {
    if (
      c["type"] === "created" &&
      typeof c["objectType"] === "string" &&
      (c["objectType"] as string).endsWith(typeSuffix) &&
      typeof c["objectId"] === "string"
    ) {
      return c["objectId"] as string;
    }
  }
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}

function setWriteResponseHeaders(reply: FastifyReply, etag: string): void {
  const requestId = randomUUID();
  // S3 wraps ETags in quotes per RFC 7232 §2.3.
  void reply.header("ETag", `"${etag}"`);
  void reply.header("x-amz-server-side-encryption", "AES256");
  void reply.header("x-amz-request-id", requestId);
  void reply.header("x-amz-id-2", requestId);
  // Empty success body — be explicit so old clients don't hang.
  void reply.header("Content-Length", "0");
}
