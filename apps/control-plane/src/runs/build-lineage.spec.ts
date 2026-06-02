import { describe, it, expect } from "vitest";
import {
  buildLineage,
  type BuildLineageArgs,
  type SessionTraceJson,
  type TraceInvocation,
  type TraceRetrievalHit,
  type TraceToolCall,
} from "./build-lineage.js";

function makeRetrievalHit(
  partial: Partial<TraceRetrievalHit> & { content_hash: string },
): TraceRetrievalHit {
  return {
    bucket_id: "bucket-1",
    chunk_id: `chunk-${partial.content_hash.slice(0, 6)}`,
    ordinal: 0,
    s3_key: "doc.md",
    source_walrus_blob_id: "walrus-source-1",
    rrf_score: 0.05,
    ...partial,
  };
}

function makeToolCall(
  partial: Partial<TraceToolCall> & { tool_call_id: string; tool_name: string },
): TraceToolCall {
  return {
    status: "completed",
    round: 0,
    arguments_hash_sha256: "args-hash",
    arguments_truncated: "{}",
    arguments_was_truncated: false,
    output_hash_sha256: "out-hash",
    output_truncated: "ok",
    output_was_truncated: false,
    tx_digest: null,
    walrus_blob_id: null,
    pooled_blob_object_id: null,
    latency_ms: 12,
    finished_at: "2026-06-02T12:00:00.500Z",
    ...partial,
  };
}

function makeInvocation(
  partial: Partial<TraceInvocation> & { invocation_id: string; ordinal: number },
): TraceInvocation {
  return {
    started_at: "2026-06-02T12:00:00.000Z",
    finished_at: "2026-06-02T12:00:01.000Z",
    model: {
      resolved: "gpt-4o-mini",
      requested: "gpt-4o-mini",
      system_fingerprint: "fp_test",
      seed: 41394,
    },
    input: {
      messages: [{ role: "user", content: "hi" }],
      last_user_message: "hi",
    },
    retrieval: null,
    tool_calls: [],
    output: { text: "hello back", cited_chunk_hashes_sha256: [] },
    usage: { prompt_tokens: 10, completion_tokens: 2 },
    timing: { wall_ms: 100, retrieval_ms: 0, llm_ms: 100 },
    ...partial,
  };
}

function makeTrace(
  invocations: TraceInvocation[],
  partial?: Partial<SessionTraceJson>,
): SessionTraceJson {
  return {
    kraterion_session_trace_version: 1,
    session_id: "session-abc",
    agent: {
      id: "agent-xyz",
      sub_wallet_address: "0xabc",
      system_prompt_hash: "system-prompt-hash",
    },
    principal: { kind: "session", id_hash: "principal-hash" },
    model_defaults: {
      requested: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
    },
    opened_at: "2026-06-02T11:59:00.000Z",
    closed_at: "2026-06-02T12:01:00.000Z",
    close_reason: "idle",
    invocations,
    ...partial,
  };
}

function makeArgs(
  invocations: TraceInvocation[],
  partial?: Partial<BuildLineageArgs>,
): BuildLineageArgs {
  return {
    trace: makeTrace(invocations),
    anchored_tx_digest: "HP45LHCrjCnNkRGghPjNAnXpQbWHay6bapsE2mExtGJB",
    trace_hash_hex: "deadbeef".repeat(8),
    ...partial,
  };
}

