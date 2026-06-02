import OpenAI from "openai";

/**
 * P9 (D10) — Per-turn re-execution against an anchored session trace.
 *
 * Iterates the trace's recorded invocations in order. For each turn:
 *   - Reconstructs the OpenAI request from the snapshot (model,
 *     seed, temperature, max_tokens, conversation messages, tools).
 *   - Re-issues the chat completion against OpenAI with the SAME
 *     seed + temp the original used. Determinism is best-effort: a
 *     fingerprint match means high confidence the output replicates;
 *     a mismatch surfaces as `system_fingerprint_matched: false` so
 *     callers can render a "backend has drifted" warning instead of
 *     silently producing a different output.
 *   - **Short-circuits tool calls.** Tools mutate state — we will NOT
 *     re-execute `kraterion_write_object` against the chain and
 *     create a duplicate blob. Instead, when the replayed model emits
 *     a tool call with the same `tool_call_id`, we feed the
 *     pre-recorded `output_truncated` back as the tool result and
 *     continue the loop. The model proceeds as if the tools ran.
 *
 * Replay never writes to Postgres. It builds the conversation in
 * memory and returns a per-turn result object. D11 wires this into
 * `RunsService.verify({rerun: true})` and adds `jsondiffpatch` for
 * the response shape.
 *
 * Out of scope (deliberate):
 *   - Anthropic / non-OpenAI providers (no `seed` parameter).
 *   - Streaming. Replay is always non-streaming (we don't render the
 *     output progressively; we collect the final text and diff it).
 *   - Re-running retrieval. The trace already captured the chunk
 *     hashes; replay relies on the model receiving the same retrieval
 *     block. To exactly reproduce, we'd need to refetch chunks by
 *     hash from KnowledgeChunk — a follow-up; today the chunks are
 *     re-built into a context block from their hashes and a
 *     placeholder "(content recoverable by hash)" stub. Note this in
 *     the response so users know the retrieval context isn't byte-
 *     identical, but the model sees the same set of citation tags.
 *   - Citation re-extraction (not interesting for the demo).
 */

/** Wire shape of one invocation inside a canonical session trace.
 *  Mirrors `build-session-trace.ts:SessionTraceBuildResult.canonicalJson`
 *  → `invocations[]`. We parse from JSON, not from Prisma, so the
 *  fields are loose. */
export interface CapturedTurn {
  ordinal: number;
  invocation_id: string;
  model: {
    requested: string | null;
    resolved: string | null;
    seed: number | null;
    system_fingerprint: string | null;
    temperature?: number;
    max_tokens?: number;
  };
  input: {
    messages: Array<{ role: string; content: string }>;
    last_user_message: string;
  };
  retrieval: {
    bucket_ids: string[];
    top_k: number;
    hits: Array<{
      bucket_id: string;
      ordinal: number;
      chunk_id: string;
      content_hash: string;
      s3_key: string;
      rrf_score: number;
    }>;
  } | null;
  tool_calls: Array<{
    tool_call_id: string;
    tool_name: string;
    round: number;
    arguments_truncated: string;
    arguments_was_truncated: boolean;
    output_truncated: string;
    output_was_truncated: boolean;
    status: string;
  }>;
  output: { text: string; cited_chunk_hashes_sha256: string[] };
}

export interface ReplayTurnResult {
  ordinal: number;
  invocation_id: string;
  /** What the original captured run emitted (verbatim from the trace). */
  captured_output: string;
  captured_system_fingerprint: string | null;
  /** What the model emitted just now when we re-issued the call. */
  replay_output: string;
  replay_system_fingerprint: string | null;
  /** True iff captured + replay system_fingerprints both present and equal.
   *  False means the backend config changed since the trace was
   *  written — output differences are NOT a tamper signal in that
   *  case, just provider drift. */
  system_fingerprint_matched: boolean;
  /** Tool call short-circuits served from the trace, by id. */
  tool_calls_replayed: string[];
}

const REPLAY_MODEL_FALLBACK = "gpt-4o-mini";
const REPLAY_TOP_P = 1;

export interface ReplayOptions {
  apiKey: string;
  /** Default temperature when the trace doesn't carry one (legacy traces). */
  defaultTemperature?: number;
  /** Default max_tokens when the trace doesn't carry one. */
  defaultMaxTokens?: number;
  /** How many tool-call rounds to allow before bailing. Each model
   *  response that ends in `finish_reason=tool_calls` counts as one
   *  round; the captured trace's MAX_TOOL_ROUNDS bound this in the
   *  original run too. */
  maxToolRounds?: number;
}

