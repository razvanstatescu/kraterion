import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { blobIdU256ToString } from "@kraterion/walrus-client";
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

    // Reserved-namespace guard — knowledge manifests come through a
    // different path. The gateway already refuses user PUTs under
    // `_kraterion/`, so this should never fire in practice; defensive.
    const s3Key = parsed.s3_key.toString("utf8");
    if (s3Key.startsWith("_kraterion/")) {
      this.logger.warn(
        `Skipping reserved-namespace blob: vault=${parsed.vault_id} key=${s3Key}`,
      );
      return;
    }

    // Resolve the StoragePool row (and confirm it exists — DLQ if not,
    // means we missed the vault-created event).
    const pool = await tx.storagePool.findUnique({
      where: { vault_object_id: parsed.vault_id },
      select: { id: true },
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

    // Encoded size isn't in this event (it's known on chain via the
    // pool's used_encoded_bytes delta). For accurate per-blob accounting
    // we'd want it; for v1 we leave it 0 here and the
    // pool-resized/auto-sync code can backfill. The plaintext size
    // (`parsed.size_bytes`) goes into the `S3Object` row directly.
    const encodedSizeBytes = 0n;

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
        registered_epoch: 0, // No current-epoch on the event; certify handler
                             // refreshes via `certified_epoch` if needed.
      },
      update: {
        // Idempotent re-application; nothing to change.
      },
      select: { id: true },
    });

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
