/**
 * Probe the KnowledgeService.search SQL path end-to-end for a given
 * bucket id. Confirms hit shape after the storage-pool migration:
 *   - `source_walrus_blob_id` is base64url
 *   - `source_pooled_blob_object_id` is the on-chain Sui object id (0x...)
 *   - `manifest_walrus_blob_id` is base64url
 *
 * Usage:
 *   pnpm -F @kraterion/control-plane exec tsx \
 *     scripts/probe-knowledge-search.ts <bucketId> "<query>"
 */
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { KnowledgeService } from "../src/knowledge/knowledge.service.js";
import { ProviderCredentialService } from "../src/providers/provider-credential.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import { BucketsService } from "../src/buckets/buckets.service.js";

async function main() {
  const bucketId = process.argv[2];
  const query = process.argv[3] ?? "the";
  if (!bucketId) {
    console.error("usage: probe-knowledge-search.ts <bucketId> <query>");
    process.exit(1);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const wrap = new KeyWrappingService();
  const buckets = new BucketsService(prisma);
  const creds = new ProviderCredentialService(prisma, wrap);
  const knowledge = new KnowledgeService(prisma, buckets, creds);

  const bucket = await prisma.bucket.findUnique({
    where: { id: bucketId },
    select: { project: { select: { account_id: true } } },
  });
  if (!bucket) {
    console.error(`no bucket id=${bucketId}`);
    process.exit(1);
  }

  const result = await knowledge.search({
    accountId: bucket.project.account_id,
    bucketId,
    query,
    topK: 3,
  });
  Logger.log(`hits=${result.hits.length} latency_ms=${result.latency_ms}`);
  const sample = result.hits.slice(0, 2).map((h) => ({
    s3_key: h.s3_key,
    ordinal: h.ordinal,
    source_walrus_blob_id: h.source_walrus_blob_id,
    source_pooled_blob_object_id: h.source_pooled_blob_object_id,
    manifest_walrus_blob_id: h.manifest_walrus_blob_id,
    content_preview: h.content.slice(0, 60),
  }));
  console.log(JSON.stringify(sample, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
