/**
 * BullMQ queue constants — must match the worker's
 * `apps/worker/src/embeddings/embeddings.service.ts`.
 *
 * Why duplicated here rather than imported from the worker package:
 * the worker is an app, not a workspace package, so its source isn't
 * importable. Promoting these constants to a shared workspace package
 * is a post-K2 follow-up — for now we accept the small duplication
 * and a test below to make sure they don't drift.
 *
 * If you change either side, change BOTH and re-run the K2 smoke
 * (`/v1/buckets/<id>/knowledge` with `enabled: true` against a bucket
 * that has un-indexed objects).
 */

export const EMBEDDINGS_QUEUE_NAME = "kraterion-embeddings";

export interface EmbeddingsJobData {
  s3_object_id: string;
  manifest_version: number;
}
