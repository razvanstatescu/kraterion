/**
 * OpenAI model price catalog used by the billing layer to impute cost
 * on every chat completion (`AgentInvocation.cost_usd_micros`) and
 * embedding job (`KnowledgeManifest`).
 *
 * Prices are in **USD micros per 1 million tokens** — i.e. the raw
 * dollar-per-million-tokens figure × 1,000,000. We use BigInt-friendly
 * integers everywhere to avoid floating-point drift across millions of
 * tiny invocations.
 *
 *     price_per_1m_usd = 0.15     →     price_per_1m_usd_micros = 150_000n
 *
 * Each model carries a `version` string that's pinned onto the
 * invocation row at the moment of the call. If OpenAI reprices a model
 * we publish a new catalog version; existing rows stay anchored to the
 * version they were billed under, so historical cost numbers never
 * silently drift.
 *
 * Refresh cadence: manual quarterly. Update the `version` and the
 * affected `price_*` fields together. Never edit a published version's
 * numbers — add a new version row instead.
 *
 * Source of truth for current prices:
 *   https://openai.com/api/pricing/ — copied 2026-05-19.
 */

export interface ModelPrice {
  /** Catalog version stamped onto invocation rows. Bump when any
   *  price changes; older rows stay anchored to the version they were
   *  billed under. */
  version: string;
  /** USD micros per 1M input tokens. */
  input_per_1m_usd_micros: bigint;
  /** USD micros per 1M output tokens. */
  output_per_1m_usd_micros: bigint;
  /** USD micros per 1M tokens for embedding models (no input/output
   *  split). Only set on embedding-capable models. */
  embedding_per_1m_usd_micros?: bigint;
}

/** Current pinned version. Bump when any price row below changes. */
export const OPENAI_PRICE_VERSION = "2026-05-19" as const;

/**
 * Canonical model id → price entry. Keys match the OpenAI `model`
 * field used in chat-completion requests. Anything not in this map
 * falls back to `FALLBACK_MODEL_PRICE` (treated as gpt-4o-mini rates)
 * with a logged warning — we'd rather over-bill ourselves than
 * silently under-bill the customer.
 */
export const OPENAI_PRICES: Record<string, ModelPrice> = {
  // Chat — flagship
  "gpt-4o": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 2_500_000n,
    output_per_1m_usd_micros: 10_000_000n,
  },
  "gpt-4o-2024-08-06": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 2_500_000n,
    output_per_1m_usd_micros: 10_000_000n,
  },
  // Chat — mini (default for most agents)
  "gpt-4o-mini": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 150_000n,
    output_per_1m_usd_micros: 600_000n,
  },
  "gpt-4o-mini-2024-07-18": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 150_000n,
    output_per_1m_usd_micros: 600_000n,
  },
  // Chat — gpt-4.1 family
  "gpt-4.1": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 2_000_000n,
    output_per_1m_usd_micros: 8_000_000n,
  },
  "gpt-4.1-mini": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 400_000n,
    output_per_1m_usd_micros: 1_600_000n,
  },
  "gpt-4.1-nano": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 100_000n,
    output_per_1m_usd_micros: 400_000n,
  },
  // Embeddings (used by the knowledge layer; no output column)
  "text-embedding-3-small": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 20_000n,
    output_per_1m_usd_micros: 0n,
    embedding_per_1m_usd_micros: 20_000n,
  },
  "text-embedding-3-large": {
    version: OPENAI_PRICE_VERSION,
    input_per_1m_usd_micros: 130_000n,
    output_per_1m_usd_micros: 0n,
    embedding_per_1m_usd_micros: 130_000n,
  },
};

/** Used when a request specifies a model we don't have priced yet.
 *  Same numbers as gpt-4o-mini — most agents default to it and the
 *  cap is friendlier to over-bill than under-bill. */
export const FALLBACK_MODEL_PRICE: ModelPrice = {
  version: OPENAI_PRICE_VERSION,
  input_per_1m_usd_micros: 150_000n,
  output_per_1m_usd_micros: 600_000n,
};

/** Resolve a model id to its price entry. Unknown models log + fall
 *  back; we never throw, because a billing failure should never break
 *  a chat completion. */
export function getModelPrice(model: string): ModelPrice {
  return OPENAI_PRICES[model] ?? FALLBACK_MODEL_PRICE;
}

/**
 * Compute USD micros for a chat invocation. Returns a BigInt so the
 * caller can store it in `AgentInvocation.cost_usd_micros` without
 * float rounding. Input + output are counted independently because
 * OpenAI bills them at different rates.
 *
 *   cost = (input_tokens × input_rate + output_tokens × output_rate) / 1_000_000
 *
 * Division by 1M happens last to preserve integer precision.
 */
export function computeChatCostUsdMicros(args: {
  model: string;
  prompt_tokens: number | null | undefined;
  completion_tokens: number | null | undefined;
}): { cost_usd_micros: bigint; price_version: string } {
  const price = getModelPrice(args.model);
  const input = BigInt(args.prompt_tokens ?? 0);
  const output = BigInt(args.completion_tokens ?? 0);
  const cost =
    (input * price.input_per_1m_usd_micros +
      output * price.output_per_1m_usd_micros) /
    1_000_000n;
  return { cost_usd_micros: cost, price_version: price.version };
}

/** Embedding-job equivalent. Treats the whole token count as input.
 *  Returns 0 cost (and the catalog version) for models without an
 *  embedding price — caller can decide whether to skip the row. */
export function computeEmbeddingCostUsdMicros(args: {
  model: string;
  tokens: number | null | undefined;
}): { cost_usd_micros: bigint; price_version: string } {
  const price = getModelPrice(args.model);
  const rate = price.embedding_per_1m_usd_micros ?? price.input_per_1m_usd_micros;
  const tokens = BigInt(args.tokens ?? 0);
  return {
    cost_usd_micros: (tokens * rate) / 1_000_000n,
    price_version: price.version,
  };
}
