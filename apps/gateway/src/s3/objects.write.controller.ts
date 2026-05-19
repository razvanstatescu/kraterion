/**
 * PutObject + DeleteObject — the S3 write path on the storage-pool model.
 *
 * Replaces the SharedBlob-era flow (`kraterion::register_blob_for_bucket` →
 * `kraterion::wrap_in_shared_blob`) with the pool wrapper
 * (`kraterion::pool_vault::register_blob` → `pool_vault::certify_blob`).
 * See /docs/storage-pool-migration.md.
 *
 * Flow (PutObject):
 *   1. SigV4 guard resolves identity + bucket + key.
 *   2. Validate body — Content-Length present, body within size cap,
 *      Content-MD5 matches MD5(body) if header set, x-amz-content-sha256
 *      matches SHA-256(body) if not UNSIGNED-PAYLOAD.
 *   3. Reject unsupported S3 features; parse `x-amz-meta-*` ahead of the
 *      expensive crypto/chain ops so an over-sized payload fails fast.
 *   4. Postgres: load bucket + parent project + account (for user's
 *      Sui address). Reject revoked access at the DB layer.
 *   5. Lazy vault provisioning — ensure the project has a
 *      `KraterionPoolVault` on chain. First PUT in a project blocks on
 *      `pool_vault::create_vault`; subsequent PUTs hit the cached row.
 *   6. Mint a fresh `object_uuid` (16 bytes); seal_identity = bucket
 *      object id (32) || object_uuid (16) = 48 bytes.
 *   7. Seal-encrypt plaintext.
 *   8. Walrus `computeBlobMetadata` → blobId + rootHash + nonce.
 *   9. Look up any existing object at (bucket_id, s3_key) — the
 *      `pooled_blob_object_id` becomes the second `delete_blob` arg in
 *      PTB2 so the pool's `used_encoded_bytes` recycles atomically.
 *  10. PTB 1 (gateway-signed):
 *        - `walrus.sendUploadRelayTip` (FIRST so the auth payload is
 *          input slot 0; relay verifier requires that)
 *        - `pool_vault::register_blob` (pulls write fee from reserve,
 *          stores PooledBlob in the pool's ObjectTable, emits
 *          `KraterionPooledBlobRegistered`)
 *      Parse `r1.events` → `pooled_blob_object_id`.
 *  11. POST encoded slivers to Mysten testnet upload-relay → certificate.
 *  12. PTB 2 (gateway-signed):
 *        - `pool_vault::certify_blob`
 *        - (if overwriting) `pool_vault::delete_blob(old_pooled_blob_id)`
 *  13. Wait for the indexer to write the `S3Object` row + `PooledBlob` row.
 *  14. Patch `metadata` (column doesn't flow through the indexer).
 *  15. Return 200.
 *
 * Failure modes (logged but not auto-recovered):
 *   - PTB 1 fails → no on-chain state, return 5xx.
 *   - Relay POST or PTB 2 fails after PTB 1 → the PooledBlob is in the
 *     pool's ObjectTable but never certified; pool capacity is consumed.
 *     The `burn_expired_pooled_blob` reaper cleans up after pool expiry.
 *
 * Flow (DeleteObject):
 *   1. Resolve target row by (bucket, s3_key). 204 if missing.
 *   2. Soft-mark row + delete its Knowledge chunks.
 *   3. Build `pool_vault::delete_blob` PTB. Operator-signed.
 *   4. On success, capacity is freed and indexer-event finalises state.
 *   5. On failure, the row stays soft-deleted; orphan PooledBlob is
 *      cleaned by `burn_expired_pooled_blob` at pool expiry.
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
import { MeterClassA } from "../billing/meter-class.decorator.js";
import { PoolCapacityGuard } from "../billing/pool-capacity.guard.js";
import { SpendCapGuard } from "../billing/spend-cap.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { S3Error } from "./s3-error.js";
import { requireKraterion, requireBucket, requireKey } from "./request-context.js";
import { waitForS3Object } from "../indexer-wait/wait-for-row.js";
import { VaultProvisioningService } from "./vault-provisioning.service.js";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  SEAL_THRESHOLD,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  blobIdStringToU256,
  getEncodedBlobLength,
  getSuiClient,
  getWalrusClient,
  getWriteFeeFrost,
  rootHashBytesToU256,
  signersToBitmap,
} from "@kraterion/walrus-client";
import { getSealClient } from "@kraterion/seal-client";

const MAX_PUT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB; matches GET cap.
const ENCODING_TYPE_RS2 = 1;
const DEFAULT_CONTENT_TYPE = "binary/octet-stream"; // AWS-canonical S3 default

/**
 * Fully-qualified Move event type the gateway parses out of PTB 1's
 * effects to recover the new PooledBlob's on-chain object ID. Walrus's
 * `register_pooled_blob` returns `()`, so the only way to know the
 * fresh PooledBlob's ID without an extra RPC is via our own event.
 */
