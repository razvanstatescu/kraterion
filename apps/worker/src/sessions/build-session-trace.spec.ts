import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildSessionTrace,
  type SessionTraceInvocation,
  type SessionTraceSource,
} from "./build-session-trace.js";

function makeInvocation(
  partial: Partial<SessionTraceInvocation> & { id: string; created_at: Date },
): SessionTraceInvocation {
  return {
    status: "completed",
    input: "what is the meaning of life?",
    output: "42",
    model: "gpt-4o-mini",
    prompt_tokens: 100,
    completion_tokens: 50,
    retrieval_latency_ms: 200,
    llm_latency_ms: 1500,
    latency_ms: 1800,
    cited_hashes: [],
    retrieval_snapshot: { bucket_ids: [], top_k: 8, hits: [] },
    seed: 0xa1b2,
    system_fingerprint: "fp_test",
    finished_at: new Date(partial.created_at.getTime() + 1800),
    tool_calls: [],
    ...partial,
  };
}

function makeSource(invocations: SessionTraceInvocation[]): SessionTraceSource {
  return {
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      opened_at: new Date("2026-06-02T10:00:00.000Z"),
      closed_at: new Date("2026-06-02T10:10:00.000Z"),
      close_reason: "idle",
      principal_kind: "session",
      principal_id: "account-abc",
    },
    agent: {
      id: "22222222-2222-4222-8222-222222222222",
      sub_wallet_address: "0xabc",
      system_prompt: "You are a helpful agent.",
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
    },
    invocations,
  };
}

