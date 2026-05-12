import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { embedQuery } from "@kraterion/embeddings-client";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * K2 retrieval API.
 *
 * Two public methods — `search` returns ranked chunks, `ask` runs an
 * LLM call against the top chunks and returns a cited answer. Both
 * share the same retrieval core (hybrid BM25 + vector + RRF).
 *
 * Hybrid retrieval rationale (see `docs/decisions.md` 2026-05-12):
 *   - Vector-only recall@10 ≈ 78% on realistic corpora.
 *   - Hybrid BM25 + vector with Reciprocal Rank Fusion ≈ 91%.
 *   - The win is concentrated on exact-identifier queries (code,
 *     citation keys, error strings) where dense embeddings miss.
 *   - We ship `KnowledgeChunk.content_tsv` as a Postgres GENERATED
 *     column in the K1 migration, so K2's BM25 leg costs zero extra
 *     write work; the GIN index makes the search fast.
 *
 * RRF tuning:
 *   - k = 60 is the de-facto standard (Cormack et al.). Each leg
 *     contributes 1 / (k + rank); legs with a chunk in their top
 *     window dominate the fused score.
 *   - Each leg fetches the top-50 candidates; we fuse and slice to
 *     the requested top_k. Higher per-leg candidate counts get
 *     diminishing returns past 50 for our chunk count.
 */

const RRF_K = 60;
const PER_LEG_CANDIDATES = 50;
const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 32;

export interface ChunkHit {
  id: string;
  s3_object_id: string;
  s3_key: string;
  bucket_id: string;
  manifest_id: string;
  ordinal: number;
  content: string;
  /** SHA-256 hex of the chunk plaintext (hex of `content_hash`). */
  content_hash: string;
  /** Vector-cosine distance (lower = closer). Null when the chunk only
   *  ranked through the BM25 leg. */
  vector_distance: number | null;
  /** Postgres `ts_rank_cd` (higher = better match). Null when the
   *  chunk only ranked through the vector leg. */
  bm25_score: number | null;
  /** Combined RRF score; this is what `ORDER BY` used. */
  rrf_score: number;
}