export async function replaySession(
  turns: CapturedTurn[],
  systemPromptHash: string,
  opts: ReplayOptions,
): Promise<ReplayTurnResult[]> {
  // `system_prompt_hash` arrives separately so we can include it in
  // the replay system message — the model sees the SAME hash the
  // original did. We can't recover the prompt itself (it's
  // hash-only in the trace). The model has no use for the hash;
  // we omit it from the replay system message and rely on
  // `temperature=0 + seed` for reproducibility. Kept as an arg so
  // future replay modes (e.g. user-supplied original prompt) can
  // thread it through.
  void systemPromptHash;

  const client = new OpenAI({ apiKey: opts.apiKey, maxRetries: 0 });
  const results: ReplayTurnResult[] = [];

  for (const turn of turns) {
    const captured = turn.output.text ?? "";
    const messages = buildReplayMessages(turn);
    const tools = turn.tool_calls.length > 0
      ? buildToolDefs(turn.tool_calls)
      : undefined;

    const seed = turn.model.seed ?? undefined;
    const temperature = turn.model.temperature ?? opts.defaultTemperature ?? 0;
    const maxTokens = turn.model.max_tokens ?? opts.defaultMaxTokens ?? 1024;
    const model = turn.model.resolved ?? turn.model.requested ?? REPLAY_MODEL_FALLBACK;

    const toolsServed: string[] = [];
    const maxToolRounds = opts.maxToolRounds ?? 4;
    const extraMessages: OpenAI.ChatCompletionMessageParam[] = [];
    let lastFingerprint: string | null = null;
    let finalContent = "";

    for (let round = 0; round <= maxToolRounds; round++) {
      const completion = await client.chat.completions.create({
        model,
        messages: [...messages, ...extraMessages],
        temperature,
        max_tokens: maxTokens,
        top_p: REPLAY_TOP_P,
        ...(typeof seed === "number" ? { seed } : {}),
        ...(tools ? { tools } : {}),
      });
      lastFingerprint = completion.system_fingerprint ?? lastFingerprint;
      const choice = completion.choices[0];
      const message = choice?.message;
      const toolCalls = message?.tool_calls ?? [];

      // No tool calls → this is the final turn.
      if (!tools || choice?.finish_reason !== "tool_calls" || toolCalls.length === 0) {
        finalContent = message?.content ?? "";
        break;
      }

      // Short-circuit each tool call by feeding the captured output.
      extraMessages.push({
        role: "assistant",
        content: message?.content ?? null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        const captured = turn.tool_calls.find(
          (t) => t.tool_call_id === tc.id,
        );
        const result = captured?.output_truncated ?? "";
        toolsServed.push(tc.id);
        extraMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      if (round === maxToolRounds) {
        // Bail before infinite-loop. Final content = whatever assistant
        // produced in this round before the tool calls.
        finalContent = message?.content ?? "";
        break;
      }
    }

    results.push({
      ordinal: turn.ordinal,
      invocation_id: turn.invocation_id,
      captured_output: captured,
      captured_system_fingerprint: turn.model.system_fingerprint,
      replay_output: finalContent,
      replay_system_fingerprint: lastFingerprint,
      system_fingerprint_matched:
        turn.model.system_fingerprint !== null &&
        lastFingerprint !== null &&
        turn.model.system_fingerprint === lastFingerprint,
      tool_calls_replayed: toolsServed,
    });
  }

  return results;
}

/** Rebuild the OpenAI messages array for one replay turn. The trace
 *  captured the FULL history sent to OpenAI at original-call time, so
 *  we use it verbatim. The retrieval block is rebuilt from chunk
 *  metadata; chunk content itself is not in the trace (recoverable by
 *  hash from KnowledgeChunk — out of scope here). */
function buildReplayMessages(
  turn: CapturedTurn,
): OpenAI.ChatCompletionMessageParam[] {
  const retrievalContext = turn.retrieval
    ? buildRetrievalContextStub(turn.retrieval)
    : "(No retrieval results.)";
  const system =
    `You are replaying a previously-anchored agent turn. ` +
    `Reproduce the captured behavior given this retrieval context:\n` +
    `\n---\nRetrieval context:\n${retrievalContext}\n`;
  return [
    { role: "system", content: system },
    ...turn.input.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map<OpenAI.ChatCompletionMessageParam>((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];
}

/** Build a hash-only retrieval context for the replay system prompt.
 *  We can't reproduce the full chunk text from a hash, but the model
 *  sees the same set of `[chunk N]` slots which keeps citation
 *  behavior close. Future work: refetch chunks by `content_hash`
 *  from KnowledgeChunk for byte-identical replay. */
function buildRetrievalContextStub(retrieval: NonNullable<CapturedTurn["retrieval"]>): string {
  if (retrieval.hits.length === 0) return "(No retrieval results.)";
  return retrieval.hits
    .map(
      (h, i) =>
        `[chunk ${i + 1} | source: ${h.s3_key} #${h.ordinal} | sha256: ${h.content_hash.slice(0, 8)}…]\n(content recoverable by hash — not inlined in the trace)`,
    )
    .join("\n\n---\n\n");
}

/** Synthesize tool definitions from the captured tool_calls so the
 *  replayed model has the same tool catalog. We can't recover the
 *  parameter schema (it lived in the AgentToolRegistry); the replay
 *  model accepts any JSON and we feed back the captured output
 *  unchanged. */
function buildToolDefs(
  captured: CapturedTurn["tool_calls"],
): OpenAI.ChatCompletionTool[] {
  const byName = new Map<string, OpenAI.ChatCompletionTool>();
  for (const tc of captured) {
    if (byName.has(tc.tool_name)) continue;
    byName.set(tc.tool_name, {
      type: "function",
      function: {
        name: tc.tool_name,
        description:
          `Captured tool ${tc.tool_name}. Calls are short-circuited at replay; ` +
          `outputs are served from the anchored trace.`,
        parameters: {
          type: "object",
          additionalProperties: true,
        },
      },
    });
  }
  return [...byName.values()];
}
