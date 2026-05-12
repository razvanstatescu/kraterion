import { Inject, Logger, OnModuleDestroy } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getOrCreateSessionKey, getSealClient } from "@kraterion/seal-client";
import { getSuiClient } from "@kraterion/walrus-client";
import {
  SealDecryptError,
  WalrusReadError,
  decryptObjectBytes,
} from "@kraterion/object-bytes";
import type { Redis } from "ioredis";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { KnowledgeIndexerKeypairService } from "../auth/knowledge-indexer-keypair.service.js";
import { chunkText, disposeEncoder } from "./chunking/recursive.js";
import { DEFAULT_BATCH_SIZE, embedAll } from "./embedders/openai.js";
import { dispatchExtractor } from "./extractors/index.js";
import {
  EMBEDDINGS_QUEUE,
  type EmbeddingsJobData,
} from "./embeddings.service.js";

/**
 * BullMQ processor for the `kraterion-embeddings` queue.
 *
 * Per-job sequence (matches `docs/ai-features-plan.md` §6.2.3):
 *   1. Insert/refresh a `KnowledgeManifest` row at `status=queued`.
 *   2. Fetch ciphertext from Walrus + decrypt via the worker's
 *      `knowledge_indexer` SessionKey (the address sits in every
 *      knowledge-enabled bucket's `api_decryption_addresses` list,
 *      added at Knowledge-enable time in K2).
 *   3. Dispatch the MIME extractor → plaintext or typed skip reason.
 *   4. Token-chunk via the recursive splitter.
 *   5. Embed every chunk via OpenAI; write the chunks + the manifest
 *      counts in one transaction.
 *
 * Idempotency:
 *   - The job id is `manifest_<s3_object_id>_v<version>`, so BullMQ
 *     dedups concurrent enqueues at the queue layer.
 *   - The processor still upserts the `KnowledgeManifest` row by
 *     `(s3_object_id, version)` and cascades old chunks before
 *     writing new ones, so a re-run on the same job rebuilds cleanly.
 *
 * Concurrency: capped at 4. OpenAI embeddings are fast (200ms/batch
 * for `text-embedding-3-small`), so the bottleneck is rarely embed
 * latency — it's the Walrus aggregator fetch and Seal decrypt. Four
 * concurrent jobs keeps p95 latency stable without flooding the
 * aggregator.
 */
