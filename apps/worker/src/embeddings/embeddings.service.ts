import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service.js";

export const EMBEDDINGS_QUEUE = "kraterion-embeddings";

export interface EmbeddingsJobData {
  s3_object_id: string;
  /** Stable across retries — set by `enqueue()` to the
   *  `(s3_object_id, manifest_version)` pair so re-PUT bumps re-enqueue
   *  cleanly. */
  manifest_version: number;
}

/**
 * Public service-tier API for the embeddings pipeline.
 *
 * Two responsibilities:
 *  1. **Enqueue** — called by `ObjectCreatedHandler` after the indexer
 *     writes a row, gated on the parent bucket having an opt-in
 *     `KnowledgeBucketSettings` record.
 *  2. **Backfill helpers** — `enqueueBucket(bucketId)` walks all
 *     existing objects in a bucket and enqueues each. Used when a
 *     user toggles Knowledge on for a bucket that already has objects
 *     (K2 wires this from the CP endpoint).
 *
 * Both methods are idempotent: the queue uses `jobId = manifest_<id>_v<n>`
 * so two concurrent enqueues for the same (object, version) collapse
 * to one. The processor itself further protects against double-work
 * by reading the manifest row.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    @InjectQueue(EMBEDDINGS_QUEUE)
    private readonly queue: Queue<EmbeddingsJobData>,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enqueue an embed job for a single object IF its bucket is
   * knowledge-enabled. Cheap to call from the indexer hot path —
   * one Postgres lookup + one Redis push.
   *
   * Returns the queued `Job` if enqueued, `null` if the bucket has no
   * `KnowledgeBucketSettings`. Callers don't need to await; the
   * indexer's tx finishes regardless.
   */
  async maybeEnqueue(s3ObjectId: string): Promise<{ queued: boolean; reason?: string }> {
    const object = await this.prisma.s3Object.findUnique({
      where: { id: s3ObjectId },
      select: {
        id: true,
        bucket_id: true,
        deleted_at: true,
        bucket: { select: { id: true, knowledge: { select: { bucket_id: true } } } },
      },
    });
    if (!object) return { queued: false, reason: "object_missing" };
    if (object.deleted_at) return { queued: false, reason: "object_deleted" };
    if (!object.bucket.knowledge) return { queued: false, reason: "bucket_not_knowledge_enabled" };

    // Manifest version: 1 on first index; bumps on overwrite via the
    // processor's transactional version-fetch. Enqueue with the
    // *expected next* version so the BullMQ dedup key matches what
    // the processor will produce.
    const latest = await this.prisma.knowledgeManifest.findFirst({
      where: { s3_object_id: s3ObjectId },
      orderBy: { version: "desc" },
      select: { version: true, status: true },
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    const jobId = `manifest_${s3ObjectId}_v${nextVersion}`;
    await this.queue.add(
      "index-object",
      { s3_object_id: s3ObjectId, manifest_version: nextVersion },
      {
        jobId,
        // 3 retries with exponential backoff; on final failure the
        // processor writes status=failed + error_detail.
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 14 * 24 * 60 * 60 },
      },
    );
    this.logger.log(`enqueued index job: s3_object=${s3ObjectId} version=${nextVersion}`);
    return { queued: true };
  }

  /**
   * Enqueue every non-deleted object in a bucket. Called when a user
   * toggles Knowledge on for a bucket that already has files; K2's
   * `POST /v1/buckets/:id/knowledge` invokes this.
   *
   * Pages internally to keep memory bounded — buckets with 100k+
   * objects should still enqueue cleanly.
   */
  async enqueueBucket(bucketId: string): Promise<number> {
    const PAGE = 500;
    let cursor: string | null = null;
    let total = 0;
    const where = { bucket_id: bucketId, deleted_at: null };
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows: Array<{ id: string }> = cursor
        ? await this.prisma.s3Object.findMany({
            where,
            orderBy: { id: "asc" },
            cursor: { id: cursor },
            skip: 1,
            take: PAGE,
            select: { id: true },
          })
        : await this.prisma.s3Object.findMany({
            where,
            orderBy: { id: "asc" },
            take: PAGE,
            select: { id: true },
          });
      if (rows.length === 0) break;
      await Promise.all(rows.map((r: { id: string }) => this.maybeEnqueue(r.id)));
      total += rows.length;
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < PAGE) break;
    }
    this.logger.log(`bucket backfill enqueued: bucket=${bucketId} objects=${total}`);
    return total;
  }
}
