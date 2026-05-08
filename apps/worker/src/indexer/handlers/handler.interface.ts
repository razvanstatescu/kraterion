import type { Prisma } from "@prisma/client";

/**
 * One handler per fully-qualified Move event type.
 *
 * `handle` runs INSIDE the per-checkpoint Prisma `$transaction` —
 * any `INSERT` / `UPDATE` it performs commits atomically with the
 * cursor advance (or rolls back together if a later handler in the
 * same checkpoint throws and we re-route to DLQ).
 *
 * The dispatcher passes a typed `tx` (`Prisma.TransactionClient`)
 * so handlers don't import the global PrismaClient — keeps testability
 * clean and avoids accidentally writing outside the transaction.
 *
 * `event` is the raw, parsed envelope; the handler's first job is
 * to validate `event.payload` against its Zod schema. If validation
 * throws, the dispatcher routes to the DLQ. Handlers should NOT
 * catch and swallow validation errors themselves.
 */
export interface ParsedEvent {
  /** Full Sui type, e.g. `0x27e1...::events::KraterionBucketCreated`. */
  eventType: string;
  /** Module name, e.g. `events`. */
  module: string;
  /** Sender address (`0x...`). */
  sender: string;
  /** The transaction's digest as bytes (the canonical idempotency key). */
  txDigest: Buffer;
  /** Per-tx event index (the `j` in `tx.events.events[j]`). */
  eventSeq: number;
  /** Sui checkpoint sequence number this event was finalized in. */
  checkpointSeq: bigint;
  /** Checkpoint timestamp in ms — for `indexer_lag_seconds`. */
  timestampMs: number;
  /** Pre-deserialized `event.json` from the gRPC payload. */
  payload: Record<string, unknown>;
  /**
   * Whole-transaction context — needed by some handlers to recover
   * data the event itself doesn't carry. For example,
   * `KraterionObjectCreated` doesn't include `shared_blob_object_id`
   * (walrus's `shared_blob::new` doesn't return the SharedBlob), so
   * the handler walks `txEffects.changedObjects[]` for one with
   * `objectType === "...::shared_blob::SharedBlob"`.
   */
  txEffects: {
    changedObjects: Array<{
      objectId: string;
      objectType: string;
      // No "mutated" in the proto enum — mutated objects have
      // id_operation = NONE (mapped to "unknown" here). See
      // `checkpoint-events.ts:normalizeIdOperation`.
      idOperation: "created" | "deleted" | "unknown";
    }>;
  };
}

export interface EventHandler {
  /**
   * One or more suffixes the dispatcher matches with `endsWith`. The
   * package address prefix is intentionally NOT part of the suffix
   * so a redeploy of the Kraterion package (new package id) doesn't
   * require touching the dispatcher map.
   *
   * Most handlers register a single suffix
   * (`::events::KraterionBucketCreated`). Handlers like
   * `ApiAccessHandler` that route two related events through one
   * code path register multiple
   * (`::events::ApiAccessGranted`, `::events::ApiAccessRevoked`)
   * and disambiguate inside `handle` via `event.eventType`.
   */
  readonly typeSuffixes: readonly string[];

  /**
   * Process the event. Runs inside an open Prisma transaction. May
   * throw — dispatcher catches and DLQs.
   */
  handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void>;
}
