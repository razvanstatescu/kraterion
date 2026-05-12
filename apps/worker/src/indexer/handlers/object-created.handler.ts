import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { EmbeddingsService } from "../../embeddings/embeddings.service.js";
import { KraterionObjectCreatedSchema } from "../event-types.js";
import { walrusBlobIdU256ToString } from "../walrus-blob-id.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionObjectCreated` → `S3Object` row.
 *
 * The event carries every field S3Object needs EXCEPT
 * `shared_blob_object_id` — walrus's `shared_blob::new(blob, ctx)`
 * consumes the Blob and shares without returning, so the kraterion
 * module never observes the SharedBlob's ID.
 *
 * Recovery: among `tx.effects.changed_objects[]`, find the unique
 * entry with `idOperation === "created"`. In a `wrap_in_shared_blob`
 * transaction:
 *   - the SharedBlob is the only newly-created object;
 *   - the consumed Blob is moved into it (idOperation=NONE/mutated);
 *   - the bucket + gas coin are also mutated (idOperation=NONE).
 * So the lone CREATED entry IS the SharedBlob.
 *
 * Why not match by objectType ending in `::SharedBlob`? Because the
 * proto explicitly notes "Type information is not provided by the
 * effects structure but is instead provided by an indexing layer."
 * `getCheckpoint` and `SubscribeCheckpoints` return raw effects with
 * `object_type` undefined; only the typed `getTransaction` API
 * surfaces it. We avoid the extra round-trip by using `id_operation`,
 * which IS present in the raw effects.
 *
 * The handler upserts on `(tx_digest, event_seq)` — the indexer's
 * idempotency key. Re-running on a backfill is a no-op.
 *
 * `walrus_blob_id` arrives as a u256 decimal string (gRPC encodes
 * u256 via `google.protobuf.Value`'s number/string variants).
 * Walrus's TS SDK formats blob IDs as URL-safe-base64 of the
 * little-endian 32 bytes — we apply that conversion in
 * `walrusBlobIdU256ToString`.
 */
@Injectable()
export class ObjectCreatedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionObjectCreated"] as const;

  private readonly logger = new Logger(ObjectCreatedHandler.name);

  // K1 hook: after the S3Object row lands, ask the embeddings service
  // to enqueue an indexing job. The service is the only edit to the
  // existing handler graph — everything else in the embeddings layer
  // is new code under `apps/worker/src/embeddings/`.
  constructor(private readonly embeddings: EmbeddingsService) {}

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionObjectCreatedSchema.parse(event.payload);

    // Recover SharedBlob ID: the unique CREATED entry in tx effects
    // (see header comment for why object_type can't be checked).
    const created = event.txEffects.changedObjects.filter((c) => c.idOperation === "created");
    if (created.length !== 1) {
      throw new Error(
        `ObjectCreatedHandler: tx ${event.txDigest.toString("utf8").slice(0, 12)}… ` +
          `expected exactly 1 created object (the SharedBlob); got ${created.length}`,
      );
    }
    const sharedBlob = created[0]!;

    // Resolve bucket_id (FK) from the on-chain bucket object id.
    const bucket = await tx.bucket.findUnique({
      where: { kraterion_bucket_object_id: parsed.bucket_id },
      select: { id: true },
    });
    if (!bucket) {
      throw new Error(
        `ObjectCreatedHandler: no Bucket row for kraterion_bucket_object_id=${parsed.bucket_id}. ` +
          `BucketCreatedHandler should have run first; if this fires under live operation it suggests ` +
          `out-of-order processing — check the cursor.`,
      );
    }

    const s3Key = parsed.s3_key.toString("utf8");
    const contentType = parsed.content_type.length > 0 ? parsed.content_type.toString("utf8") : null;
    const walrusBlobIdString = walrusBlobIdU256ToString(parsed.walrus_blob_id);
    const etagHex = parsed.etag_md5.toString("hex");

    // K5: manifest archive blobs land under a reserved key prefix. The
    // Move package emits the same `KraterionObjectCreated` event we use
    // for user objects (a separate event would require a Move bump +
    // package republish, which would orphan every existing bucket).
    // Instead, the worker writes manifests under
    // `_kraterion/manifests/<manifest_id>.json` and the indexer routes
    // those events to `KnowledgeManifest` updates without ever creating
    // an `S3Object` row — so they don't pollute ListObjectsV2 or the
    // bucket's file browser. The user can never PUT under `_kraterion/`
    // (the gateway rejects it; see `objects.write.controller.ts`).
    const MANIFEST_PREFIX = "_kraterion/manifests/";
    if (s3Key.startsWith(MANIFEST_PREFIX)) {
      const manifestId = s3Key.slice(MANIFEST_PREFIX.length, -".json".length);
      const updated = await tx.knowledgeManifest.updateMany({
        where: { id: manifestId, bucket_id: bucket.id },
        data: {
          manifest_walrus_blob_id: walrusBlobIdString,
          manifest_shared_blob_object_id: sharedBlob.objectId,
        },
      });
      this.logger.log(
        `KnowledgeManifest archived on chain: manifest=${manifestId} ` +
          `bucket=${parsed.bucket_id} blob_id=${walrusBlobIdString} ` +
          `shared=${sharedBlob.objectId.slice(0, 12)}… (updated=${updated.count})`,
      );
      return;
    }

    // S3 semantics: `PUT s3://bucket/key` is unconditionally
    // last-write-wins. The natural key for the row is
    // `(bucket_id, s3_key)` — a fresh PutObject with the same key
    // replaces the previous row's SharedBlob/etag/etc. The prior
    // SharedBlob persists on chain (orphan; future reaper job).
    //
    // The `(tx_digest, event_seq) UNIQUE` is a SECONDARY guard
    // against double-processing the same event during a backfill
    // (e.g., after `indexer:reset`). The replay produces the same
    // `(bucket_id, s3_key)` row; the upsert's UPDATE branch
    // re-writes the same fields and the (tx_digest, event_seq)
    // pair stays consistent.
    const previous = await tx.s3Object.findUnique({
      where: { bucket_id_s3_key: { bucket_id: bucket.id, s3_key: s3Key } },
      select: { shared_blob_object_id: true, walrus_blob_id: true, tx_digest: true },
    });
    if (
      previous &&
      previous.shared_blob_object_id !== sharedBlob.objectId &&
      // Only log "overwrite orphan" when this event is genuinely a
      // new write — not a reprocessing of the same event after
      // `indexer:reset` (which would have the same shared_blob).
      !(previous.tx_digest && previous.tx_digest.equals(event.txDigest))
    ) {
      this.logger.warn(
        `ORPHAN SHAREDBLOB (overwritten): bucket=${parsed.bucket_id} key="${s3Key}" ` +
          `prev_shared=${previous.shared_blob_object_id} prev_blob_id=${previous.walrus_blob_id} ` +
          `→ new_shared=${sharedBlob.objectId}`,
      );
    }

    const row = await tx.s3Object.upsert({
      where: { bucket_id_s3_key: { bucket_id: bucket.id, s3_key: s3Key } },
      create: {
        bucket_id: bucket.id,
        s3_key: s3Key,
        size_bytes: parsed.size_bytes,
        content_type: contentType,
        etag: etagHex,
        walrus_blob_id: walrusBlobIdString,
        shared_blob_object_id: sharedBlob.objectId,
        storage_end_epoch: parsed.storage_end_epoch,
        seal_identity: parsed.seal_identity,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
      },
      update: {
        size_bytes: parsed.size_bytes,
        content_type: contentType,
        etag: etagHex,
        walrus_blob_id: walrusBlobIdString,
        shared_blob_object_id: sharedBlob.objectId,
        storage_end_epoch: parsed.storage_end_epoch,
        seal_identity: parsed.seal_identity,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
        event_payload: event.payload as Prisma.InputJsonValue,
        deleted_at: null, // un-soft-delete on overwrite (S3 spec)
        uploaded_at: new Date(),
      },
      select: { id: true },
    });

    this.logger.log(
      `S3Object created: bucket=${parsed.bucket_id} key="${s3Key}" ` +
        `size=${parsed.size_bytes} shared=${sharedBlob.objectId.slice(0, 12)}… etag=${etagHex.slice(0, 8)}…`,
    );

    // K1: enqueue an embed job if the parent bucket has Knowledge
    // enabled. The enqueue is fire-and-forget — the processor reads
    // the freshly-upserted row itself. We deliberately call this
    // INSIDE the tx for two reasons:
    //  1. If the tx rolls back, the bucket/object state we'd be
    //     enqueueing for never existed; the worst case is one BullMQ
    //     job that the processor immediately marks as failed (cheap).
    //  2. Doing it post-commit would require a handler-interface
    //     change (no `postCommit` hook today) — overkill for K1.
    // The `maybeEnqueue` call only writes to Redis, so it does not
    // join the Prisma transaction. A rare tx-rollback-after-enqueue
    // outcome is documented and acceptable.
    void this.embeddings.maybeEnqueue(row.id).catch((err) => {
      this.logger.warn(
        `embeddings.maybeEnqueue failed for s3_object=${row.id}: ${(err as Error).message}`,
      );
    });
  }
}
