import type { Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import {
  blobIdStringToU256,
  getEncodedBlobLength,
  getSuiClient,
  getWalrusClient,
  getWriteFeeFrost,
  rootHashBytesToU256,
  signersToBitmap,
} from "@kraterion/walrus-client";
import type { PrismaService } from "../prisma/prisma.service.js";

/**
 * K5 (full flow): archive a finalized `KnowledgeManifest` as a Walrus
 * PooledBlob in the source project's pool on chain.
 *
 * Mirrors the gateway's PutObject pipeline so the manifest blob lives
 * under the same ownership pattern as the source data:
 *
 *   PTB1: relay tip + `kraterion::pool_vault::register_blob`
 *           → adds a PooledBlob to the project's vault. We recover the
 *           on-chain `pooled_blob_object_id` from the emitted
 *           `KraterionPooledBlobRegistered` event.
 *   Relay: `WalrusClient.writeBlobToUploadRelay` uploads the bytes and
 *           returns the certificate Walrus needs to certify the blob.
 *   PTB2: `kraterion::pool_vault::certify_blob`
 *           → flips the PooledBlob to certified state.
 *
 * Why this matters: the PooledBlob lives inside the project's vault.
 * The user revoking the vault via `pool_vault::revoke_all` cuts platform
 * write access for the manifest too. The bucket's
 * `revoke_all_api_access` still gates the user-data path; manifests are
 * tied to the project's vault, not the bucket's API list.
 *
 * The Move call emits `KraterionPooledBlobRegistered`. We use a reserved
 * `_kraterion/manifests/<manifest_id>.json` s3_key prefix; the indexer's
 * `PooledBlobRegisteredHandler` recognises it and routes the row to
 * `KnowledgeManifest` instead of `S3Object`. (Currently the handler
 * skips reserved keys entirely — manifest indexing is therefore a
 * separate path that updates `KnowledgeManifest` directly via the
 * worker writes below; the indexer doesn't need to do this routing.)
 *
 * Authorization: the worker's `knowledge_indexer` sub-wallet must be on
 * the reserve whitelist (set by `bootstrap-gateway`). Unlike the
 * SharedBlob era, the bucket's `api_decryption_addresses` is NOT
 * checked for write — pool ops only check reserve auth. The bucket
 * grant still matters for Seal-decrypt access later if the manifest
 * ever gets Seal-encrypted.
 *
 * What the manifest does NOT contain (per `docs/ai-features-plan.md` §6.6):
 *   - chunk plaintext
 *   - embedding vectors
 * Just hashes + boundaries + model spec. Reproducible from (a) the
 * source blob + (b) the manifest, given the same model.
 *
 * Best-effort: a failure here is logged and `manifest_walrus_blob_id`
 * stays null. The chunks remain searchable; the dashboard hides the
 * link when null.
 */
const MANIFEST_KEY_PREFIX = "_kraterion/manifests/";
const MANIFEST_CONTENT_TYPE = "application/json";
const ENCODING_TYPE_RS2 = 1;

/**
 * Fully-qualified event type the worker parses out of PTB1's effects to
 * recover the freshly-created PooledBlob's on-chain object ID.
 */
const KRATERION_POOLED_BLOB_REGISTERED_TYPE =
  `${KRATERION_PACKAGE_ID}::events::KraterionPooledBlobRegistered` as const;

/**
 * The relay POST is the only step in the archive sequence that flakes
 * regularly on testnet (transient `500 internal client error`, or
 * `400 the transaction does not have a timestamp` when the relay's
 * full node hasn't observed the register tx yet). Retry it in place
 * with a short backoff. PTB1 (`register_blob`) and PTB2 (`certify_blob`)
 * are NOT retried — `register_blob` writes a unique
 * `pooled_blob_object_id` into the pool's `ObjectTable`, so a second
 * attempt would abort with `dynamic_field::add` code 0
 * ("field already exists") instead of recovering. Mirrors the gateway's
 * PutObject pattern.
 */
const RELAY_MAX_ATTEMPTS = 3;
const RELAY_BACKOFF_MS = [500, 1_500];

export async function archiveManifestToWalrus(args: {
  prisma: PrismaService;
  signer: Ed25519Keypair;
  logger: Logger;
  manifestId: string;
}): Promise<void> {
  const { prisma, signer, logger, manifestId } = args;

  // Idempotent re-run: if a previous attempt already populated the blob
  // id, do nothing.
  const existing = await prisma.knowledgeManifest.findUnique({
    where: { id: manifestId },
    select: { manifest_walrus_blob_id: true },
  });
  if (existing?.manifest_walrus_blob_id) return;

  const manifest = await prisma.knowledgeManifest.findUnique({
    where: { id: manifestId },
    include: {
      s3_object: {
        select: { id: true, walrus_blob_id: true, etag: true, bucket_id: true },
      },
      chunks: {
        select: {
          ordinal: true,
          content_hash: true,
          token_count: true,
          start_offset: true,
          end_offset: true,
        },
        orderBy: { ordinal: "asc" },
      },
    },
  });
  if (!manifest) return;
  if (manifest.status !== "indexed" || manifest.chunks.length === 0) {
    logger.debug(
      `manifest-archive: skipping ${manifestId} (status=${manifest.status}, chunks=${manifest.chunks.length})`,
    );
    return;
  }

  const bucket = await prisma.bucket.findUnique({
    where: { id: manifest.s3_object.bucket_id },
    select: { kraterion_bucket_object_id: true },
  });
  if (!bucket) {
    logger.warn(`manifest-archive: no bucket row for manifest ${manifestId}`);
    return;
  }

  // === Build manifest bytes ===
  const json = {
    kraterion_manifest_version: 1 as const,
    source_s3_object_id: manifest.s3_object.id,
    source_walrus_blob_id: manifest.s3_object.walrus_blob_id,
    source_etag: manifest.s3_object.etag,
    embedding_model: manifest.embedding_model,
    embedding_dimensions: manifest.embedding_dimensions,
    chunking: {
      strategy: "recursive",
      tokens: 400,
      overlap: 60,
    },
    chunks: manifest.chunks.map((c) => ({
      ordinal: c.ordinal,
      content_hash: Buffer.from(c.content_hash).toString("hex"),
      tokens: c.token_count,
      start: c.start_offset,
      end: c.end_offset,
    })),
    created_at: new Date().toISOString(),
    manifest_id: manifestId,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const md5 = createHash("md5").update(bytes).digest(); // 16 bytes; the etag value
  const s3Key = `${MANIFEST_KEY_PREFIX}${manifestId}.json`;
  // 48-byte Seal IBE identity = bucket_object_id (32) || manifest_uuid (16).
  // The bucket-wrap function REQUIRES this shape even when the blob
  // isn't actually Seal-encrypted. Manifest content is hashes-only, so
  // the identity is decorative for now; it leaves Seal headroom for a
  // future "encrypt manifest for private buckets" follow-up.
  const sealIdentity = buildSealIdentity(bucket.kraterion_bucket_object_id, manifestId);

  // === PTB1 + relay + PTB2 (matches gateway PutObject) ===
  // The relay POST has its own internal retry (see RELAY_MAX_ATTEMPTS);
  // PTB1/PTB2 don't retry because `register_blob` would re-abort on the
  // already-registered pooled_blob_object_id.
  try {
    await tryArchiveOnChain({
      prisma,
      signer,
      logger,
      manifestId,
      bytes,
      md5,
      s3Key,
      sealIdentity,
      bucketObjectId: bucket.kraterion_bucket_object_id,
      bucketId: manifest.s3_object.bucket_id,
    });
  } catch (err) {
    logger.warn(
      `manifest-archive: ${manifestId} failed: ${(err as Error).message}; ` +
        `manifest_walrus_blob_id stays null (chunks remain searchable, ` +
        `dashboard hides the link). Re-run via ` +
        `\`pnpm -F @kraterion/worker exec tsx scripts/backfill-manifest-archive.ts --manifest-id ${manifestId}\`.`,
    );
  }
}

/**
 * One attempt of the bucket-owned archive sequence. Throws on any
 * failure (relay error, PTB revert, missing object). The outer retry
 * loop catches and retries with backoff.
 *
 * Returns nothing on success — the manifest row is updated in-place.
 */
async function tryArchiveOnChain(args: {
  prisma: PrismaService;
  signer: Ed25519Keypair;
  logger: Logger;
  manifestId: string;
  bytes: Uint8Array;
  md5: Buffer;
  s3Key: string;
  sealIdentity: Uint8Array;
  bucketObjectId: string;
  bucketId: string;
}): Promise<void> {
  const { prisma, signer, logger, manifestId, bytes, md5, s3Key, sealIdentity, bucketId } = args;
  const walrus = getWalrusClient();
  const suiClient = getSuiClient();

  // Resolve the bucket → project → StoragePool (vault). Manifest archival
  // runs AFTER the user's first PUT in the bucket (otherwise there would
  // be no chunks to archive), so the vault MUST exist. If it doesn't, we
  // throw and the outer retry loop falls back to writeBlob.
  const poolRow = await prisma.storagePool.findFirst({
    where: { project: { buckets: { some: { id: bucketId } } } },
    select: { vault_object_id: true },
  });
  if (!poolRow) {
    throw new Error(
      `no StoragePool found for project owning bucket=${bucketId}; ` +
        `falling through to fallback writeBlob`,
    );
  }
  const vaultObjectId = poolRow.vault_object_id;

  const meta = await walrus.computeBlobMetadata({ bytes });
  const systemState = await walrus.systemState();
  const encodedSize = getEncodedBlobLength(bytes.length, systemState.committee.n_shards);
  const committeeSize = systemState.committee.members.length;
  const blobIdU256 = blobIdStringToU256(meta.blobId);

  // PTB1: relay tip + pool_vault::register_blob.
  // No `transferObjects` — register_pooled_blob returns () and the
  // PooledBlob lives inside the pool's ObjectTable. We recover its
  // on-chain object ID from the emitted event.
  const tx1 = new Transaction();
  tx1.add(
    walrus.sendUploadRelayTip({
      size: bytes.length,
      blobDigest: meta.blobDigest,
      nonce: meta.nonce,
    }),
  );
  tx1.add(
    pool_vault.registerBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: vaultObjectId,
        reserve: KRATERION_RESERVE_ID,
        system: WALRUS_SYSTEM_OBJECT_ID,
        blobId: blobIdU256,
        rootHash: rootHashBytesToU256(meta.rootHash),
        unencodedSize: BigInt(bytes.length),
        encodingType: ENCODING_TYPE_RS2,
        s3Key: Array.from(new TextEncoder().encode(s3Key)),
        contentType: Array.from(new TextEncoder().encode(MANIFEST_CONTENT_TYPE)),
        sealIdentity: Array.from(sealIdentity),
        sizeBytes: BigInt(bytes.length),
        etagMd5: Array.from(md5),
        paymentBudgetFrost: getWriteFeeFrost(encodedSize),
      },
    }),
  );

  const r1 = await suiClient.signAndExecuteTransaction({
    transaction: tx1,
    signer,
    options: { showEffects: true, showEvents: true },
  });
  if (r1.effects?.status?.status !== "success") {
    throw new Error(
      `pool_vault::register_blob reverted: ${r1.effects?.status?.error ?? "unknown"}`,
    );
  }
  const pooledBlobObjectId = pickPooledBlobObjectIdFromEvents(r1.events ?? [], blobIdU256);
  if (!pooledBlobObjectId) {
    throw new Error("PTB1 settled but KraterionPooledBlobRegistered event missing");
  }

  // Relay upload — most likely transient failure point on testnet.
  // Bounded retry in-place; PTB1 is NOT retried (the pool entry already
  // exists, register_blob would abort on the duplicate object_id).
  let certificate;
  {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RELAY_MAX_ATTEMPTS; attempt++) {
      try {
        const relayResult = await walrus.writeBlobToUploadRelay({
          blob: bytes,
          blobId: meta.blobId,
          nonce: meta.nonce,
          txDigest: r1.digest,
          blobObjectId: pooledBlobObjectId,
          deletable: true,
        });
        certificate = relayResult.certificate;
        if (attempt > 1) {
          logger.log(
            `manifest-archive: relay POST succeeded on attempt ${attempt}/${RELAY_MAX_ATTEMPTS} ` +
              `(manifest=${manifestId}, pooled=${pooledBlobObjectId})`,
          );
        }
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < RELAY_MAX_ATTEMPTS) {
          logger.warn(
            `manifest-archive: relay POST attempt ${attempt}/${RELAY_MAX_ATTEMPTS} ` +
              `failed (manifest=${manifestId}): ${(e as Error).message}`,
          );
          await sleep(RELAY_BACKOFF_MS[attempt - 1] ?? 1_500);
        }
      }
    }
    if (!certificate) {
      throw new Error(
        `manifest relay POST failed after ${RELAY_MAX_ATTEMPTS} attempts ` +
          `(orphan pooled_blob_object_id=${pooledBlobObjectId}): ${(lastErr as Error).message}`,
      );
    }
  }
  const signersBitmap = signersToBitmap(certificate.signers, committeeSize);

  // PTB2: pool_vault::certify_blob.
  const tx2 = new Transaction();
  tx2.add(
    pool_vault.certifyBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        vault: vaultObjectId,
        reserve: KRATERION_RESERVE_ID,
        system: WALRUS_SYSTEM_OBJECT_ID,
        blobId: blobIdU256,
        signature: Array.from(certificate.signature),
        signersBitmap: Array.from(signersBitmap),
        message: Array.from(certificate.serializedMessage),
      },
    }),
  );

  const r2 = await suiClient.signAndExecuteTransaction({
    transaction: tx2,
    signer,
    options: { showEffects: true },
  });
  if (r2.effects?.status?.status !== "success") {
    throw new Error(`pool_vault::certify_blob reverted: ${r2.effects?.status?.error ?? "unknown"}`);
  }

  await prisma.knowledgeManifest.update({
    where: { id: manifestId },
    data: {
      manifest_walrus_blob_id: meta.blobId,
      manifest_pooled_blob_object_id: pooledBlobObjectId,
    },
  });
  logger.log(
    `manifest-archive: ${manifestId} -> blob_id=${meta.blobId} pooled=${pooledBlobObjectId} (vault-owned)`,
  );
}

