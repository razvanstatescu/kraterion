/**
 * Mirrors `apps/worker/src/sessions/session-archive.service.ts` —
 * Bull queue name + job-data shape for the producer side. The
 * control-plane is a producer-only client; the worker owns the
 * processor.
 *
 * Duplicating the constant rather than importing across apps mirrors
 * the existing `EMBEDDINGS_QUEUE_NAME` pattern in
 * `apps/control-plane/src/knowledge/embeddings-queue.constants.ts`.
 * If you change the queue name or the job-data shape here, change
 * both files.
 */

export const SESSION_ARCHIVE_QUEUE = "kraterion-session-archive";

export type SessionCloseReason =
  | "idle"
  | "size_cap"
  | "age_cap"
  | "explicit_end";

export interface SessionArchiveJobData {
  session_id: string;
  close_reason: SessionCloseReason;
}