interface RawHybridRow {
  id: string;
  s3_object_id: string;
  s3_key: string;
  bucket_id: string;
  manifest_id: string;
  ordinal: number;
  content: string;
  content_hash: Buffer;
  vector_distance: number | null;
  bm25_score: number | null;
  rrf_score: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
  ) {}

  /**
   * Hybrid retrieval over `KnowledgeChunk`. Returns up to `top_k`
   * chunks ranked by Reciprocal Rank Fusion of vector + BM25 scores.
   *
   * 403s with `Forbidden` when `bucket.api_access_granted = false` —
   * the same revocation lever that gates GetObject on the gateway.
   * Search has no fallback to Walrus aggregator like the dashboard
   * download path does, so revocation also revokes the retrieval API.
   * That's the intended semantics: revoking platform access means
   * "the platform can't read or serve search results either."
   */
  async search(args: {
    accountId: string;
    bucketId: string;
    query: string;
    topK?: number;
    /** `ef_search` tunable for the HNSW probe. Default 64 (search) /
     *  96 (ask) per the migration's comment. */
    efSearch?: number;
  }): Promise<{
    hits: ChunkHit[];
    embedding_model: string;
    embedding_dimensions: number;
    query_tokens: number;
    latency_ms: number;
  }> {
    const t0 = Date.now();
    const bucket = await this.buckets.getOwned(args.accountId, args.bucketId);
    if (!bucket.api_access_granted) {
      throw new ControlPlaneError(
        "Forbidden",
        "Search is disabled while platform API access is revoked. Restore it in the bucket Settings page.",
      );
    }

    const settings = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: args.bucketId },
    });
    if (!settings) {
      throw new ControlPlaneError(
        "Conflict",
        "Knowledge is not enabled for this bucket. Toggle it on first.",
      );
    }

    const topK = Math.min(Math.max(args.topK ?? DEFAULT_TOP_K, 1), MAX_TOP_K);
    const efSearch = args.efSearch ?? 64;

    // Embed the query using the SAME model + dims the bucket was indexed
    // with. The retrieval is meaningless if the spaces don't match.
    const embedded = await embedQuery(args.query, {
      model: settings.embedding_model,
      dimensions: settings.embedding_dimensions,
    });
    const halfvecLiteral = `[${embedded.vector.join(",")}]`;

    // One transaction so `SET LOCAL hnsw.ef_search` only affects this
    // query. The fused query selects the union of vector-top-K and
    // BM25-top-K candidates, scoring each by RRF.
    //
    // BM25 leg: `plainto_tsquery` is the simple "AND of words" query
    // parser. Good default; we don't need users to know tsquery
    // syntax. Empty queries (no stems) return zero rows from the
    // BM25 leg, which is harmless — the vector leg still ranks.
    const rows = await this.prisma.$transaction(async (tx) => {
      // `SET LOCAL` is a Postgres config command — it refuses `$N`
      // parameter binding (`syntax error at or near "$1"`). Validate
      // `efSearch` as a clean integer and inline via `$executeRawUnsafe`.
      const safeEfSearch = Math.floor(Math.max(1, Math.min(1024, efSearch)));
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${safeEfSearch}`);
      return tx.$queryRaw<RawHybridRow[]>`
        WITH vec_leg AS (
          SELECT
            c.id,
            (c.embedding <=> ${Prisma.raw(`'${halfvecLiteral}'::halfvec(${settings.embedding_dimensions})`)})::float8 AS distance,
            ROW_NUMBER() OVER (
              ORDER BY c.embedding <=> ${Prisma.raw(`'${halfvecLiteral}'::halfvec(${settings.embedding_dimensions})`)}
            ) AS rank
          FROM "KnowledgeChunk" c
          WHERE c.bucket_id = ${args.bucketId}::text
          ORDER BY c.embedding <=> ${Prisma.raw(`'${halfvecLiteral}'::halfvec(${settings.embedding_dimensions})`)}
          LIMIT ${PER_LEG_CANDIDATES}
        ),
        bm_leg AS (
          SELECT
            c.id,
            ts_rank_cd(c.content_tsv, q) AS score,
            ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.content_tsv, q) DESC) AS rank
          FROM "KnowledgeChunk" c, plainto_tsquery('english', ${args.query}) q
          WHERE c.bucket_id = ${args.bucketId}::text
            AND c.content_tsv @@ q
          ORDER BY ts_rank_cd(c.content_tsv, q) DESC
          LIMIT ${PER_LEG_CANDIDATES}
        ),
        candidates AS (
          SELECT id FROM vec_leg
          UNION
          SELECT id FROM bm_leg
        )
        SELECT
          c.id,
          c.s3_object_id,
          s.s3_key,
          c.bucket_id,
          c.manifest_id,
          c.ordinal,
          c.content,
          c.content_hash,
          v.distance AS vector_distance,
          b.score    AS bm25_score,
          (
            COALESCE(1.0 / (${RRF_K} + v.rank), 0)
            + COALESCE(1.0 / (${RRF_K} + b.rank), 0)
          )::float8 AS rrf_score
        FROM candidates cd
        JOIN "KnowledgeChunk" c ON c.id = cd.id
        JOIN "S3Object" s ON s.id = c.s3_object_id
        LEFT JOIN vec_leg v ON v.id = c.id
        LEFT JOIN bm_leg  b ON b.id = c.id
        WHERE c.bucket_id = ${args.bucketId}::text
        ORDER BY rrf_score DESC
        LIMIT ${topK};
      `;
    });

    const hits: ChunkHit[] = rows.map((r) => ({
      id: r.id,
      s3_object_id: r.s3_object_id,
      s3_key: r.s3_key,
      bucket_id: r.bucket_id,
      manifest_id: r.manifest_id,
      ordinal: r.ordinal,
      content: r.content,
      content_hash: Buffer.from(r.content_hash).toString("hex"),
      vector_distance: r.vector_distance,
      bm25_score: r.bm25_score,
      rrf_score: r.rrf_score,
    }));

    return {
      hits,
      embedding_model: embedded.model,
      embedding_dimensions: embedded.dimensions,
      query_tokens: embedded.prompt_tokens,
      latency_ms: Date.now() - t0,
    };
  }

  /**
   * Write a `KnowledgeQuery` audit row. Both `/search` and `/ask`
   * fire this; the dashboard's Activity feed will surface them in K4.
   * The cited-hashes column is the K5 verifiability hook — given a
   * stored answer, you can replay which chunks backed it.
   */
  async recordQuery(args: {
    bucketId: string;
    projectId: string;
    apiKeyId: string | null;
    kind: "search" | "ask";
    query: string;
    topK: number;
    latencyMs: number;
    chunkHashes: readonly string[];
    llmModel?: string | null;
    llmTokens?: number | null;
  }): Promise<void> {
    await this.prisma.knowledgeQuery.create({
      data: {
        bucket_id: args.bucketId,
        project_id: args.projectId,
        api_key_id: args.apiKeyId,
        kind: args.kind,
        query: args.query,
        top_k: args.topK,
        latency_ms: args.latencyMs,
        chunk_count: args.chunkHashes.length,
        cited_hashes: args.chunkHashes.map((h) => Buffer.from(h, "hex")),
        ...(args.llmModel ? { llm_model: args.llmModel } : {}),
        ...(args.llmTokens != null ? { llm_tokens: args.llmTokens } : {}),
      },
    });
  }
}
