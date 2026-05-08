/**
 * gRPC `FieldMask` paths for `SubscribeCheckpoints` and `GetCheckpoint`.
 *
 * Path-rooting verdict (probed 2026-05-08, see `cli/probe-readmask.ts`
 * and `docs/decisions.md`):
 *   - SubscribeCheckpoints AND GetCheckpoint both root paths at the
 *     `Checkpoint` message — i.e. `transactions.events.events.json`,
 *     NOT `checkpoint.transactions.events.events.json`.
 *   - Without an explicit mask, the response is essentially empty.
 *     Specifying the mask is mandatory.
 *
 * The mask is field-selection only — Sui gRPC does NOT support
 * filter expressions. We download every transaction in every
 * checkpoint and filter by `event.packageId` client-side in
 * `checkpoint-events.ts`. At our volume (hundreds of events/day) the
 * bandwidth is fine; the heavy fields (`transactions.transaction`,
 * `transactions.effects.changed_objects.object_id` outside what we
 * need, `transactions.objects`, `objects`, `balance_changes`) are
 * deliberately excluded.
 *
 * What we keep:
 *   - `sequence_number` + `digest`             — checkpoint identity
 *   - `summary.timestamp`                       — for indexer_lag_seconds
 *   - `transactions.digest`                     — per-event tx digest
 *   - `transactions.events.events.*`           — the meat
 *   - `transactions.effects.changed_objects.*` — needed to derive
 *     `shared_blob_object_id` for ObjectCreated (walrus's
 *     `shared_blob::new` doesn't return the SharedBlob in the event)
 */

export const CHECKPOINT_READ_MASK_PATHS: readonly string[] = [
  "sequence_number",
  "digest",
  "summary.timestamp",
  "transactions.digest",
  "transactions.events.events.package_id",
  "transactions.events.events.module",
  "transactions.events.events.event_type",
  "transactions.events.events.sender",
  "transactions.events.events.json",
  // For deriving shared_blob_object_id from KraterionObjectCreated tx
  // effects (the walrus shared_blob ID isn't in the event payload —
  // see ADR "Move event surgery").
  "transactions.effects.changed_objects.object_id",
  "transactions.effects.changed_objects.object_type",
  "transactions.effects.changed_objects.id_operation",
];

/**
 * The subscribe response wraps the Checkpoint in `response.checkpoint`
 * and adds `response.cursor`. The probe (2026-05-08) found that the
 * live stream does NOT populate `event.json` (it returns `event.contents`
 * raw BCS only) — the `json` decode happens server-side via the
 * indexer layer that backs `getCheckpoint`/`getTransaction`. So we
 * use the subscribe stream purely as a "next cursor" notifier and
 * fetch the actual checkpoint via `getCheckpoint(cursor)` for the
 * fully-decoded payload. See `run-loop.ts:processSubscribeResponse`.
 *
 * The minimal subscribe mask is just `sequence_number` (which we
 * already get implicitly via `response.cursor`). We keep
 * `sequence_number` explicit so the response isn't completely empty
 * — some servers return zero bytes when no path is selected.
 */
export const SUBSCRIBE_READ_MASK_PATHS: readonly string[] = ["sequence_number"];
