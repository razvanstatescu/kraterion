import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ParsedEvent } from "./handlers/handler.interface.js";

const MAX_RETRIES = 3;

/**
 * Dead-letter queue for events whose handler threw. Per the Phase-1
 * design: we never freeze the cursor on a poison event — instead, we
 * stash the offending event in `IndexerDeadLetter` and continue past
 * it. A separate retry sweep (`scheduleRetries`) re-attempts up to
 * `MAX_RETRIES` times before flipping `status = 'parked'` for human
 * triage.
 *
 * The `(source_id, tx_digest, event_seq)` natural key means
 * re-encountering the same event during a backfill bumps the retry
 * count rather than creating a duplicate row.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Insert (or bump retries on) a poisoned event. Runs OUTSIDE the
   * checkpoint's main transaction so the rest of the checkpoint can
   * commit even if the DLQ insert itself races. */
  async record(
    sourceId: string,
    event: ParsedEvent,
    error: Error,
  ): Promise<void> {
    const data = {
      source_id: sourceId,
      checkpoint_seq: event.checkpointSeq,
      tx_digest: event.txDigest,
      event_seq: event.eventSeq,
      event_type: event.eventType,
      payload: event.payload as Prisma.InputJsonValue,
      error_message: error.message,
      error_stack: error.stack ?? null,
      last_attempt_at: new Date(),
    };
    await this.prisma.indexerDeadLetter
      .upsert({
        where: {
          source_id_tx_digest_event_seq: {
            source_id: sourceId,
            tx_digest: event.txDigest,
            event_seq: event.eventSeq,
          },
        },
        create: data,
        update: {
          // On re-entry, bump retries and re-record the latest error.
          retries: { increment: 1 },
          error_message: data.error_message,
          error_stack: data.error_stack,
          last_attempt_at: data.last_attempt_at,
          status: "pending", // re-open if previously parked? handled by sweep
        },
      })
      .then(async (row) => {
        if (row.retries >= MAX_RETRIES && row.status !== "parked") {
          await this.prisma.indexerDeadLetter.update({
            where: { id: row.id },
            data: { status: "parked" },
          });
          this.logger.error(
            `DLQ row PARKED after ${row.retries} retries — manual intervention needed: ` +
              `source=${sourceId} type=${event.eventType} tx=${event.txDigest.toString("utf8").slice(0, 12)}…`,
          );
        }
      });
    this.logger.warn(
      `DLQ insert: source=${sourceId} type=${event.eventType} ` +
        `tx=${event.txDigest.toString("utf8").slice(0, 12)}… seq=${event.eventSeq} ` +
        `error="${error.message}"`,
    );
  }

  /** Resolve a DLQ row (called by the retry sweep on success). */
  async markResolved(id: string): Promise<void> {
    await this.prisma.indexerDeadLetter.update({
      where: { id },
      data: { status: "resolved" },
    });
  }
}
