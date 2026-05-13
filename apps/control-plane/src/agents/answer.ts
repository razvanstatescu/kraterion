import OpenAI from "openai";
import type { ChunkHit } from "../knowledge/knowledge.service.js";

/**
 * Per-agent prompt-stuffed chat helper.
 *
 * Replaces `apps/control-plane/src/knowledge/ask.ts` (P3, 2026-05-13).
 * The previous `answerWithLLM` lived in the knowledge module and used
 * a hardcoded global system prompt; the agent layer makes the prompt
 * a per-resource property. Citation contract stays the same — the
 * appended retrieval block instructs the model to inline `[chunk N]`
 * markers that the controller resolves back to source chunks before
 * returning the response.
 */

export interface AnswerNonStreamRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  hits: ChunkHit[];
  temperature: number;
  maxTokens: number;
  stream?: false;
}

export interface AnswerStreamRequest extends Omit<AnswerNonStreamRequest, "stream"> {
  stream: true;
}

export interface AnswerResult {
  answer: string;
  citations: Array<{ chunk_hash: string; s3_key: string; ordinal: number }>;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

const CITATION_INSTRUCTIONS = `Cite every claim inline using the format [chunk N] where N is the 1-indexed chunk number from the supplied retrieval block. Multiple citations are allowed: [chunk 1][chunk 3]. Quote exact identifiers (function names, file paths, error strings) verbatim from the chunks where relevant. If the chunks don't cover the question, say "The supplied chunks don't cover this question."`;

function buildContext(hits: readonly ChunkHit[]): string {
  if (hits.length === 0) return "(No retrieval results.)";
  return hits
    .map((h, i) => `[chunk ${i + 1} | source: ${h.s3_key} #${h.ordinal}]\n${h.content}`)
    .join("\n\n---\n\n");
}

function buildMessages(req: {
  systemPrompt: string;
  userMessage: string;
  hits: readonly ChunkHit[];
}): OpenAI.ChatCompletionMessageParam[] {
  const retrievalBlock = `\n\n---\nRetrieval context:\n${buildContext(req.hits)}\n\n${CITATION_INSTRUCTIONS}`;
  return [
    { role: "system", content: `${req.systemPrompt}${retrievalBlock}` },
    { role: "user", content: req.userMessage },
  ];
}

/**
 * Synchronous (non-streaming) answer. Used by the chat endpoint when
 * `stream: false` and by MCP `kraterion_invoke_agent`.
 */
export async function answerWithAgent(
  req: AnswerNonStreamRequest,
): Promise<AnswerResult> {
  const client = new OpenAI({ apiKey: req.apiKey, maxRetries: 0 });
  if (req.hits.length === 0) {
    return {
      answer: "The supplied chunks don't cover this question.",
      citations: [],
      model: req.model,
      prompt_tokens: 0,
      completion_tokens: 0,
    };
  }
  const completion = await client.chat.completions.create({
    model: req.model,
    messages: buildMessages(req),
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  });
  const answer = completion.choices[0]?.message?.content ?? "";
  return {
    answer,
    citations: resolveCitations(answer, req.hits),
    model: completion.model ?? req.model,
    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
    completion_tokens: completion.usage?.completion_tokens ?? 0,
  };
}

/**
 * Streaming variant. Returns the raw OpenAI async-iterator stream so
 * the controller can forward chunks over SSE without buffering. The
 * controller is responsible for accumulating the final answer text
 * (for citation resolution + audit row) as chunks arrive.
 */
export async function streamWithAgent(req: AnswerStreamRequest) {
  const client = new OpenAI({ apiKey: req.apiKey, maxRetries: 0 });
  return client.chat.completions.create({
    model: req.model,
    messages: buildMessages(req),
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });
}

/**
 * Walk the assistant text for `[chunk N]` markers, resolve each to a
 * hit by 1-indexed position, dedup by content hash. Out-of-range
 * markers are silently dropped (model hallucination).
 */
export function resolveCitations(
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
