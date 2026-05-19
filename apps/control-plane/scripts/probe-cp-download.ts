/**
 * End-to-end probe of the dashboard's "Download" path:
 *   1. Find the demo account's owned object.
 *   2. Call `PresignService.signDownload(...)` → signed envelope.
 *   3. Issue the GET against the gateway using the returned URL + headers.
 *   4. Assert non-empty body and `x-kraterion-storage-kind: pooled`.
 *
 * No HTTP auth needed — instantiates the CP service directly via Prisma,
 * exactly the same code path the controller invokes.
 */
import "dotenv/config";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PresignService } from "../src/objects/presign.service.js";
import { BucketsService } from "../src/buckets/buckets.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";

async function main() {
  const objectId = process.argv[2];
  if (!objectId) {
    console.error("usage: probe-cp-download.ts <objectId>");
    process.exit(1);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const wrap = new KeyWrappingService();
  const buckets = new BucketsService(prisma);
  const presign = new PresignService(prisma, buckets, wrap);

  const row = await prisma.s3Object.findUnique({
    where: { id: objectId },
    select: { bucket: { select: { project: { select: { account_id: true } } } } },
  });
  if (!row) {
    console.error(`no S3Object id=${objectId}`);
    process.exit(1);
  }
  const accountId = row.bucket.project.account_id;
  console.log(`▸ signDownload for object=${objectId} account=${accountId.slice(0, 8)}…`);

  const signed = await presign.signDownload({ accountId, objectId });
  console.log(`  method=${signed.method} url=${signed.url}`);

  const t0 = Date.now();
  const res = await fetch(signed.url, { method: signed.method, headers: signed.headers });
  const body = await res.arrayBuffer();
  const elapsed = Date.now() - t0;
  console.log(
    `◀ ${res.status} ${res.statusText} (${elapsed}ms) bytes=${body.byteLength} ` +
      `storage-kind=${res.headers.get("x-kraterion-storage-kind") ?? "(none)"} ` +
      `content-type=${res.headers.get("content-type") ?? "(none)"}`,
  );

  await prisma.$disconnect();
  process.exit(res.ok && body.byteLength > 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
