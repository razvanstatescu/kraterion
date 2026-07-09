#!/usr/bin/env tsx
/**
 * Cleanup script: delete orphan PooledBlobs on-chain to free pool
 * capacity. An "orphan" here is a `PooledBlob` row with
 * `status != 'deleted'` that is NOT referenced by any live `S3Object`
 * (via `S3Object.pooled_blob_id`) and NOT referenced by any live
 * `KnowledgeManifest` (via `manifest_pooled_blob_object_id`).
 *
 * Use case: the manifest-archive worker registered manifests under
 * earlier versions, the KnowledgeManifest row was re-written to point
 * at a newer version, and the old PooledBlob now occupies pool
 * capacity for no reason.
 *
 * Mirrors the `pool_vault.deleteBlob` PTB the gateway builds in
 * `objects.write.controller.ts:550`. Same signer (the gateway
 * sub-wallet), same arguments shape. No fee.
 *
 * Usage:
 *   pnpm --filter @kraterion/gateway exec tsx \
 *     scripts/cleanup-orphan-pooled-blobs.ts \
 *     [--vault 0x…] [--dry-run]
 *
 *   --vault     restrict to a single vault object id (otherwise all vaults)
 *   --dry-run   print the list and stop, don't sign anything
 */

import "dotenv/config";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { PrismaClient } from "@prisma/client";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import { blobIdStringToU256, gasStatusError, gasTx, getSuiClient } from "@kraterion/walrus-client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const vaultIdx = args.indexOf("--vault");
const onlyVault = vaultIdx >= 0 ? args[vaultIdx + 1] : null;

interface Orphan {
  pooled_blob_id: string;
  pooled_blob_object_id: string;
  walrus_blob_id: string;
  encoded_size_bytes: bigint;
  storage_pool_id: string;
  vault_object_id: string;
  registered_at: Date;
}

async function findOrphans(prisma: PrismaClient): Promise<Orphan[]> {
  // Raw query because we need a LEFT JOIN on two tables and Prisma's
  // relation filters don't compose this way cleanly.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      pooled_blob_id: string;
      pooled_blob_object_id: string;
      walrus_blob_id: string;
      encoded_size_bytes: bigint;
      storage_pool_id: string;
      vault_object_id: string;
      registered_at: Date;
    }>
  >(`
    SELECT
      pb.id              AS pooled_blob_id,
      pb.pooled_blob_object_id,
      pb.walrus_blob_id,
      pb.encoded_size_bytes,
      pb.storage_pool_id,
      sp.vault_object_id,
      pb.registered_at
    FROM "PooledBlob" pb
    JOIN "StoragePool" sp ON sp.id = pb.storage_pool_id
    WHERE pb.status != 'deleted'
      AND NOT EXISTS (
        SELECT 1 FROM "S3Object" s3o
        WHERE s3o.pooled_blob_id = pb.id AND s3o.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM "KnowledgeManifest" km
        WHERE km.manifest_pooled_blob_object_id = pb.pooled_blob_object_id
          AND km.deleted_at IS NULL
      )
      ${onlyVault ? `AND sp.vault_object_id = $1` : ""}
    ORDER BY pb.registered_at ASC
  `, ...(onlyVault ? [onlyVault] : []));
  return rows;
}

async function loadGatewayKeypair(
  prisma: PrismaClient,
  wrapper: EnvKeyWrapper,
): Promise<Ed25519Keypair> {
  const sub = await prisma.subWallet.findFirst({
    where: { role: "api_decryption", account_id: null },
  });
  if (!sub) {
    throw new Error(
      "No gateway sub-wallet in DB. Run `pnpm -F @kraterion/gateway bootstrap` first.",
    );
  }
  const seed = wrapper.unwrap(sub.mnemonic_wrapped);
  return Ed25519Keypair.fromSecretKey(seed);
}

async function deleteOne(
  client: ReturnType<typeof getSuiClient>,
  signer: Ed25519Keypair,
  orphan: Orphan,
): Promise<{ ok: true; digest: string } | { ok: false; error: string }> {
  const blobIdU256 = blobIdStringToU256(orphan.walrus_blob_id);
  const tx = new Transaction();
  tx.add(
    pool_vault.deleteBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: orphan.vault_object_id,
        reserve: KRATERION_RESERVE_ID,
        system: WALRUS_SYSTEM_OBJECT_ID,
        blobId: blobIdU256,
      },
    }),
  );
  try {
    const result = gasTx(
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer,
        include: { effects: true },
      }),
    );
    if (!result.effects.status.success) {
      return {
        ok: false,
        error: gasStatusError(result) ?? "unknown",
      };
    }
    return { ok: true, digest: result.digest };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function main() {
  const prisma = new PrismaClient();
  const wrapper = new EnvKeyWrapper();

  console.log("scanning for orphan PooledBlobs…");
  const orphans = await findOrphans(prisma);

  if (orphans.length === 0) {
    console.log("nothing to do — no orphans found.");
    await prisma.$disconnect();
    return;
  }

  const totalBytes = orphans.reduce(
    (acc, o) => acc + Number(o.encoded_size_bytes),
    0,
  );
  console.log(
    `found ${orphans.length} orphan(s), total encoded_size = ${(
      totalBytes / 1024 / 1024
    ).toFixed(1)} MiB`,
  );
  for (const o of orphans) {
    console.log(
      `  ${o.pooled_blob_object_id.slice(0, 18)}… ` +
        `(${(Number(o.encoded_size_bytes) / 1024 / 1024).toFixed(1)} MiB, ` +
        `registered ${o.registered_at.toISOString().slice(0, 10)}, ` +
        `vault ${o.vault_object_id.slice(0, 12)}…)`,
    );
  }

  if (dryRun) {
    console.log("\n--dry-run — exiting without signing.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nloading gateway keypair…");
  const signer = await loadGatewayKeypair(prisma, wrapper);
  const client = getSuiClient();
  console.log(`signer = ${signer.toSuiAddress()}\n`);

  let freed = 0;
  let succeeded = 0;
  for (const o of orphans) {
    process.stdout.write(
      `deleting ${o.pooled_blob_object_id.slice(0, 18)}… `,
    );
    const result = await deleteOne(client, signer, o);
    if (result.ok) {
      succeeded += 1;
      freed += Number(o.encoded_size_bytes);
      console.log(`ok (tx ${result.digest.slice(0, 14)}…)`);
    } else {
      console.log(`FAILED: ${result.error}`);
    }
  }

  console.log(
    `\nfinished: ${succeeded}/${orphans.length} deleted, ` +
      `~${(freed / 1024 / 1024).toFixed(1)} MiB freed (chain-side).`,
  );
  console.log(
    "DB rows will be marked status='deleted' by the indexer once it " +
      "processes the PooledBlobDeleted events.",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("cleanup failed:", err);
  process.exit(1);
});
