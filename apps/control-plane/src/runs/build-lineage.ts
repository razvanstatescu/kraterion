/**
 * P9 Feature 2 (D1) — Pure transformer: canonical session trace → OpenLineage-shaped envelope.
 *
 * Takes the parsed canonical JSON that `RunsService.verify()` already
 * decrypts + hash-checks, and produces an OpenLineage-style envelope
 * (Jobs / Runs / Datasets). The transformer is deterministic and
 * side-effect-free: same input → same output. That's important because
 * the lineage shape isn't separately anchored on chain — the integrity
 * proof rests on the existing `trace_hash` over the canonical trace,
 * and the lineage is a deterministic view over it.
 *
 * Where this diverges from the OpenLineage 1.x spec, on purpose:
 *   - No `_producer` / `_schemaURL` URI fields on facets. The strict
 *     OpenLineage validators aren't our v1 audience; the shape is
 *     compatible enough for Marquez / MLflow / DataHub adapters to
 *     consume once we add `_producer="https://kraterion.dev/..."`.
 *   - Single envelope per session (not one RunEvent per invocation
 *     emitted as a stream). The graph viewer wants the whole DAG
 *     atomically; downstream consumers can flatten if they want
 *     per-invocation events.
 *   - `runs[]` is ordered by `ordinal` (= chronological).
 *
 * MemWal-readiness: `memory.recall` and `memory.remember` tool calls
 * (Feature 3) flow through as ordinary tool-output datasets. The
 * viewer maps the `tool_name` to a memory icon; no special-case
 * branching here.
 */

/** Canonical session trace shape — mirrors what `RunsService.verify()`
 *  returns in `result.trace`. Built by
 *  `apps/worker/src/sessions/build-session-trace.ts`. The fields are
 *  loose (`unknown` at edges) because the trace is parsed from JSON,
 *  not from Prisma. */
export interface SessionTraceJson {
  kraterion_session_trace_version: number;
  session_id: string;
  agent: {
    id: string;
    sub_wallet_address: string;
    system_prompt_hash: string;
  };
  principal: {
    kind: string;
    id_hash: string;
  };
  model_defaults: {
    requested: string;
    temperature: number;
    max_tokens: number;
  };
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
  invocations: TraceInvocation[];
}

export interface TraceInvocation {
  ordinal: number;
  invocation_id: string;
  started_at: string;
  finished_at: string | null;
  model: {
    resolved: string | null;
    requested: string | null;
    system_fingerprint: string | null;
    seed: number | null;
  };
  input: {
    messages: Array<{ role: string; content: string }>;
    last_user_message: string;
  };
  retrieval: {
    bucket_ids: string[];
    top_k: number;
    hits: TraceRetrievalHit[];
  } | null;
  tool_calls: TraceToolCall[];
  output: {
    text: string;
    cited_chunk_hashes_sha256: string[];
  };
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
  };
  timing: {
    wall_ms: number | null;
    retrieval_ms: number | null;
    llm_ms: number | null;
  };
}

export interface TraceRetrievalHit {
  bucket_id: string;
  chunk_id: string;
  ordinal: number;
  content_hash: string;
  s3_key: string;
  source_walrus_blob_id?: string | null;
  /** K5 manifest blob id for this chunk's parent object. The verify
   *  affordance fetches this from Walrus, finds the chunk by
   *  `ordinal`, and compares its `content_hash` to ours — the
   *  cryptographic proof that the chunk content wasn't altered after
   *  indexing. Null on traces captured before P9-F2 added the field
   *  to the retrieval snapshot, OR for any object whose manifest the
   *  worker hasn't archived yet. */
  manifest_walrus_blob_id?: string | null;
  rrf_score: number;
}

export interface TraceToolCall {
  tool_call_id: string;
  tool_name: string;
  status: string;
  round: number;
  arguments_hash_sha256: string;
  arguments_truncated: string;
  arguments_was_truncated: boolean;
  output_hash_sha256: string | null;
  output_truncated: string;
  output_was_truncated: boolean;
  tx_digest: string | null;
  walrus_blob_id: string | null;
  pooled_blob_object_id: string | null;
  latency_ms: number | null;
  finished_at: string | null;
}

// === OpenLineage envelope (v1) ===

export interface OpenLineageEnvelope {
  kraterion_lineage_version: 1;
  session: {
    id: string;
    agent_id: string;
    /** The Sui tx digest that anchored the session on chain. Base58. */
    anchored_tx_digest: string;
    opened_at: string;
    closed_at: string | null;
    /** SHA-256 hex of the canonical-JSON plaintext trace. Same value the
     *  verify endpoint compared against the on-chain commitment. */
    trace_hash_hex: string;
  };
  job: {
    namespace: "kraterion";
    name: string;
    facets: {
      "kraterion.agent": {
        sub_wallet_address: string;
        system_prompt_hash: string;
      };
    };
  };
  runs: OpenLineageRun[];
}

