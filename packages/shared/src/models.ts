/**
 * Catalog of OpenAI models surfaced by Kraterion's Knowledge stack.
 *
 * Single source of truth for both the control plane (validation +
 * `/ask` defaults) and the dashboard (enable-Knowledge modal pickers,
 * cost preview). Adding a new model is a one-line change here.
 *
 * Pricing is the OpenAI public list price per million tokens as of
 * 2026-05-13. Re-check before claiming exact cost in marketing copy;
 * the UI rounds and labels these as "estimates".
 */

export type ProviderName = "openai";

export interface EmbeddingOption {
  /** Stable id used in radio inputs + URL state. */
  id: string;
  provider: ProviderName;
  model: string;
  dimensions: number;
  /** OpenAI's per-million-token list price. Used for the cost preview. */
  price_per_m_tokens_usd: number;
  label: string;
  description: string;
  /** Recommended default in the picker. Exactly one option carries this. */
  default?: boolean;
  /**
   * When true, the picker shows the option but disables selection.
   * Reason: the `KnowledgeChunk.embedding` pgvector column is fixed at
   * `halfvec(1024)`. Storing 1536d or 3072d vectors needs a column-level
   * schema change (or a per-dim shadow table). Tracked for post-hackathon
   * — see decisions.md 2026-05-13.
   */
  disabled?: boolean;
}

export const EMBEDDING_OPTIONS: readonly EmbeddingOption[] = [
  {
    id: "openai:text-embedding-3-small:1024",
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1024,
    price_per_m_tokens_usd: 0.02,
    label: "text-embedding-3-small @ 1024d",
    description: "Fast, cheap, recommended for most buckets.",
    default: true,
  },
  {
    id: "openai:text-embedding-3-small:1536",
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    price_per_m_tokens_usd: 0.02,
    label: "text-embedding-3-small @ 1536d",
    description: "Full dimension. Marginal recall lift over 1024d.",
    disabled: true,
  },
  {
    id: "openai:text-embedding-3-large:3072",
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 3072,
    price_per_m_tokens_usd: 0.13,
    label: "text-embedding-3-large @ 3072d",
    description: "Higher quality for technical or multilingual corpora.",
    disabled: true,
  },
];

export const DEFAULT_EMBEDDING_OPTION =
  EMBEDDING_OPTIONS.find((o) => o.default && !o.disabled) ?? EMBEDDING_OPTIONS[0]!;

export function findEmbeddingOption(
  model: string,
  dimensions: number,
): EmbeddingOption | undefined {
  return EMBEDDING_OPTIONS.find(
    (o) => o.model === model && o.dimensions === dimensions,
  );
}

export interface ChatModelOption {
  id: string;
  label: string;
  description: string;
  /** Per-million-token list price for output tokens. Rough — input
   *  is usually cheaper, but the cost preview is a rough estimate
   *  anyway. */
  price_per_m_tokens_usd: number;
  default?: boolean;
}

export const CHAT_MODELS: readonly ChatModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "gpt-4o-mini",
    description: "Cheap and fast. Recommended for most use cases.",
    price_per_m_tokens_usd: 0.6,
    default: true,
  },
  {
    id: "gpt-4o",
    label: "gpt-4o",
    description: "Higher quality, more expensive.",
    price_per_m_tokens_usd: 10,
  },
  {
    id: "gpt-4-turbo",
    label: "gpt-4-turbo",
    description: "Long-context predecessor of 4o.",
    price_per_m_tokens_usd: 30,
  },
  {
    id: "o3-mini",
    label: "o3-mini",
    description: "Reasoning model. Slower; better for hard logic.",
    price_per_m_tokens_usd: 4.4,
  },
  {
    id: "o1",
    label: "o1",
    description: "Larger reasoning model. Slowest, most thorough.",
    price_per_m_tokens_usd: 60,
  },
];

export const DEFAULT_CHAT_MODEL_ID =
  CHAT_MODELS.find((m) => m.default)?.id ?? "gpt-4o-mini";

export function isKnownChatModel(id: string): boolean {
  return CHAT_MODELS.some((m) => m.id === id);
}

/**
 * Cost preview: rough byte → token conversion. OpenAI's rule of thumb
 * is ~4 bytes per English token; non-English / code drifts higher.
 * The UI labels these as "estimates" so we don't oversell precision.
 */
export const BYTES_PER_TOKEN_ESTIMATE = 4;

export function estimateEmbeddingCostUsd(
  totalBytes: number,
  option: EmbeddingOption,
): number {
  const tokens = totalBytes / BYTES_PER_TOKEN_ESTIMATE;
  return (tokens / 1_000_000) * option.price_per_m_tokens_usd;
}
