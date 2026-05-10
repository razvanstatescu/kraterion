/**
 * Live end-to-end smoke for the Enoki sponsorship pipeline.
 *
 * Walks the full happy path:
 *
 *   1. Generate a fresh Ed25519 keypair (the "user").
 *   2. POST /v1/auth/dev-sign-up to mint a CP session keyed to that
 *      keypair's Sui address. (Real production sign-in is via
 *      /v1/auth/zklogin + Enoki Google OAuth; the dev-mode endpoint
 *      stands in here so the script doesn't need a live Google JWT.)
 *   3. POST /v1/buckets/prepare-create — control-plane builds the
 *      kind-bytes, asks Enoki to sponsor, returns { digest, bytes }.
 *   4. Sign `bytes` with the keypair locally (Enoki accepts any valid
 *      Sui signature for the sender, not only zkLogin signatures).
 *   5. POST /v1/sponsor/execute { digest, signature } — control-plane
 *      relays to Enoki, which co-signs the gas envelope and submits.
 *   6. Wait for the tx via SuiClient and assert the
 *      `KraterionBucketCreated` event fired.
 *
 * Prereqs:
 *   - control-plane running on $CP_URL (default http://127.0.0.1:4001)
 *   - ENOKI_PRIVATE_KEY set in .env at the repo root
 *   - The Enoki Portal app must permit the
 *     `<KRATERION_PACKAGE_ID>::kraterion::create_and_share_bucket`
 *     target (or wildcard the kraterion package).
 *
 * Run: `pnpm -F @kraterion/control-plane enoki:smoke`
 */

import { config as dotenvConfig } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Walk to the workspace root .env. The Nest app picks it up via Prisma's
// upward-walking dotenv loader at boot, but standalone scripts have to
// resolve it ourselves.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });

import { fromBase64 } from "@mysten/sui/utils";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";

const CP_URL = process.env["CP_URL"] ?? "http://127.0.0.1:4001";
const SUI_RPC = process.env["SUI_RPC_URL"] ?? getJsonRpcFullnodeUrl("testnet");

function bold(s: string) { console.log(`\x1b[1m${s}\x1b[0m`); }
function info(s: string) { console.log(`  ${s}`); }
function ok(s: string) { console.log(`\x1b[32m  ✓\x1b[0m ${s}`); }
function fail(s: string): never {
  console.error(`\x1b[31m  ✗ ${s}\x1b[0m`);
  process.exit(1);
}