export interface OpenLineageRun {
  /** Stable runId — the AgentInvocation UUID. */
  runId: string;
  ordinal: number;
  /** Time the invocation completed. We don't emit START / COMPLETE
   *  events separately in v1; a single event per run captures both. */
  eventTime: string;
  state: "COMPLETE" | "FAIL" | "ABORT" | "OTHER";
  facets: {
    "kraterion.run": {
      model: TraceInvocation["model"];
      usage: TraceInvocation["usage"];
      timing: TraceInvocation["timing"];
    };
  };
  inputs: OpenLineageDataset[];
  outputs: OpenLineageDataset[];
}

export interface OpenLineageDataset {
  namespace: string;
  name: string;
  facets: Record<string, unknown>;
}

// === Top-level builder ===

export interface BuildLineageArgs {
  trace: SessionTraceJson;
  /** Surface the anchor digest + the on-chain trace hash on the envelope
   *  so the dashboard renders the verification beat without a second
   *  endpoint call. The caller (`RunsService.lineage()`) already has
   *  these from `verify()`. */
  anchored_tx_digest: string;
  trace_hash_hex: string;
}

export function buildLineage(args: BuildLineageArgs): OpenLineageEnvelope {
  const { trace } = args;
  return {
    kraterion_lineage_version: 1,
    session: {
      id: trace.session_id,
      agent_id: trace.agent.id,
      anchored_tx_digest: args.anchored_tx_digest,
      opened_at: trace.opened_at,
      closed_at: trace.closed_at,
      trace_hash_hex: args.trace_hash_hex,
    },
    job: {
      namespace: "kraterion",
      name: `agents/${trace.agent.id}`,
      facets: {
        "kraterion.agent": {
          sub_wallet_address: trace.agent.sub_wallet_address,
          system_prompt_hash: trace.agent.system_prompt_hash,
        },
      },
    },
    runs: trace.invocations.map(buildRun),
  };
}

function buildRun(inv: TraceInvocation): OpenLineageRun {
  return {
    runId: inv.invocation_id,
    ordinal: inv.ordinal,
    eventTime: inv.finished_at ?? inv.started_at,
    state: "COMPLETE",
    facets: {
      "kraterion.run": {
        model: inv.model,
        usage: inv.usage,
        timing: inv.timing,
      },
    },
    inputs: buildInputs(inv),
    outputs: buildOutputs(inv),
  };
}

/** Inputs = every retrieved chunk. The `cited` facet flag distinguishes
 *  chunks the assistant actually cited in the answer (highlighted in
 *  the viewer) from chunks that were retrieved but unused. */
function buildInputs(inv: TraceInvocation): OpenLineageDataset[] {
  if (!inv.retrieval || inv.retrieval.hits.length === 0) return [];
  const citedSet = new Set(inv.output.cited_chunk_hashes_sha256);
  return inv.retrieval.hits.map((hit) => ({
    namespace: "kraterion-knowledge",
    name: `${hit.bucket_id}/chunk/${hit.content_hash}`,
    facets: {
      walrus: {
        source_blob_id: hit.source_walrus_blob_id ?? null,
        manifest_blob_id: hit.manifest_walrus_blob_id ?? null,
        content_hash_sha256: hit.content_hash,
      },
      "kraterion.retrieval": {
        ordinal: hit.ordinal,
        s3_key: hit.s3_key,
        rrf_score: hit.rrf_score,
        cited: citedSet.has(hit.content_hash),
        chunk_id: hit.chunk_id,
        bucket_id: hit.bucket_id,
      },
    },
  }));
}

/** Outputs = one Dataset per tool call (with on-chain receipt facets
 *  when the tool wrote to chain) + one Dataset for the assistant's
 *  final response. */
function buildOutputs(inv: TraceInvocation): OpenLineageDataset[] {
  const toolDatasets = inv.tool_calls.map(
    (tc): OpenLineageDataset => ({
      namespace: "kraterion-tool",
      name: `${tc.tool_name}/${tc.tool_call_id}`,
      facets: {
        "kraterion.tool": {
          tool_name: tc.tool_name,
          status: tc.status,
          round: tc.round,
          arguments_hash_sha256: tc.arguments_hash_sha256,
          output_hash_sha256: tc.output_hash_sha256,
          latency_ms: tc.latency_ms,
        },
        ...(tc.tx_digest ? { sui: { tx_digest: tc.tx_digest } } : {}),
        ...(tc.walrus_blob_id || tc.pooled_blob_object_id
          ? {
              walrus: {
                blob_id: tc.walrus_blob_id,
                pooled_blob_object_id: tc.pooled_blob_object_id,
              },
            }
          : {}),
      },
    }),
  );

  const responseDataset: OpenLineageDataset = {
    namespace: "kraterion-output",
    name: `invocation/${inv.invocation_id}`,
    facets: {
      "kraterion.output": {
        // Hash-only would be more privacy-respecting, but the dashboard
        // wants enough text to render the "this is the answer the agent
        // produced" beat. The trace blob already contains the full text;
        // we just expose a short preview in the envelope to keep the
        // wire shape lean.
        text_preview: inv.output.text.slice(0, 240),
        text_truncated: inv.output.text.length > 240,
        cited_chunk_hashes_sha256: inv.output.cited_chunk_hashes_sha256,
      },
    },
  };

  return [...toolDatasets, responseDataset];
}
