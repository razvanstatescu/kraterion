/**
 * One-shot reserve top-up. Reads `--wal N` (default 5 WAL), exchanges
 * SUI for WAL via `walrus get-wal` (idempotent — does nothing if the
 * deployer already has enough), then calls `reserve::fund` to deposit
 * into the platform reserve.
 *
 *   pnpm -F @kraterion/gateway exec tsx scripts/topup-reserve.ts [--wal N]
 *
 * Diagnostic / testnet only. Production WAL top-ups go through a
 * separate treasury automation (B6, deferred).
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { KRATERION_PACKAGE_ID, KRATERION_RESERVE_ID } from "@kraterion/shared";
import { reserve } from "@kraterion/kraterion-move-sdk";
import { getSuiClient } from "@kraterion/walrus-client";
import { loadActiveDeployerKeypair } from "./load-deployer.js";

const WAL_COIN_TYPE =
  "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL";

interface Args {
  walMist: bigint;
}
function parseArgs(argv: string[]): Args {
  let wal = 5n; // default 5 WAL
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--wal" && argv[i + 1]) {
      wal = BigInt(argv[i + 1]!);
      i++;
    }
  }
  return { walMist: wal * 1_000_000_000n };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { keypair: deployer, address: deployerAddress } = loadActiveDeployerKeypair();
  console.log(`deployer: ${deployerAddress}`);

  const suiClient = getSuiClient();

  // 1. Top up SUI's WAL exchange if needed.
  let owned = await getOwnedWalBalance(suiClient, deployerAddress);
  console.log(`owned WAL: ${owned} MIST (need ${args.walMist})`);
  while (owned < args.walMist) {
    console.log("running `walrus get-wal` (0.5 WAL exchange)…");
    try {
      execSync("walrus get-wal", { stdio: "inherit" });
    } catch (err) {
      console.error("walrus get-wal failed:", (err as Error).message);
      process.exit(1);
    }
    // Wait briefly for the chain state to settle.
    await new Promise((r) => setTimeout(r, 1000));
    owned = await getOwnedWalBalance(suiClient, deployerAddress);
    console.log(`owned WAL: ${owned} MIST`);
  }

  // 2. Fund the reserve.
  const tx = new Transaction();
  tx.add(
    reserve.fund({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        reserve: KRATERION_RESERVE_ID,
        coin: coinWithBalance({ type: WAL_COIN_TYPE, balance: args.walMist }),
      },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== "success") {
    console.error(`reserve.fund failed: ${JSON.stringify(r.effects?.status)}`);
    process.exit(1);
  }
  console.log(`funded reserve with ${args.walMist} MIST (tx ${r.digest})`);
}

async function getOwnedWalBalance(
  client: ReturnType<typeof getSuiClient>,
  address: string,
): Promise<bigint> {
  const balance = await client.getBalance({ owner: address, coinType: WAL_COIN_TYPE });
  return BigInt(balance.totalBalance);
}

main().catch((e) => {
  console.error("top-up failed:", e);
  process.exit(1);
});
