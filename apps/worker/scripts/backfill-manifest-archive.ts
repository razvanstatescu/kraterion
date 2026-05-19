/**
 * Re-runs the K5 manifest archive step against every `KnowledgeManifest`
 * row that is `status=indexed` but missing `manifest_walrus_blob_id`.
 *
 * Why this exists: the K5 archive step runs at finalize time in the
 * embeddings processor. Manifests that were indexed BEFORE the K5 code
 * shipped have a final state but no archived blob. This script catches
 * them up without forcing a re-embedding.
 *
 * Usage:
 *   pnpm -F @kraterion/worker exec tsx scripts/backfill-manifest-archive.ts
 *
 * Optional CLI:
 *   --bucket-id <uuid>      restrict to one bucket
 *   --manifest-id <uuid>    restrict to one manifest
 *   --limit <n>             cap total work per run (default 50)
 */
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";
import { archiveManifestToWalrus } from "../src/embeddings/manifest-archive.js";

const args = parseArgs(process.argv.slice(2));
const logger = new Logger("manifest-backfill");
const prisma = new PrismaClient();

async function main() {
  const where = {
    status: "indexed",
    manifest_walrus_blob_id: null,
    ...(args.bucketId ? { bucket_id: args.bucketId } : {}),
    ...(args.manifestId ? { id: args.manifestId } : {}),
  };
  const candidates = await prisma.knowledgeManifest.findMany({
    where,
    select: { id: true, bucket_id: true },
    orderBy: { created_at: "asc" },
    take: args.limit,
  });
  logger.log(`found ${candidates.length} manifest(s) to archive (limit=${args.limit})`);

  if (candidates.length === 0) {
    logger.log("nothing to do");
    return;
  }

  const signer = await loadKnowledgeIndexerKeypair();
  logger.log(`signer (knowledge_indexer) = ${signer.toSuiAddress()}`);

  for (const { id } of candidates) {
    logger.log(`archiving manifest ${id}…`);
    // The archive helper is best-effort + idempotent — it skips when
    // `manifest_walrus_blob_id` is already populated, so running this
    // twice is harmless.
    await archiveManifestToWalrus({
      prisma: prisma as unknown as Parameters<typeof archiveManifestToWalrus>[0]["prisma"],
      signer,
      logger,
      manifestId: id,
    });
    const after = await prisma.knowledgeManifest.findUnique({
      where: { id },
      select: { manifest_walrus_blob_id: true, manifest_pooled_blob_object_id: true },
    });
    if (after?.manifest_walrus_blob_id) {
      logger.log(
        `  ok: blob_id=${after.manifest_walrus_blob_id} pooled=${after.manifest_pooled_blob_object_id ?? "(none)"}`,
      );
    } else {
      logger.warn(`  failed: row still has no manifest_walrus_blob_id`);
    }
  }
}

async function loadKnowledgeIndexerKeypair(): Promise<Ed25519Keypair> {
  const wallet = await prisma.subWallet.findFirst({
    where: { role: "knowledge_indexer", account_id: null },
    select: { mnemonic_wrapped: true, sui_address: true },
  });
  if (!wallet) {
    throw new Error(
      "knowledge_indexer sub-wallet missing. Run `pnpm -F @kraterion/gateway bootstrap` first.",
    );
  }
  const wrapper = new EnvKeyWrapper();
  const seed = wrapper.unwrap(wallet.mnemonic_wrapped);
  const kp = Ed25519Keypair.fromSecretKey(seed);
  if (kp.toSuiAddress() !== wallet.sui_address) {
    throw new Error(
      `Derived address ${kp.toSuiAddress()} doesn't match stored ${wallet.sui_address}`,
    );
  }
  return kp;
}

interface CliArgs {
  bucketId?: string;
  manifestId?: string;
  limit: number;
}
function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { limit: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--bucket-id" && next) {
      out.bucketId = next;
      i++;
    } else if (a === "--manifest-id" && next) {
      out.manifestId = next;
      i++;
    } else if (a === "--limit" && next) {
      out.limit = Math.max(1, parseInt(next, 10));
      i++;
    }
  }
  return out;
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error(`backfill failed: ${(err as Error).stack ?? err}`);
    await prisma.$disconnect();
    process.exit(1);
  });
