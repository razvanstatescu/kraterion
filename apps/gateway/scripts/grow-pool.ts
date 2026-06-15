/**
 * One-off: grow every project's storage pool to a target encoded capacity.
 *
 * Why: Walrus encoded size has a ~64 MB/blob floor at 1000 shards, so the
 * old 500 MiB pools only held ~7-8 objects and small-file uploads aborted
 * with `walrus::storage_pool::EInsufficientCapacity` (code 6). New pools
 * now provision 5 GiB (see vault-provisioning.service.ts); this backfills
 * the existing ones.
 *
 * Run (operator-signed, like the bootstrap) with prod creds:
 *   DATABASE_URL=<prod> KEY_WRAPPING_MASTER_KEY=<prod> SUI_RPC_URL=… SUI_NETWORK=testnet \
 *     pnpm -F @kraterion/gateway exec tsx scripts/grow-pool.ts
 *
 * Idempotent: pools already >= target are skipped. Gas is pinned to the
 * wallet's largest (treasury) coin so it never collides with the live
 * GasCoinPool's 1-SUI lease coins.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { getSuiClient, getPoolStorageCostFrost } from "@kraterion/walrus-client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";

const TARGET_BYTES = 5n * 1024n * 1024n * 1024n; // 5 GiB encoded

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const wrapper = new EnvKeyWrapper();

  const sub = await prisma.subWallet.findFirst({
    where: { role: "api_decryption", account_id: null },
  });
  if (!sub) throw new Error("no api_decryption sub-wallet in the DB");
  const keypair = Ed25519Keypair.fromSecretKey(wrapper.unwrap(sub.mnemonic_wrapped));
  const address = keypair.toSuiAddress();
  const suiClient = getSuiClient();
  console.log(`operator: ${address}`);

  // Largest SUI coin = treasury (not leased by the gas pool). Pin it as gas.
  const coins = await suiClient.getCoins({ owner: address, coinType: "0x2::sui::SUI" });
  const treasury = coins.data
    .slice()
    .sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1))[0];
  if (!treasury) throw new Error("operator wallet holds no SUI");
  let gasRef = {
    objectId: treasury.coinObjectId,
    version: treasury.version,
    digest: treasury.digest,
  };

  const pools = await prisma.storagePool.findMany({
    select: {
      vault_object_id: true,
      reserved_encoded_bytes: true,
      used_encoded_bytes: true,
      start_epoch: true,
      end_epoch: true,
    },
  });
  console.log(`${pools.length} pool(s) found`);

  for (const p of pools) {
    const reserved = BigInt(p.reserved_encoded_bytes);
    const used = BigInt(p.used_encoded_bytes);
    if (reserved >= TARGET_BYTES) {
      console.log(`  ${p.vault_object_id} already ${reserved} bytes (>= 5 GiB) — skip`);
      continue;
    }
    const additional = TARGET_BYTES - reserved;
    const epochs = Math.max(1, p.end_epoch - p.start_epoch);
    const budget = getPoolStorageCostFrost(additional, epochs);

    const tx = new Transaction();
    tx.setGasPayment([gasRef]);
    tx.setGasBudget(200_000_000n); // 0.2 SUI, plenty for the Move call
    tx.add(
      pool_vault.resizeGrow({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: p.vault_object_id,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          additionalEncodedCapacityBytes: additional,
          paymentBudgetFrost: budget,
        },
      }),
    );
    const res = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true },
    });
    const ok = res.effects?.status?.status === "success";
    console.log(
      `  ${p.vault_object_id}: ${ok ? "OK" : "FAILED " + res.effects?.status?.error} ` +
        `(used=${used} reserved ${reserved}→5GiB, +${additional}B, budget=${budget} FROST) tx=${res.digest}`,
    );
    // Advance the treasury ref for the next iteration.
    const g = res.effects?.gasObject?.reference;
    if (g) gasRef = { objectId: g.objectId, version: String(g.version), digest: g.digest };
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
