/**
 * Bootstrap the gateway's testnet state:
 *   1. Load the deployer's active Sui CLI keypair.
 *   2. Generate (or restore) the gateway's api-decryption Ed25519 keypair,
 *      AES-wrap its 32-byte seed, store in `SubWallet`.
 *   3. Fund the gateway address with ~5 SUI from the deployer.
 *   4. Authorize the gateway address on the `PlatformReserve`.
 *   5. Fund the reserve with ~2 WAL from the deployer.
 *   6. Insert a test `Account`/`Project`/`ApiKey` triple in Postgres.
 *      Generate AKIA-style access key id + 40-char secret. Wrap secret.
 *   7. Create a test `KraterionBucket` (private mode) with the gateway
 *      address in `api_decryption_addresses`. Insert `Bucket` row.
 *   8. Print AKIA / secret / bucket IDs.
 *
 * Idempotent: every step checks for existing state and skips re-creation
 * when present. Re-running is safe and fast.
 *
 * Run with `pnpm -F @kraterion/gateway bootstrap`.
 */

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { MIST_PER_SUI } from "@mysten/sui/utils";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { kraterion, reserve } from "@kraterion/kraterion-move-sdk";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WAL_COIN_TYPE,
} from "@kraterion/shared";
import { getSuiClient } from "@kraterion/walrus-client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";
import { loadActiveDeployerKeypair } from "./load-deployer.js";

const GATEWAY_FUND_SUI = 5n; // 5 SUI for gas
const RESERVE_FUND_WAL_MIST = 2_000_000_000n; // 2 WAL
const TEST_ACCOUNT_EMAIL = "demo@kraterion.dev";
const TEST_ACCOUNT_ZKLOGIN_SUB = "demo-zklogin-sub-bootstrap";
const TEST_PROJECT_NAME = "demo-project";
const TEST_BUCKET_NAME = "test-bucket";
const TEST_API_KEY_NAME = "bootstrap-key";

// === Pretty output ===
function bold(s: string) { console.log(`\x1b[1m${s}\x1b[0m`); }
function info(s: string) { console.log(`  ${s}`); }
function warn(s: string) { console.warn(`\x1b[33m  warning:\x1b[0m ${s}`); }

// === Helpers ===

function newAkia(): string {
  // AWS-style: "AKIA" + 16 chars from a base32-ish alphabet (A–Z + 2–7).
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const buf = randomBytes(16);
  let out = "AKIA";
  for (let i = 0; i < 16; i++) {
    out += alphabet[buf[i]! % alphabet.length];
  }
  return out;
}

function newSecret(): string {
  // 40 base64-ish chars.
  return randomBytes(30).toString("base64").replace(/[+/=]/g, "x").slice(0, 40);
}

async function getOwnedWalBalance(
  suiClient: ReturnType<typeof getSuiClient>,
  owner: string,
): Promise<bigint> {
  // Server-side type filter via `getBalance`; cheaper than fetching every
  // owned coin and filtering locally.
  const b = await suiClient.getBalance({ owner, coinType: WAL_COIN_TYPE });
  return BigInt(b.totalBalance);
}

// === Steps ===

async function ensureGatewaySubWallet(prisma: PrismaClient, wrapper: EnvKeyWrapper) {
  const existing = await prisma.subWallet.findFirst({
    where: { role: "api_decryption", account_id: null },
  });
  if (existing) {
    info(`gateway sub-wallet exists: ${existing.sui_address}`);
    const seed = wrapper.unwrap(existing.mnemonic_wrapped);
    const keypair = Ed25519Keypair.fromSecretKey(seed);
    return { keypair, address: existing.sui_address, created: false };
  }

  const keypair = Ed25519Keypair.generate();
  const address = keypair.toSuiAddress();
  // Decision A: store the raw 32-byte seed. getSecretKey() returns the
  // Bech32 string; decodeSuiPrivateKey unpacks it to the raw 32 bytes.
  const { secretKey: seedBytes } = decodeSuiPrivateKey(keypair.getSecretKey());
  if (seedBytes.length !== 32) {
    throw new Error(`Unexpected seed length: ${seedBytes.length} (expected 32)`);
  }
  const wrapped = wrapper.wrap(seedBytes);

  await prisma.subWallet.create({
    data: {
      sui_address: address,
      mnemonic_wrapped: wrapped,
      role: "api_decryption",
      account_id: null,
    },
  });

  // Sanity: re-derive from wrapped seed to catch round-trip bugs early.
  const roundTrip = Ed25519Keypair.fromSecretKey(wrapper.unwrap(wrapped));
  if (roundTrip.toSuiAddress() !== address) {
    throw new Error("Wrapped seed round-trip produced a different address.");
  }

  info(`gateway sub-wallet created: ${address}`);
  return { keypair, address, created: true };
}

