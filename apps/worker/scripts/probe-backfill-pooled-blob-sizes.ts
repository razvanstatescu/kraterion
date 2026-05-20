/**
 * Backfill `PooledBlob.encoded_size_bytes` + `registered_epoch` for
 * any rows where the indexer's initial v1 handler hardcoded them to
 * 0 (see `apps/worker/src/indexer/handlers/pooled-blob-registered.
 * handler.ts` pre-fix). Reads each affected pool's live
 * `used_encoded_bytes` from chain and reconciles against the sum of
 * stored encoded sizes; the gap is attributed proportionally to the
 * stale rows, then `StoragePool.used_encoded_bytes` is mirrored.
 *
 * Safe to re-run. Idempotent on rows that already have non-zero
 * encoded_size_bytes (they're skipped).
 *
 *   pnpm -F @kraterion/worker exec tsx \
 *     scripts/probe-backfill-pooled-blob-sizes.ts [--dry-run]
 */
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
    ".env",
  ),
});

import { PrismaService } from "../src/prisma/prisma.service.js";
import {
  readPoolUsedEncodedBytes,
  readPooledBlobRegisteredEpoch,
} from "@kraterion/walrus-client";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const stale = await prisma.pooledBlob.findMany({
      where: {
        OR: [
          { encoded_size_bytes: 0n },
          { registered_epoch: 0 },
        ],
        deleted_at: null,
      },
      orderBy: { registered_at: "asc" },
    });
    if (stale.length === 0) {
      console.log("✓ nothing to backfill");
      return;
    }
    console.log(`▸ found ${stale.length} stale row(s) to fix`);

    // Group by storage pool so we can read each pool's live used_bytes
    // once and reconcile all its stale rows together.
    const byPool = new Map<string, typeof stale>();
    for (const row of stale) {
      const arr = byPool.get(row.storage_pool_id) ?? [];
      arr.push(row);
      byPool.set(row.storage_pool_id, arr);
    }

    let updatedPooledBlobs = 0;
    let updatedPools = 0;

    for (const [poolId, rows] of byPool) {
      const pool = await prisma.storagePool.findUnique({
        where: { id: poolId },
        select: {
          id: true,
          pool_object_id: true,
          used_encoded_bytes: true,
          blob_count: true,
        },
      });
      if (!pool) {
        console.warn(`  ! pool=${poolId} missing locally; skipping`);
        continue;
      }
      const liveUsed = await readPoolUsedEncodedBytes(pool.pool_object_id);
      if (liveUsed === null) {
        console.warn(
          `  ! couldn't read on-chain pool ${pool.pool_object_id}; skipping`,
        );
        continue;
      }

      // Sum non-stale rows for this pool to find the "known" portion.
      // The remaining bytes are split evenly across stale rows — not
      // per-blob accurate but the dashboard total stays right.
      const others = await prisma.pooledBlob.findMany({
        where: {
          storage_pool_id: poolId,
          deleted_at: null,
          NOT: { id: { in: rows.map((r) => r.id) } },
        },
        select: { encoded_size_bytes: true },
      });
      const knownBytes = others.reduce(
        (acc, r) => acc + r.encoded_size_bytes,
        0n,
      );
      const unattributedBytes = liveUsed - knownBytes;
      const perStale =
        rows.length > 0 && unattributedBytes > 0n
          ? unattributedBytes / BigInt(rows.length)
          : 0n;

      for (const row of rows) {
        const epoch = await readPooledBlobRegisteredEpoch(
          row.pooled_blob_object_id,
        );
        const patch = {
          encoded_size_bytes: perStale,
          registered_epoch: epoch ?? row.registered_epoch,
        };
        console.log(
          `  • blob=${row.pooled_blob_object_id.slice(0, 14)}… ` +
            `→ encoded=${patch.encoded_size_bytes} registered_epoch=${patch.registered_epoch}`,
        );
        if (!DRY_RUN) {
          await prisma.pooledBlob.update({
            where: { id: row.id },
            data: patch,
          });
          await prisma.s3Object.updateMany({
            where: { pooled_blob_id: row.id },
            data: { encoded_size_bytes: patch.encoded_size_bytes },
          });
          updatedPooledBlobs++;
        }
      }

      if (pool.used_encoded_bytes !== liveUsed) {
        console.log(
          `  ✎ pool=${pool.id} used_encoded_bytes ${pool.used_encoded_bytes} → ${liveUsed}`,
        );
        if (!DRY_RUN) {
          await prisma.storagePool.update({
            where: { id: pool.id },
            data: {
              used_encoded_bytes: liveUsed,
              last_synced_at: new Date(),
            },
          });
          updatedPools++;
        }
      }
    }

    console.log("");
    if (DRY_RUN) {
      console.log(`(dry-run) ${stale.length} blob row(s) + ${byPool.size} pool(s) would be patched`);
    } else {
      console.log(
        `✓ backfill complete: ${updatedPooledBlobs} pooled blob row(s), ${updatedPools} pool row(s) updated`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("✗ backfill failed:", err);
  process.exit(1);
});
