/**
 * Day-1 read-mask probe.
 *
 * Sui's gRPC `SubscribeCheckpoints` accepts a `FieldMask` (string
 * paths) but the proto comments don't disambiguate whether the paths
 * are rooted at the response (paths start with `checkpoint.`) or at
 * the checkpoint itself (paths start with `transactions.`). The
 * `LedgerService.GetCheckpoint` mask paths ARE rooted at the
 * checkpoint, so the discrepancy is a real risk.
 *
 * This script subscribes for one checkpoint with each candidate mask
 * shape and reports what came back. Run once per environment; bake
 * the result into `read-mask.ts`. Documented in
 * `docs/decisions.md`.
 *
 * Usage:
 *   pnpm -F @kraterion/worker indexer:probe-readmask
 */

import "dotenv/config";
import { createSuiGrpcClient } from "../sui-grpc.client.provider.js";

const TIMEOUT_MS = 60_000;

type MaskShape = "rooted-at-response" | "rooted-at-checkpoint" | "no-mask";

const candidates: Array<{ shape: MaskShape; paths: string[] | undefined }> = [
  {
    shape: "rooted-at-response",
    paths: [
      "cursor",
      "checkpoint.sequence_number",
      "checkpoint.digest",
      "checkpoint.summary.timestamp",
      "checkpoint.transactions.digest",
      "checkpoint.transactions.events.events.package_id",
      "checkpoint.transactions.events.events.module",
      "checkpoint.transactions.events.events.event_type",
      "checkpoint.transactions.events.events.json",
    ],
  },
  {
    shape: "rooted-at-checkpoint",
    paths: [
      "sequence_number",
      "digest",
      "summary.timestamp",
      "transactions.digest",
      "transactions.events.events.package_id",
      "transactions.events.events.module",
      "transactions.events.events.event_type",
      "transactions.events.events.json",
    ],
  },
  { shape: "no-mask", paths: undefined },
];

interface ProbeResult {
  shape: MaskShape;
  ok: boolean;
  receivedCheckpoint: boolean;
  hasSequenceNumber: boolean;
  hasTransactions: boolean;
  hasEvents: boolean;
  approxBytes: number;
  error?: string;
}

async function probe(shape: MaskShape, paths: string[] | undefined): Promise<ProbeResult> {
  const client = createSuiGrpcClient();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  const result: ProbeResult = {
    shape,
    ok: false,
    receivedCheckpoint: false,
    hasSequenceNumber: false,
    hasTransactions: false,
    hasEvents: false,
    approxBytes: 0,
  };

  try {
    const call = client.subscriptionService.subscribeCheckpoints(
      paths ? { readMask: { paths } } : {},
      { abort: ac.signal },
    );
    for await (const msg of call.responses) {
      const cp = msg.checkpoint;
      result.receivedCheckpoint = !!cp;
      if (cp) {
        result.hasSequenceNumber = cp.sequenceNumber !== undefined;
        const txs = cp.transactions ?? [];
        result.hasTransactions = txs.length > 0;
        for (const tx of txs) {
          if ((tx.events?.events ?? []).length > 0) {
            result.hasEvents = true;
            break;
          }
        }
      }
      // Crude size proxy: stringify the response. Not a wire-level byte
      // count, but a useful comparator across mask shapes.
      result.approxBytes = JSON.stringify(msg, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Array.from(v) : v,
      ).length;
      result.ok = true;
      break;
    }
  } catch (err) {
    result.error = (err as Error).message;
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
  return result;
}

async function main(): Promise<void> {
  console.log("=== Sui gRPC read_mask probe ===\n");
  console.log(`host: ${process.env["SUI_GRPC_HOST"] ?? "fullnode.testnet.sui.io:443"}\n`);

  for (const { shape, paths } of candidates) {
    console.log(`▸ probing shape=${shape} (paths=${paths ? paths.length : "none"})`);
    const r = await probe(shape, paths);
    if (!r.ok) {
      console.log(`  \x1b[31mFAIL\x1b[0m ${r.error ?? "no checkpoint received before timeout"}`);
      continue;
    }
    console.log(
      `  ok=${r.ok} cp=${r.receivedCheckpoint} seq=${r.hasSequenceNumber} ` +
        `txs=${r.hasTransactions} events=${r.hasEvents} ~bytes=${r.approxBytes}`,
    );
  }
  console.log("\n=== verdict ===");
  console.log("Pick the shape whose row shows cp=true seq=true AND has the smallest");
  console.log("~bytes. If both rooted-* shapes work but only one returns events,");
  console.log("that's the answer. Bake into read-mask.ts and docs/decisions.md.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[probe-readmask] fatal", err);
  process.exit(1);
});
