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
import { gasTx, getSuiClient } from "@kraterion/walrus-client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";
import { loadActiveDeployerKeypair } from "./load-deployer.js";

// Funding amounts are env-overridable so a bootstrap can fit a constrained
// deployer balance (e.g. BOOTSTRAP_GATEWAY_SUI=10). Defaults target a hosted
// deploy with ample headroom.
const GATEWAY_FUND_SUI = BigInt(process.env["BOOTSTRAP_GATEWAY_SUI"] ?? "50"); // whole SUI
// Knowledge-indexer sub-wallet needs SUI for K5 manifest writes
// (`register_blob_for_bucket` + `wrap_in_shared_blob`).
const KNOWLEDGE_INDEXER_FUND_SUI =
  BigInt(process.env["BOOTSTRAP_INDEXER_SUI"] ?? "10") * MIST_PER_SUI; // in MIST
const RESERVE_FUND_WAL_MIST =
  BigInt(process.env["BOOTSTRAP_RESERVE_WAL"] ?? "100") * 1_000_000_000n; // WAL in MIST
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
  const { balance: b } = await suiClient.core.getBalance({ owner, coinType: WAL_COIN_TYPE });
  return BigInt(b.balance);
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

/**
 * Provision the AI worker's `knowledge_indexer` sub-wallet. Same shape
 * as the gateway sub-wallet — Ed25519 keypair, seed AES-wrapped via
 * `EnvKeyWrapper`, recorded in `SubWallet { role: "knowledge_indexer",
 * account_id: null }` (shared across all knowledge-enabled buckets for
 * v1; per-account is a post-hackathon iteration).
 *
 * The address is funded from the deployer for K5 manifest-blob writes.
 * The on-chain `grant_api_access(bucket, this_address)` call happens
 * later at Knowledge-enable time per bucket (K2 endpoint), not here.
 */
async function ensureKnowledgeIndexerSubWallet(
  prisma: PrismaClient,
  wrapper: EnvKeyWrapper,
) {
  const existing = await prisma.subWallet.findFirst({
    where: { role: "knowledge_indexer", account_id: null },
  });
  if (existing) {
    info(`knowledge-indexer sub-wallet exists: ${existing.sui_address}`);
    return { address: existing.sui_address, created: false };
  }

  const keypair = Ed25519Keypair.generate();
  const address = keypair.toSuiAddress();
  const { secretKey: seedBytes } = decodeSuiPrivateKey(keypair.getSecretKey());
  if (seedBytes.length !== 32) {
    throw new Error(`Unexpected seed length: ${seedBytes.length} (expected 32)`);
  }
  const wrapped = wrapper.wrap(seedBytes);

  await prisma.subWallet.create({
    data: {
      sui_address: address,
      mnemonic_wrapped: wrapped,
      role: "knowledge_indexer",
      account_id: null,
    },
  });

  // Sanity: re-derive from wrapped seed to catch round-trip bugs early.
  const roundTrip = Ed25519Keypair.fromSecretKey(wrapper.unwrap(wrapped));
  if (roundTrip.toSuiAddress() !== address) {
    throw new Error("Wrapped seed round-trip produced a different address.");
  }

  info(`knowledge-indexer sub-wallet created: ${address}`);
  return { address, created: true };
}

/**
 * Idempotent `grant_api_access` against the bootstrap-created test
 * bucket for the worker's knowledge_indexer sub-wallet. Skips when
 * the address is already in the bucket's `api_decryption_addresses`
 * list so re-runs are free.
 *
 * Production buckets get this grant via the K2 "enable Knowledge"
 * endpoint at toggle-on time; the bootstrap is the test-only wiring.
 */
async function grantKnowledgeIndexerAccessOnTestBucket(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  bucketObjectId: string,
  knowledgeIndexerAddress: string,
) {
  const obj = await suiClient.core.getObject({
    objectId: bucketObjectId,
    include: { json: true },
  });
  const fields = obj.object?.json;
  const granted = (fields?.["api_decryption_addresses"] as string[] | undefined) ?? [];
  const norm = (a: string) => a.toLowerCase();
  if (granted.map(norm).includes(norm(knowledgeIndexerAddress))) {
    info(`knowledge-indexer already granted on test bucket; skipping`);
    return;
  }

  const tx = new Transaction();
  tx.add(
    kraterion.grantApiAccess({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        bucket: bucketObjectId,
        apiAddr: knowledgeIndexerAddress,
      },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    include: { effects: true },
  });
  if (!gasTx(r).effects.status.success) {
    throw new Error(
      `kraterion.grant_api_access (knowledge_indexer) failed: ${JSON.stringify(gasTx(r).effects.status)}`,
    );
  }
  info(`granted knowledge-indexer access on test bucket (tx ${gasTx(r).digest})`);
}

async function fundKnowledgeIndexerWithSui(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  address: string,
) {
  const { balance } = await suiClient.core.getBalance({ owner: address });
  if (BigInt(balance.balance) >= KNOWLEDGE_INDEXER_FUND_SUI) {
    const sui = BigInt(balance.balance) / MIST_PER_SUI;
    info(`knowledge-indexer already has ~${sui} SUI; skipping`);
    return;
  }
  const need = KNOWLEDGE_INDEXER_FUND_SUI - BigInt(balance.balance);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [need]);
  tx.transferObjects([coin], address);
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    include: { effects: true },
  });
  if (!gasTx(r).effects.status.success) {
    throw new Error(`SUI funding tx failed: ${JSON.stringify(gasTx(r).effects.status)}`);
  }
  info(`funded knowledge-indexer with ${need} MIST SUI (tx ${gasTx(r).digest})`);
}

