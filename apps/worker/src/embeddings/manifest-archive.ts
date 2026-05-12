import type { Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { kraterion } from "@kraterion/kraterion-move-sdk";
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
  rootHashBytesToU256,
} from "@kraterion/walrus-client";
import type { PrismaService } from "../prisma/prisma.service.js";

/**
 * K5 (full flow): archive a finalized `KnowledgeManifest` as a Walrus
 * SharedBlob owned by the source bucket on chain.
 *
 * Mirrors the gateway's PutObject pipeline so the manifest blob lives
 * under the same ownership pattern as the source data:
 *
 *   PTB1: relay tip + `kraterion::register_blob_for_bucket`
 *           → returns a freshly minted Walrus `Blob` owned by the worker.
 *   Relay: `WalrusClient.writeBlobToUploadRelay` uploads the bytes and
 *           returns the certificate Walrus needs to certify the blob.
 *   PTB2: `walrus::system::certify_blob` + `kraterion::wrap_in_shared_blob`
 *           → wraps the Blob into a SharedBlob attached to the bucket.
 *
 * Why this matters: the SharedBlob is part of the bucket's on-chain
 * footprint. Revoking the bucket's API access via
 * `revoke_all_api_access` cuts read+write for the manifest too. That's
 * the verifiable-retrieval beat the demo turns on.
 *
 * The Move call emits `KraterionObjectCreated`. We use a reserved
 * `_kraterion/manifests/<manifest_id>.json` key prefix; the indexer's
 * `ObjectCreatedHandler` recognizes it and routes the row to
 * `KnowledgeManifest` instead of `S3Object` so manifests don't show up
 * in the bucket's file browser or `ListObjectsV2`.
 *
 * Authorization: the worker's `knowledge_indexer` sub-wallet must be in
 * the bucket's `api_decryption_addresses`. The dashboard arranges that
 * via a sponsored `grant_api_access` at Knowledge-enable time. If the
 * grant hasn't landed (or was revoked), PTB1 reverts with an
 * authorization error; we log + fall back to a worker-owned
 * `WalrusClient.writeBlob` so the dashboard still gets a Walruscan
 * link.
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
const MANIFEST_EPOCHS_AHEAD = 5;
const MANIFEST_PAYMENT_AMOUNT_MIST = 200_000_000n; // 0.2 WAL — same ceiling as PutObject
const ENCODING_TYPE_RS2 = 1;

/**
 * Bounded retries on the PTB1+relay+PTB2 sequence. The failures we
 * actually see on Walrus testnet are transient:
 *   - PTB1 abort 1 (`assert_caller_authorized_for_bucket`) when the
 *     `knowledge_indexer` grant hasn't propagated to the bucket object
 *     a checkpoint earlier;
 *   - Relay returns `500 internal client error` or
 *     `400 the transaction does not have a timestamp` when its full
 *     node hasn't observed the register tx yet.
 *
 * 3 attempts at 1s / 3s / 9s covers both with margin. After that we
 * fall back to `WalrusClient.writeBlob` so the dashboard's Walruscan
 * link still resolves even if the on-chain path is genuinely broken.
 */
