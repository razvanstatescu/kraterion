/**
 * Operational tool: drop the indexer cursor row so the next worker
 * boot resumes from `INDEXER_INITIAL_CHECKPOINT` (or 0 if unset).
 *
 * Useful for:
 *   - After a Move package redeploy where on-chain artifacts shift.
 *   - When the indexer-written rows have been truncated and need a
 *     fresh derivation from chain.
 *   - Sanity checks during development.
 *
 * Usage:
 *   pnpm -F @kraterion/worker indexer:reset
 *   pnpm -F @kraterion/worker indexer:reset --source kraterion-mainpipeline-v1
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const DEFAULT_SOURCE_ID = "kraterion-mainpipeline-v1";

async function main(): Promise<void> {
  const sourceId = parseSourceId(process.argv.slice(2)) ?? DEFAULT_SOURCE_ID;
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.indexerCursor.findUnique({
      where: { source_id: sourceId },
    });
    if (!existing) {
      console.log(`no cursor row for source=${sourceId}; nothing to do.`);
      return;
    }
    await prisma.indexerCursor.delete({ where: { source_id: sourceId } });
    console.log(
      `deleted cursor row source=${sourceId} (was at checkpoint=${existing.last_checkpoint_seq}).`,
    );
    console.log(
      `next worker boot resumes from INDEXER_INITIAL_CHECKPOINT (env) or 0.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function parseSourceId(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) return args[i + 1]!;
  }
  return null;
}

main().catch((err) => {
  console.error("[reset-cursor] fatal", err);
  process.exit(1);
});
