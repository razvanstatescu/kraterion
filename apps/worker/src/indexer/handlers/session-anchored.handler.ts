import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { blobIdU256ToString } from "@kraterion/walrus-client";
import { KraterionSessionAnchoredSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * P9 — `KraterionSessionAnchored` → `AgentSessionTrace` row.
 *
 * Paired event with `KraterionPooledBlobRegistered`. Both are emitted
 * by the same PTB in the session-archive worker (PTB1 composes
 * `register_blob` + `anchor_session`), so when this handler runs:
 *   - The `PooledBlob` row already exists in the same transaction
 *     (written by the sibling `PooledBlobRegisteredHandler`).
 *   - The `AgentSession` row exists in Postgres (written by the
 *     control plane when the session was opened on the first chat
 *     completion).
 *
 * Handler responsibilities:
 *   1. Validate the event payload.
 *   2. Look up the parent AgentSession by decoding the 16-byte
 *      session_id payload into UUID form.
 *   3. Look up the PooledBlob row by `pooled_blob_object_id`.
 *   4. Insert AgentSessionTrace. Idempotent via the schema-level
 *      `(tx_digest, event_seq) UNIQUE` and `session_id @unique`.
 *   5. Patch AgentSession.anchored_tx_digest defensively (the worker
 *      writes this too on PTB1 success — the indexer's write here is
 *      idempotent re-application).
 *
 * Failure modes:
 *   - Session row missing → DLQ. Means the control plane never
 *     opened a session for this id, which would indicate a serious
 *     bug since the worker can only anchor sessions it pulled from
 *     Postgres. Worth investigating.
 *   - PooledBlob row missing → DLQ. The companion
 *     `PooledBlobRegisteredHandler` should have processed in the
 *     same checkpoint. If we got here without it, the dispatcher
 *     ordering is broken.
 *   - Bucket lookup failure (from seal_identity prefix) → not fatal
 *     here; we already have all the data we need without it.
 *
 * The reserved-namespace guard in `PooledBlobRegisteredHandler`
 * already short-circuits the `_kraterion/sessions/<id>` keys so they
 * don't get routed as regular S3Objects (the existing guard covers
 * all `_kraterion/` prefixes — manifests and now sessions).
 */
@Injectable()
export class SessionAnchoredHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionSessionAnchored"] as const;

  private readonly logger = new Logger(SessionAnchoredHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionSessionAnchoredSchema.parse(event.payload);

    // 16-byte UUID → standard 8-4-4-4-12 hex string. AgentSession.id is
    // a Prisma `@default(uuid())` (string), so we reconstruct the
    // canonical form to look it up.
    if (parsed.session_id.length !== 16) {
      throw new Error(
        `SessionAnchoredHandler: expected 16-byte session_id, got ${parsed.session_id.length}`,
      );
    }
    const sessionUuid = bytes16ToUuid(parsed.session_id);

    const session = await tx.agentSession.findUnique({
      where: { id: sessionUuid },
      select: { id: true, project_id: true },
    });
    if (!session) {
      throw new Error(
        `SessionAnchoredHandler: no AgentSession row for id=${sessionUuid}. ` +
          `Worker anchored a session that has no Postgres parent — investigate.`,
      );
    }

    const pooledBlob = await tx.pooledBlob.findUnique({
      where: { pooled_blob_object_id: parsed.pooled_blob_object_id },
      select: { id: true },
    });
    if (!pooledBlob) {
      throw new Error(
        `SessionAnchoredHandler: no PooledBlob row for ` +
          `pooled_blob_object_id=${parsed.pooled_blob_object_id}. ` +
          `PooledBlobRegisteredHandler must run first in the same checkpoint.`,
      );
    }

    const walrusBlobId = blobIdU256ToString(parsed.walrus_blob_id);

    // Idempotency via unique constraints on (tx_digest, event_seq) +
    // session_id + pooled_blob_id. A re-fire is a no-op.
    await tx.agentSessionTrace.upsert({
      where: { session_id: sessionUuid },
      create: {
        session_id: sessionUuid,
        project_id: session.project_id,
        pooled_blob_id: pooledBlob.id,
        walrus_blob_id: walrusBlobId,
        seal_identity: parsed.seal_identity,
        trace_hash: parsed.trace_hash,
        invocation_count: parsed.invocation_count,
        // The plaintext + gzip sizes aren't carried in the event
        // payload (the trace was Seal-encrypted before upload; the
        // Walrus-side size is the encrypted size). We don't have a
        // cheap way to recover them from chain. Set 0 here; a
        // follow-up could backfill from the worker's archive log if
        // visibility into pre-encryption size matters for the UI.
        trace_size_bytes: 0,
        trace_gzip_size_bytes: 0,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
      },
      update: {
        // Replay-safe re-application — same data, same row.
        pooled_blob_id: pooledBlob.id,
        walrus_blob_id: walrusBlobId,
        seal_identity: parsed.seal_identity,
        trace_hash: parsed.trace_hash,
        invocation_count: parsed.invocation_count,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
      },
    });

    // Patch parent session — defensive (the worker also writes this on
    // PTB1 success). Idempotent same-value re-write.
    await tx.agentSession.update({
      where: { id: sessionUuid },
      data: { anchored_tx_digest: event.txDigest },
    });

    this.logger.log(
      `SessionAnchored: session=${sessionUuid.slice(0, 8)}… ` +
        `pooled=${parsed.pooled_blob_object_id.slice(0, 12)}… ` +
        `invocations=${parsed.invocation_count} ` +
        `tx=0x${event.txDigest.toString("hex").slice(0, 12)}…`,
    );
  }
}

/** 16 raw bytes → canonical UUID hex string (`8-4-4-4-12`). */
function bytes16ToUuid(buf: Buffer): string {
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
