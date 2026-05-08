/**
 * Operational tool: skip the indexer ahead to (live tip - N).
 *
 * Use case: dev iteration. After redeploying the package, the
 * `INDEXER_INITIAL_CHECKPOINT` env points at publish-checkpoint —
 * the worker would then backfill thousands of checkpoints to catch
 * up to live, and any new PutObject during that window 503s on
 * `waitForS3Object`. If you've already exercised bucket creation
 * (or you don't care about historical events), this CLI seeds the
 * cursor near live tip so the worker enters live-stream mode
 * immediately.
 *
 * **Production warning:** running this skips events between the
 * current cursor and the seeded position. Domain rows that should
 * have been derived from those events will be missing. Only safe in
 * dev or when you've manually verified the gap is empty.
 *
 * Usage:
 *   pnpm -F @kraterion/worker indexer:fast-forward
 *   pnpm -F @kraterion/worker indexer:fast-forward --back 100
 *   pnpm -F @kraterion/worker indexer:fast-forward --source kraterion-mainpipeline-v1
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";

const DEFAULT_SOURCE_ID = "kraterion-mainpipeline-v1";
const DEFAULT_BACK = 50;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceId = parseFlag(args, "--source") ?? DEFAULT_SOURCE_ID;
  const backStr = parseFlag(args, "--back") ?? String(DEFAULT_BACK);
  const back = BigInt(backStr);

  const host = process.env["SUI_GRPC_HOST"] ?? "fullnode.testnet.sui.io:443";
  const network = (process.env["SUI_NETWORK"] ?? "testnet") as "testnet" | "mainnet";
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
  });
  const client = new SuiGrpcClient({ network, transport });

  // First message of `subscribeCheckpoints` carries `cursor = current
  // live tip`. Use it as the reference point.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  const call = client.subscriptionService.subscribeCheckpoints(
    { readMask: { paths: ["sequence_number"] } },
    { abort: ac.signal },
  );
  let liveTip: bigint | undefined;
  for await (const msg of call.responses) {
    liveTip = msg.cursor;
    break;
  }
  clearTimeout(timer);
  ac.abort();
  if (liveTip === undefined) throw new Error("no live tip from subscribeCheckpoints");

  const seedAt = liveTip - back;
  console.log(`live tip:        ${liveTip}`);
  console.log(`seed cursor at:  ${seedAt}  (live_tip - ${back})`);

  const prisma = new PrismaClient();
  try {
    const previous = await prisma.indexerCursor.findUnique({
      where: { source_id: sourceId },
    });
    if (previous) {
      console.log(`existing cursor: ${previous.last_checkpoint_seq}`);
    }
    await prisma.indexerCursor.upsert({
      where: { source_id: sourceId },
      create: {
        source_id: sourceId,
        last_checkpoint_seq: seedAt,
        last_tx_digest: null,
        last_event_seq: null,
      },
      update: {
        last_checkpoint_seq: seedAt,
        last_tx_digest: null,
        last_event_seq: null,
      },
    });
    console.log(`cursor seeded for source=${sourceId}; restart the worker to take effect.`);
  } finally {
    await prisma.$disconnect();
  }
}

function parseFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : null;
}

main().catch((err) => {
  console.error("[fast-forward] fatal", err);
  process.exit(1);
});