const MAX_ARCHIVE_ATTEMPTS = 3;
const ARCHIVE_BACKOFF_MS = [1_000, 3_000, 9_000];

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

  // === PTB1 + relay + PTB2 (matches gateway PutObject), with bounded retry ===
  for (let attempt = 1; attempt <= MAX_ARCHIVE_ATTEMPTS; attempt++) {
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
      });
      return;
    } catch (err) {
      const isLast = attempt === MAX_ARCHIVE_ATTEMPTS;
      const wait = ARCHIVE_BACKOFF_MS[attempt - 1] ?? 9_000;
      logger.warn(
        `manifest-archive: attempt ${attempt}/${MAX_ARCHIVE_ATTEMPTS} for ${manifestId} ` +
          `failed: ${(err as Error).message}` +
          (isLast ? `; falling back to worker-owned writeBlob` : `; retrying in ${wait}ms`),
      );
      if (!isLast) {
        await sleep(wait);
      }
    }
  }
  // All bucket-owned attempts exhausted — best-effort fallback so the
  // dashboard's Walruscan link still resolves.
  await fallbackWriteBlob({ prisma, signer, logger, manifestId, bytes });
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
}): Promise<void> {
  const { prisma, signer, logger, manifestId, bytes, md5, s3Key, sealIdentity, bucketObjectId } =
    args;
  const walrus = getWalrusClient();
  const suiClient = getSuiClient();
  const senderAddress = signer.toSuiAddress();

  const meta = await walrus.computeBlobMetadata({ bytes });
  const systemState = await walrus.systemState();
  const encodedSize = getEncodedBlobLength(bytes.length, systemState.committee.n_shards);

  // PTB1: relay tip + register_blob_for_bucket
  const tx1 = new Transaction();
  tx1.add(
    walrus.sendUploadRelayTip({
      size: bytes.length,
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
        paymentAmount: MANIFEST_PAYMENT_AMOUNT_MIST,
        storageAmount: BigInt(encodedSize),
        epochsAhead: MANIFEST_EPOCHS_AHEAD,
        blobId: blobIdStringToU256(meta.blobId),
        rootHash: rootHashBytesToU256(meta.rootHash),
        size: BigInt(bytes.length),
        encodingType: ENCODING_TYPE_RS2,
      },
    }),
  );
  tx1.transferObjects([blobArg], senderAddress);

  const r1 = await suiClient.signAndExecuteTransaction({
    transaction: tx1,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r1.effects?.status?.status !== "success") {
    throw new Error(
      `register_blob_for_bucket reverted: ${r1.effects?.status?.error ?? "unknown"}`,
    );
  }
  const blobObjectId = pickCreatedObjectId(r1, "::blob::Blob");
  if (!blobObjectId) {
    throw new Error("PTB1 produced no Blob object");
  }

  // Relay upload — the most likely transient failure point on testnet.
  const relayResult = await walrus.writeBlobToUploadRelay({
    blob: bytes,
    blobId: meta.blobId,
    nonce: meta.nonce,
    txDigest: r1.digest,
    blobObjectId,
    deletable: false,
  });
  const certificate = relayResult.certificate;

  // PTB2: certifyBlob + wrap_in_shared_blob
  const tx2 = new Transaction();
  tx2.add(
    walrus.certifyBlob({
      blobId: meta.blobId,
      blobObjectId,
      certificate,
      deletable: false,
    }),
  );
  tx2.add(
    kraterion.wrapInSharedBlob({
      package: KRATERION_PACKAGE_ID,
      arguments: {
        bucket: bucketObjectId,
        blob: blobObjectId,
        s3Key: Array.from(new TextEncoder().encode(s3Key)),
        contentType: Array.from(new TextEncoder().encode(MANIFEST_CONTENT_TYPE)),
        sealIdentity: Array.from(sealIdentity),
        sizeBytes: BigInt(bytes.length),
        etagMd5: Array.from(md5),
      },
    }),
  );

  const r2 = await suiClient.signAndExecuteTransaction({
    transaction: tx2,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r2.effects?.status?.status !== "success") {
    throw new Error(`certify_blob + wrap_in_shared_blob reverted: ${r2.effects?.status?.error ?? "unknown"}`);
  }
  const sharedBlobObjectId = pickCreatedObjectId(r2, "::shared_blob::SharedBlob");

  await prisma.knowledgeManifest.update({
    where: { id: manifestId },
    data: {
      manifest_walrus_blob_id: meta.blobId,
      manifest_shared_blob_object_id: sharedBlobObjectId,
    },
  });
  logger.log(
    `manifest-archive: ${manifestId} -> blob_id=${meta.blobId} shared=${sharedBlobObjectId} (bucket-owned)`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fallback: write the manifest as a regular worker-owned Walrus blob.
 * Loses the bucket-ownership tie but preserves the dashboard's
 * Walruscan link so the demo path still works while the user fixes the
 * grant (or while we debug a transient on-chain failure).
 */
async function fallbackWriteBlob(args: {
  prisma: PrismaService;
  signer: Ed25519Keypair;
  logger: Logger;
  manifestId: string;
  bytes: Uint8Array;
}): Promise<void> {
  const { prisma, signer, logger, manifestId, bytes } = args;
  try {
    const walrus = getWalrusClient();
    const res = await walrus.writeBlob({
      blob: bytes,
      deletable: false,
      epochs: 26,
      signer,
    });
    const blobObjectId = (res.blobObject.id as unknown as { id: string }).id;
    await prisma.knowledgeManifest.update({
      where: { id: manifestId },
      data: {
        manifest_walrus_blob_id: res.blobId,
        manifest_shared_blob_object_id: blobObjectId,
      },
    });
    logger.log(
      `manifest-archive: ${manifestId} -> blob_id=${res.blobId} (worker-owned fallback)`,
    );
  } catch (err) {
    logger.warn(
      `manifest-archive: fallback writeBlob failed for ${manifestId}: ${(err as Error).message}`,
    );
  }
}

/**
 * Builds a 48-byte Seal IBE identity: 32 bytes of bucket-object-id +
 * 16 bytes of manifest-uuid. Matches the gateway's PutObject identity
 * shape so the on-chain `wrap_in_shared_blob` accepts it.
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

function pickCreatedObjectId(
  result: { objectChanges?: unknown[] | null },
  typeSuffix: string,
): string | null {
  const changes = result.objectChanges ?? [];
  for (const c of changes as Array<Record<string, unknown>>) {
    if (
      c["type"] === "created" &&
      typeof c["objectType"] === "string" &&
      (c["objectType"] as string).endsWith(typeSuffix) &&
      typeof c["objectId"] === "string"
    ) {
      return c["objectId"] as string;
    }
  }
  return null;
}
