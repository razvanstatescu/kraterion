import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import { answerWithLLM } from "./ask.js";
import {
  EMBEDDINGS_QUEUE_NAME,
  type EmbeddingsJobData,
} from "./embeddings-queue.constants.js";
import { KnowledgeService } from "./knowledge.service.js";

/**
 * K2 knowledge controller.
 *
 * Four endpoints under `/v1/buckets/:bucketId/knowledge`:
 *   - `GET /`             — current settings (or null if disabled).
 *   - `POST /`            — toggle on/off + tune chunking knobs. On
 *                           enable, fires `enqueueBucket` to backfill
 *                           existing objects.
 *   - `POST /search`      — hybrid BM25 + vector retrieval.
 *   - `POST /ask`         — same retrieval + a BYO-key LLM step.
 *
 * What's still deferred to K4 (dashboard tab):
 *   - On-chain `grant_api_access` for the `knowledge_indexer` address
 *     at enable time. The bootstrap pre-grants the test bucket; the
 *     dashboard UI will offer a one-click sponsor flow for any other
 *     bucket the user toggles on.
 *
 * Auth: all four routes use the existing session-JWT `AuthGuard`. The
 * `MCPGuard` extension that accepts API-key secrets ships in K3 with
 * `/mcp`; for K2 we keep the surface to authenticated dashboard +
 * curl-with-token use cases.
 */

const enableKnowledgeSchema = z.object({
  enabled: z.boolean(),
  embedding_model: z.string().optional(),
  embedding_dimensions: z.number().int().positive().max(3072).optional(),
  chunk_tokens: z.number().int().positive().max(8192).optional(),
  chunk_overlap_tokens: z.number().int().nonnegative().max(2048).optional(),
});
type EnableKnowledgeDto = z.infer<typeof enableKnowledgeSchema>;

const searchSchema = z.object({
  query: z.string().min(1).max(4096),
  top_k: z.number().int().min(1).max(32).optional(),
});
type SearchDto = z.infer<typeof searchSchema>;

const askSchema = z.object({
  query: z.string().min(1).max(4096),
  top_k: z.number().int().min(1).max(32).optional(),
  model: z.string().optional(),
  /** Bring-your-own OpenAI key. Plan §6.3 — we never proxy LLM calls. */
  openai_api_key: z.string().min(20),
  max_tokens: z.number().int().positive().max(2048).optional(),
});
type AskDto = z.infer<typeof askSchema>;

