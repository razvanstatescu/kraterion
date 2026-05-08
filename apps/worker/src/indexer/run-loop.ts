import { Logger } from "@nestjs/common";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { setMaxListeners } from "node:events";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Prisma } from "@prisma/client";
import { walkCheckpoint, type KraterionEventBatch } from "./checkpoint-events.js";
import { CHECKPOINT_READ_MASK_PATHS, SUBSCRIBE_READ_MASK_PATHS } from "./read-mask.js";
import { CursorRepo } from "./cursor.repo.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { DispatcherService } from "./dispatcher.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  indexerCursorCheckpoint,
  indexerLagSeconds,
  indexerRpcErrors,
} from "./metrics.js";

const FATAL_GRPC_CODES = new Set(["INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED"]);
// Concurrency capped at 2 to stay under the public testnet fullnode's
// 10 rps quota during the initial backfill burst. With a paid endpoint
// this can safely go to 12+. Documented in `docs/runbook.md`.
const BACKFILL_CONCURRENCY = 2;
// Token-bucket-style minimum spacing between backfill `getCheckpoint`
// calls. 8 rps target leaves headroom under the public testnet's 10 rps
// hard cap. With concurrency=2 + 125ms between calls we average 16
// requests/2s = 8 rps. Override via env for paid endpoints.
const BACKFILL_MIN_INTERVAL_MS = Number(process.env["INDEXER_BACKFILL_INTERVAL_MS"] ?? 125);
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_BASE_MS = 250;
const STABLE_STREAM_RESET_MS = 60_000; // 60s of stable streaming → reset attempt counter

/**
 * The forever-loop. Owns the cursor + the gRPC subscribe stream +
 * gap-fill via unary `getCheckpoint`. One instance per pipeline
 * source.
 *
 * Lifecycle:
 *   1. Read cursor from DB. If null, start from `INITIAL_SEQ`
 *      (configured by env or hardcoded post-deploy).
 *   2. Open `subscribeCheckpoints` stream. Pull first message — its
 *      `cursor` IS the live tip.
 *   3. If cursor < liveTip, run `backfill(cursor+1, liveTip-1)` via
 *      bounded-concurrency unary `getCheckpoint`.
 *   4. Process the buffered first message + drain the stream forward.
 *   5. On RpcError that isn't fatal, exponential backoff, restart
 *      from step 1.
 */