const KRATERION_POOLED_BLOB_REGISTERED_TYPE =
  `${KRATERION_PACKAGE_ID}::events::KraterionPooledBlobRegistered` as const;

// Suppress unused — kept inline for future header-debug logs.
void toHex;

@UseGuards(Sigv4Guard, SpendCapGuard, PoolCapacityGuard)
@Controller()
export class ObjectsWriteController {
  private readonly logger = new Logger(ObjectsWriteController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayKeypair: GatewayKeypairService,
    private readonly vaultProvisioning: VaultProvisioningService,
    @Inject(REDIS) _redis: Redis,
  ) {
    void _redis; // SessionKey caching is read-side only; PutObject doesn't need Redis.
  }

  @Put(":bucket/*")
  @HttpCode(200)
  @MeterClassA()
  async putObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
    @Body() body: Buffer | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    const bucketName = requireBucket(ctx);
    const s3Key = requireKey(ctx);

    // Reserved namespace for internal artifacts (Knowledge manifests land
    // as bucket-owned blobs written by the worker). The indexer routes
    // events under this prefix to `KnowledgeManifest` instead of
    // `S3Object`; admitting user PUTs here would break the routing
    // assumption.
    if (s3Key.startsWith("_kraterion/")) {
      throw new S3Error(
        "InvalidArgument",
        "Object keys starting with '_kraterion/' are reserved for platform-managed artifacts.",
      );
    }

    rejectUnsupportedWriteHeaders(headers);
    const metadata = pickMetadata(headers);

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

    const etagRaw = createHash("md5").update(plaintext).digest();
    const etag = etagRaw.toString("hex");
    const contentType = pickContentType(headers);

