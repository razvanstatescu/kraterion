/**
 * One-shot backfill: rewrite `S3Object.walrus_blob_id` and
 * `PooledBlob.walrus_blob_id` from the legacy u256-decimal form into
 * Walrus's canonical URL-safe-base64 form.
 *
 * Why: until this commit, the pooled-blob-registered handler stored the
 * `walrus_blob_id` field from the on-chain event verbatim (a `u256`
 * stringified as decimal). Walruscan, the aggregator, and every other
 * downstream tool need the base64url form. New rows are correct; this
 * script repairs the ones written before the fix landed.
 *
 * Heuristic: any value that's all decimal digits and longer than 64
 * chars is the legacy u256 form (base64url ids max out at 43 chars and
 * always contain non-decimal characters). Anything else is left alone.
 *
 * Idempotent: re-running after a successful pass is a no-op.
 *
 * Usage:
 *   pnpm -F @kraterion/worker exec tsx scripts/backfill-blob-id-format.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { blobIdU256ToString } from "@kraterion/walrus-client";

const isLegacyU256 = (s: string): boolean => /^[0-9]{40,}$/.test(s);

async function main() {
  const prisma = new PrismaClient();

  const pooled = await prisma.pooledBlob.findMany({
    select: { id: true, walrus_blob_id: true },
  });
  let pooledFixed = 0;
  for (const row of pooled) {
    if (!isLegacyU256(row.walrus_blob_id)) continue;
    const fixed = blobIdU256ToString(BigInt(row.walrus_blob_id));
    await prisma.pooledBlob.update({
      where: { id: row.id },
      data: { walrus_blob_id: fixed },
    });
    pooledFixed++;
    console.log(`PooledBlob ${row.id}: ${row.walrus_blob_id.slice(0, 12)}… → ${fixed}`);
  }
  console.log(`PooledBlob: ${pooledFixed} / ${pooled.length} fixed`);

  const s3 = await prisma.s3Object.findMany({
    select: { id: true, walrus_blob_id: true },
  });
  let s3Fixed = 0;
  for (const row of s3) {
    if (!isLegacyU256(row.walrus_blob_id)) continue;
    const fixed = blobIdU256ToString(BigInt(row.walrus_blob_id));
    await prisma.s3Object.update({
      where: { id: row.id },
      data: { walrus_blob_id: fixed },
    });
    s3Fixed++;
    console.log(`S3Object ${row.id}: ${row.walrus_blob_id.slice(0, 12)}… → ${fixed}`);
  }
  console.log(`S3Object: ${s3Fixed} / ${s3.length} fixed`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(`backfill failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
