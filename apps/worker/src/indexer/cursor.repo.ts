import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * `IndexerCursor` is a single row per pipeline source. The run-loop
 * reads it before subscribing (to know where to resume from) and
 * advances it inside every per-checkpoint Prisma transaction.
 *
 * `last_checkpoint_seq` is the gRPC-native unit of progress.
 * `last_tx_digest` and `last_event_seq` are diagnostic only — they
 * record the tail event of the most recent checkpoint we processed.
 */
export interface CursorState {
  lastCheckpointSeq: bigint;
  lastTxDigest: Buffer | null;
  lastEventSeq: number | null;
}

@Injectable()
export class CursorRepo {
  constructor(private readonly prisma: PrismaService) {}

  async read(sourceId: string): Promise<CursorState | null> {
    const row = await this.prisma.indexerCursor.findUnique({
      where: { source_id: sourceId },
    });
    if (!row) return null;
    return {
      lastCheckpointSeq: row.last_checkpoint_seq,
      lastTxDigest: row.last_tx_digest as Buffer | null,
      lastEventSeq: row.last_event_seq,
    };
  }

  /**
   * Upsert the cursor inside an open transaction. The caller wraps
   * `cursor.advance(...)` with row-level inserts in a single
   * `$transaction`, so a failure in either half rolls both back.
   */
  async advance(
    tx: Prisma.TransactionClient,
    sourceId: string,
    state: CursorState,
  ): Promise<void> {
    await tx.indexerCursor.upsert({
      where: { source_id: sourceId },
      create: {
        source_id: sourceId,
        last_checkpoint_seq: state.lastCheckpointSeq,
        last_tx_digest: state.lastTxDigest,
        last_event_seq: state.lastEventSeq,
      },
      update: {
        last_checkpoint_seq: state.lastCheckpointSeq,
        last_tx_digest: state.lastTxDigest,
        last_event_seq: state.lastEventSeq,
        // updated_at auto-bumps via Prisma's @updatedAt directive.
      },
    });
  }

  /** Operational tool: drop the cursor row so the next run backfills from genesis. */
  async reset(sourceId: string): Promise<void> {
    await this.prisma.indexerCursor.delete({ where: { source_id: sourceId } }).catch(() => {
      /* row didn't exist; idempotent */
    });
  }
}
