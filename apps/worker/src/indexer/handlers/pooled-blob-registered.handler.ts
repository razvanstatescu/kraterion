import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  blobIdU256ToString,
  readPoolUsedEncodedBytes,
  readPooledBlobRegisteredEpoch,
} from "@kraterion/walrus-client";
import { EmbeddingsService } from "../../embeddings/embeddings.service.js";
import { KraterionPooledBlobRegisteredSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionPooledBlobRegistered` → `PooledBlob` row + placeholder
 * `S3Object` row.
 *
 * Emitted by `pool_vault::register_blob` (gateway-signed). PUT then
 * goes off to the upload-relay and comes back to certify; that fires
 * the matching `pooled-blob-certified` handler which flips
 * `PooledBlob.status` to 'certified'.
 *
 * The gateway's `waitForS3Object` polls for
 * `S3Object.pooled_blob.status='certified'` — so the row exists from
 * REGISTER (status='registered') but the gateway waits until CERTIFY
 * sets status='certified' before returning 200.
 *
 * The event's `seal_identity` contains the bucket's on-chain object ID
 * as its first 32 bytes (`bucket_uid || object_uuid`); we use that to
 * resolve the parent Bucket row without needing an extra event field.
 *
 * Idempotent via `(tx_digest, event_seq) UNIQUE`. Replay-safe: the
 * PooledBlob upsert is keyed on `pooled_blob_object_id`; the S3Object
 * upsert is keyed on `(bucket_id, s3_key)` and harmlessly re-applies
 * the same data on replay.
 *
 * Knowledge enqueue: if the bucket is knowledge-enabled, the worker
 * starts a background indexing job. Same fire-and-forget pattern the
 * SharedBlob-era handler used.
 */
@Injectable()
export class PooledBlobRegisteredHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionPooledBlobRegistered"] as const;

  private readonly logger = new Logger(PooledBlobRegisteredHandler.name);

  constructor(private readonly embeddings: EmbeddingsService) {}

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionPooledBlobRegisteredSchema.parse(event.payload);

    // Reserved-namespace handling.
    //
    // `_kraterion/manifests/*` — K5 knowledge manifest archives write
    // their `manifest_walrus_blob_id` directly to `KnowledgeManifest`
    // from the worker; no PooledBlob/S3Object row needed. Skip entirely.
    //
    // `_kraterion/sessions/*` — P9 session traces. The companion
    // `SessionAnchoredHandler` (running on the next event in the same
    // tx) looks up the PooledBlob row by `pooled_blob_object_id` to
    // join to `AgentSessionTrace`. So we DO need the PooledBlob row;
    // we just skip the S3Object upsert (these aren't user-facing
    // objects). Fall through to the registration logic below, with an
    // early-exit flag set before the S3Object section.
    //
    // The gateway already refuses user PUTs under `_kraterion/`, so
    // any other reserved prefix is a programming bug.
    const s3Key = parsed.s3_key.toString("utf8");
    const isSessionTrace = s3Key.startsWith("_kraterion/sessions/");
    if (s3Key.startsWith("_kraterion/") && !isSessionTrace) {
      this.logger.warn(
        `Skipping reserved-namespace blob: vault=${parsed.vault_id} key=${s3Key}`,
      );
      return;
    }

    // Resolve the StoragePool row (and confirm it exists — DLQ if not,
    // means we missed the vault-created event).
    const pool = await tx.storagePool.findUnique({
      where: { vault_object_id: parsed.vault_id },
      select: {
        id: true,
        pool_object_id: true,
        used_encoded_bytes: true,
      },
    });
    if (!pool) {
      throw new Error(
        `PooledBlobRegisteredHandler: no StoragePool for vault=${parsed.vault_id}. ` +
          `vault-created event must arrive first.`,
      );
    }

    // Resolve the parent bucket from the seal_identity's first 32 bytes.
    if (parsed.seal_identity.length < 32) {
      throw new Error(
        `PooledBlobRegisteredHandler: seal_identity too short ` +
          `(${parsed.seal_identity.length} bytes); expected ≥32.`,
      );
    }
    const bucketObjectId = "0x" + parsed.seal_identity.subarray(0, 32).toString("hex");
    const bucket = await tx.bucket.findUnique({
      where: { kraterion_bucket_object_id: bucketObjectId },
      select: { id: true },
    });
    if (!bucket) {
      throw new Error(
        `PooledBlobRegisteredHandler: no Bucket for object_id=${bucketObjectId} ` +
          `(from seal_identity prefix).`,
      );
    }

    // Encoded size + registered_epoch aren't carried by the event
    // (the Move-side `KraterionPooledBlobRegistered` keeps the
    // event payload tight — plaintext metadata only). Read them off
    // chain after the register tx lands:
    //
    //   - `pool.used_encoded_bytes` post-register = previous + this
    //     blob's encoded size, so the delta is the per-blob value.
    //   - `pooled_blob.registered_epoch` is set on the register tx
    //     and never changes.
    //
    // Failure mode: if the RPC read fails, we still write the row
    // (encoded_size = 0, registered_epoch = 0) so the gateway's
    // `waitForS3Object` poll completes — a backfill probe can patch
    // the missing fields later (see scripts/probe-backfill-pooled-
    // blob-sizes.ts). Better to ship an incomplete row than to
    // wedge the upload.
    let encodedSizeBytes = 0n;
    let postRegisterUsedBytes = pool.used_encoded_bytes;
    let registeredEpoch = 0;
    try {
      const liveUsed = await readPoolUsedEncodedBytes(pool.pool_object_id);
      if (liveUsed !== null) {
        postRegisterUsedBytes = liveUsed;
        const delta = liveUsed - pool.used_encoded_bytes;
        if (delta > 0n) encodedSizeBytes = delta;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to read pool ${pool.pool_object_id} state: ${(err as Error).message}. ` +
          `Falling back to encoded_size=0; row will need backfill.`,
      );
    }
    try {
      const epoch = await readPooledBlobRegisteredEpoch(
        parsed.pooled_blob_object_id,
      );
      if (epoch !== null) registeredEpoch = epoch;
    } catch (err) {
      this.logger.warn(
        `Failed to read pooled blob ${parsed.pooled_blob_object_id} epoch: ${(err as Error).message}`,
      );
    }

    const contentType = parsed.content_type.toString("utf8") || null;
    const etagHex = parsed.etag_md5.toString("hex");

    // The on-chain event carries `walrus_blob_id` as a `u256`; the rest
    // of the system (walruscan links, aggregator URLs, agent citations)
    // expects the canonical URL-safe-base64 form. Convert once at the
    // boundary so every downstream reader gets it right.
    const walrusBlobId = blobIdU256ToString(parsed.walrus_blob_id);

    // Insert PooledBlob first (S3Object's FK depends on it). Upsert on
    // `pooled_blob_object_id` for replay safety.
    const pooledBlob = await tx.pooledBlob.upsert({
      where: { pooled_blob_object_id: parsed.pooled_blob_object_id },
      create: {
        storage_pool_id: pool.id,
        walrus_blob_id: walrusBlobId,
        pooled_blob_object_id: parsed.pooled_blob_object_id,
        encoded_size_bytes: encodedSizeBytes,
        registered_epoch: registeredEpoch,
      },
      update: {
        // Idempotent re-application — overwrite encoded_size_bytes
        // and registered_epoch with what's now on chain (helps with
        // replay after a backfill).
        encoded_size_bytes: encodedSizeBytes,
        registered_epoch: registeredEpoch,
      },
      select: { id: true },
    });

    // Sync StoragePool.used_encoded_bytes with the post-register
    // on-chain value. The chain is the authoritative source; if we
    // missed prior events or if two registers race, mirroring keeps
    // the dashboard's "X MB used" honest.
    if (postRegisterUsedBytes !== pool.used_encoded_bytes) {
      await tx.storagePool.update({
        where: { id: pool.id },
        data: {
          used_encoded_bytes: postRegisterUsedBytes,
          blob_count: { increment: 1 },
          last_synced_at: new Date(),
        },
      });
    }

    // Session traces stop here — they don't have an S3Object surface
    // and they don't get embedded. The companion
    // `SessionAnchoredHandler` will read the PooledBlob row above to
    // link the `AgentSessionTrace` row.
    if (isSessionTrace) {
      this.logger.log(
        `PooledBlob registered (session trace): vault=${parsed.vault_id.slice(0, 12)}… ` +
          `pooled=${parsed.pooled_blob_object_id.slice(0, 12)}… key="${s3Key}"`,
      );
      return;
    }

    // Upsert S3Object keyed on (bucket_id, s3_key). On overwrite (same
    // key, different blob), the previous row is soft-deleted by the
    // gateway's PUT path BEFORE register — so the upsert below either
    // creates a fresh row or updates the soft-deleted one. We always
    // clear deleted_at on conflict so the row is live again.
    const s3Object = await tx.s3Object.upsert({
      where: { bucket_id_s3_key: { bucket_id: bucket.id, s3_key: s3Key } },
      create: {
        bucket_id: bucket.id,
        s3_key: s3Key,
        size_bytes: parsed.size_bytes,
        content_type: contentType,
        etag: etagHex,
        walrus_blob_id: walrusBlobId,
        pooled_blob_id: pooledBlob.id,
        encoded_size_bytes: encodedSizeBytes,
        seal_identity: parsed.seal_identity,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
      },
      update: {
        size_bytes: parsed.size_bytes,
        content_type: contentType,
        etag: etagHex,
        walrus_blob_id: walrusBlobId,
        pooled_blob_id: pooledBlob.id,
        encoded_size_bytes: encodedSizeBytes,
        seal_identity: parsed.seal_identity,
        deleted_at: null,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    this.logger.log(
      `PooledBlob registered: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `pooled=${parsed.pooled_blob_object_id.slice(0, 12)}… ` +
        `bucket=${bucket.id} key="${s3Key}"`,
    );

    // Fire-and-forget Knowledge enqueue (only if the bucket has
    // KnowledgeBucketSettings; the service handles the no-op case).
    // Note: not awaited inside the tx because BullMQ Redis writes
    // shouldn't block the indexer's checkpoint commit. The S3Object row
    // exists in the parent transaction by the time the worker pulls it.
    void this.embeddings.maybeEnqueue(s3Object.id).catch((err: unknown) => {
      this.logger.error(
        `Failed to enqueue embeddings for s3_object=${s3Object.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    });
  }
}