export async function runLoop(opts: {
  client: SuiGrpcClient;
  prisma: PrismaService;
  cursor: CursorRepo;
  dispatcher: DispatcherService;
  deadLetter: DeadLetterService;
  sourceId: string;
  initialCheckpointSeq: bigint;
  signal: AbortSignal;
}): Promise<void> {
  const logger = new Logger(`IndexerRunLoop:${opts.sourceId}`);
  let attempt = 0;
  let lastStableStartMs = Date.now();

  while (!opts.signal.aborted) {
    const ac = new AbortController();
    // Backfill fans out N concurrent gRPC calls + the subscribe
    // stream + per-call timers, all registering abort listeners on
    // this signal. Default cap of 10 is too low; bump generously
    // (Node only logs a warning, doesn't enforce).
    setMaxListeners(64, ac.signal);
    const onAbort = () => ac.abort();
    opts.signal.addEventListener("abort", onAbort, { once: true });

    try {
      const cursorState = await opts.cursor.read(opts.sourceId);
      const startFrom = cursorState
        ? cursorState.lastCheckpointSeq + 1n
        : opts.initialCheckpointSeq;

      logger.log(`subscribing (resume from=${startFrom})…`);
      const call = opts.client.subscriptionService.subscribeCheckpoints(
        { readMask: { paths: [...SUBSCRIBE_READ_MASK_PATHS] } },
        { abort: ac.signal },
      );

      const iterator = call.responses[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done) throw new Error("stream closed before first message");
      lastStableStartMs = Date.now();

      const liveTip = first.value.cursor;
      if (liveTip === undefined) {
        throw new Error("first stream message had no cursor");
      }
      logger.log(`live tip=${liveTip}, our cursor next=${startFrom}`);

      // Backfill from `startFrom` up to (but not including) liveTip,
      // using unary getCheckpoint with bounded concurrency. Pass the
      // inner abort controller's signal — when the subscribe stream
      // errors out and we enter the catch block, in-flight backfill
      // calls must abort together, otherwise their late rejections
      // surface as unhandled rejections and crash the process.
      if (startFrom < liveTip) {
        await backfillRange({
          ...opts,
          signal: ac.signal,
          fromInclusive: startFrom,
          toExclusive: liveTip,
        });
      }

      // Drain the live stream from liveTip forward. The first message
      // we already pulled; process it, then continue. We pass
      // `signal: ac.signal` so the per-checkpoint fetchCheckpoint
      // calls cancel cleanly on stream error.
      const liveOpts = { ...opts, signal: ac.signal };
      await processSubscribeResponse(liveOpts, first.value);
      while (!ac.signal.aborted) {
        const next = await iterator.next();
        if (next.done) break;
        await processSubscribeResponse(liveOpts, next.value);
        // Reset the attempt counter once we've been streaming
        // stably for a while.
        if (Date.now() - lastStableStartMs > STABLE_STREAM_RESET_MS) {
          attempt = 0;
        }
      }

      // Stream ended cleanly (server-side close, not error). Fall
      // through to the outer loop to re-subscribe.
      logger.warn("subscribe stream ended cleanly; re-subscribing");
    } catch (err) {
      if (opts.signal.aborted) break;
      const code = err instanceof RpcError ? err.code : "UNKNOWN";
      indexerRpcErrors.inc({ kind: code });

      if (FATAL_GRPC_CODES.has(code)) {
        logger.error(`fatal gRPC code=${code}; aborting indexer: ${(err as Error).message}`);
        throw err;
      }

      const wait = backoffMs(attempt);
      attempt += 1;
      logger.warn(
        `subscribe loop error code=${code} attempt=${attempt} retry-in=${wait}ms: ${(err as Error).message}`,
      );
      await sleep(wait, opts.signal);
    } finally {
      opts.signal.removeEventListener("abort", onAbort);
      ac.abort();
    }
  }
  logger.log("indexer loop exited (signal aborted)");
}

/** Process one `SubscribeCheckpointsResponse`.
 *
 * **Important wire-protocol quirk** (probed 2026-05-08, see
 * `docs/decisions.md` "subscribeCheckpoints doesn't populate
 * event.json"): the live `subscribeCheckpoints` stream returns
 * `event.contents` (raw BCS) but NOT `event.json` (the pre-decoded
 * JSON). Only `getCheckpoint` and `getTransaction` populate `json`.
 * Decoding BCS client-side would work but require the Move struct
 * schemas wired into the indexer.
 *
 * Mitigation: use the live stream as a heartbeat (which checkpoint
 * to process next) and fetch each cursor via unary
 * `getCheckpoint`. One extra RPC per live checkpoint at ~1 rps
 * (testnet's ~250ms checkpoint cadence) — well under the public
 * fullnode's 10 rps cap. When we move to a paid endpoint we can
 * revisit and decode BCS inline to halve the RPC count.
 */
async function processSubscribeResponse(
  opts: {
    client: SuiGrpcClient;
    prisma: PrismaService;
    cursor: CursorRepo;
    dispatcher: DispatcherService;
    deadLetter: DeadLetterService;
    sourceId: string;
    signal: AbortSignal;
  },
  msg: { cursor?: bigint },
): Promise<void> {
  if (msg.cursor === undefined) return;
  const checkpoint = await fetchCheckpoint(opts.client, msg.cursor, opts.signal);
  if (checkpoint == null) {
    await advanceEmpty(opts, msg.cursor);
    return;
  }
  const batch = walkCheckpoint(checkpoint as never);
  await commitCheckpoint(opts, msg.cursor, batch);
}

