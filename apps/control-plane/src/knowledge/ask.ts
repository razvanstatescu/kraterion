import OpenAI from "openai";
import type { ChunkHit } from "./knowledge.service.js";

/**
 * Prompt-stuffed `ask` helper.
 *
 * The CP-side `/ask` runs `search` first, then prompt-stuffs the top
 * chunks into an OpenAI Chat Completions call using a **caller-supplied
 * API key**. The platform never pays for the LLM step; users bring
 * their own key.
 *
 * Why a fresh OpenAI client per request: keeps the BYO-key contract
 * clean. The shared `@kraterion/embeddings-client` is server-paid
 * (KRATERION's key, server-side ingestion); ask LLM calls are
 * user-paid. Mixing them in one client would risk leaking the wrong
 * key. Per-request construction is cheap (no connection pool to set up
 * for sync chat completion).
 *
 * Citation contract: the system prompt instructs the model to inline
 * citations as `[chunk N]` where N is the chunk's position in the
 * supplied context. The CP then maps each cited index back to the
 * `ChunkHit` and surfaces both the answer and the resolved citations
 * to the caller. If the model hallucinates a chunk index, we silently
 * drop it from the citations list — the answer text still includes
 * the marker but the resolution table omits it.
 */

export interface AskRequest {
  query: string;
  hits: ChunkHit[];
  /** Caller-supplied OpenAI API key. Required — we never proxy keys. */
  openaiApiKey: string;
  /** Defaults to `gpt-4o-mini`. */
  model?: string;
  /** Optional max output tokens. Defaults to 600. */
  maxTokens?: number;
}

export interface AskResult {
  answer: string;
  /** `chunk_hashes[i]` is the SHA-256 hex of `hits[i]` that the model
   *  actually cited; same length and order as the cite markers in
   *  `answer`. Dedup'd. */
  citations: Array<{ chunk_hash: string; s3_key: string; ordinal: number }>;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 600;

const SYSTEM_PROMPT = `You are an assistant answering questions grounded in a set of provided document chunks.

Rules:
- Use ONLY the chunks below to answer. If they don't contain the answer, say "The supplied chunks don't cover this question."
- Cite every claim inline using the format [chunk N] where N is the 1-indexed chunk number from the context below.
- Multiple citations are allowed: [chunk 1][chunk 3]
- Quote exact identifiers (function names, file paths, error strings, citation keys) verbatim from chunks where relevant — your retrieval system uses exact matching for those.
- Keep the answer concise unless asked otherwise.`;

export async function answerWithLLM(req: AskRequest): Promise<AskResult> {
  if (!req.openaiApiKey) {
    throw new Error("openai_api_key is required for /ask — bring your own.");
  }
  if (req.hits.length === 0) {
    return {
      answer: "The supplied chunks don't cover this question.",
      citations: [],
      model: req.model ?? DEFAULT_MODEL,
      prompt_tokens: 0,
      completion_tokens: 0,
    };
  }

  const model = req.model ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey: req.openaiApiKey, maxRetries: 0 });

  const context = req.hits
    .map((h, i) => `[chunk ${i + 1} | source: ${h.s3_key} #${h.ordinal}]\n${h.content}`)
    .join("\n\n---\n\n");

  const userPrompt = `Question: ${req.query}\n\nContext:\n${context}`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0.2,
  });

  const answer = completion.choices[0]?.message?.content ?? "";
  const cited = resolveCitations(answer, req.hits);

  return {
    answer,
    citations: cited,
    model: completion.model ?? model,
    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
    completion_tokens: completion.usage?.completion_tokens ?? 0,
  };
}

/**
 * Walk the answer for `[chunk N]` markers, resolve each to a hit by
 * 1-indexed position, dedup. Out-of-range markers are dropped
 * silently (model hallucination) — the answer text is unchanged but
 * the citations list reflects what we could actually back.
 */
function resolveCitations(
  answer: string,
  hits: readonly ChunkHit[],
): Array<{ chunk_hash: string; s3_key: string; ordinal: number }> {
  const seen = new Set<string>();
  const out: Array<{ chunk_hash: string; s3_key: string; ordinal: number }> = [];
  const re = /\[chunk\s+(\d+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const idx = Number(m[1]);
    if (!Number.isFinite(idx) || idx < 1 || idx > hits.length) continue;
    const hit = hits[idx - 1]!;
    if (seen.has(hit.content_hash)) continue;
    seen.add(hit.content_hash);
    out.push({
      chunk_hash: hit.content_hash,
      s3_key: hit.s3_key,
      ordinal: hit.ordinal,
    });
  }
  return out;
}
