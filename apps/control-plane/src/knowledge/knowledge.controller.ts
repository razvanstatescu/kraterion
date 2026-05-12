import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  DEFAULT_CHAT_MODEL_ID,
  EMBEDDING_OPTIONS,
  findEmbeddingOption,
  isKnownChatModel,
} from "@kraterion/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProviderCredentialService } from "../providers/provider-credential.service.js";
import { KnowledgeIndexerAddressService } from "../sui/knowledge-indexer-address.service.js";
import { SuiClientService } from "../sui/sui-client.service.js";
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
  /**
   * Default LLM model for `/ask` on this bucket. Callers can still
   * override per request. Null clears the column back to "no default".
   * Validated against the shared chat-model catalog so the dashboard's
   * picker and the API stay in lockstep.
   */
  default_llm_model: z.string().nullable().optional(),
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
  max_tokens: z.number().int().positive().max(2048).optional(),
});
type AskDto = z.infer<typeof askSchema>;

// Re-index payload is a strict subset of the enable schema — same
// fields, all optional. Omitting a field means "keep the current value
// from KnowledgeBucketSettings". `enabled` is implicit (re-indexing on
// a disabled bucket makes no sense; we 409 instead).
const reindexKnowledgeSchema = z.object({
  embedding_model: z.string().optional(),
  embedding_dimensions: z.number().int().positive().max(3072).optional(),
  default_llm_model: z.string().nullable().optional(),
  chunk_tokens: z.number().int().positive().max(8192).optional(),
  chunk_overlap_tokens: z.number().int().nonnegative().max(2048).optional(),
});
type ReindexKnowledgeDto = z.infer<typeof reindexKnowledgeSchema>;