    // Bucket lookup. Join through to project + account so we have the
    // user's Sui address for lazy vault provisioning (the address is
    // recorded as `vault.created_by` so the user can call
    // `pool_vault::revoke_all` later).
    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: {
        id: true,
        name: true,
        project_id: true,
        kraterion_bucket_object_id: true,
        api_access_granted: true,
        project: { select: { account: { select: { sui_address: true } } } },
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

    // === Lazy vault provisioning ===
    // First PUT in a brand-new project blocks here while we create the
    // vault on chain and wait for the indexer to write the StoragePool
    // row (~3-5s testnet). Concurrent first-PUTs serialize on a Postgres
    // advisory lock; only one tx hits the chain.
    const { vaultObjectId } = await this.vaultProvisioning.ensureVaultForProject(
      bucketRow.project_id,
      bucketRow.project.account.sui_address,
    );

    // Build the seal_identity. The 32-byte bucket prefix binds the
    // ciphertext to this bucket's seal_approve policy; the 16-byte
    // suffix is per-object so each file has a unique IBE identity.
    const objectUuid = randomBytes(16);
    const sealIdentity = new Uint8Array(48);
    sealIdentity.set(hexToBytes(bucketRow.kraterion_bucket_object_id), 0);
    sealIdentity.set(objectUuid, 32);

    const { encryptedObject: encrypted } = await getSealClient().encrypt({
      threshold: SEAL_THRESHOLD,
      packageId: KRATERION_PACKAGE_ID,
      id: toHex(sealIdentity),
      data: plaintext,
    });

    // Compute Walrus metadata + encoded size locally (Walrus expects the
    // unencoded byte count plus n_shards; we calculate the encoded MiB
    // ourselves for the write-fee budget). Committee size is needed for
    // packing the certify_blob signers bitmap further down.
    const walrus = getWalrusClient();
    const meta = await walrus.computeBlobMetadata({ bytes: encrypted });
    const systemState = await walrus.systemState();
    const nShards = systemState.committee.n_shards;
    const committeeSize = systemState.committee.members.length;
    const encodedSize = getEncodedBlobLength(encrypted.length, nShards);

    // === Overwrite detection ===
    // If an object already exists at (bucket, key) and has a PooledBlob,
    // we'll atomically delete it in PTB2 so the pool's used_bytes
    // recycles. Soft-deleted rows are ignored (we already freed them).
    const existing = await this.prisma.s3Object.findFirst({
      where: { bucket_id: bucketRow.id, s3_key: s3Key, deleted_at: null },
      select: {
        id: true,
        pooled_blob: { select: { pooled_blob_object_id: true, walrus_blob_id: true } },
      },
    });
    // `walrus_blob_id` is stored in Walrus's canonical URL-safe-base64
    // form; the on-chain delete_blob entry expects the `u256` form, so
    // we convert via the same helper the register path uses (NOT plain
    // `BigInt(...)`, which only works on decimal strings).
    const overwritePooledBlobIdToDelete = existing?.pooled_blob?.walrus_blob_id
      ? blobIdStringToU256(existing.pooled_blob.walrus_blob_id)
      : null;

    const gatewayKp = this.gatewayKeypair.getKeypair();
    const suiClient = getSuiClient();
    const writeFeeBudget = getWriteFeeFrost(encodedSize);

    const blobIdU256 = blobIdStringToU256(meta.blobId);

    // === PTB 1: relay tip + pool_vault::register_blob ===
    // No `transferObjects` — `register_pooled_blob` returns `()` and the
    // PooledBlob lives inside the pool's internal ObjectTable. We
    // recover its object ID from our own `KraterionPooledBlobRegistered`
    // event after the tx settles.
    const tx1 = new Transaction();
    tx1.add(
      walrus.sendUploadRelayTip({
        size: encrypted.length,
        blobDigest: meta.blobDigest,
        nonce: meta.nonce,
      }),
    );
    tx1.add(
      pool_vault.registerBlob({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: vaultObjectId,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          blobId: blobIdU256,
          rootHash: rootHashBytesToU256(meta.rootHash),
          unencodedSize: BigInt(encrypted.length),
          encodingType: ENCODING_TYPE_RS2,
          s3Key: Array.from(new TextEncoder().encode(s3Key)),
          contentType: Array.from(new TextEncoder().encode(contentType)),
          sealIdentity: Array.from(sealIdentity),
          sizeBytes: BigInt(plaintext.byteLength),
          etagMd5: Array.from(etagRaw),
          paymentBudgetFrost: writeFeeBudget,
        },
      }),
    );