/** Backfill [fromInclusive, toExclusive) via unary getCheckpoint. */
async function backfillRange(opts: {
  client: SuiGrpcClient;
  prisma: PrismaService;
  cursor: CursorRepo;
  dispatcher: DispatcherService;
  deadLetter: DeadLetterService;
  sourceId: string;
  signal: AbortSignal;
  fromInclusive: bigint;
  toExclusive: bigint;
}): Promise<void> {
  const logger = new Logger(`IndexerRunLoop:${opts.sourceId}`);
  const total = opts.toExclusive - opts.fromInclusive;
  if (total <= 0n) return;
  logger.log(`backfilling ${total} checkpoints (${opts.fromInclusive}..${opts.toExclusive - 1n})`);

  // Sequential per-checkpoint commits (the cursor is global per source,
  // so out-of-order commits would let a crash stall on a hole). We
  // PIPELINE the network fetches — fetch up to BACKFILL_CONCURRENCY
  // checkpoints in flight, but commit them in order.
  let nextToFetch = opts.fromInclusive;
  let nextToCommit = opts.fromInclusive;
  const inflight = new Map<bigint, Promise<unknown>>();
  let nextAllowedFetchAtMs = 0;

  while (nextToCommit < opts.toExclusive && !opts.signal.aborted) {
    while (
      inflight.size < BACKFILL_CONCURRENCY &&
      nextToFetch < opts.toExclusive
    ) {
      // Token-bucket gate: each backfill `getCheckpoint` waits for
      // its slot. Eliminates the 429 churn we saw against the public
      // testnet at concurrency=4 with no spacing.
      const now = Date.now();
      if (now < nextAllowedFetchAtMs) {
        await sleep(nextAllowedFetchAtMs - now, opts.signal);
        if (opts.signal.aborted) break;
      }
      nextAllowedFetchAtMs = Math.max(now, nextAllowedFetchAtMs) + BACKFILL_MIN_INTERVAL_MS;

      const seq = nextToFetch++;
      const p = fetchCheckpoint(opts.client, seq, opts.signal);
      // Attach a noop handler to mark rejections as "handled" — the
      // sequential `await inflight.get(seq)` below still observes
      // them. Without this, when one in-flight call rejects (429
      // burst, network blip) and we throw out of this loop, the
      // OTHER in-flight calls' rejections become unhandled and
      // crash the process.
      p.catch(() => undefined);
      inflight.set(seq, p);
    }
    const seq = nextToCommit;
    const checkpoint = await inflight.get(seq);
    inflight.delete(seq);
    nextToCommit += 1n;
    if (checkpoint == null) {
      await advanceEmpty(opts, seq);
      continue;
    }
    const batch = walkCheckpoint(checkpoint as never);
    await commitCheckpoint(opts, seq, batch);
  }
  logger.log(`backfill committed through ${nextToCommit - 1n}`);
}

async function fetchCheckpoint(
  client: SuiGrpcClient,
  sequenceNumber: bigint,
  signal: AbortSignal,
): Promise<unknown | null> {
  const { response } = await client.ledgerService.getCheckpoint(
    {
      checkpointId: { oneofKind: "sequenceNumber", sequenceNumber },
      readMask: { paths: [...CHECKPOINT_READ_MASK_PATHS] },
    },
    { abort: signal },
  );
  return response.checkpoint ?? null;
}