async function fundGatewayWithSui(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  gatewayAddress: string,
) {
  const { balance } = await suiClient.core.getBalance({ owner: gatewayAddress });
  const target = GATEWAY_FUND_SUI * MIST_PER_SUI;
  if (BigInt(balance.balance) >= target) {
    info(`gateway already has ${BigInt(balance.balance) / MIST_PER_SUI} SUI; skipping`);
    return;
  }

  const need = target - BigInt(balance.balance);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [need]);
  tx.transferObjects([coin], gatewayAddress);

  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    include: { effects: true },
  });
  if (!gasTx(r).effects.status.success) {
    throw new Error(`SUI funding tx failed: ${JSON.stringify(gasTx(r).effects.status)}`);
  }
  info(`funded gateway with ${need / MIST_PER_SUI} SUI (tx ${gasTx(r).digest})`);
}

/**
 * Idempotent reserve authorization. Used for both the gateway and the
 * knowledge-indexer sub-wallets — anyone who calls
 * `register_blob_for_bucket` (which pulls WAL from the reserve) must be
 * on the reserve's `authorized_callers` list.
 *
 * Skips when the address is already authorized so the bootstrap stays
 * cheap on re-runs.
 */
async function authorizeAddressOnReserve(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
  address: string,
  label: string,
) {
  const obj = await suiClient.core.getObject({
    objectId: KRATERION_RESERVE_ID,
    include: { json: true },
  });
  const fields = obj.object?.json;
  const authorized = (fields?.["authorized_callers"] as string[] | undefined) ?? [];
  if (authorized.map((a) => a.toLowerCase()).includes(address.toLowerCase())) {
    info(`${label} already authorized on reserve; skipping`);
    return;
  }

  const tx = new Transaction();
  tx.add(
    reserve.authorizeCaller({
      package: KRATERION_PACKAGE_ID,
      arguments: { reserve: KRATERION_RESERVE_ID, addr: address },
    }),
  );
  const r = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: deployer,
    include: { effects: true },
  });
  if (!gasTx(r).effects.status.success) {
    throw new Error(`reserve.authorize_caller failed: ${JSON.stringify(gasTx(r).effects.status)}`);
  }
  info(`authorized ${label} on reserve (tx ${gasTx(r).digest})`);
}

async function fundReserveWithWal(
  suiClient: ReturnType<typeof getSuiClient>,
  deployer: Ed25519Keypair,
) {
  // Skip if the reserve already has enough WAL.
  const obj = await suiClient.core.getObject({
    objectId: KRATERION_RESERVE_ID,
    include: { json: true },
  });
  const fields = obj.object?.json;
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
    include: { effects: true },
  });
  if (!gasTx(r).effects.status.success) {
    throw new Error(`reserve.fund failed: ${JSON.stringify(gasTx(r).effects.status)}`);
  }
  info(`funded reserve with ${need} MIST WAL (tx ${gasTx(r).digest})`);
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
    include: { effects: true, objectTypes: true },
  });
  const tx2 = gasTx(r);
  if (!tx2.effects.status.success) {
    throw new Error(`createGrantAndShareBucket failed: ${JSON.stringify(tx2.effects.status)}`);
  }

  // `objectChanges` → `effects.changedObjects` (idOperation) cross-referenced
  // with the `objectTypes` id→type map from `include: { objectTypes: true }`.
  const types = tx2.objectTypes ?? {};
  const created = tx2.effects.changedObjects.find(
    (c) =>
      c.idOperation === "Created" &&
      types[c.objectId]?.endsWith("::kraterion::KraterionBucket"),
  );
  if (!created) {
    throw new Error("Could not find created KraterionBucket in tx effects.");
  }
  const bucketObjectId = created.objectId;
  info(`created test bucket on chain: ${bucketObjectId} (tx ${gasTx(r).digest})`);
  // The on-chain bucket emits `KraterionBucketCreated`; the indexer
  // worker (separate process) writes the `Bucket` row. Per the
  // single-writer ADR we don't insert here. Print a hint so the
  // operator knows to start the worker for the row to appear.
  void projectId; // resolved by the indexer via Account.sui_address.
  info(
    `Bucket DB row will be written by the indexer (run ` +
      `\`pnpm -F @kraterion/worker dev\` if not already running).`,
  );
  // Return a minimal stub so callers that previously consumed the
  // Bucket row's id keep typechecking. None of the bootstrap output
  // formatting depends on this; the indexer is the source of truth.
  return { id: null, kraterion_bucket_object_id: bucketObjectId };
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

  bold("▸ knowledge-indexer sub-wallet");
  const { address: knowledgeIndexerAddress } = await ensureKnowledgeIndexerSubWallet(
    prisma,
    wrapper,
  );

  bold("▸ knowledge-indexer SUI funding");
  await fundKnowledgeIndexerWithSui(suiClient, deployer, knowledgeIndexerAddress);

  bold("▸ reserve authorization");
  await authorizeAddressOnReserve(suiClient, deployer, gatewayAddress, "gateway");
  // K5: the knowledge_indexer signs `register_blob_for_bucket` when
  // archiving manifests, so it needs the same reserve grant.
  await authorizeAddressOnReserve(
    suiClient,
    deployer,
    knowledgeIndexerAddress,
    "knowledge-indexer",
  );

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

  bold("▸ knowledge-indexer access on test bucket");
  await grantKnowledgeIndexerAccessOnTestBucket(
    suiClient,
    deployer,
    bucket.kraterion_bucket_object_id,
    knowledgeIndexerAddress,
  );

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
  info(`knowledge-indexer    ${knowledgeIndexerAddress}`);
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