async function fundGatewayWithSui(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  gatewayAddress: string,
) {
  const balance = await suiClient.getBalance({ owner: gatewayAddress });
  const target = GATEWAY_FUND_SUI * MIST_PER_SUI;
  if (BigInt(balance.totalBalance) >= target) {
    info(`gateway already has ${BigInt(balance.totalBalance) / MIST_PER_SUI} SUI; skipping`);
    return;
  }

  const need = target - BigInt(balance.totalBalance);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [need]);
  tx.transferObjects([coin], gatewayAddress);

  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== "success") {
    throw new Error(`SUI funding tx failed: ${JSON.stringify(r.effects?.status)}`);
  }
  info(`funded gateway with ${need / MIST_PER_SUI} SUI (tx ${r.digest})`);
}

async function authorizeGatewayOnReserve(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  gatewayAddress: string,
) {
  // Read current authorized list off-chain to skip if already present.
  const obj = await suiClient.getObject({
    id: KRATERION_RESERVE_ID,
    options: { showContent: true },
  });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  const authorized = (fields?.["authorized_callers"] as string[] | undefined) ?? [];
  if (authorized.map((a) => a.toLowerCase()).includes(gatewayAddress.toLowerCase())) {
    info(`gateway already authorized on reserve; skipping`);
    return;
  }

  const tx = new Transaction();
  tx.add(
    reserve.authorizeCaller({
      package: KRATERION_PACKAGE_ID,
      arguments: { reserve: KRATERION_RESERVE_ID, addr: gatewayAddress },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== "success") {
    throw new Error(`reserve.authorize_caller failed: ${JSON.stringify(r.effects?.status)}`);
  }
  info(`authorized gateway on reserve (tx ${r.digest})`);
}

async function fundReserveWithWal(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
) {
  // Skip if the reserve already has enough WAL.
  const obj = await suiClient.getObject({
    id: KRATERION_RESERVE_ID,
    options: { showContent: true },
  });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  const balanceField = fields?.["wal_balance"] as string | undefined;
  const current = BigInt(balanceField ?? "0");
  if (current >= RESERVE_FUND_WAL_MIST) {
    info(`reserve already has ${current} WAL-MIST; skipping fund`);
    return;
  }

  const need = RESERVE_FUND_WAL_MIST - current;
  const ownedWal = await getOwnedWalBalance(suiClient, deployer.toSuiAddress());
  if (ownedWal < need) {
    throw new Error(
      `Deployer has only ${ownedWal} MIST of ${WAL_COIN_TYPE}; need ${need}. ` +
        `Run \`walrus get-wal\` to top up, then re-run bootstrap.`,
    );
  }

  // `coinWithBalance` (from `@mysten/sui/transactions`) handles arbitrary
  // coin types: it picks owned coins of the right type, merges/splits as
  // needed, and yields a `Coin<WAL>` argument we hand to reserve.fund.
  // No manual splitCoins ceremony required.
  const tx = new Transaction();
  tx.add(
    reserve.fund({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        reserve: KRATERION_RESERVE_ID,
        coin: coinWithBalance({ type: WAL_COIN_TYPE, balance: need }),
      },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== "success") {
    throw new Error(`reserve.fund failed: ${JSON.stringify(r.effects?.status)}`);
  }
  info(`funded reserve with ${need} MIST WAL (tx ${r.digest})`);
}

async function ensureTestAccount(prisma: PrismaClient, wrapper: EnvKeyWrapper, deployerAddress: string) {
  let account = await prisma.account.findUnique({ where: { email: TEST_ACCOUNT_EMAIL } });
  if (!account) {
    account = await prisma.account.create({
      data: {
        email: TEST_ACCOUNT_EMAIL,
        zklogin_sub: TEST_ACCOUNT_ZKLOGIN_SUB,
        sui_address: deployerAddress,
      },
    });
    info(`created test account: ${account.id}`);
  } else {
    info(`test account exists: ${account.id}`);
  }

  let project = await prisma.project.findFirst({
    where: { account_id: account.id, name: TEST_PROJECT_NAME },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { account_id: account.id, name: TEST_PROJECT_NAME },
    });
    info(`created test project: ${project.id}`);
  } else {
    info(`test project exists: ${project.id}`);
  }

  let apiKey = await prisma.apiKey.findFirst({
    where: { project_id: project.id, name: TEST_API_KEY_NAME, revoked_at: null },
  });
  let secret: string | null = null;
  if (!apiKey) {
    secret = newSecret();
    apiKey = await prisma.apiKey.create({
      data: {
        project_id: project.id,
        name: TEST_API_KEY_NAME,
        access_key_id: newAkia(),
        secret_wrapped: wrapper.wrap(Buffer.from(secret, "utf8")),
      },
    });
    info(`created test API key: ${apiKey.access_key_id}`);
  } else {
    info(`test API key exists: ${apiKey.access_key_id} (secret not re-displayed; rotate if lost)`);
  }

  return { account, project, apiKey, secretIfNew: secret };
}

async function ensureTestBucket(
  suiClient: ReturnType<typeof getSuiClient>,
  prisma: PrismaClient,
  deployer: Ed25519Keypair,
  gatewayAddress: string,
  projectId: string,
) {
  const existing = await prisma.bucket.findFirst({
    where: { project_id: projectId, name: TEST_BUCKET_NAME, deleted_at: null },
  });
  if (existing) {
    info(`test bucket exists on-chain: ${existing.kraterion_bucket_object_id}`);
    return existing;
  }

  const tx = new Transaction();
  tx.add(
    kraterion.createGrantAndShareBucket({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        name: Array.from(new TextEncoder().encode(TEST_BUCKET_NAME)),
        apiAddr: gatewayAddress,
        encryptionMode: 0, // private
      },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r.effects?.status?.status !== "success") {
    throw new Error(`createGrantAndShareBucket failed: ${JSON.stringify(r.effects?.status)}`);
  }

  const created = (r.objectChanges ?? []).find(
    (c) =>
      c.type === "created" &&
      "objectType" in c &&
      c.objectType.endsWith("::kraterion::KraterionBucket"),
  );
  if (!created || !("objectId" in created)) {
    throw new Error("Could not find created KraterionBucket in tx effects.");
  }
  const bucketObjectId = created.objectId;

  const bucket = await prisma.bucket.create({
    data: {
      project_id: projectId,
      name: TEST_BUCKET_NAME,
      encryption_mode: "private",
      kraterion_bucket_object_id: bucketObjectId,
      api_access_granted: true,
    },
  });
  info(`created test bucket: ${bucketObjectId} (tx ${r.digest})`);
  return bucket;
}

// === Main ===

async function main() {
  bold("▸ pre-flight");
  const prisma = new PrismaClient();
  const wrapper = new EnvKeyWrapper();
  const suiClient = getSuiClient();
  const { keypair: deployer, address: deployerAddress } = loadActiveDeployerKeypair();
  info(`deployer: ${deployerAddress}`);

  bold("▸ gateway sub-wallet");
  const { keypair: gateway, address: gatewayAddress } = await ensureGatewaySubWallet(prisma, wrapper);

  bold("▸ gateway SUI funding");
  await fundGatewayWithSui(suiClient, deployer, gatewayAddress);

  bold("▸ reserve authorization");
  await authorizeGatewayOnReserve(suiClient, deployer, gatewayAddress);

  bold("▸ reserve WAL funding");
  await fundReserveWithWal(suiClient, deployer);

  bold("▸ test account / project / api key");
  const { account, project, apiKey, secretIfNew } = await ensureTestAccount(
    prisma,
    wrapper,
    deployerAddress,
  );

  bold("▸ test bucket");
  const bucket = await ensureTestBucket(suiClient, prisma, deployer, gatewayAddress, project.id);

  bold("");
  bold("✓ bootstrap complete");
  info("");
  info(`account              ${account.id}`);
  info(`project              ${project.id}`);
  info(`access_key_id        ${apiKey.access_key_id}`);
  if (secretIfNew) {
    warn(`secret (display ONCE) ${secretIfNew}`);
    warn(`record this somewhere — re-running bootstrap won't print it again`);
  } else {
    info(`secret               (already set on a prior run; rotate if lost)`);
  }
  info(`gateway address      ${gatewayAddress}`);
  info(`bucket object id     ${bucket.kraterion_bucket_object_id}`);
  info("");
  info("next: pnpm -F @kraterion/gateway smoke");

  // suppress unused-var on `gateway` keypair (the smoke test reads it from DB).
  void gateway;

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\x1b[31m  error:\x1b[0m", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