/** Commit one checkpoint's worth of events + cursor advance. */
async function commitCheckpoint(
  opts: {
    prisma: PrismaService;
    cursor: CursorRepo;
    dispatcher: DispatcherService;
    deadLetter: DeadLetterService;
    sourceId: string;
  },
  checkpointSeq: bigint,
  batch: KraterionEventBatch,
): Promise<void> {
  // Two-pass strategy for poison-pill safety:
  //   1. Try to commit ALL events + cursor advance in one tx.
  //   2. If a handler throws, abort the tx, route the offending
  //      event to DLQ, and re-commit the SURVIVING events + cursor
  //      advance in a second tx. This way a single bad event
  //      doesn't block the queue, but a transient DB error
  //      naturally retries on the next subscribe loop.
  const allEvents = batch.events;
  const poisoned = new Set<number>(); // indices into allEvents

  // Bounded retry: at most `events.length` poisoned attempts. In
  // practice most checkpoints have 0 events from us so this loop
  // runs once.
  for (let attempt = 0; attempt <= allEvents.length; attempt++) {
    try {
      await opts.prisma.$transaction(async (tx) => {
        for (let i = 0; i < allEvents.length; i++) {
          if (poisoned.has(i)) continue;
          await opts.dispatcher.dispatch(tx, opts.sourceId, allEvents[i]!);
        }
        await opts.cursor.advance(tx, opts.sourceId, {
          lastCheckpointSeq: checkpointSeq,
          lastTxDigest: batch.lastTxDigest,
          lastEventSeq: batch.lastEventSeq,
        });
      });
      indexerCursorCheckpoint.set({ source: opts.sourceId }, Number(checkpointSeq));
      return;
    } catch (err) {
      // Find the FIRST event whose handler threw — by re-running the
      // dispatch outside a tx until we hit the throw.
      // Simpler: identify by inspecting the error path. We don't have
      // event identity in the error today, so we re-bisect: try each
      // un-poisoned event in isolation and find the failing one.
      // For correctness this is fine; for efficiency it's O(n²) but
      // n is small (events per checkpoint involving our package).
      const failingIdx = await findFailingEvent(opts, allEvents, poisoned);
      if (failingIdx === null) {
        // The error was NOT a per-event handler throw (e.g. DB
        // connectivity). Don't DLQ anything; bubble up to the
        // run-loop's backoff.
        throw err;
      }
      poisoned.add(failingIdx);
      await opts.deadLetter.record(opts.sourceId, allEvents[failingIdx]!, err as Error);
      // Loop and retry without the poisoned event.
    }
  }
  // Defensive: if we somehow exhausted the loop, advance the cursor
  // anyway so we don't re-process.
  await opts.prisma.$transaction(async (tx) => {
    await opts.cursor.advance(tx, opts.sourceId, {
      lastCheckpointSeq: checkpointSeq,
      lastTxDigest: batch.lastTxDigest,
      lastEventSeq: batch.lastEventSeq,
    });
  });
  indexerCursorCheckpoint.set({ source: opts.sourceId }, Number(checkpointSeq));
}

async function advanceEmpty(
  opts: { prisma: PrismaService; cursor: CursorRepo; sourceId: string },
  checkpointSeq: bigint,
): Promise<void> {
  await opts.prisma.$transaction(async (tx) => {
    await opts.cursor.advance(tx, opts.sourceId, {
      lastCheckpointSeq: checkpointSeq,
      lastTxDigest: null,
      lastEventSeq: null,
    });
  });
  indexerCursorCheckpoint.set({ source: opts.sourceId }, Number(checkpointSeq));
}

/**
 * Find the failing event by re-running each un-poisoned event in
 * isolation. Returns the array index of the first one that throws,
 * or null if none do (suggests the error wasn't event-specific).
 */
async function findFailingEvent(
  opts: { prisma: PrismaService; dispatcher: DispatcherService; sourceId: string },
  allEvents: KraterionEventBatch["events"],
  poisoned: Set<number>,
): Promise<number | null> {
  for (let i = 0; i < allEvents.length; i++) {
    if (poisoned.has(i)) continue;
    try {
      await opts.prisma.$transaction(async (tx) => {
        await opts.dispatcher.dispatch(tx, opts.sourceId, allEvents[i]!);
        // Always rollback — this is just a probe.
        throw new Error("__indexer_probe_rollback__");
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== "__indexer_probe_rollback__") return i;
    }
  }
  return null;
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt) + Math.random() * 250;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