describe("buildSessionTrace", () => {
  it("produces identical sha256 for identical input across two calls", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
      makeInvocation({ id: "inv-2", created_at: new Date("2026-06-02T10:00:05Z") }),
    ]);
    const a = buildSessionTrace(src);
    const b = buildSessionTrace(src);
    expect(a.sha256.toString("hex")).toBe(b.sha256.toString("hex"));
    expect(a.canonicalJson).toBe(b.canonicalJson);
  });

  it("hash is stable regardless of object key order in tool_calls retrieval_snapshot input", () => {
    // Two retrieval_snapshot objects with the same fields in different key order.
    const snapshot1 = { bucket_ids: ["b"], top_k: 8, hits: [{ ordinal: 0, bucket_id: "b" }] };
    const snapshot2 = { top_k: 8, hits: [{ bucket_id: "b", ordinal: 0 }], bucket_ids: ["b"] };
    const src1 = makeSource([
      makeInvocation({
        id: "inv-1",
        created_at: new Date("2026-06-02T10:00:01Z"),
        retrieval_snapshot: snapshot1,
      }),
    ]);
    const src2 = makeSource([
      makeInvocation({
        id: "inv-1",
        created_at: new Date("2026-06-02T10:00:01Z"),
        retrieval_snapshot: snapshot2,
      }),
    ]);
    const a = buildSessionTrace(src1);
    const b = buildSessionTrace(src2);
    expect(a.sha256.toString("hex")).toBe(b.sha256.toString("hex"));
  });

  it("drops failed and pending invocations", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
      makeInvocation({
        id: "inv-failed",
        status: "failed",
        output: null,
        created_at: new Date("2026-06-02T10:00:02Z"),
      }),
      makeInvocation({
        id: "inv-pending",
        status: "pending",
        output: null,
        created_at: new Date("2026-06-02T10:00:03Z"),
      }),
      makeInvocation({ id: "inv-2", created_at: new Date("2026-06-02T10:00:04Z") }),
    ]);
    const r = buildSessionTrace(src);
    expect(r.invocationCount).toBe(2);
    const parsed = JSON.parse(r.canonicalJson);
    expect(parsed.invocations).toHaveLength(2);
    expect(parsed.invocations[0].invocation_id).toBe("inv-1");
    expect(parsed.invocations[1].invocation_id).toBe("inv-2");
  });

  it("sorts invocations by created_at ascending regardless of input order", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-third", created_at: new Date("2026-06-02T10:00:30Z") }),
      makeInvocation({ id: "inv-first", created_at: new Date("2026-06-02T10:00:10Z") }),
      makeInvocation({ id: "inv-second", created_at: new Date("2026-06-02T10:00:20Z") }),
    ]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    expect(parsed.invocations.map((i: { invocation_id: string }) => i.invocation_id)).toEqual([
      "inv-first",
      "inv-second",
      "inv-third",
    ]);
  });

  it("reconstructs conversation history per turn (prior pairs prepended)", () => {
    const src = makeSource([
      makeInvocation({
        id: "t1",
        input: "hi",
        output: "hello",
        created_at: new Date("2026-06-02T10:00:01Z"),
      }),
      makeInvocation({
        id: "t2",
        input: "and what's next?",
        output: "next is dinner",
        created_at: new Date("2026-06-02T10:00:05Z"),
      }),
    ]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    expect(parsed.invocations[0].input.messages).toEqual([
      { role: "user", content: "hi" },
    ]);
    expect(parsed.invocations[1].input.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "and what's next?" },
    ]);
  });

  it("truncates tool call arguments and output over 10KB and marks the flag", () => {
    const big = "x".repeat(20_000);
    const src = makeSource([
      makeInvocation({
        id: "inv-1",
        created_at: new Date("2026-06-02T10:00:01Z"),
        tool_calls: [
          {
            tool_call_id: "tc-1",
            tool_name: "kraterion_read_object",
            status: "completed",
            round: 0,
            arguments: big,
            output: big,
            tx_digest: null,
            walrus_blob_id: null,
            pooled_blob_object_id: null,
            latency_ms: 50,
            finished_at: new Date("2026-06-02T10:00:01.5Z"),
          },
        ],
      }),
    ]);
    const r = buildSessionTrace(src);
    const tc = JSON.parse(r.canonicalJson).invocations[0].tool_calls[0];
    expect(tc.arguments_was_truncated).toBe(true);
    expect(tc.output_was_truncated).toBe(true);
    expect(tc.arguments_truncated).toHaveLength(10_240);
    expect(tc.output_truncated).toHaveLength(10_240);
    // Hash is over the full pre-truncation content.
    expect(tc.arguments_hash_sha256).toBe(
      createHash("sha256").update(big, "utf-8").digest("hex"),
    );
    expect(tc.output_hash_sha256).toBe(
      createHash("sha256").update(big, "utf-8").digest("hex"),
    );
  });

  it("does not mark truncation for fields under cap", () => {
    const src = makeSource([
      makeInvocation({
        id: "inv-1",
        created_at: new Date("2026-06-02T10:00:01Z"),
        tool_calls: [
          {
            tool_call_id: "tc-1",
            tool_name: "kraterion_read_object",
            status: "completed",
            round: 0,
            arguments: "small",
            output: "smaller",
            tx_digest: null,
            walrus_blob_id: null,
            pooled_blob_object_id: null,
            latency_ms: 50,
            finished_at: new Date("2026-06-02T10:00:01.5Z"),
          },
        ],
      }),
    ]);
    const tc = JSON.parse(buildSessionTrace(src).canonicalJson).invocations[0].tool_calls[0];
    expect(tc.arguments_was_truncated).toBe(false);
    expect(tc.output_was_truncated).toBe(false);
    expect(tc.arguments_truncated).toBe("small");
    expect(tc.output_truncated).toBe("smaller");
  });

  it("hashes principal_id to avoid putting raw account/api_key/share_token ids on chain", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
    ]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    const expected = createHash("sha256")
      .update("session:account-abc", "utf-8")
      .digest("hex");
    expect(parsed.principal.id_hash).toBe(expected);
    expect(parsed.principal).not.toHaveProperty("id");
  });

  it("hashes the system prompt rather than including it verbatim", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
    ]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    const expected = createHash("sha256")
      .update("You are a helpful agent.", "utf-8")
      .digest("hex");
    expect(parsed.agent.system_prompt_hash).toBe(expected);
    expect(parsed.agent).not.toHaveProperty("system_prompt");
  });

  it("sha256 matches sha256(canonicalBytes)", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
    ]);
    const r = buildSessionTrace(src);
    const expected = createHash("sha256").update(r.canonicalBytes).digest();
    expect(r.sha256.equals(expected)).toBe(true);
    expect(r.sha256).toHaveLength(32);
  });

  it("returns sizeBytes that equals canonicalBytes.length and matches canonicalJson UTF-8 length", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
    ]);
    const r = buildSessionTrace(src);
    expect(r.sizeBytes).toBe(r.canonicalBytes.length);
    expect(r.sizeBytes).toBe(Buffer.byteLength(r.canonicalJson, "utf-8"));
  });

  it("hex-encodes cited_hashes from Buffers", () => {
    const buf = Buffer.from("0102030405060708090a0b0c0d0e0f10", "hex");
    const src = makeSource([
      makeInvocation({
        id: "inv-1",
        created_at: new Date("2026-06-02T10:00:01Z"),
        cited_hashes: [buf, buf],
      }),
    ]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    expect(parsed.invocations[0].output.cited_chunk_hashes_sha256).toEqual([
      "0102030405060708090a0b0c0d0e0f10",
      "0102030405060708090a0b0c0d0e0f10",
    ]);
  });

  it("includes session-level metadata at the top level", () => {
    const src = makeSource([]);
    const parsed = JSON.parse(buildSessionTrace(src).canonicalJson);
    expect(parsed.kraterion_session_trace_version).toBe(1);
    expect(parsed.session_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.opened_at).toBe("2026-06-02T10:00:00.000Z");
    expect(parsed.closed_at).toBe("2026-06-02T10:10:00.000Z");
    expect(parsed.close_reason).toBe("idle");
    expect(parsed.model_defaults).toEqual({
      requested: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
    });
  });

  it("invocationCount counts only the trace's completed invocations", () => {
    const src = makeSource([
      makeInvocation({ id: "inv-1", created_at: new Date("2026-06-02T10:00:01Z") }),
      makeInvocation({
        id: "inv-failed",
        status: "failed",
        output: null,
        created_at: new Date("2026-06-02T10:00:02Z"),
      }),
      makeInvocation({ id: "inv-2", created_at: new Date("2026-06-02T10:00:03Z") }),
    ]);
    expect(buildSessionTrace(src).invocationCount).toBe(2);
  });
});
