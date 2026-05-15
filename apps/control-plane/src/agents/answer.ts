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
 *
 * P4 (2026-05-13) adds optional `tools` + cross-turn message threading
 * (`extraMessages`). When `tools` is non-empty the model may emit
 * `tool_calls` instead of `content`; the controller's tool-call loop
 * accumulates them, executes the registered handlers, and re-invokes
 * this helper with the tool results appended via `extraMessages`.
 */

/**
 * One turn in the conversation history forwarded to OpenAI. The server
 * appends the system prompt + retrieval block ahead of these; clients
 * never send `role: "system"` (the chat DTO refuses it).
 */
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/** Alias for OpenAI's `tools[]` shape (function-call kind). */
export type ChatToolDef = OpenAI.ChatCompletionTool;

export interface AnswerNonStreamRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** Ordered history: every previously-completed turn followed by the
   *  new user message. Length-1 is the single-turn case. */
  messages: ChatHistoryMessage[];
  hits: ChunkHit[];
  temperature: number;
  maxTokens: number;
  /** Tool catalog the model may invoke. Omit (or pass empty) for pure
   *  RAG mode — when absent the model can only emit `content`. */
  tools?: ChatToolDef[];
  /** Trailing messages appended verbatim after the user history. The
   *  tool-call loop uses this to thread `assistant({tool_calls})` +
   *  `tool` results back into the conversation across rounds. Caller
   *  is responsible for the wire format (OpenAI shape). */
  extraMessages?: OpenAI.ChatCompletionMessageParam[];
  /** When true, the retrieval block is still injected (the model
   *  needs the chunks to ground its answer) but the `[chunk N]`
   *  citation contract is dropped from the prompt. Used by share
   *  tokens with `cite_sources=false` — the model produces clean
   *  prose without any inline markers. */
  omitCitationInstructions?: boolean;
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
  messages: readonly ChatHistoryMessage[];
  hits: readonly ChunkHit[];
  extraMessages?: OpenAI.ChatCompletionMessageParam[];
  omitCitationInstructions?: boolean;
}): OpenAI.ChatCompletionMessageParam[] {
  // Retrieval block lives on the system prompt for now. Known
  // limitation: this means every turn re-sends the full retrieval
  // payload, even on follow-ups where retrieval against the latest
  // user message returned the same chunks (or nothing useful). See
  // `docs/progress.md` "multi-turn known issues" for the post-
  // hackathon fix (move retrieval to a per-turn tool message, or
  // skip retrieval on contextual follow-ups).
  // The retrieval block is always present (the model needs the chunks
  // to ground its answer); the inline-citation contract is conditional.
  // For `omitCitationInstructions=true` flows we substitute a short
  // "answer in clean prose" instruction so the model knows the chunks
  // are context, not data to copy markers from.
  const citationCue = req.omitCitationInstructions
    ? "Use the retrieval context to ground your answer. Do not output citation markers, chunk numbers, or source paths in your response."
    : CITATION_INSTRUCTIONS;
  const retrievalBlock = `\n\n---\nRetrieval context:\n${buildContext(req.hits)}\n\n${citationCue}`;
  return [
    { role: "system", content: `${req.systemPrompt}${retrievalBlock}` },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(req.extraMessages ?? []),
  ];
}

/**
 * Synchronous (non-streaming) answer. Used by the chat endpoint when
 * `stream: false` and by MCP `kraterion_invoke_agent`.
 */
export async function answerWithAgent(
  req: AnswerNonStreamRequest,
): Promise<AnswerResult & { completion: OpenAI.ChatCompletion }> {
  const client = new OpenAI({ apiKey: req.apiKey, maxRetries: 0 });
  // Empty retrieval => stub a "no context" response. We previously
  // short-circuited here; with multi-turn we still want to surface
  // the model output (it may legitimately answer from prior turns
  // or pure conversation, not retrieval). Leave the empty
  // retrieval block in the prompt — `buildContext` writes
  // "(No retrieval results.)" — and let the model decide.
  const completion = await client.chat.completions.create({
    model: req.model,
    messages: buildMessages(req),
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
  });
  const answer = completion.choices[0]?.message?.content ?? "";
  return {
    answer,
    citations: resolveCitations(answer, req.hits),
    model: completion.model ?? req.model,
    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
    completion_tokens: completion.usage?.completion_tokens ?? 0,
    // The full completion is returned so the tool-call loop can read
    // `choices[0].finish_reason` and `tool_calls` without a second
    // parse.
    completion,
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
    ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
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