@Controller("v1/buckets/:bucketId/knowledge")
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
    private readonly knowledge: KnowledgeService,
    @InjectQueue(EMBEDDINGS_QUEUE_NAME)
    private readonly embeddingsQueue: Queue<EmbeddingsJobData>,
  ) {}

  @Get()
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);
    const row = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
    });
    return {
      enabled: !!row,
      settings: row
        ? {
            embedding_model: row.embedding_model,
            embedding_dimensions: row.embedding_dimensions,
            chunk_tokens: row.chunk_tokens,
            chunk_overlap_tokens: row.chunk_overlap_tokens,
            updated_at: row.updated_at.toISOString(),
          }
        : null,
    };
  }

  @Post()
  @HttpCode(200)
  async upsert(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(enableKnowledgeSchema)) dto: EnableKnowledgeDto,
  ) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);

    if (!dto.enabled) {
      const [chunks] = await this.prisma.$transaction([
        this.prisma.knowledgeChunk.deleteMany({ where: { bucket_id: bucketId } }),
        this.prisma.knowledgeBucketSettings.deleteMany({ where: { bucket_id: bucketId } }),
      ]);
      return { enabled: false, chunks_deleted: chunks.count };
    }

    const data = {
      bucket_id: bucketId,
      ...(dto.embedding_model ? { embedding_model: dto.embedding_model } : {}),
      ...(dto.embedding_dimensions ? { embedding_dimensions: dto.embedding_dimensions } : {}),
      ...(dto.chunk_tokens ? { chunk_tokens: dto.chunk_tokens } : {}),
      ...(dto.chunk_overlap_tokens !== undefined
        ? { chunk_overlap_tokens: dto.chunk_overlap_tokens }
        : {}),
    };
    const previouslyEnabled = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
      select: { bucket_id: true },
    });
    const row = await this.prisma.knowledgeBucketSettings.upsert({
      where: { bucket_id: bucketId },
      create: data,
      update: data,
    });

    // K2 enable-time backfill: enqueue every non-deleted object in
    // the bucket so the worker indexes them. Skips when the bucket
    // was already enabled (no point re-embedding).
    let backfilled = 0;
    if (!previouslyEnabled) {
      backfilled = await this.backfillBucket(bucketId);
    }

    return {
      enabled: true,
      backfilled_objects: backfilled,
      settings: {
        embedding_model: row.embedding_model,
        embedding_dimensions: row.embedding_dimensions,
        chunk_tokens: row.chunk_tokens,
        chunk_overlap_tokens: row.chunk_overlap_tokens,
        updated_at: row.updated_at.toISOString(),
      },
    };
  }

  @Post("search")
  @HttpCode(200)
  async search(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(searchSchema)) dto: SearchDto,
  ) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    const result = await this.knowledge.search({
      accountId: user.accountId,
      bucketId,
      query: dto.query,
      ...(dto.top_k !== undefined ? { topK: dto.top_k } : {}),
    });
    await this.knowledge.recordQuery({
      bucketId,
      projectId: bucket.project_id,
      apiKeyId: null,
      kind: "search",
      query: dto.query,
      topK: dto.top_k ?? 8,
      latencyMs: result.latency_ms,
      chunkHashes: result.hits.map((h) => h.content_hash),
    });
    return result;
  }

  @Post("ask")
  @HttpCode(200)
  async ask(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(askSchema)) dto: AskDto,
  ) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    // `/ask` uses a slightly higher ef_search to widen the retrieval
    // window before the LLM step picks citations.
    const retrieved = await this.knowledge.search({
      accountId: user.accountId,
      bucketId,
      query: dto.query,
      ...(dto.top_k !== undefined ? { topK: dto.top_k } : {}),
      efSearch: 96,
    });
    const answered = await answerWithLLM({
      query: dto.query,
      hits: retrieved.hits,
      openaiApiKey: dto.openai_api_key,
      ...(dto.model ? { model: dto.model } : {}),
      ...(dto.max_tokens ? { maxTokens: dto.max_tokens } : {}),
    });

    await this.knowledge.recordQuery({
      bucketId,
      projectId: bucket.project_id,
      apiKeyId: null,
      kind: "ask",
      query: dto.query,
      topK: dto.top_k ?? 8,
      latencyMs: retrieved.latency_ms,
      chunkHashes: retrieved.hits.map((h) => h.content_hash),
      llmModel: answered.model,
      llmTokens: answered.prompt_tokens + answered.completion_tokens,
    });

    return {
      answer: answered.answer,
      citations: answered.citations,
      retrieval: {
        embedding_model: retrieved.embedding_model,
        embedding_dimensions: retrieved.embedding_dimensions,
        query_tokens: retrieved.query_tokens,
        latency_ms: retrieved.latency_ms,
        hit_count: retrieved.hits.length,
      },
      llm: {
        model: answered.model,
        prompt_tokens: answered.prompt_tokens,
        completion_tokens: answered.completion_tokens,
      },
    };
  }

  /**
   * Enqueue every non-deleted object in a bucket. Mirrors the
   * worker's `EmbeddingsService.enqueueBucket(...)` but the
   * implementation lives here on the CP side because BullMQ producers
   * don't need the worker process. The processor (worker side) picks
   * up the jobs naturally.
   */
  private async backfillBucket(bucketId: string): Promise<number> {
    const PAGE = 500;
    let cursor: string | null = null;
    let total = 0;
    const where = { bucket_id: bucketId, deleted_at: null };
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows: Array<{ id: string }> = cursor
        ? await this.prisma.s3Object.findMany({
            where,
            orderBy: { id: "asc" },
            cursor: { id: cursor },
            skip: 1,
            take: PAGE,
            select: { id: true },
          })
        : await this.prisma.s3Object.findMany({
            where,
            orderBy: { id: "asc" },
            take: PAGE,
            select: { id: true },
          });
      if (rows.length === 0) break;
      await Promise.all(
        rows.map(async (r) => {
          // Manifest version: pick the next-after-latest so re-enables
          // don't collide with an existing manifest's (s3_object, version)
          // unique constraint.
          const latest = await this.prisma.knowledgeManifest.findFirst({
            where: { s3_object_id: r.id },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const next = latest ? latest.version + 1 : 1;
          const jobId = `manifest_${r.id}_v${next}`;
          await this.embeddingsQueue.add(
            "index-object",
            { s3_object_id: r.id, manifest_version: next },
            {
              jobId,
              attempts: 3,
              backoff: { type: "exponential", delay: 2_000 },
              removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
              removeOnFail: { age: 14 * 24 * 60 * 60 },
            },
          );
        }),
      );
      total += rows.length;
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < PAGE) break;
    }
    return total;
  }
}
