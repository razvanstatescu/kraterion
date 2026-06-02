import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { SessionCloseReason } from "./session-archive.js";

export const SESSION_ARCHIVE_QUEUE = "kraterion-session-archive";

export interface SessionArchiveJobData {
  session_id: string;
  close_reason: SessionCloseReason;
}

/**
 * Public service-tier API for the session-archive pipeline.
 *
 * The session sweeper (D5) flips `AgentSession.status` from `open` to
 * `flushing` and then calls `enqueue()` here. The processor consumes
 * the queue, runs `archiveSessionToWalrus`, and transitions the row
 * to `anchored` (on chain success) or `failed` (on exhausted retries).
 *
 * Idempotency: `jobId = session_<id>` so concurrent sweeper passes
 * collapse to one job. The processor double-guards by skipping when
 * `session.status !== 'flushing'` (re-runs after status reset still
 * work; this is just a fast path).
 */
@Injectable()
export class SessionArchiveService {
  private readonly logger = new Logger(SessionArchiveService.name);

  constructor(
    @InjectQueue(SESSION_ARCHIVE_QUEUE)
    private readonly queue: Queue<SessionArchiveJobData>,
  ) {}

  async enqueue(data: SessionArchiveJobData): Promise<void> {
    const jobId = `session_${data.session_id}`;
    await this.queue.add("archive-session", data, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 14 * 24 * 60 * 60 },
    });
    this.logger.log(
      `session-archive enqueued: session=${data.session_id} reason=${data.close_reason}`,
    );
  }
}