/**
 * Parse the `KraterionPooledBlobRegistered` event from PTB1's effects
 * to recover the new PooledBlob's on-chain object ID. Same helper as
 * the gateway's PUT controller — extracted here too because the K5
 * worker doesn't depend on the gateway package.
 */
function pickPooledBlobObjectIdFromEvents(
  events: Array<Record<string, unknown>>,
  blobId: bigint,
): string | null {
  for (const ev of events) {
    if (ev["type"] !== KRATERION_POOLED_BLOB_REGISTERED_TYPE) continue;
    const json = ev["parsedJson"] as Record<string, unknown> | undefined;
    if (!json) continue;
    const evBlobId = json["walrus_blob_id"];
    if (typeof evBlobId === "string" && BigInt(evBlobId) === blobId) {
      const oid = json["pooled_blob_object_id"];
      if (typeof oid === "string") return oid;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a 48-byte Seal IBE identity: 32 bytes of bucket-object-id +
 * 16 bytes of manifest-uuid. Matches the gateway's PutObject identity
 * shape so the `seal_approve` policy accepts it (the bucket UID prefix
 * is what `kraterion::access::seal_approve` matches on).
 */
function buildSealIdentity(bucketObjectId: string, manifestId: string): Uint8Array {
  const out = new Uint8Array(48);
  // bucket_object_id is a 32-byte hex (with `0x` prefix).
  const bucketBytes = Buffer.from(bucketObjectId.replace(/^0x/, ""), "hex");
  out.set(bucketBytes.subarray(0, 32), 0);
  // Compress the manifest UUID into 16 bytes by stripping dashes and
  // hex-parsing. Postgres `uuid` rendering gives us 32 hex chars; some
  // ids may include extra hyphens from older formats — be defensive.
  const hex = manifestId.replace(/-/g, "");
  const uuidBytes = Buffer.from(hex.padEnd(32, "0").slice(0, 32), "hex");
  out.set(uuidBytes.subarray(0, 16), 32);
  return out;
}

