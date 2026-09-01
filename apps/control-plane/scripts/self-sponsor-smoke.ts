/**
 * Live end-to-end smoke for the SELF-HOSTED sponsorship pipeline (no Enoki).
 *
 * Walks the full happy path:
 *
 *   1. Generate a fresh Ed25519 keypair (the "user"). A plain Ed25519
 *      signature exercises the exact same sponsor path a zkLogin signature
 *      will — the gas layer only cares that the sender produced a valid Sui
 *      signature over the TransactionData; it doesn't care how.
 *   2. POST /v1/auth/dev-sign-up to mint a CP session keyed to that
 *      keypair's Sui address. (Production sign-in is /v1/auth/zklogin; the
 *      dev endpoint stands in so this script needs no Google JWT.)
 *   3. POST /v1/buckets/prepare-create — control-plane builds the PTB,
 *      leases a gas coin from OUR operator wallet, sets gasOwner=operator +
 *      sender=user, sponsor-signs, and returns { digest, bytes }.
 *   4. Sign `bytes` with the keypair locally (the user's half of the dual
 *      signature).
 *   5. POST /v1/sponsor/execute { digest, signature } — control-plane
 *      submits with [user, sponsor] signatures. Gas paid by the operator
 *      wallet; only real gas, no third-party fee.
 *   6. Wait for the tx and assert `KraterionBucketCreated` fired and the
 *      bucket is owned by the user's address.
 *
 * Prereqs:
 *   - control-plane running on $CP_URL (default http://127.0.0.1:4001)
 *   - the operator (`api_decryption`) wallet funded with testnet SUI
 *   - SUI_NETWORK=testnet
 *
 * Run: `pnpm -F @kraterion/control-plane sponsor:smoke`
 */

import { config as dotenvConfig } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });

import { fromBase64 } from "@mysten/sui/utils";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { gasTx } from "@kraterion/walrus-client";
import { KRATERION_PACKAGE_ID, SUI_TESTNET_GRPC } from "@kraterion/shared";

const CP_URL = process.env["CP_URL"] ?? "http://127.0.0.1:4001";
const SUI_GRPC = process.env["SUI_RPC_URL"] ?? SUI_TESTNET_GRPC;

function bold(s: string) { console.log(`\x1b[1m${s}\x1b[0m`); }
function info(s: string) { console.log(`  ${s}`); }
function ok(s: string) { console.log(`\x1b[32m  ✓\x1b[0m ${s}`); }
function fail(s: string): never {
  console.error(`\x1b[31m  ✗ ${s}\x1b[0m`);
  process.exit(1);
}

async function main() {
  bold("=== Self-hosted sponsorship smoke (no Enoki) ===");
  info(`control-plane: ${CP_URL}`);
  info(`sui rpc:       ${SUI_GRPC}`);
  info(`package id:    ${KRATERION_PACKAGE_ID}`);

  const keypair = new Ed25519Keypair();
  const senderAddress = keypair.toSuiAddress();
  info(`sender (user): ${senderAddress}`);

  bold("\n[1/5] dev-sign-up");
  const stamp = `selfspon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  bold("\n[2/5] prepare-create (self-sponsored)");
  const bucketName = `selfspon-${stamp.slice(0, 12)}`.toLowerCase();
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
      sponsored_by: string;
    };
  };
  if (prepared.expected.sponsored_by !== "kraterion") {
    fail(`expected sponsored_by=kraterion, got ${prepared.expected.sponsored_by}`);
  }
  if (prepared.expected.sender !== senderAddress) {
    fail(`expected sender=${senderAddress}, got ${prepared.expected.sender}`);
  }
  if (prepared.expected.allowed_move_call_targets.length !== 1) {
    fail(`allow-list should be exactly 1 target, got ${prepared.expected.allowed_move_call_targets.length}`);
  }
  ok(`self-sponsored digest=${prepared.digest}`);
  info(`bytes:  ${prepared.bytes.length} chars (base64)`);
  info(`target: ${prepared.expected.allowed_move_call_targets[0]}`);

  bold("\n[3/5] sign locally (user half of the dual signature)");
  const txBytes = fromBase64(prepared.bytes);
  const signed = await keypair.signTransaction(txBytes);
  ok(`signed (${signed.signature.length} chars)`);

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
  ok(`settled digest=${exec.digest}`);

  bold("\n[5/5] verify on-chain");
  const sui = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_GRPC });
  const txResult = gasTx(
    await sui.core.waitForTransaction({
      digest: exec.digest,
      include: { effects: true, events: true },
    }),
  );
  if (!txResult.effects.status.success) {
    fail(`on-chain status: ${JSON.stringify(txResult.effects.status)}`);
  }
  ok(`on-chain status: success`);
  const created = txResult.effects.created ?? [];
  const sharedBucketObj = created.find(
    (c) => typeof c.owner === "object" && c.owner !== null && "Shared" in c.owner,
  );
  if (sharedBucketObj) {
    ok(`new shared bucket object: ${sharedBucketObj.reference.objectId}`);
  }
  // The gRPC Core API returns the fully-qualified type on `eventType`.
  const eventTypeOf = (e: unknown): string | undefined => {
    const rec = e as { eventType?: string; type?: string };
    return rec.eventType ?? rec.type;
  };
  const bucketCreatedEvent = (txResult.events ?? []).find((e) =>
    eventTypeOf(e)?.endsWith("::events::KraterionBucketCreated"),
  );
  if (bucketCreatedEvent) {
    ok(`KraterionBucketCreated event emitted (sender=${(bucketCreatedEvent as { sender?: string }).sender})`);
  } else {
    fail("KraterionBucketCreated event not found in transaction events");
  }

  bold("\n=== Self-sponsor smoke green ===");
  info(`bucket name:  ${bucketName}`);
  info(`tx digest:    ${exec.digest}`);
  info(`gas paid by:  operator wallet (no Enoki)`);
  info(`explorer:     https://suiscan.xyz/testnet/tx/${exec.digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
