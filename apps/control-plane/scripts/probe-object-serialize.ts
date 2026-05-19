/**
 * Probe the CP's S3Object serialization path end-to-end (Prisma query →
 * `serializeObject` → JSON) for a given object id. Confirms the fix
 * for the missing `pooled_blob_object_id` field in the dashboard's
 * "On-chain details" panel.
 *
 * Usage:
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-object-serialize.ts <objectId>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { serializeObject } from "../src/buckets/serialize.js";

async function main() {
  const objectId = process.argv[2];
  if (!objectId) {
    console.error("usage: probe-object-serialize.ts <objectId>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const row = await prisma.s3Object.findUnique({
    where: { id: objectId },
    include: { pooled_blob: { select: { pooled_blob_object_id: true } } },
  });
  if (!row) {
    console.error(`no row for id=${objectId}`);
    process.exit(1);
  }
  const json = serializeObject(row);
  console.log(JSON.stringify(json, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