async function main() {
  if (!process.env["ENOKI_PRIVATE_KEY"]) {
    fail("ENOKI_PRIVATE_KEY not set in .env. Provision a private key in the Enoki Portal first.");
  }

  bold("=== Enoki live smoke ===");
  info(`control-plane: ${CP_URL}`);
  info(`sui rpc:       ${SUI_RPC}`);
  info(`package id:    ${KRATERION_PACKAGE_ID}`);

  // 1. Generate a fresh keypair. Each run uses a distinct address so
  //    the Account/Project/ApiKey rows we create are isolated.
  const keypair = new Ed25519Keypair();
  const senderAddress = keypair.toSuiAddress();
  info(`sender:        ${senderAddress}`);

  // 2. dev-sign-up against the running control-plane.
  bold("\n[1/5] dev-sign-up");
  const stamp = `enoki-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${stamp}@kraterion.dev`;
  const signupRes = await fetch(`${CP_URL}/v1/auth/dev-sign-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sui_address: senderAddress }),
  });
  if (!signupRes.ok) {
    fail(`dev-sign-up failed: ${signupRes.status} ${await signupRes.text()}`);
  }
  const signup = (await signupRes.json()) as {
    token: string;
    project: { id: string };
  };
  ok(`signed up, project id ${signup.project.id}`);

  // 3. prepare-create: backend builds kind-bytes + Enoki sponsorship.
  //
  //    grant_api_access:false avoids needing the gateway sub-wallet for
  //    this smoke — the goal is to verify Enoki, not the bootstrap
  //    chain. The same path with grant_api_access:true works once
  //    `pnpm -F @kraterion/gateway bootstrap` has been run.
  bold("\n[2/5] prepare-create");
  const bucketName = `enoki-smoke-${stamp.slice(0, 12)}`.toLowerCase();
  const prepareRes = await fetch(`${CP_URL}/v1/buckets/prepare-create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signup.token}`,
    },
    body: JSON.stringify({
      project_id: signup.project.id,
      name: bucketName,
      encryption_mode: "private",
      grant_api_access: false,
    }),
  });
  if (!prepareRes.ok) {
    fail(`prepare-create failed: ${prepareRes.status} ${await prepareRes.text()}`);
  }
  const prepared = (await prepareRes.json()) as {
    digest: string;
    bytes: string;
    expected: {
      package_id: string;
      function: string;
      summary: string;
      sender: string;
      allowed_move_call_targets: string[];
      sponsored_by: "enoki";
    };
  };
  if (prepared.expected.sponsored_by !== "enoki") {
    fail(`expected sponsored_by=enoki, got ${prepared.expected.sponsored_by}`);
  }
  if (prepared.expected.sender !== senderAddress) {
    fail(`expected sender=${senderAddress}, got ${prepared.expected.sender}`);
  }
  if (prepared.expected.allowed_move_call_targets.length !== 1) {
    fail(`allow-list should be exactly 1 target, got ${prepared.expected.allowed_move_call_targets.length}`);
  }
  ok(`enoki returned digest=${prepared.digest}`);
  info(`bytes:  ${prepared.bytes.length} chars (base64)`);
  info(`target: ${prepared.expected.allowed_move_call_targets[0]}`);

  // 4. Sign Enoki's bytes locally. The keypair's signTransaction takes
  //    the BCS TransactionData bytes (which Enoki already gas-paid)
  //    and returns the user's part of the dual signature.
  bold("\n[3/5] sign locally");
  const txBytes = fromBase64(prepared.bytes);
  const signed = await keypair.signTransaction(txBytes);
  ok(`signed (${signed.signature.length} chars)`);

  // 5. Hand digest+signature back to the control plane, which relays
  //    to Enoki's executeSponsoredTransaction. Enoki combines its
  //    sponsor signature with ours and submits.
  bold("\n[4/5] sponsor/execute");
  const execRes = await fetch(`${CP_URL}/v1/sponsor/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signup.token}`,
    },
    body: JSON.stringify({
      digest: prepared.digest,
      signature: signed.signature,
    }),
  });
  if (!execRes.ok) {
    fail(`sponsor/execute failed: ${execRes.status} ${await execRes.text()}`);
  }
  const exec = (await execRes.json()) as { digest: string };
  ok(`enoki settled digest=${exec.digest}`);

  // 6. On-chain confirmation. We re-encode the digest the canonical
  //    way and ask the fullnode for effects + emitted events.
  bold("\n[5/5] verify on-chain");
  const sui = new SuiJsonRpcClient({ url: SUI_RPC });
  const txResult = await sui.waitForTransaction({
    digest: exec.digest,
    options: { showEffects: true, showEvents: true },
  });
  if (txResult.effects?.status?.status !== "success") {
    fail(`on-chain status: ${JSON.stringify(txResult.effects?.status)}`);
  }
  ok(`on-chain status: ${txResult.effects.status.status}`);
  const created = txResult.effects.created ?? [];
  const sharedBucketObj = created.find(
    (c) => typeof c.owner === "object" && c.owner !== null && "Shared" in c.owner,
  );
  if (sharedBucketObj) {
    ok(`new shared bucket object: ${sharedBucketObj.reference.objectId}`);
  } else {
    info(`(no shared object found in effects.created — odd, but the tx succeeded)`);
  }
  const bucketCreatedEvent = (txResult.events ?? []).find((e) =>
    e.type.endsWith("::events::KraterionBucketCreated"),
  );
  if (bucketCreatedEvent) {
    ok(`KraterionBucketCreated event emitted`);
    info(`  parsed: ${JSON.stringify(bucketCreatedEvent.parsedJson)}`);
  } else {
    fail("KraterionBucketCreated event not found in transaction events");
  }

  bold("\n=== Enoki live smoke green ===");
  info(`bucket name:  ${bucketName}`);
  info(`tx digest:    ${exec.digest}`);
  info(`explorer:     https://suiscan.xyz/testnet/tx/${exec.digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
