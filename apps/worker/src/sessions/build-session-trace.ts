import { createHash } from "node:crypto";

/**
 * Builds the deterministic, canonical-JSON trace blob for an
 * AgentSession. Pure function — no DB, no clock, no I/O. The
 * SessionArchiveProcessor (D4) reads the session + its child rows from
 * Postgres, feeds them here, and gets back the bytes to Seal-encrypt
 * and upload to Walrus.
 *
 * Stability invariant: same input → same `canonicalJson` and same
 * `sha256`. Object key order is recursively sorted; arrays preserve
 * caller order. The hash that goes on chain (`KraterionSessionAnchored.
 * trace_hash`) is `sha256(canonicalBytes)`.
 *
 * Truncation: per-tool-call `arguments` and `output` are capped at 10 KB
 * each (chars, not bytes — single-byte ASCII for our tools). The
 * canonical row still stores `*_hash_sha256` of the FULL pre-truncation
 * value, so verifiers can hash the original tool I/O against the
 * canonical row's claim if they have it. Use the boolean
 * `*_was_truncated` to surface truncation in the dashboard.
 *
 * Invocations with status != 'completed' or with null output are
 * dropped — failed/pending turns are not replayable and would only
 * bloat the trace. The `invocations[]` array is sorted by `created_at`
 * ascending (the same order they were attached to the session).
 *
 * Conversation reconstruction: we don't store the full OpenAI
 * `messages[]` per invocation today (only `AgentInvocation.input` =
 * the last user turn). To reproduce a multi-turn replay, each
 * invocation's `input.messages` is rebuilt here by chaining the
 * (user, assistant) pairs of prior completed turns + the current
 * user input. This is deterministic given the same session rows.
 */

const VERSION = 1;
/** 10 KB cap per tool-call argument/output field. Single-byte ASCII for our
 *  tools means chars ≈ bytes; if a tool ever emits multibyte content
 *  this is a slight under-cap, which is fine. */
const MAX_TOOL_FIELD_CHARS = 10_240;

export interface SessionTraceInvocation {
  id: string;
  status: string;
  input: string;
  output: string | null;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  retrieval_latency_ms: number | null;
  llm_latency_ms: number | null;
  latency_ms: number | null;
  cited_hashes: Buffer[];
  retrieval_snapshot: unknown;
  /** OpenAI `seed` used for this turn (P9 D10). Null on legacy rows
   *  written before the column existed. */
  seed: number | null;
  /** OpenAI `system_fingerprint` returned with the completion (P9 D10).
   *  Used at replay time to detect backend drift. */
  system_fingerprint: string | null;
  created_at: Date;
  finished_at: Date | null;
  tool_calls: SessionTraceToolCall[];
}

export interface SessionTraceToolCall {
  tool_call_id: string;
  tool_name: string;
  status: string;
  round: number;
  arguments: string;
  output: string | null;
  tx_digest: string | null;
  walrus_blob_id: string | null;
  pooled_blob_object_id: string | null;
  latency_ms: number | null;
  finished_at: Date | null;
}

