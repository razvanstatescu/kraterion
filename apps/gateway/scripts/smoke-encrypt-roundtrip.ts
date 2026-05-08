/**
 * End-to-end crypto + on-chain smoke test, off-S3. Validates the entire
 * "Architecture D" pipeline that the gateway's PutObject / GetObject
 * will use:
 *
 *   1. Seal-encrypt a small plaintext under a 48-byte identity bound to
 *      the test bucket.
 *   2. Compute Walrus blob metadata (blobId, rootHash, nonce, encoding).
 *   3. PTB 1 — `kraterion::registerBlobForBucket`. Pulls WAL from the
 *      reserve. Returns the new on-chain `Blob` owned by the gateway.
 *   4. POST encoded payload to Mysten's public testnet upload-relay,
 *      receive certificate.
 *   5. PTB 2 — `walrus::system::certifyBlob` + `kraterion::wrapInSharedBlob`,
 *      composed atomically. Wraps the certified `Blob` into a `SharedBlob`.
 *   6. Read the encrypted bytes back via the public aggregator HTTP.
 *   7. Build a `seal_approve` PTB → txBytes (no on-chain submit; Seal's
 *      key servers dry-run it).
 *   8. Decrypt with a Redis-cached SessionKey.
 *   9. Assert plaintext round-trips.
 *
 * Run with `pnpm -F @kraterion/gateway smoke`. Requires Phase 2's
 * bootstrap to have run first (creates the test bucket + funds the
 * reserve + authorizes the gateway sub-wallet).
 */

import "dotenv/config";
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import Redis from "ioredis";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  SEAL_THRESHOLD,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { kraterion, access } from "@kraterion/kraterion-move-sdk";
import {
  blobIdStringToU256,
  getEncodedBlobLength,
  getSuiClient,
  getWalrusClient,
  readBlobByBlobId,
  rootHashBytesToU256,
} from "@kraterion/walrus-client";
import {
  getSealClient,
  getOrCreateSessionKey,
} from "@kraterion/seal-client";
import { EnvKeyWrapper } from "../src/auth/key-wrapping.js";

const EPOCHS_AHEAD = 5;
// Generous payment budget; leftover is auto-returned to the reserve.
// Walrus testnet pricing is tiny — a few thousand MIST per write epoch.
const PAYMENT_AMOUNT_MIST = 200_000_000n; // 0.2 WAL

// === Pretty output ===
function bold(s: string) { console.log(`\x1b[1m${s}\x1b[0m`); }
function info(s: string) { console.log(`  ${s}`); }
function bad(s: string) { console.error(`\x1b[31m  error:\x1b[0m ${s}`); }

// Helper: drop UID 0x prefix and convert to bytes.
function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}

async function loadGatewayKeypair(prisma: PrismaClient, wrapper: EnvKeyWrapper): Promise<Ed25519Keypair> {
  const sub = await prisma.subWallet.findFirst({
    where: { role: "api_decryption", account_id: null },
  });
  if (!sub) {
    throw new Error("No gateway sub-wallet in DB. Run `pnpm -F @kraterion/gateway bootstrap` first.");
  }
  const seed = wrapper.unwrap(sub.mnemonic_wrapped);
  return Ed25519Keypair.fromSecretKey(seed);
}

async function loadTestBucket(prisma: PrismaClient) {
  const bucket = await prisma.bucket.findFirst({
    where: { name: "test-bucket", deleted_at: null },
  });
  if (!bucket) {
    throw new Error("No test bucket. Run `pnpm -F @kraterion/gateway bootstrap` first.");
  }
  return bucket;
}