describe("buildLineage", () => {
  it("emits deterministic output: same input → JSON.stringify-equal envelopes", () => {
    const args = makeArgs([
      makeInvocation({ invocation_id: "inv-1", ordinal: 0 }),
      makeInvocation({ invocation_id: "inv-2", ordinal: 1 }),
    ]);
    const a = buildLineage(args);
    const b = buildLineage(args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("preserves invocation ordinal order in the runs[] array", () => {
    const args = makeArgs([
      makeInvocation({ invocation_id: "inv-0", ordinal: 0 }),
      makeInvocation({ invocation_id: "inv-1", ordinal: 1 }),
      makeInvocation({ invocation_id: "inv-2", ordinal: 2 }),
    ]);
    const env = buildLineage(args);
    expect(env.runs.map((r) => r.runId)).toEqual(["inv-0", "inv-1", "inv-2"]);
    expect(env.runs.map((r) => r.ordinal)).toEqual([0, 1, 2]);
  });

  it("emits a session block carrying the anchor digest + trace hash for verification", () => {
    const env = buildLineage(makeArgs([makeInvocation({ invocation_id: "inv-1", ordinal: 0 })]));
    expect(env.session.anchored_tx_digest).toBe(
      "HP45LHCrjCnNkRGghPjNAnXpQbWHay6bapsE2mExtGJB",
    );
    expect(env.session.trace_hash_hex).toBe("deadbeef".repeat(8));
    expect(env.session.id).toBe("session-abc");
    expect(env.session.agent_id).toBe("agent-xyz");
  });

  it("emits a Job block keyed on the agent id, OpenLineage-style", () => {
    const env = buildLineage(makeArgs([makeInvocation({ invocation_id: "inv-1", ordinal: 0 })]));
    expect(env.job.namespace).toBe("kraterion");
    expect(env.job.name).toBe("agents/agent-xyz");
    expect(env.job.facets["kraterion.agent"].sub_wallet_address).toBe("0xabc");
    expect(env.job.facets["kraterion.agent"].system_prompt_hash).toBe("system-prompt-hash");
  });

  it("produces zero input datasets for invocations with null retrieval", () => {
    const env = buildLineage(makeArgs([makeInvocation({ invocation_id: "inv-1", ordinal: 0 })]));
    expect(env.runs[0]!.inputs).toEqual([]);
  });

  it("produces zero input datasets for invocations with empty retrieval.hits", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      retrieval: { bucket_ids: ["b"], top_k: 8, hits: [] },
    });
    expect(buildLineage(makeArgs([inv])).runs[0]!.inputs).toEqual([]);
  });

  it("emits one Dataset per retrieval hit with walrus + kraterion.retrieval facets", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      retrieval: {
        bucket_ids: ["bucket-1"],
        top_k: 8,
        hits: [
          makeRetrievalHit({
            content_hash: "hash-1",
            ordinal: 0,
            rrf_score: 0.1,
            source_walrus_blob_id: "walrus-1",
          }),
          makeRetrievalHit({
            content_hash: "hash-2",
            ordinal: 1,
            rrf_score: 0.08,
          }),
        ],
      },
    });
    const env = buildLineage(makeArgs([inv]));
    expect(env.runs[0]!.inputs).toHaveLength(2);
    const [first, second] = env.runs[0]!.inputs;
    expect(first!.namespace).toBe("kraterion-knowledge");
    expect(first!.name).toBe("bucket-1/chunk/hash-1");
    expect(first!.facets["walrus"]).toEqual({
      source_blob_id: "walrus-1",
      manifest_blob_id: null,
      content_hash_sha256: "hash-1",
    });
    expect(first!.facets["kraterion.retrieval"]).toMatchObject({
      ordinal: 0,
      rrf_score: 0.1,
    });
    expect(second!.name).toBe("bucket-1/chunk/hash-2");
  });

  it("threads manifest_walrus_blob_id into the walrus facet for the verify-chunk affordance", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      retrieval: {
        bucket_ids: ["bucket-1"],
        top_k: 8,
        hits: [
          makeRetrievalHit({
            content_hash: "hash-1",
            manifest_walrus_blob_id: "manifest-blob-xyz",
          }),
        ],
      },
    });
    const env = buildLineage(makeArgs([inv]));
    const walrus = env.runs[0]!.inputs[0]!.facets["walrus"] as Record<string, unknown>;
    expect(walrus["manifest_blob_id"]).toBe("manifest-blob-xyz");
    const retrieval = env.runs[0]!.inputs[0]!.facets[
      "kraterion.retrieval"
    ] as Record<string, unknown>;
    expect(retrieval["chunk_id"]).toMatch(/^chunk-/);
    expect(retrieval["bucket_id"]).toBe("bucket-1");
  });

  it("marks chunks as cited when the assistant's cited_chunk_hashes_sha256 includes them", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      output: { text: "ok", cited_chunk_hashes_sha256: ["hash-1"] },
      retrieval: {
        bucket_ids: ["bucket-1"],
        top_k: 8,
        hits: [
          makeRetrievalHit({ content_hash: "hash-1" }),
          makeRetrievalHit({ content_hash: "hash-2" }),
        ],
      },
    });
    const env = buildLineage(makeArgs([inv]));
    const facets = env.runs[0]!.inputs.map(
      (d) =>
        (d.facets["kraterion.retrieval"] as { cited: boolean })?.cited,
    );
    expect(facets).toEqual([true, false]);
  });

  it("emits one tool-output Dataset per tool_call + one response Dataset", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      tool_calls: [
        makeToolCall({ tool_call_id: "tc-a", tool_name: "kraterion_read_object" }),
        makeToolCall({ tool_call_id: "tc-b", tool_name: "kraterion_list_objects" }),
      ],
    });
    const env = buildLineage(makeArgs([inv]));
    expect(env.runs[0]!.outputs).toHaveLength(3); // 2 tool + 1 response
    const namespaces = env.runs[0]!.outputs.map((o) => o.namespace);
    expect(namespaces).toEqual([
      "kraterion-tool",
      "kraterion-tool",
      "kraterion-output",
    ]);
    expect(env.runs[0]!.outputs[2]!.name).toBe("invocation/inv-1");
  });

  it("attaches sui.tx_digest + walrus.blob_id facets only when present on the tool call", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      tool_calls: [
        makeToolCall({
          tool_call_id: "tc-a",
          tool_name: "kraterion_write_object",
          tx_digest: "0xdeadbeef",
          walrus_blob_id: "walrus-out-1",
          pooled_blob_object_id: "0xabc123",
        }),
        makeToolCall({
          tool_call_id: "tc-b",
          tool_name: "kraterion_list_objects",
        }),
      ],
    });
    const env = buildLineage(makeArgs([inv]));
    const withChain = env.runs[0]!.outputs[0]!;
    const withoutChain = env.runs[0]!.outputs[1]!;
    expect(withChain.facets["sui"]).toEqual({ tx_digest: "0xdeadbeef" });
    expect(withChain.facets["walrus"]).toEqual({
      blob_id: "walrus-out-1",
      pooled_blob_object_id: "0xabc123",
    });
    expect(withoutChain.facets["sui"]).toBeUndefined();
    expect(withoutChain.facets["walrus"]).toBeUndefined();
  });

  it("recognizes MemWal tool names as ordinary tool calls (no special-case logic needed)", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      tool_calls: [
        makeToolCall({ tool_call_id: "tc-r", tool_name: "memory.recall" }),
        makeToolCall({ tool_call_id: "tc-w", tool_name: "memory.remember" }),
      ],
    });
    const env = buildLineage(makeArgs([inv]));
    const toolNames = env.runs[0]!.outputs
      .filter((o) => o.namespace === "kraterion-tool")
      .map(
        (o) =>
          (o.facets["kraterion.tool"] as { tool_name: string }).tool_name,
      );
    expect(toolNames).toEqual(["memory.recall", "memory.remember"]);
    // Names map cleanly into kraterion-tool dataset names so the
    // viewer's MemWal icon mapping can key on tool_name.
    expect(env.runs[0]!.outputs[0]!.name).toBe("memory.recall/tc-r");
  });

  it("truncates the response text_preview at 240 chars and flags long outputs", () => {
    const longText = "x".repeat(300);
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      output: { text: longText, cited_chunk_hashes_sha256: [] },
    });
    const env = buildLineage(makeArgs([inv]));
    const response = env.runs[0]!.outputs[0]!;
    const facet = response.facets["kraterion.output"] as {
      text_preview: string;
      text_truncated: boolean;
    };
    expect(facet.text_preview).toHaveLength(240);
    expect(facet.text_truncated).toBe(true);
  });

  it("emits a response Dataset even when the invocation produced no tool calls", () => {
    const inv = makeInvocation({ invocation_id: "inv-1", ordinal: 0 });
    const env = buildLineage(makeArgs([inv]));
    expect(env.runs[0]!.outputs).toHaveLength(1);
    expect(env.runs[0]!.outputs[0]!.namespace).toBe("kraterion-output");
  });

  it("passes model + usage + timing through on the kraterion.run facet", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      model: {
        resolved: "gpt-4o-mini-2024-07-18",
        requested: "gpt-4o-mini",
        system_fingerprint: "fp_X",
        seed: 42,
      },
      usage: { prompt_tokens: 100, completion_tokens: 50 },
      timing: { wall_ms: 1800, retrieval_ms: 200, llm_ms: 1500 },
    });
    const env = buildLineage(makeArgs([inv]));
    const facet = env.runs[0]!.facets["kraterion.run"];
    expect(facet.model.system_fingerprint).toBe("fp_X");
    expect(facet.model.seed).toBe(42);
    expect(facet.usage.prompt_tokens).toBe(100);
    expect(facet.timing.wall_ms).toBe(1800);
  });

  it("uses finished_at as the run eventTime, falling back to started_at when absent", () => {
    const inv = makeInvocation({
      invocation_id: "inv-1",
      ordinal: 0,
      started_at: "2026-06-02T12:00:00.000Z",
      finished_at: null,
    });
    const env = buildLineage(makeArgs([inv]));
    expect(env.runs[0]!.eventTime).toBe("2026-06-02T12:00:00.000Z");
  });
});