export interface SessionTraceSource {
  session: {
    id: string;
    opened_at: Date;
    closed_at: Date | null;
    close_reason: string | null;
    principal_kind: string;
    principal_id: string;
  };
  agent: {
    id: string;
    sub_wallet_address: string;
    system_prompt: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  invocations: SessionTraceInvocation[];
}

export interface SessionTraceBuildResult {
  /** Canonical JSON string (recursively sorted keys, UTF-8). */
  canonicalJson: string;
  /** UTF-8 bytes of `canonicalJson`. The input to sha256 and to Seal
   *  encryption. */
  canonicalBytes: Buffer;
  /** SHA-256 of `canonicalBytes`. 32 bytes. Goes on chain as
   *  `KraterionSessionAnchored.trace_hash`. */
  sha256: Buffer;
  /** Length of `canonicalBytes`. */
  sizeBytes: number;
  /** Number of `completed` invocations included in the trace. */
  invocationCount: number;
}

export function buildSessionTrace(src: SessionTraceSource): SessionTraceBuildResult {
  const completed = [...src.invocations]
    .filter((i) => i.status === "completed" && i.output !== null)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  const trace = {
    kraterion_session_trace_version: VERSION,
    session_id: src.session.id,
    agent: {
      id: src.agent.id,
      sub_wallet_address: src.agent.sub_wallet_address,
      system_prompt_hash: sha256Hex(src.agent.system_prompt),
    },
    principal: {
      kind: src.session.principal_kind,
      id_hash: sha256Hex(`${src.session.principal_kind}:${src.session.principal_id}`),
    },
    model_defaults: {
      requested: src.agent.model,
      temperature: src.agent.temperature,
      max_tokens: src.agent.max_tokens,
    },
    opened_at: src.session.opened_at.toISOString(),
    closed_at: src.session.closed_at?.toISOString() ?? null,
    close_reason: src.session.close_reason,
    invocations: buildInvocations(completed),
  };

  const canonicalJson = canonicalStringify(trace);
  const canonicalBytes = Buffer.from(canonicalJson, "utf-8");
  const sha256 = createHash("sha256").update(canonicalBytes).digest();
  return {
    canonicalJson,
    canonicalBytes,
    sha256,
    sizeBytes: canonicalBytes.length,
    invocationCount: completed.length,
  };
}

function buildInvocations(items: SessionTraceInvocation[]): unknown[] {
  const priorMessages: Array<{ role: string; content: string }> = [];
  return items.map((inv, idx) => {
    const messages: Array<{ role: string; content: string }> = [
      ...priorMessages,
      { role: "user", content: inv.input },
    ];
    // After this turn, its (user, assistant) pair becomes prior context.
    priorMessages.push({ role: "user", content: inv.input });
    priorMessages.push({ role: "assistant", content: inv.output ?? "" });

    const sortedToolCalls = [...inv.tool_calls].sort(
      (a, b) =>
        a.round - b.round ||
        a.tool_call_id.localeCompare(b.tool_call_id),
    );

    return {
      ordinal: idx,
      invocation_id: inv.id,
      started_at: inv.created_at.toISOString(),
      finished_at: inv.finished_at?.toISOString() ?? null,
      model: {
        // `resolved` is the model OpenAI returned (after any backend
        // mapping). For now we mirror `inv.model` — the agent's
        // requested model id post-override resolution. Future work can
        // distinguish `requested` ("gpt-4o-mini") from `resolved`
        // ("gpt-4o-mini-2024-07-18") if needed.
        resolved: inv.model,
        requested: inv.model,
        system_fingerprint: inv.system_fingerprint,
        seed: inv.seed,
      },
      input: {
        messages,
        last_user_message: inv.input,
      },
      retrieval: inv.retrieval_snapshot ?? null,
      tool_calls: sortedToolCalls.map(buildToolCall),
      output: {
        text: inv.output,
        cited_chunk_hashes_sha256: inv.cited_hashes.map((b) =>
          b.toString("hex"),
        ),
      },
      usage: {
        prompt_tokens: inv.prompt_tokens,
        completion_tokens: inv.completion_tokens,
      },
      timing: {
        retrieval_ms: inv.retrieval_latency_ms,
        llm_ms: inv.llm_latency_ms,
        wall_ms: inv.latency_ms,
      },
    };
  });
}

function buildToolCall(tc: SessionTraceToolCall) {
  const argsTrunc = truncate(tc.arguments);
  const outputStr = tc.output ?? "";
  const outTrunc = truncate(outputStr);
  return {
    tool_call_id: tc.tool_call_id,
    tool_name: tc.tool_name,
    status: tc.status,
    round: tc.round,
    arguments_hash_sha256: sha256Hex(tc.arguments),
    arguments_truncated: argsTrunc.value,
    arguments_was_truncated: argsTrunc.truncated,
    output_hash_sha256: tc.output !== null ? sha256Hex(outputStr) : null,
    output_truncated: outTrunc.value,
    output_was_truncated: outTrunc.truncated,
    tx_digest: tc.tx_digest,
    walrus_blob_id: tc.walrus_blob_id,
    pooled_blob_object_id: tc.pooled_blob_object_id,
    latency_ms: tc.latency_ms,
    finished_at: tc.finished_at?.toISOString() ?? null,
  };
}

function truncate(s: string): { value: string; truncated: boolean } {
  if (s.length <= MAX_TOOL_FIELD_CHARS) return { value: s, truncated: false };
  return { value: s.slice(0, MAX_TOOL_FIELD_CHARS), truncated: true };
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function canonicalStringify(v: unknown): string {
  return JSON.stringify(canonicalize(v));
}

function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString("hex");
  if (Array.isArray(v)) return v.map(canonicalize);
  const obj = v as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) out[k] = canonicalize(obj[k]);
  return out;
}