@Controller("v1/buckets/:bucketId/knowledge")
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
    private readonly knowledge: KnowledgeService,
    private readonly knowledgeIndexerAddress: KnowledgeIndexerAddressService,
    private readonly suiClient: SuiClientService,
    private readonly credentials: ProviderCredentialService,
    @InjectQueue(EMBEDDINGS_QUEUE_NAME)
    private readonly embeddingsQueue: Queue<EmbeddingsJobData>,
  ) {}

  /**
   * Reads the live `KraterionBucket` object's `api_decryption_addresses`
   * vector and returns whether `addr` is already on it. Used by the
   * enable response so the dashboard only fires a sponsored
   * `grant_api_access` tx when actually needed.
   *
   * Case-insensitive compare: Sui addresses serialize lowercase on
   * chain but JS typings sometimes hand us mixed case.
   */
  private async isAddressGrantedOnBucket(
    bucketObjectId: string,
    addr: string,
  ): Promise<boolean> {
    try {
      const obj = await this.suiClient.get().getObject({
        id: bucketObjectId,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)
        ?.fields;
      const list = (fields?.["api_decryption_addresses"] as string[] | undefined) ?? [];
      const norm = (a: string) => a.toLowerCase();
      return list.map(norm).includes(norm(addr));
    } catch {
      // Treat read failures as "not granted" so the dashboard always
      // attempts the grant — `grant_api_access` is idempotent on chain,
      // so a duplicate is harmless (no-op + event).
      return false;
    }
  }

  @Get()
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);
    const row = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
    });
    // Aggregate manifest counts grouped by status, plus the total
    // non-deleted-object count, so the dashboard's status panel can
    // render "indexed N of M" without a second round-trip. Cheap —
    // both are indexed counts.
    // total_bytes drives the enable-modal indexing-cost preview. Same
    // query plan as the count + a SUM in one pass.
    const [statusCounts, objectAggregate] = await Promise.all([
      this.prisma.knowledgeManifest.groupBy({
        by: ["status"],
        where: { bucket_id: bucketId, deleted_at: null },
        _count: { _all: true },
      }),
      this.prisma.s3Object.aggregate({
        where: { bucket_id: bucketId, deleted_at: null },
        _count: { _all: true },
        _sum: { size_bytes: true },
      }),
    ]);
    const summary = {
      total_objects: objectAggregate._count._all,
      // size_bytes is a BigInt; stringify on the wire for browsers
      // that can't round-trip large numbers through JSON.
      total_bytes: (objectAggregate._sum.size_bytes ?? 0n).toString(),
      indexed: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
    };
    for (const row of statusCounts) {
      const key = row.status as keyof typeof summary;
      if (key in summary && key !== "total_objects" && key !== "total_bytes") {
        summary[key] = row._count._all;
      }
    }
    return {
      enabled: !!row,
      settings: row
        ? {
            embedding_model: row.embedding_model,
            embedding_dimensions: row.embedding_dimensions,
            default_llm_model: row.default_llm_model,
            chunk_tokens: row.chunk_tokens,
            chunk_overlap_tokens: row.chunk_overlap_tokens,
            updated_at: row.updated_at.toISOString(),
          }
        : null,
      summary,
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
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);

    if (!dto.enabled) {
      const [chunks] = await this.prisma.$transaction([
        this.prisma.knowledgeChunk.deleteMany({ where: { bucket_id: bucketId } }),
        this.prisma.knowledgeBucketSettings.deleteMany({ where: { bucket_id: bucketId } }),
      ]);
      // K5: tell the dashboard whether an on-chain revoke is needed so
      // the indexer's authority doesn't outlive the disable intent.
      // The Move package has no per-address revoke; the dashboard
      // emulates it with `revoke_all + grant(gateway)` in one PTB.
      const indexerAddress = await this.knowledgeIndexerAddress.get();
      const grantedOnChain = await this.isAddressGrantedOnBucket(
        bucket.kraterion_bucket_object_id,
        indexerAddress,
      );
      return {
        enabled: false,
        chunks_deleted: chunks.count,
        indexer_address: indexerAddress,
        needs_indexer_revoke: grantedOnChain,
      };
    }

    // Gate: enabling Knowledge requires a stored OpenAI credential for
    // the project. Indexing and retrieval both pull the key via
    // ProviderCredentialService.useDecrypted; turning Knowledge on
    // without one would queue jobs that fail at embed time.
    const creds = await this.credentials.list(bucket.project_id);
    const hasActiveOpenAi = creds.some(
      (c) => c.provider === "openai" && c.status === "active",
    );
    if (!hasActiveOpenAi) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Configure an OpenAI key on /keys before enabling Knowledge.",
        { provider: "openai", reason: "missing" },
      );
    }

    // Validate (model, dimensions) against the shared catalog so we
    // never persist a combination the worker / search path can't
    // actually use. Disabled options (1536d, 3072d today) are rejected
    // because the pgvector column is fixed at halfvec(1024); see
    // decisions.md 2026-05-13.
    if (dto.embedding_model !== undefined || dto.embedding_dimensions !== undefined) {
      const model = dto.embedding_model ?? EMBEDDING_OPTIONS[0]!.model;
      const dims = dto.embedding_dimensions ?? EMBEDDING_OPTIONS[0]!.dimensions;
      const option = findEmbeddingOption(model, dims);
      if (!option || option.disabled) {
        throw new ControlPlaneError(
          "InvalidArgument",
          `Embedding option "${model} @ ${dims}d" isn't available. Pick a supported option.`,
          { model, dimensions: String(dims) },
        );
      }
    }
    if (dto.default_llm_model !== undefined && dto.default_llm_model !== null) {
      if (!isKnownChatModel(dto.default_llm_model)) {
        throw new ControlPlaneError(
          "InvalidArgument",
          `Chat model "${dto.default_llm_model}" isn't available.`,
          { model: dto.default_llm_model },
        );
      }
    }

    // Lock the embedding spec on already-enabled buckets. Changing
    // model/dimensions without dropping chunks would leave the bucket
    // with vectors indexed under the old model — every subsequent
    // search would return junk. The dashboard surfaces this constraint
    // as a separate "Re-index" action that calls /reindex; this
    // endpoint refuses to mutate the embedding fields silently.
    const previousSettings = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
    });
    const previouslyEnabled = previousSettings !== null;
    if (previouslyEnabled) {
      const changesModel =
        dto.embedding_model !== undefined &&
        dto.embedding_model !== previousSettings.embedding_model;
      const changesDims =
        dto.embedding_dimensions !== undefined &&
        dto.embedding_dimensions !== previousSettings.embedding_dimensions;
      const changesChunking =
        (dto.chunk_tokens !== undefined &&
          dto.chunk_tokens !== previousSettings.chunk_tokens) ||
        (dto.chunk_overlap_tokens !== undefined &&
          dto.chunk_overlap_tokens !== previousSettings.chunk_overlap_tokens);
      if (changesModel || changesDims || changesChunking) {
        throw new ControlPlaneError(
          "PreconditionFailed",
          "Changing the embedding model, dimensions, or chunking on an enabled bucket requires re-indexing. Use the Re-index action.",
          { reason: "embedding_locked" },
        );
      }
    }

    const data = {
      bucket_id: bucketId,
      ...(dto.embedding_model ? { embedding_model: dto.embedding_model } : {}),
      ...(dto.embedding_dimensions ? { embedding_dimensions: dto.embedding_dimensions } : {}),
      ...(dto.default_llm_model !== undefined
        ? { default_llm_model: dto.default_llm_model }
        : {}),
      ...(dto.chunk_tokens ? { chunk_tokens: dto.chunk_tokens } : {}),
      ...(dto.chunk_overlap_tokens !== undefined
        ? { chunk_overlap_tokens: dto.chunk_overlap_tokens }
        : {}),
    };
    const row = await this.prisma.knowledgeBucketSettings.upsert({
      where: { bucket_id: bucketId },
      create: data,
      update: data,
    });

    // K5 grant + race fix: the worker's `knowledge_indexer` sub-wallet
    // must be in the bucket's `api_decryption_addresses` list before it
    // can call `register_blob_for_bucket` + `wrap_in_shared_blob` to
    // archive manifests on chain. If the grant hasn't landed yet, we
    // skip enqueueing the backfill — those jobs would burn through
    // their first archive attempt against an unauthorized bucket and
    // fall back to worker-owned blobs. The dashboard calls
    // `POST /v1/buckets/:id/knowledge/backfill` once the sponsored
    // grant tx confirms.
    const indexerAddress = await this.knowledgeIndexerAddress.get();
    const granted = await this.isAddressGrantedOnBucket(
      bucket.kraterion_bucket_object_id,
      indexerAddress,
    );

    let backfilled = 0;
    if (!previouslyEnabled && granted) {
      backfilled = await this.backfillBucket(bucketId);
    }

    return {
      enabled: true,
      backfilled_objects: backfilled,
      backfill_deferred: !previouslyEnabled && !granted,
      indexer_address: indexerAddress,
      needs_indexer_grant: !granted,
      settings: {
        embedding_model: row.embedding_model,
        embedding_dimensions: row.embedding_dimensions,
        default_llm_model: row.default_llm_model,
        chunk_tokens: row.chunk_tokens,
        chunk_overlap_tokens: row.chunk_overlap_tokens,
        updated_at: row.updated_at.toISOString(),
      },
    };
  }

  /**
   * Explicit backfill kick. Called by the dashboard after the
   * sponsored `grant_api_access` tx confirms, when the enable response
   * returned `backfill_deferred: true`.
   *
   * Idempotent: re-running on an already-backfilled bucket just
   * re-enqueues jobs the worker dedups at the queue layer (job id =
   * `manifest_<s3_object_id>_v<version>`).
   */
  @Post("backfill")
  @HttpCode(200)
  async backfill(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);
    const settings = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
      select: { bucket_id: true },
    });
    if (!settings) {
      throw new ControlPlaneError(
        "Conflict",
        "Knowledge is not enabled for this bucket. Toggle it on first.",
      );
    }
    const queued = await this.backfillBucket(bucketId);
    return { queued_objects: queued };
  }

  /**
   * Destructive re-index. Validates the new settings, drops every
   * `KnowledgeChunk` for the bucket, updates `KnowledgeBucketSettings`,
   * then re-enqueues every non-deleted object for indexing under the
   * new params. Manifests stay for audit (a fresh manifest version is
   * written when each object re-indexes), but their hashes won't match
   * live chunks until the new pass completes.
   *
   * Search returns empty for this bucket between the chunk wipe and
   * the first new manifest landing. Documented in the dashboard
   * confirmation copy.
   *
   * Gates: Knowledge must be enabled, project must have an active
   * OpenAI credential, and the new (model, dims) pair must be in
   * the shared catalog and not disabled.
   */
  @Post("reindex")
  @HttpCode(200)
  async reindex(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(reindexKnowledgeSchema)) dto: ReindexKnowledgeDto,
  ) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    const settings = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
    });
    if (!settings) {
      throw new ControlPlaneError(
        "Conflict",
        "Knowledge is not enabled for this bucket. Toggle it on first.",
      );
    }

    const creds = await this.credentials.list(bucket.project_id);
    const hasActiveOpenAi = creds.some(
      (c) => c.provider === "openai" && c.status === "active",
    );
    if (!hasActiveOpenAi) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Configure an OpenAI key on /keys before re-indexing.",
        { provider: "openai", reason: "missing" },
      );
    }

    // Compose the next settings row from current + overrides so a
    // partial DTO (e.g. only changing the chat model) leaves the
    // embedding settings alone.
    const nextModel = dto.embedding_model ?? settings.embedding_model;
    const nextDims = dto.embedding_dimensions ?? settings.embedding_dimensions;
    const option = findEmbeddingOption(nextModel, nextDims);
    if (!option || option.disabled) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Embedding option "${nextModel} @ ${nextDims}d" isn't available. Pick a supported option.`,
        { model: nextModel, dimensions: String(nextDims) },
      );
    }
    if (dto.default_llm_model && !isKnownChatModel(dto.default_llm_model)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Chat model "${dto.default_llm_model}" isn't available.`,
        { model: dto.default_llm_model },
      );
    }

    // Wipe live chunks, swap settings — one transaction so a partial
    // failure doesn't leave the bucket pointing at chunks indexed with
    // the wrong embedding spec.
    const [{ count: chunksDeleted }] = await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({ where: { bucket_id: bucketId } }),
      this.prisma.knowledgeBucketSettings.update({
        where: { bucket_id: bucketId },
        data: {
          embedding_model: nextModel,
          embedding_dimensions: nextDims,
          ...(dto.default_llm_model !== undefined
            ? { default_llm_model: dto.default_llm_model }
            : {}),
          ...(dto.chunk_tokens !== undefined
            ? { chunk_tokens: dto.chunk_tokens }
            : {}),
          ...(dto.chunk_overlap_tokens !== undefined
            ? { chunk_overlap_tokens: dto.chunk_overlap_tokens }
            : {}),
        },
      }),
    ]);

    const queued = await this.backfillBucket(bucketId);
    return {
      chunks_deleted: chunksDeleted,
      queued_objects: queued,
      settings: {
        embedding_model: nextModel,
        embedding_dimensions: nextDims,
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
    // Model resolution: explicit per-request override > bucket's
    // default_llm_model > the global default. Settings is null on
    // a knowledge-disabled bucket (`/ask` would 404 before this point,
    // but the chain is safe either way).
    const settings = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
      select: { default_llm_model: true },
    });
    const chosenModel =
      dto.model ?? settings?.default_llm_model ?? DEFAULT_CHAT_MODEL_ID;
    const answered = await this.credentials.useDecrypted(
      bucket.project_id,
      "openai",
      (apiKey) =>
        answerWithLLM({
          query: dto.query,
          hits: retrieved.hits,
          apiKey,
          model: chosenModel,
          ...(dto.max_tokens ? { maxTokens: dto.max_tokens } : {}),
        }),
    );

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