@Processor(EMBEDDINGS_QUEUE, { concurrency: 4 })
export class EmbeddingsProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keypair: KnowledgeIndexerKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    disposeEncoder();
  }

  async process(job: Job<EmbeddingsJobData>): Promise<{ chunk_count: number; status: string }> {
    const { s3_object_id, manifest_version } = job.data;
    const manifest = await this.openManifest(s3_object_id, manifest_version);

    try {
      const object = await this.prisma.s3Object.findUnique({
        where: { id: s3_object_id },
        include: { bucket: { include: { knowledge: true } } },
      });
      if (!object) {
        await this.finalize(manifest.id, {
          status: "failed",
          error_detail: "S3Object row not found",
        });
        return { chunk_count: 0, status: "failed" };
      }
      if (object.deleted_at) {
        await this.finalize(manifest.id, {
          status: "skipped",
          skip_reason: "object_deleted",
        });
        return { chunk_count: 0, status: "skipped" };
      }
      if (!object.bucket.knowledge) {
        // The toggle flipped off between enqueue and dequeue.
        await this.finalize(manifest.id, {
          status: "skipped",
          skip_reason: "knowledge_disabled",
        });
        return { chunk_count: 0, status: "skipped" };
      }

      const settings = object.bucket.knowledge;

      // === Fetch + decrypt ===
      const sessionKey = await getOrCreateSessionKey({
        accountKey: "knowledge_indexer",
        signer: this.keypair.getKeypair() as unknown as Ed25519Keypair,
        redis: this.redis,
      });
      let plaintext: Uint8Array;
      try {
        plaintext = await decryptObjectBytes({
          bucketObjectId: object.bucket.kraterion_bucket_object_id,
          sealIdentity: object.seal_identity,
          walrusBlobId: object.walrus_blob_id,
          sessionKey,
          sealClient: getSealClient(),
          suiClient: getSuiClient(),
        });
      } catch (err) {
        if (err instanceof WalrusReadError) {
          await this.finalize(manifest.id, {
            status: "failed",
            error_detail: `walrus_read: ${err.message}`,
          });
          throw err; // let BullMQ retry — Walrus is transient
        }
        if (err instanceof SealDecryptError) {
          // No retry path: Seal refused, almost certainly an ACL issue
          // (e.g. user already revoked api access for this bucket).
          await this.finalize(manifest.id, {
            status: "failed",
            error_detail: `seal_decrypt: ${err.message}`,
          });
          return { chunk_count: 0, status: "failed" };
        }
        throw err;
      }

      // === Extract → chunk ===
      const extracted = await dispatchExtractor({
        contentType: object.content_type,
        bytes: plaintext,
      });
      if (extracted.text === null) {
        await this.finalize(manifest.id, {
          status: "skipped",
          skip_reason: extracted.skip_reason,
          ...(extracted.detail ? { error_detail: extracted.detail } : {}),
          bytes_in: BigInt(plaintext.byteLength),
        });
        return { chunk_count: 0, status: "skipped" };
      }

      const chunks = chunkText(extracted.text, {
        chunk_tokens: settings.chunk_tokens,
        chunk_overlap_tokens: settings.chunk_overlap_tokens,
      });
      if (chunks.length === 0) {
        await this.finalize(manifest.id, {
          status: "skipped",
          skip_reason: "empty",
          bytes_in: BigInt(plaintext.byteLength),
        });
        return { chunk_count: 0, status: "skipped" };
      }

      // === Embed ===
      const embedded = await embedAll(
        chunks.map((c) => c.content),
        {
          model: settings.embedding_model,
          dimensions: settings.embedding_dimensions,
          batchSize: DEFAULT_BATCH_SIZE,
        },
      );
      if (embedded.vectors.length !== chunks.length) {
        throw new Error(
          `Embedder returned ${embedded.vectors.length} vectors for ${chunks.length} chunks`,
        );
      }

      // === Persist ===
      // One transaction: delete any prior chunks for this manifest (the
      // re-PUT path), insert the new chunks, finalize the manifest. The
      // halfvec column requires raw SQL because Prisma can't serialize
      // it, so we hand-write the INSERT with a parameterized halfvec
      // literal: `'[0.1,0.2,...]'::halfvec(1024)`.
      const bytesIndexed = chunks.reduce((s, c) => s + Buffer.byteLength(c.content, "utf8"), 0);
      const insertedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { manifest_id: manifest.id } });
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]!;
          const v = embedded.vectors[i]!;
          const contentHash = createHash("sha256").update(c.content, "utf8").digest();
          const halfvecLit = `[${v.join(",")}]`;
          // `$executeRaw` parameter binding handles content + halfvec
          // cast safely. The id is a UUID generated client-side so the
          // INSERT can stay parameterized end-to-end.
          await tx.$executeRaw`
            INSERT INTO "KnowledgeChunk"
              (id, bucket_id, s3_object_id, manifest_id, ordinal,
               content_hash, content, embedding,
               token_count, start_offset, end_offset)
            VALUES (
              gen_random_uuid()::text,
              ${object.bucket_id},
              ${object.id},
              ${manifest.id},
              ${c.ordinal},
              ${contentHash},
              ${c.content},
              ${halfvecLit}::halfvec(${Prisma.raw(String(settings.embedding_dimensions))}),
              ${c.token_count},
              ${c.start_offset},
              ${c.end_offset}
            )
          `;
        }
        await tx.knowledgeManifest.update({
          where: { id: manifest.id },
          data: {
            status: "indexed",
            chunk_count: chunks.length,
            bytes_in: BigInt(plaintext.byteLength),
            bytes_indexed: BigInt(bytesIndexed),
            embedding_tokens: embedded.prompt_tokens,
            embedding_model: embedded.model,
            embedding_dimensions: embedded.dimensions,
            finished_at: insertedAt,
            error_detail: null,
          },
        });
      });

      this.logger.log(
        `indexed s3_object=${s3_object_id} v=${manifest_version} chunks=${chunks.length} tokens=${embedded.prompt_tokens}`,
      );
      return { chunk_count: chunks.length, status: "indexed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `embedding job failed s3_object=${s3_object_id} v=${manifest_version}: ${message}`,
      );
      // Only mark failed on the final attempt — earlier attempts roll
      // through BullMQ's retry machinery and stay `indexing`.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.finalize(manifest.id, {
          status: "failed",
          error_detail: message.slice(0, 1024),
        });
      }
      throw err;
    }
  }

  /**
   * Insert (or rewind) the manifest row for `(s3_object_id, version)`,
   * setting status to `indexing` + `started_at` to now. Re-running the
   * same job (BullMQ retry) reuses the row.
   */
  private async openManifest(s3ObjectId: string, version: number) {
    const object = await this.prisma.s3Object.findUniqueOrThrow({
      where: { id: s3ObjectId },
      select: { id: true, bucket_id: true },
    });
    return await this.prisma.knowledgeManifest.upsert({
      where: { s3_object_id_version: { s3_object_id: object.id, version } },
      create: {
        s3_object_id: object.id,
        bucket_id: object.bucket_id,
        version,
        status: "indexing",
        started_at: new Date(),
      },
      update: {
        status: "indexing",
        started_at: new Date(),
        error_detail: null,
      },
    });
  }

  /**
   * Final-state update for skip/fail outcomes. Doesn't touch chunks —
   * the deleteMany at the start of the persist transaction already
   * cleared any stragglers from a partial prior run.
   */
  private async finalize(
    manifestId: string,
    data: {
      status: "skipped" | "failed" | "indexed";
      skip_reason?: string;
      error_detail?: string;
      bytes_in?: bigint;
    },
  ): Promise<void> {
    await this.prisma.knowledgeManifest.update({
      where: { id: manifestId },
      data: {
        status: data.status,
        ...(data.skip_reason ? { skip_reason: data.skip_reason } : {}),
        ...(data.error_detail ? { error_detail: data.error_detail } : {}),
        ...(data.bytes_in ? { bytes_in: data.bytes_in } : {}),
        finished_at: new Date(),
      },
    });
  }
}