async function main() {
  bold("▸ pre-flight");
  const prisma = new PrismaClient();
  const wrapper = new EnvKeyWrapper();
  const suiClient = getSuiClient();
  const walrus = getWalrusClient();
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
  });

  const gateway = await loadGatewayKeypair(prisma, wrapper);
  const gatewayAddress = gateway.toSuiAddress();
  const bucket = await loadTestBucket(prisma);
  const bucketObjectId = bucket.kraterion_bucket_object_id;
  info(`gateway:  ${gatewayAddress}`);
  info(`bucket:   ${bucketObjectId}`);

  const seal = getSealClient();

  // === 1. Seal-encrypt ===
  bold("▸ seal encrypt");
  const plaintext = Buffer.from(
    "hello kraterion — smoke test " + new Date().toISOString(),
    "utf8",
  );
  const objectUuid = randomBytes(16);
  const sealIdentity = new Uint8Array(48);
  sealIdentity.set(hexToBytes(bucketObjectId), 0); // 32 bytes
  sealIdentity.set(objectUuid, 32);                // 16 bytes
  const { encryptedObject: encrypted } = await seal.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: KRATERION_PACKAGE_ID,
    id: toHex(sealIdentity),
    data: plaintext,
  });
  info(`plaintext size:  ${plaintext.length} bytes`);
  info(`encrypted size:  ${encrypted.length} bytes (Seal envelope embedded)`);

  // === 2. Compute Walrus blob metadata + encoded size ===
  bold("▸ compute blob metadata");
  const meta = await walrus.computeBlobMetadata({ bytes: encrypted });
  const systemState = await walrus.systemState();
  const nShards = systemState.committee.n_shards;
  const encodedSize = getEncodedBlobLength(encrypted.length, nShards);
  info(`blobId:        ${meta.blobId}`);
  info(`rootHash:      ${Buffer.from(meta.rootHash).toString("hex").slice(0, 16)}…`);
  info(`n_shards:      ${nShards}`);
  info(`unencoded:     ${encrypted.length} bytes`);
  info(`encoded:       ${encodedSize} bytes (RS2 expansion factor ${(encodedSize / encrypted.length).toFixed(1)}x)`);
  // EncodingType: 1 = RS2 (modern), 0 = RedStuff (legacy).
  const encodingTypeU8 = 1;

  // === 3. PTB 1: register through our contract ===
  bold("▸ PTB 1 (relay tip + register_blob_for_bucket)");
  const tx1 = new Transaction();
  // Pay the relay tip FIRST so that `addAuthPayload` is input slot 0 of
  // the PTB — the relay's verifier expects the auth payload as the
  // first input (not just the first command). This is the contract
  // shape Mysten's relay enforces.
  tx1.add(
    walrus.sendUploadRelayTip({
      size: encrypted.length,
      blobDigest: meta.blobDigest,
      nonce: meta.nonce,
    }),
  );
  const blobArg = tx1.add(
    kraterion.registerBlobForBucket({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        reserve: KRATERION_RESERVE_ID,
        bucket: bucketObjectId,
        system: WALRUS_SYSTEM_OBJECT_ID,
        paymentAmount: PAYMENT_AMOUNT_MIST,
        storageAmount: BigInt(encodedSize),
        epochsAhead: EPOCHS_AHEAD,
        blobId: blobIdStringToU256(meta.blobId),
        rootHash: rootHashBytesToU256(meta.rootHash),
        size: BigInt(encrypted.length),
        encodingType: encodingTypeU8,
      },
    }),
  );
  // The function returns Blob; transfer the result to the gateway address
  // so it lands as an owned object (PTB result must be consumed).
  tx1.transferObjects([blobArg], gatewayAddress);

  const r1 = await suiClient.signAndExecuteTransaction({
    transaction: tx1,
    signer: gateway,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r1.effects?.status?.status !== "success") {
    throw new Error(`PTB1 failed: ${JSON.stringify(r1.effects?.status)}`);
  }
  const blobChange = (r1.objectChanges ?? []).find(
    (c) =>
      c.type === "created" &&
      "objectType" in c &&
      c.objectType.endsWith("::blob::Blob"),
  );
  if (!blobChange || !("objectId" in blobChange)) {
    throw new Error(`PTB1 produced no Blob object: ${JSON.stringify(r1.objectChanges)}`);
  }
  const blobObjectId = blobChange.objectId;
  info(`blobObjectId:  ${blobObjectId}`);
  info(`tx1 digest:    ${r1.digest}`);

  // === 4. Upload encoded payload to Mysten testnet relay ===
  // The relay is consistently flaky on testnet (500s "internal client
  // error" and 400s "the transaction does not have a timestamp; it has
  // not been executed" — both transient). Retry up to 8 times with a
  // 4s base delay; a fresh PTB1 is NOT cheap (orphan Blob + reserve
  // WAL spend), so we only re-enter the relay step.
  bold("▸ upload to relay");
  let relayResult: Awaited<ReturnType<typeof walrus.writeBlobToUploadRelay>> | null = null;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      relayResult = await walrus.writeBlobToUploadRelay({
        blob: encrypted,
        blobId: meta.blobId,
        nonce: meta.nonce,
        txDigest: r1.digest,
        blobObjectId,
        deletable: false,
      });
      break;
    } catch (e) {
      lastErr = e as Error;
      const wait = Math.min(15_000, 4_000 * attempt);
      info(`relay attempt ${attempt}/8 failed: ${lastErr.message} — waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (!relayResult) throw lastErr ?? new Error("relay never succeeded");
  info(`certificate received (${typeof relayResult.certificate === "string" ? "BCS-base64" : "structured"})`);

  // === 5. PTB 2: certify + wrap, atomically ===
  bold("▸ PTB 2 (certifyBlob + wrap_in_shared_blob)");
  const tx2 = new Transaction();
  tx2.add(
    walrus.certifyBlob({
      blobId: meta.blobId,
      blobObjectId,
      certificate: relayResult.certificate,
      deletable: false,
    }),
  );
  tx2.add(
    kraterion.wrapInSharedBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        bucket: bucketObjectId,
        blob: blobObjectId,
        s3Key: Array.from(new TextEncoder().encode("smoke/hello.txt")),
        contentType: Array.from(new TextEncoder().encode("text/plain")),
        sealIdentity: Array.from(sealIdentity),
        sizeBytes: BigInt(plaintext.length),
      },
    }),
  );
  const r2 = await suiClient.signAndExecuteTransaction({
    transaction: tx2,
    signer: gateway,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r2.effects?.status?.status !== "success") {
    throw new Error(`PTB2 failed: ${JSON.stringify(r2.effects?.status)}`);
  }
  const sharedBlobChange = (r2.objectChanges ?? []).find(
    (c) =>
      c.type === "created" &&
      "objectType" in c &&
      c.objectType.endsWith("::shared_blob::SharedBlob"),
  );
  const sharedBlobId = sharedBlobChange && "objectId" in sharedBlobChange
    ? sharedBlobChange.objectId
    : "(not found)";
  info(`SharedBlob:    ${sharedBlobId}`);
  info(`tx2 digest:    ${r2.digest}`);

  // === 6. Read encrypted bytes back via public aggregator ===
  bold("▸ read from aggregator");
  // Aggregator may need a few seconds to see the just-certified blob.
  let downloaded: Uint8Array | null = null;
  for (let i = 0; i < 10; i++) {
    try {
      downloaded = await readBlobByBlobId(meta.blobId);
      break;
    } catch (e) {
      info(`aggregator not ready yet (attempt ${i + 1}/10): ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!downloaded) throw new Error("aggregator never produced bytes");
  info(`downloaded:    ${downloaded.length} bytes`);
  assert.equal(downloaded.length, encrypted.length, "downloaded length mismatch");

  // === 7. Build seal_approve PTB → txBytes (not submitted) ===
  bold("▸ build seal_approve PTB");
  const sealTx = new Transaction();
  sealTx.add(
    access.sealApprove({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        id: Array.from(sealIdentity),
        bucket: bucketObjectId,
      },
    }),
  );
  // Must set sender BEFORE building, else the SDK can't sign.
  // For dry-run-only PTBs (Seal key servers), sender must be the
  // address Seal will check — i.e. the gateway.
  sealTx.setSender(gatewayAddress);
  const txBytes = await sealTx.build({ client: suiClient, onlyTransactionKind: true });
  info(`txBytes length: ${txBytes.length}`);

  // === 8. Get/create SessionKey + decrypt via Seal ===
  bold("▸ seal decrypt");
  const sessionKey = await getOrCreateSessionKey({
    accountKey: "gateway",
    signer: gateway,
    redis,
  });
  const recovered = await seal.decrypt({
    data: downloaded,
    sessionKey,
    txBytes,
  });
  info(`recovered:    ${recovered.length} bytes`);

  // === 9. Assert plaintext round-trips ===
  assert.deepEqual(
    Buffer.from(recovered),
    plaintext,
    "round-tripped plaintext does not match original!",
  );

  // === 10. Persist an S3Object row so the gateway's GET path can find it ===
  // Without this, boto3 `get_object` would 404 — the smoke test owns the
  // ground-truth bookkeeping the gateway reads at request time. Idempotent
  // by `(bucket_id, s3_key)` unique → upsert.
  bold("▸ persist S3Object row");
  const s3Key = "smoke/hello.txt";
  const etag = createHash("md5").update(plaintext).digest("hex");
  const endEpoch = systemState.committee.epoch + EPOCHS_AHEAD;
  if (!sharedBlobChange || !("objectId" in sharedBlobChange)) {
    throw new Error("No SharedBlob created; cannot persist S3Object row.");
  }
  const sharedBlobObjectId = sharedBlobChange.objectId;
  const objectRow = await prisma.s3Object.upsert({
    where: { bucket_id_s3_key: { bucket_id: bucket.id, s3_key: s3Key } },
    create: {
      bucket_id: bucket.id,
      s3_key: s3Key,
      size_bytes: BigInt(plaintext.length),
      content_type: "text/plain",
      etag,
      walrus_blob_id: meta.blobId,
      shared_blob_object_id: sharedBlobObjectId,
      storage_end_epoch: endEpoch,
      seal_identity: Buffer.from(sealIdentity),
      deleted_at: null,
    },
    update: {
      size_bytes: BigInt(plaintext.length),
      content_type: "text/plain",
      etag,
      walrus_blob_id: meta.blobId,
      shared_blob_object_id: sharedBlobObjectId,
      storage_end_epoch: endEpoch,
      seal_identity: Buffer.from(sealIdentity),
      deleted_at: null,
      uploaded_at: new Date(),
    },
  });
  info(`S3Object row id=${objectRow.id}`);
  info(`  s3_key:        ${s3Key}`);
  info(`  walrus_blob_id ${meta.blobId}`);
  info(`  end_epoch:     ${endEpoch}`);

  bold("");
  bold("✓ smoke test passed");
  info(`tx1 (register) https://suiscan.xyz/testnet/tx/${r1.digest}`);
  info(`tx2 (certify+wrap) https://suiscan.xyz/testnet/tx/${r2.digest}`);
  info(`shared_blob   https://suiscan.xyz/testnet/object/${sharedBlobId}`);
  info("");
  info(`next: boto3 s3.get_object(Bucket="${bucket.name}", Key="${s3Key}")`);

  await redis.quit();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  bad(e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
