/**
 * OpenAI embedding client wrapper.
 *
 * Targets `text-embedding-3-small` at 1024 dims (Matryoshka-truncated
 * via the `dimensions` parameter). Honors per-bucket overrides:
 * `KnowledgeBucketSettings.embedding_model` /
 * `embedding_dimensions` flow through here unchanged.
 *
 * Batch shape: 200 chunks/request — research consensus
 * (2026-05-12 RAG audit, see `docs/decisions.md`) puts the sync
 * sweet spot at 200–500. We start at 200 to keep p95 latency under
 * a second per batch while leaving rate-limit headroom for a busy
 * bucket. Bump after you watch a few embedding runs.
 *
 * Retry: 5 attempts, exponential backoff with full jitter, capped at
 * 30s. The OpenAI SDK's built-in `maxRetries` would do this for us;
 * we wrap with `p-retry` to (a) get our own `429`/`5xx` classification
 * and (b) log between attempts so a worker that's stuck on rate-limit
 * retries surfaces visibly.
 *
 * Batch API (50% cheaper, ~1-hour SLA): a TODO marker. Not in K1's
 * critical path — the demo wants "upload → see indexed in seconds".
 * Post-hackathon, route any bucket > a few thousand chunks through
 * the async Batch endpoint.
 */

import OpenAI from "openai";
import pRetry, { AbortError } from "p-retry";
import { Logger } from "@nestjs/common";

export interface EmbeddingRequest {
  /** Plain-text inputs in the same order as the returned vectors. */
  inputs: readonly string[];
  /** Defaults to `text-embedding-3-small`. */
  model?: string;
  /** Defaults to 1024 (Matryoshka-truncated). */
  dimensions?: number;
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  /** Same length and order as `inputs`. */
  vectors: number[][];
  /** Reported by OpenAI in `usage.total_tokens`. */
  prompt_tokens: number;
  /** Always equal to `inputs.length`. */
  count: number;
  model: string;
  dimensions: number;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1024;
/**
 * Default sync-batch size. The OpenAI request limit is much higher
 * (~2048 inputs per request) but practical sweet spot is 200–500
 * inputs (balancing latency × 429-headroom). Tune from runtime data.
 */
export const DEFAULT_BATCH_SIZE = 200;
const RETRY_MAX = 5;
const RETRY_INITIAL_MS = 500;
const RETRY_MAX_MS = 30_000;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY env var is not set. Add it to the repo-root `.env` " +
        "(not the dashboard's `.env.local` — that file is browser-scoped). " +
        "The worker reads its environment from `<repo-root>/.env`.",
    );
  }
  _client = new OpenAI({
    apiKey,
    // We do our own retry below to get visibility into rate limits.
    // OpenAI SDK default is 2 retries; setting to 0 keeps the layered
    // logic predictable.
    maxRetries: 0,
  });
  return _client;
}

const logger = new Logger("OpenAIEmbedder");

/**
 * Embed a single batch (typically up to 200 inputs). For larger
 * corpora call this multiple times in series or with `p-limit` for
 * controlled concurrency — but a single processor job rarely needs to
 * embed more than ~10 batches.
 */
export async function embedBatch(req: EmbeddingRequest): Promise<EmbeddingResult> {
  const client = getClient();
  const model = req.model ?? DEFAULT_MODEL;
  const dimensions = req.dimensions ?? DEFAULT_DIMENSIONS;

  const response = await pRetry(
    async (attempt) => {
      try {
        return await client.embeddings.create(
          {
            model,
            input: [...req.inputs],
            dimensions,
            encoding_format: "float",
          },
          req.signal ? { signal: req.signal } : undefined,
        );
      } catch (err) {
        // Classify so retries only fire on transient failures.
        const status = (err as { status?: number } | null)?.status;
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          // 4xx (other than 408/429) is a real bug — schema, auth,
          // payload. Don't retry; surface upstream.
          throw new AbortError(err as Error);
        }
        if (attempt < RETRY_MAX) {
          const detail = (err as Error)?.message ?? "unknown";
          logger.warn(`embeddings.create attempt ${attempt} failed (status=${status}): ${detail}`);
        }
        throw err;
      }
    },
    {
      retries: RETRY_MAX,
      factor: 2,
      minTimeout: RETRY_INITIAL_MS,
      maxTimeout: RETRY_MAX_MS,
      // Full jitter — keeps thundering-herd retries from synchronizing
      // across multiple worker concurrency slots.
      randomize: true,
    },
  );

  return {
    vectors: response.data.map((d) => d.embedding),
    prompt_tokens: response.usage?.total_tokens ?? 0,
    count: response.data.length,
    model: response.model,
    dimensions,
  };
}

/**
 * Embed an arbitrary input list by splitting into 200-input batches
 * and concatenating results. Sequential by default — embedding-3-small
 * is cheap enough that we don't yet need cross-batch parallelism.
 */
export async function embedAll(
  inputs: readonly string[],
  opts: { model?: string; dimensions?: number; batchSize?: number; signal?: AbortSignal } = {},
): Promise<EmbeddingResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  if (inputs.length === 0) {
    return {
      vectors: [],
      prompt_tokens: 0,
      count: 0,
      model: opts.model ?? DEFAULT_MODEL,
      dimensions: opts.dimensions ?? DEFAULT_DIMENSIONS,
    };
  }

  const vectors: number[][] = [];
  let prompt_tokens = 0;
  let modelTag: string | null = null;
  let dimensionsTag: number | null = null;

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchOpts: EmbeddingRequest = {
      inputs: inputs.slice(i, i + batchSize),
    };
    if (opts.model) batchOpts.model = opts.model;
    if (opts.dimensions) batchOpts.dimensions = opts.dimensions;
    if (opts.signal) batchOpts.signal = opts.signal;
    const batch = await embedBatch(batchOpts);
    vectors.push(...batch.vectors);
    prompt_tokens += batch.prompt_tokens;
    modelTag = batch.model;
    dimensionsTag = batch.dimensions;
  }

  return {
    vectors,
    prompt_tokens,
    count: vectors.length,
    model: modelTag ?? opts.model ?? DEFAULT_MODEL,
    dimensions: dimensionsTag ?? opts.dimensions ?? DEFAULT_DIMENSIONS,
  };
}
