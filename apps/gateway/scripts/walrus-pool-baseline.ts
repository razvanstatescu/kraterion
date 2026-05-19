/**
 * Phase A — Walrus storage_pool baseline calibration.
 *
 * Exercises every storage_pool entry function exposed by walrus::system on
 * testnet, captures gas-used numbers, and writes a calibration report.
 *
 * Why this script exists: docs/storage-pool-migration.md §3 requires Phase A
 * to measure real gas costs for the pool primitives BEFORE we commit to
 * Phase C (Move wrapper + gateway refactor). The Walrus docs say these costs
 * are "size-independent, ~constant" but never publish numbers.
 *
 * This script calls the BARE Walrus entry functions (no Kraterion wrapper
 * yet). Our wrapper will add a thin overhead (one auth check + one reserve
 * debit) per call; Phase C's tests re-measure with the wrapper. The
 * baseline here is the floor.
 *
 * What we measure:
 *   1. `create_storage_pool` — initial pool creation (1 MiB encoded, 2 epochs)
 *   2. `increase_storage_pool_capacity` — grow by 1 MiB
 *   3. `extend_storage_pool` — extend by 1 epoch
 *   4. `decrease_storage_pool_unused_capacity_by_percent` — shrink to half
 *
 * NOT measured here (require real Walrus blob encoding + relay quorum):
 *   - register_pooled_blob, certify_pooled_blob, delete_pooled_blob,
 *     burn_expired_pooled_blob
 *
 * Those are exercised end-to-end in Phase K (full E2E) once the kraterion
 * pool_vault.move wrapper and gateway PUT pipeline are wired.
 *
 * Run with: pnpm -F @kraterion/gateway exec tsx scripts/walrus-pool-baseline.ts
 *
 * Requires: an active Sui CLI keypair on testnet with at least 1 WAL +
 * 0.5 SUI for gas. Faucet via the dashboard at
 * https://faucet.testnet.sui.io if needed.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import {
  WALRUS_PACKAGE_PUBLISHED_AT_TESTNET,
  WALRUS_SYSTEM_OBJECT_ID,
  WAL_COIN_TYPE,
} from "@kraterion/shared";
import { getSuiClient } from "@kraterion/walrus-client";
import { loadActiveDeployerKeypair } from "./load-deployer.js";

type Client = ReturnType<typeof getSuiClient>;

// === Calibration parameters ===
// 1 MiB encoded = the smallest meaningful pool, mirrors Walrus's BYTES_PER_UNIT_SIZE.
const INITIAL_CAPACITY_BYTES = BigInt(1024 * 1024);
const INITIAL_EPOCHS_AHEAD = 2;
const GROW_BY_BYTES = BigInt(1024 * 1024); // +1 MiB
const EXTEND_BY_EPOCHS = 1;
const SHRINK_BY_PERCENT = 50;
const GAS_BUDGET = 200_000_000n; // 0.2 SUI per tx; ample headroom

// === Pretty output ===
function bold(s: string) {
  console.log(`\x1b[1m${s}\x1b[0m`);
}
function info(s: string) {
  console.log(`  ${s}`);
}
function bad(s: string) {
  console.error(`\x1b[31m  error:\x1b[0m ${s}`);
}

interface GasReading {
  step: string;
  txDigest: string;
  computationCost: bigint;
  storageCost: bigint;
  storageRebate: bigint;
  nonRefundableStorageFee: bigint;
  netCost: bigint; // computation + storage - rebate
  notes?: string;
}

async function findWalCoin(
  client: Client,
  owner: string,
  minBalance: bigint,
): Promise<{ coinObjectId: string; balance: bigint }> {
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({ owner, coinType: WAL_COIN_TYPE, cursor });
    for (const c of page.data) {
      const balance = BigInt(c.balance);
      if (balance >= minBalance) {
        return { coinObjectId: c.coinObjectId, balance };
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  throw new Error(
    `No WAL coin with balance >= ${minBalance} FROST found for ${owner}. ` +
      `Visit https://stake-wal.wal.app/ to faucet WAL on testnet.`,
  );
}

function extractGas(effects: NonNullable<Awaited<ReturnType<Client["executeTransactionBlock"]>>["effects"]>): {
  computationCost: bigint;
  storageCost: bigint;
  storageRebate: bigint;
  nonRefundableStorageFee: bigint;
  netCost: bigint;
} {
  const g = effects.gasUsed;
  const computationCost = BigInt(g.computationCost);
  const storageCost = BigInt(g.storageCost);
  const storageRebate = BigInt(g.storageRebate);
  const nonRefundableStorageFee = BigInt(g.nonRefundableStorageFee);
  return {
    computationCost,
    storageCost,
    storageRebate,
    nonRefundableStorageFee,
    netCost: computationCost + storageCost - storageRebate,
  };
}

function findCreatedObject(
  effects: NonNullable<Awaited<ReturnType<Client["executeTransactionBlock"]>>["effects"]>,
  expectedTypeSubstring: string,
): string {
  const created = effects.created ?? [];
  for (const c of created) {
    // We don't have type info on effects directly; caller must follow up
    // with `getObject` to verify type. For now, return the first created
    // object owned by the sender (heuristic — the only objects we create
    // in our PTBs are the ones we ask for).
    const owner = c.owner;
    if (typeof owner === "object" && "AddressOwner" in owner) {
      return c.reference.objectId;
    }
  }
  throw new Error(`No created object matching ${expectedTypeSubstring} in tx effects`);
}

async function main() {
  bold("Walrus storage_pool baseline calibration (testnet)");
  console.log();

  // 1. Load keypair + check balances
  const { keypair, address } = loadActiveDeployerKeypair();
  info(`Deployer address: ${address}`);

  const client = getSuiClient();

  const suiBalance = BigInt((await client.getBalance({ owner: address })).totalBalance);
  info(`SUI balance:      ${(Number(suiBalance) / 1e9).toFixed(4)} SUI`);
  if (suiBalance < GAS_BUDGET * 5n) {
    bad(`Insufficient SUI for ~5 tx at ${GAS_BUDGET} MIST gas-budget each. Faucet at https://faucet.testnet.sui.io`);
    process.exit(1);
  }

  const walBalance = BigInt(
    (await client.getBalance({ owner: address, coinType: WAL_COIN_TYPE })).totalBalance,
  );
  info(`WAL balance:      ${(Number(walBalance) / 1e9).toFixed(6)} WAL`);
  const minWalNeeded = 1_000_000n; // 0.001 WAL — pool storage at 1 MiB × few epochs is ~hundreds of FROST
  if (walBalance < minWalNeeded) {
    bad(`Insufficient WAL. Need at least ${minWalNeeded} FROST. Faucet at https://stake-wal.wal.app/`);
    process.exit(1);
  }

  const walCoin = await findWalCoin(client, address, minWalNeeded);
  info(`Using WAL coin:   ${walCoin.coinObjectId} (${walCoin.balance} FROST)`);
  console.log();

  const readings: GasReading[] = [];
  let poolObjectId: string | null = null;
  let poolInitialSharedVersion: bigint | null = null;

  // === Step 1: create_storage_pool ===
  bold("Step 1: create_storage_pool");
  info(`  reserved_capacity = ${INITIAL_CAPACITY_BYTES} bytes (${Number(INITIAL_CAPACITY_BYTES) / 1024 / 1024} MiB)`);
  info(`  epochs_ahead      = ${INITIAL_EPOCHS_AHEAD}`);
  {
    const tx = new Transaction();
    tx.setGasBudget(GAS_BUDGET);
    const pool = tx.moveCall({
      target: `${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}::system::create_storage_pool`,
      arguments: [
        tx.sharedObjectRef({
          objectId: WALRUS_SYSTEM_OBJECT_ID,
          initialSharedVersion: await getSharedObjectInitialVersion(client, WALRUS_SYSTEM_OBJECT_ID),
          mutable: true,
        }),
        tx.pure.u64(INITIAL_CAPACITY_BYTES),
        tx.pure.u32(INITIAL_EPOCHS_AHEAD),
        tx.object(walCoin.coinObjectId),
      ],
    });
    tx.transferObjects([pool], tx.pure.address(address));

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
    await client.waitForTransaction({ digest: result.digest });

    const effects = result.effects;
    if (!effects || effects.status.status !== "success") {
      bad(`create_storage_pool failed: ${JSON.stringify(effects?.status)}`);
      process.exit(1);
    }

    // Find the StoragePool object from objectChanges. Note: the type filter
    // must be EXACT — Walrus creates both a `StoragePool` (the outer object
    // we want) AND a dynamic Field<u64, StoragePoolInnerV1> as side-effect.
    // The inner Field's type ALSO contains "::storage_pool::StoragePool"
    // as a substring, so a substring filter would grab the wrong one.
    const expectedType = `${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}::storage_pool::StoragePool`;
    const changes = result.objectChanges ?? [];
    const created = changes.find(
      (c) => c.type === "created" && c.objectType === expectedType,
    );
    if (!created || created.type !== "created") {
      bad(`Could not find created ${expectedType} in objectChanges`);
      info("objectChanges:");
      console.error(JSON.stringify(changes, null, 2));
      process.exit(1);
    }
    poolObjectId = created.objectId;
    info(`  ↪ Pool object:   ${poolObjectId}`);

    const gas = extractGas(effects);
    readings.push({
      step: "create_storage_pool",
      txDigest: result.digest,
      ...gas,
      notes: `pool=${poolObjectId}; capacity=${INITIAL_CAPACITY_BYTES}; epochs=${INITIAL_EPOCHS_AHEAD}`,
    });
    info(`  ↪ Gas:           ${gas.netCost} MIST net (${gas.computationCost} compute + ${gas.storageCost} storage - ${gas.storageRebate} rebate)`);
    info(`  ↪ Tx:            ${result.digest}`);
  }
  console.log();

  // Re-fetch the WAL coin since the previous tx modified it
  const walCoinPostCreate = await findWalCoin(client, address, minWalNeeded);

  // === Step 2: increase_storage_pool_capacity ===
  bold("Step 2: increase_storage_pool_capacity");
  info(`  additional_bytes = ${GROW_BY_BYTES} (${Number(GROW_BY_BYTES) / 1024 / 1024} MiB)`);
  {
    const tx = new Transaction();
    tx.setGasBudget(GAS_BUDGET);
    tx.moveCall({
      target: `${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}::system::increase_storage_pool_capacity`,
      arguments: [
        tx.sharedObjectRef({
          objectId: WALRUS_SYSTEM_OBJECT_ID,
          initialSharedVersion: await getSharedObjectInitialVersion(client, WALRUS_SYSTEM_OBJECT_ID),
          mutable: true,
        }),
        tx.object(poolObjectId!),
        tx.pure.u64(GROW_BY_BYTES),
        tx.object(walCoinPostCreate.coinObjectId),
      ],
    });
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    await client.waitForTransaction({ digest: result.digest });
    const effects = result.effects;
    if (!effects || effects.status.status !== "success") {
      bad(`increase_storage_pool_capacity failed: ${JSON.stringify(effects?.status)}`);
      process.exit(1);
    }
    const gas = extractGas(effects);
    readings.push({
      step: "increase_storage_pool_capacity",
      txDigest: result.digest,
      ...gas,
      notes: `+${GROW_BY_BYTES} bytes`,
    });
    info(`  ↪ Gas:           ${gas.netCost} MIST net`);
    info(`  ↪ Tx:            ${result.digest}`);
  }
  console.log();

  // === Step 3: extend_storage_pool ===
  const walCoinPostGrow = await findWalCoin(client, address, minWalNeeded);
  bold("Step 3: extend_storage_pool");
  info(`  extended_epochs  = ${EXTEND_BY_EPOCHS}`);
  {
    const tx = new Transaction();
    tx.setGasBudget(GAS_BUDGET);
    tx.moveCall({
      target: `${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}::system::extend_storage_pool`,
      arguments: [
        tx.sharedObjectRef({
          objectId: WALRUS_SYSTEM_OBJECT_ID,
          initialSharedVersion: await getSharedObjectInitialVersion(client, WALRUS_SYSTEM_OBJECT_ID),
          mutable: true,
        }),
        tx.object(poolObjectId!),
        tx.pure.u32(EXTEND_BY_EPOCHS),
        tx.object(walCoinPostGrow.coinObjectId),
      ],
    });
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    await client.waitForTransaction({ digest: result.digest });
    const effects = result.effects;
    if (!effects || effects.status.status !== "success") {
      bad(`extend_storage_pool failed: ${JSON.stringify(effects?.status)}`);
      process.exit(1);
    }
    const gas = extractGas(effects);
    readings.push({
      step: "extend_storage_pool",
      txDigest: result.digest,
      ...gas,
      notes: `+${EXTEND_BY_EPOCHS} epochs`,
    });
    info(`  ↪ Gas:           ${gas.netCost} MIST net`);
    info(`  ↪ Tx:            ${result.digest}`);
  }
  console.log();

  // === Step 4: decrease_storage_pool_unused_capacity_by_percent ===
  bold("Step 4: decrease_storage_pool_unused_capacity_by_percent");
  info(`  percent          = ${SHRINK_BY_PERCENT}`);
  {
    const tx = new Transaction();
    tx.setGasBudget(GAS_BUDGET);
    const recoveredStorage = tx.moveCall({
      target: `${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}::system::decrease_storage_pool_unused_capacity_by_percent`,
      arguments: [
        tx.sharedObjectRef({
          objectId: WALRUS_SYSTEM_OBJECT_ID,
          initialSharedVersion: await getSharedObjectInitialVersion(client, WALRUS_SYSTEM_OBJECT_ID),
          mutable: true,
        }),
        tx.object(poolObjectId!),
        tx.pure.u8(SHRINK_BY_PERCENT),
      ],
    });
    // recovered Storage resource is transferred to caller
    tx.transferObjects([recoveredStorage], tx.pure.address(address));

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
    await client.waitForTransaction({ digest: result.digest });
    const effects = result.effects;
    if (!effects || effects.status.status !== "success") {
      bad(`decrease_storage_pool_unused_capacity_by_percent failed: ${JSON.stringify(effects?.status)}`);
      process.exit(1);
    }
    const recovered = (result.objectChanges ?? []).find(
      (c) => c.type === "created" && c.objectType.includes("::storage_resource::Storage"),
    );
    const gas = extractGas(effects);
    readings.push({
      step: "decrease_unused_capacity_by_percent",
      txDigest: result.digest,
      ...gas,
      notes: `-${SHRINK_BY_PERCENT}%; recovered_storage=${recovered && recovered.type === "created" ? recovered.objectId : "?"}`,
    });
    info(`  ↪ Gas:           ${gas.netCost} MIST net`);
    info(`  ↪ Tx:            ${result.digest}`);
  }
  console.log();

  // === Report ===
  bold("=== Calibration summary ===");
  console.log();
  console.log(
    "step                                | net cost (MIST) | compute | storage | rebate    | tx digest",
  );
  console.log(
    "------------------------------------|-----------------|---------|---------|-----------|----------",
  );
  for (const r of readings) {
    console.log(
      `${r.step.padEnd(36)}| ${String(r.netCost).padStart(15)} | ${String(r.computationCost).padStart(7)} | ${String(r.storageCost).padStart(7)} | ${String(r.storageRebate).padStart(9)} | ${r.txDigest}`,
    );
  }
  console.log();

  // Write to /docs/walrus-calibration.md
  const reportPath = join(import.meta.dirname, "..", "..", "..", "docs", "walrus-calibration.md");
  const reportBody = renderReport(readings, address, poolObjectId!);
  writeFileSync(reportPath, reportBody, "utf8");
  info(`Wrote ${reportPath}`);
  console.log();
  bold("Done.");
}

async function getSharedObjectInitialVersion(
  client: Client,
  objectId: string,
): Promise<string> {
  const obj = await client.getObject({ id: objectId, options: { showOwner: true } });
  const owner = obj.data?.owner;
  if (!owner || typeof owner !== "object" || !("Shared" in owner)) {
    throw new Error(`Object ${objectId} is not a shared object: ${JSON.stringify(owner)}`);
  }
  return String(owner.Shared.initial_shared_version);
}

function renderReport(readings: GasReading[], deployer: string, poolObjectId: string): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [];
  lines.push("# Walrus storage_pool baseline calibration");
  lines.push("");
  lines.push(`**Date:** ${date}`);
  lines.push(`**Network:** Sui testnet`);
  lines.push(`**Walrus published-at:** \`${WALRUS_PACKAGE_PUBLISHED_AT_TESTNET}\` (v3)`);
  lines.push(`**System object:** \`${WALRUS_SYSTEM_OBJECT_ID}\``);
  lines.push(`**Deployer:** \`${deployer}\``);
  lines.push(`**Pool created:** \`${poolObjectId}\``);
  lines.push("");
  lines.push("## Why this exists");
  lines.push("");
  lines.push("Phase A of the storage-pool migration ([docs/storage-pool-migration.md](storage-pool-migration.md)) requires real gas numbers for the Walrus pool primitives before we commit to the wrapper module and gateway refactor. Walrus docs say these are size-independent and ~constant but never publish numbers.");
  lines.push("");
  lines.push("## Measurements");
  lines.push("");
  lines.push("All values in MIST (1 SUI = 10^9 MIST).");
  lines.push("");
  lines.push("| Step | Net cost | Computation | Storage | Rebate | Tx |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const r of readings) {
    lines.push(
      `| \`${r.step}\` | ${r.netCost} | ${r.computationCost} | ${r.storageCost} | ${r.storageRebate} | [\`${r.txDigest.slice(0, 10)}…\`](https://suiscan.xyz/testnet/tx/${r.txDigest}) |`,
    );
  }
  lines.push("");
  lines.push("## Notes per step");
  lines.push("");
  for (const r of readings) {
    lines.push(`- **${r.step}** — ${r.notes ?? ""}`);
  }
  lines.push("");
  lines.push("## What's NOT measured here");
  lines.push("");
  lines.push("- `register_pooled_blob` / `certify_pooled_blob` / `delete_pooled_blob` / `burn_expired_pooled_blob` — these require real Walrus blob encoding + storage-node quorum certificates. Measured end-to-end in Phase K once the pool_vault.move wrapper and gateway PUT pipeline are wired.");
  lines.push("");
  lines.push("## Wrapper overhead estimate");
  lines.push("");
  lines.push("Our `kraterion::pool_vault::*` entry functions add a thin overhead on top of these baselines:");
  lines.push("- 1× `reserve::assert_caller_authorized` — single vector membership check");
  lines.push("- 1× `reserve::pull_wal` + `coin::destroy_zero` (for fee-bearing ops) — Balance arithmetic + coin destroy");
  lines.push("- 1× `&mut KraterionPoolVault` borrow — adds one shared-object input to the PTB");
  lines.push("");
  lines.push("Expect ~10–20% additional gas per call on top of these baselines. Phase K will measure exact.");
  lines.push("");
  lines.push("## How to rerun");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm -F @kraterion/gateway exec tsx scripts/walrus-pool-baseline.ts");
  lines.push("```");
  lines.push("");
  lines.push("Requires: active Sui CLI keypair on testnet, ≥1 WAL + ≥0.5 SUI in the deployer wallet.");
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  bad(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