    let r1;
    try {
      r1 = await suiClient.signAndExecuteTransaction({
        transaction: tx1,
        signer: gatewayKp,
        options: { showEffects: true, showEvents: true },
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
        `pool_vault::register_blob failed: ${r1.effects?.status?.error ?? "unknown"}`,
      );
    }
    const pooledBlobObjectId = pickPooledBlobObjectIdFromEvents(
      r1.events ?? [],
      blobIdU256,
    );
    if (!pooledBlobObjectId) {
      throw new S3Error(
        "InternalError",
        "PTB1 settled but the KraterionPooledBlobRegistered event was missing.",
      );
    }

    // === Relay upload ===
    // From here on, any failure = orphan PooledBlob inside our pool
    // (uses capacity but never certified). The
    // `burn_expired_pooled_blob` reaper cleans up at pool expiry.
    //
    // The testnet upload-relay is flaky and occasionally returns 5xx on
    // first try; retrying without backoff usually succeeds. Three
    // attempts with 500ms / 1500ms backoff covers the observed failure
    // window without inflating p99 unnecessarily.
    let certificate;
    {
      const maxAttempts = 3;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const relayResult = await walrus.writeBlobToUploadRelay({
            blob: encrypted,
            blobId: meta.blobId,
            nonce: meta.nonce,
            txDigest: r1.digest,
            blobObjectId: pooledBlobObjectId,
            deletable: true,
          });
          certificate = relayResult.certificate;
          if (attempt > 1) {
            this.logger.log(
              `relay POST succeeded on attempt ${attempt}/${maxAttempts} ` +
                `(pooled_blob_object_id=${pooledBlobObjectId})`,
            );
          }
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < maxAttempts) {
            this.logger.warn(
              `relay POST attempt ${attempt}/${maxAttempts} failed ` +
                `(pooled_blob_object_id=${pooledBlobObjectId}): ${(e as Error).message}`,
            );
            await new Promise((r) => setTimeout(r, attempt === 1 ? 500 : 1500));
          }
        }
      }
      if (!certificate) {
        this.logger.error(
          `ORPHAN POOLED BLOB (relay POST failed after ${maxAttempts} attempts): ` +
            `pooled_blob_object_id=${pooledBlobObjectId} ` +
            `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${
              (lastErr as Error).message
            }`,
        );
        throw new S3Error(
          "ServiceUnavailable",
          "Storage upload failed; please retry.",
        );
      }
    }

    // === PTB 2: pool_vault::certify_blob (+ overwrite delete) ===
    const tx2 = new Transaction();
    // certificate.signers is a list of committee member indices; Walrus
    // expects them packed as a bitmap. signersToBitmap mirrors the SDK's
    // internal helper used by `walrus.certifyBlob` for SharedBlobs.
    const signersBitmap = signersToBitmap(certificate.signers, committeeSize);
    tx2.add(
      pool_vault.certifyBlob({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: vaultObjectId,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          blobId: blobIdU256,
          signature: Array.from(certificate.signature),
          signersBitmap: Array.from(signersBitmap),
          message: Array.from(certificate.serializedMessage),
        },
      }),
    );
    if (overwritePooledBlobIdToDelete !== null) {
      // Atomic: certify the new blob and free the old one in the same
      // tx. If certify fails, delete doesn't run. If the whole tx fails,
      // we end up with an orphan new PooledBlob (handled by reaper) and
      // the old blob is unchanged (correct).
      tx2.add(
        pool_vault.deleteBlob({
          package: KRATERION_PACKAGE_ID,
          arguments: {
            vault: vaultObjectId,
            reserve: KRATERION_RESERVE_ID,
            system: WALRUS_SYSTEM_OBJECT_ID,
            blobId: overwritePooledBlobIdToDelete,
          },
        }),
      );
    }

    let r2;
    try {
      r2 = await suiClient.signAndExecuteTransaction({
        transaction: tx2,
        signer: gatewayKp,
        options: { showEffects: true },
      });
    } catch (e) {
      this.logger.error(
        `ORPHAN POOLED BLOB (PTB2 RPC failed): pooled_blob_object_id=${pooledBlobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "Storage commit failed; please retry.",
      );
    }
    if (r2.effects?.status?.status !== "success") {
      this.logger.error(
        `ORPHAN POOLED BLOB (PTB2 reverted): pooled_blob_object_id=${pooledBlobObjectId} ` +
          `blob_id=${meta.blobId} bucket=${bucketName} key=${s3Key}: ${r2.effects?.status?.error}`,
      );
      throw new S3Error(
        "InternalError",
        `pool_vault::certify_blob failed: ${r2.effects?.status?.error ?? "unknown"}`,
      );
    }

    // === Hand off to indexer ===
    // The indexer's `pooled-blob-certified` handler advances the
    // PooledBlob row to status='certified' and patches the S3Object
    // row's `pooled_blob_id` FK. We poll for that.
    await waitForS3Object(this.prisma, pooledBlobObjectId);

    // `metadata` is the one column on `S3Object` that does NOT flow
    // through the indexer — the on-chain event carries no metadata
    // because it isn't consensus-critical. Patch it here.
    if (metadata) {
      await this.prisma.s3Object.updateMany({
        where: { pooled_blob: { pooled_blob_object_id: pooledBlobObjectId } },
        data: { metadata },
      });
    }

    setWriteResponseHeaders(reply, etag);
    void reply.status(200).send();
  }

  @Delete(":bucket/*")
  @HttpCode(204)
  @MeterClassA()
  async deleteObject(@Req() req: FastifyRequest): Promise<void> {
    const ctx = requireKraterion(req);
    const bucketName = requireBucket(ctx);
    const s3Key = requireKey(ctx);

    // StoragePool lives on Project, not Bucket — we join through.
    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: {
        id: true,
        project_id: true,
        project: {
          select: { storage_pool: { select: { vault_object_id: true } } },
        },
      },
    });
    if (!bucketRow) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }
    const projectVault = bucketRow.project.storage_pool;

    // Idempotent — DELETE on a missing key returns 204 (S3 spec).
    const target = await this.prisma.s3Object.findFirst({
      where: { bucket_id: bucketRow.id, s3_key: s3Key, deleted_at: null },
      select: {
        id: true,
        pooled_blob: { select: { walrus_blob_id: true, pooled_blob_object_id: true } },
      },
    });
    if (!target) {
      return;
    }

    // Soft-delete + wipe Knowledge chunks first. Even if the on-chain
    // delete fails, the row + chunks are out of the user-visible state.
    await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({
        where: { s3_object_id: target.id },
      }),
      this.prisma.s3Object.update({
        where: { id: target.id },
        data: { deleted_at: new Date() },
      }),
    ]);

    // On-chain delete to recycle pool capacity. Skip if no vault yet
    // (first PUT was in flight, never completed) or no PooledBlob row
    // (object was never certified — orphan PooledBlob, reaper handles it).
    if (!projectVault || !target.pooled_blob?.walrus_blob_id) {
      this.logger.warn(
        `DELETE soft-marked only (no vault or PooledBlob row): ` +
          `bucket=${bucketName} key=${s3Key} object=${target.id}`,
      );
      return;
    }

    const gatewayKp = this.gatewayKeypair.getKeypair();
    const suiClient = getSuiClient();
    // Stored form is URL-safe-base64; convert through the SDK helper
    // (see overwrite branch in `putObject` for the same conversion).
    const blobIdU256 = blobIdStringToU256(target.pooled_blob.walrus_blob_id);

    const tx = new Transaction();
    tx.add(
      pool_vault.deleteBlob({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: projectVault.vault_object_id,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          blobId: blobIdU256,
        },
      }),
    );

    try {
      const result = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: gatewayKp,
        options: { showEffects: true },
      });
      if (result.effects?.status?.status !== "success") {
        // Logged but not surfaced — the row is already soft-deleted from
        // the user's perspective; the orphan PooledBlob is reaped later.
        this.logger.error(
          `ORPHAN POOLED BLOB (delete reverted): ` +
            `pooled_blob_object_id=${target.pooled_blob.pooled_blob_object_id} ` +
            `bucket=${bucketName} key=${s3Key}: ${result.effects?.status?.error}`,
        );
        return;
      }
      this.logger.log(
        `object deleted: bucket=${bucketName} key=${s3Key} ` +
          `pooled=${target.pooled_blob.pooled_blob_object_id.slice(0, 12)}… tx=${result.digest}`,
      );
    } catch (e) {
      this.logger.error(
        `ORPHAN POOLED BLOB (delete RPC failed): ` +
          `pooled_blob_object_id=${target.pooled_blob.pooled_blob_object_id} ` +
          `bucket=${bucketName} key=${s3Key}: ${(e as Error).message}`,
      );
      // Same as above — row soft-deleted, reaper cleans up.
    }
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
}

/**
 * AWS S3 user-metadata cap: the total serialized size of `x-amz-meta-*`
 * headers (each `name + value`, sum across all entries) must not exceed
 * 2 KiB for PUT requests. Mirroring the spec keeps us drop-in compatible
 * with the AWS Java/Python SDKs that already validate against this.
 */
const MAX_METADATA_BYTES = 2 * 1024;

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

/**
 * Find the `KraterionPooledBlobRegistered` event in PTB 1's effects
 * payload and return the new PooledBlob's on-chain object ID.
 *
 * Matches on the fully-qualified Move type to ignore other events that
 * the same package might emit in unrelated tx batches. Filters by
 * `blob_id` too — in theory one PTB could register multiple blobs at
 * once; in practice the gateway never batches, but the filter is cheap
 * insurance.
 */
function pickPooledBlobObjectIdFromEvents(
  events: Array<Record<string, unknown>>,
  blobId: bigint,
): string | null {
  for (const ev of events) {
    if (ev["type"] !== KRATERION_POOLED_BLOB_REGISTERED_TYPE) continue;
    const json = ev["parsedJson"] as Record<string, unknown> | undefined;
    if (!json) continue;
    const evBlobId = json["walrus_blob_id"];
    // Sui RPC serialises u256 as decimal strings; compare as BigInt.
    if (typeof evBlobId === "string" && BigInt(evBlobId) === blobId) {
      const oid = json["pooled_blob_object_id"];
      if (typeof oid === "string") return oid;
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
