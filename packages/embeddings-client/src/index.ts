/**
 * OpenAI embedding client — shared by:
 *   - the worker's K1 ingestion pipeline (`apps/worker/src/embeddings/`),
 *   - the control-plane's K2 retrieval API (`apps/control-plane/src/knowledge/`),
 *     which embeds the *query* with the same model the bucket was indexed with.
 *
 * Why a separate package: both apps need identical embedding behavior
 * (same model, same dimensions, same retry semantics). Duplicating the
 * file across `apps/worker/` and `apps/control-plane/` would silently
 * drift in 2 weeks. Extracting a workspace package costs ~5 lines of
 * package.json wiring and saves a class of bugs.
 *
 * What this package owns:
 *   - `text-embedding-3-small`-shaped call (configurable model + dims).
 *   - Batch + retry semantics (200/batch sync, exponential w/ jitter,
 *     4xx-no-retry policy).
 *
 * What this package does NOT own:
 *   - Chunking (caller's concern).
 *   - Persisting embeddings (caller's concern; pgvector/halfvec, etc).
 *   - Where the API key comes from. Callers pass `apiKey` per request.
 *     The control plane and worker both pull it from the project-scoped
 *     `ProviderCredential` table via `ProviderCredentialService.useDecrypted`.
 */

import OpenAI from "openai";
import pRetry, { AbortError } from "p-retry";

export interface EmbeddingRequest {
  inputs: readonly string[];
  /** Project-scoped OpenAI API key. Required. */
  apiKey: string;
  /** Defaults to `text-embedding-3-small`. */
  model?: string;
  /** Defaults to 1024 (Matryoshka-truncated). */
  dimensions?: number;
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  vectors: number[][];
  prompt_tokens: number;
  count: number;
  model: string;
  dimensions: number;
}

export const DEFAULT_MODEL = "text-embedding-3-small";
export const DEFAULT_DIMENSIONS = 1024;
/**
 * Sync-batch sweet spot per 2026 research (200-500 inputs/request).
 * Conservative 200 keeps p95 latency low while leaving rate-limit
 * headroom for busy buckets. Bump after live observation.
 */
export const DEFAULT_BATCH_SIZE = 200;

const RETRY_MAX = 5;
const RETRY_INITIAL_MS = 500;
const RETRY_MAX_MS = 30_000;

function buildClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    // We layer p-retry on top for explicit 4xx classification + logging
    // hooks, so the SDK's internal retry is set to 0.
    maxRetries: 0,
  });
}

export async function embedBatch(req: EmbeddingRequest): Promise<EmbeddingResult> {
  const client = buildClient(req.apiKey);
  const model = req.model ?? DEFAULT_MODEL;
  const dimensions = req.dimensions ?? DEFAULT_DIMENSIONS;

  const response = await pRetry(
    async () => {
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
        const status = (err as { status?: number } | null)?.status;
        // 4xx (other than 408/429) signals a real bug — schema, auth,
        // payload. Don't retry; surface upstream.
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          throw new AbortError(err as Error);
        }
        throw err;
      }
    },
    {
      retries: RETRY_MAX,
      factor: 2,
      minTimeout: RETRY_INITIAL_MS,
      maxTimeout: RETRY_MAX_MS,
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
 * Embed an arbitrary input list by splitting into `batchSize` chunks.
 * Sequential — `text-embedding-3-small` is fast enough that we don't
 * yet need cross-batch parallelism. K2's `/search` always calls this
 * with a single-element input (the user's query), so the batching
 * machinery is a no-op for the retrieval path.
 */
export async function embedAll(
  inputs: readonly string[],
  opts: {
    apiKey: string;
    model?: string;
    dimensions?: number;
    batchSize?: number;
    signal?: AbortSignal;
  },
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
      apiKey: opts.apiKey,
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

/**
 * Embed a single query. Convenience wrapper for the retrieval path.
 */
export async function embedQuery(
  query: string,
  opts: { apiKey: string; model?: string; dimensions?: number; signal?: AbortSignal },
): Promise<{ vector: number[]; model: string; dimensions: number; prompt_tokens: number }> {
  const res = await embedBatch({ inputs: [query], ...opts });
  return {
    vector: res.vectors[0]!,
    model: res.model,
    dimensions: res.dimensions,
    prompt_tokens: res.prompt_tokens,
  };
}
