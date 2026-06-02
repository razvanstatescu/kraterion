"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Banner } from "@/components/ui/Banner";
import {
  NODE_TYPES,
  type ChunkNodeData,
  type LineageNodeData,
  type ResponseNodeData,
  type RunNodeData,
  type ToolOutputNodeData,
} from "./lineage-nodes";

/**
 * P9 Feature 2 (D4/D5/D6) — Lineage graph viewer.
 *
 * Renders the OpenLineage envelope returned by GET
 * /v1/runs/:txDigest/lineage as a left-to-right DAG. Per invocation:
 *   - Column 1 (inputs): chunk nodes (one per retrieved knowledge chunk)
 *   - Column 2 (run): the agent-run node
 *   - Column 3 (outputs): tool nodes + the response node
 *
 * Multi-turn sessions stack vertically (turn 1 above turn 2 ...).
 *
 * Manual layout (no dagre) — the structure is so regular that fixed
 * column positions + a per-row vertical offset reads cleaner than an
 * auto-layouter, and saves a dep.
 */

const COL_X = {
  chunk: 0,
  run: 360,
  output: 720,
} as const;

/** Vertical pitch between sibling nodes within the same column (chunk
 *  stack, tool stack). Tuned to leave breathing room between cards. */
const NODE_VSPACING = 104;
/** Vertical pad between turn rows so descender of row N doesn't touch
 *  ascender of row N+1. */
const ROW_GAP = 56;
/** Fixed canvas height. The whole graph fits via `fitView`; the user
 *  can pan + zoom inside. Picked so the viewer doesn't push session
 *  controls off-screen on a 14" laptop. */
const CANVAS_HEIGHT = 520;

/** Mirror of the OpenLineageEnvelope type defined on the control-plane
 *  side. Kept narrow — only the fields the viewer reads. */
export interface LineageEnvelopeJson {
  kraterion_lineage_version: number;
  session: {
    id: string;
    agent_id: string;
    anchored_tx_digest: string;
    opened_at: string;
    closed_at: string | null;
    trace_hash_hex: string;
  };
  job: {
    namespace: string;
    name: string;
    facets: Record<string, unknown>;
  };
  runs: Array<{
    runId: string;
    ordinal: number;
    eventTime: string;
    state: string;
    facets: {
      "kraterion.run"?: {
        model?: {
          resolved: string | null;
          requested: string | null;
          system_fingerprint: string | null;
          seed: number | null;
        };
      };
    };
    inputs: LineageDatasetJson[];
    outputs: LineageDatasetJson[];
  }>;
}

interface LineageDatasetJson {
  namespace: string;
  name: string;
  facets: Record<string, unknown>;
}

interface Props {
  envelope: LineageEnvelopeJson;
  onNodeClick?: (node: LineageNodeData) => void;
}

export function LineageGraph({ envelope, onNodeClick }: Props) {
  const { nodes, edges } = useMemo(() => buildGraph(envelope), [envelope]);

  if (nodes.length === 0) {
    return (
      <Banner
        tone="info"
        title="No lineage to render"
        body="This session had no completed invocations to graph."
      />
    );
  }

  return (
    <div
      style={{
        height: CANVAS_HEIGHT,
        background: "var(--surface)",
        borderRadius: 8,
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        {...(onNodeClick
          ? {
              onNodeClick: (_, node) =>
                onNodeClick(node.data as unknown as LineageNodeData),
            }
          : {})}
      >
        <Background gap={20} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function buildGraph(envelope: LineageEnvelopeJson): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Cumulative y cursor — each row's height is sized from its
  // own column counts, then bumped by ROW_GAP. Previously the
  // fixed ROW_HEIGHT caused tall rows (10+ chunks) to overlap
  // the next turn's chunks. With dynamic stacking the layout
  // grows downward only as much as the content demands.
  let cursorY = 0;

  envelope.runs.forEach((run) => {
    const rowSlots = Math.max(run.inputs.length, run.outputs.length, 1);
    const rowY = cursorY;
    // Run node sits vertically centered against the taller column
    // (inputs or outputs). For a row with 3 chunks + 1 response,
    // the run node lines up with the middle of the chunk stack.
    const runY = rowY + ((rowSlots - 1) * NODE_VSPACING) / 2;

    // --- Run node (center column) ---
    const runId = `run/${run.runId}`;
    const runData: RunNodeData = {
      kind: "run",
      ordinal: run.ordinal,
      invocation_id: run.runId,
      model_resolved: run.facets["kraterion.run"]?.model?.resolved ?? null,
      seed: run.facets["kraterion.run"]?.model?.seed ?? null,
      system_fingerprint:
        run.facets["kraterion.run"]?.model?.system_fingerprint ?? null,
    };
    nodes.push({
      id: runId,
      type: "run",
      position: { x: COL_X.run, y: runY },
      data: runData as unknown as Record<string, unknown>,
    });

    // --- Input chunk nodes (left column) ---
    run.inputs.forEach((input, idx) => {
      const walrus = (input.facets["walrus"] ?? {}) as Record<string, unknown>;
      const retr = (input.facets["kraterion.retrieval"] ?? {}) as Record<
        string,
        unknown
      >;
      const data: ChunkNodeData = {
        kind: "chunk",
        content_hash: String(
          walrus["content_hash_sha256"] ?? input.name.split("/").pop() ?? "",
        ),
        source_blob_id: (walrus["source_blob_id"] as string | null) ?? null,
        manifest_blob_id: (walrus["manifest_blob_id"] as string | null) ?? null,
        cited: Boolean(retr["cited"]),
        ordinal: typeof retr["ordinal"] === "number" ? (retr["ordinal"] as number) : idx,
        s3_key: String(retr["s3_key"] ?? ""),
        rrf_score: typeof retr["rrf_score"] === "number" ? (retr["rrf_score"] as number) : 0,
        chunk_id: String(retr["chunk_id"] ?? ""),
        bucket_id: String(retr["bucket_id"] ?? input.name.split("/")[0] ?? ""),
      };
      const id = `chunk/${run.runId}/${idx}`;
      nodes.push({
        id,
        type: "chunk",
        position: { x: COL_X.chunk, y: rowY + idx * NODE_VSPACING },
        data: data as unknown as Record<string, unknown>,
      });
      edges.push(makeEdge(id, runId, "retrieval"));
    });

    // --- Output nodes (right column): tool outputs then the response ---
    run.outputs.forEach((output, idx) => {
      const y = rowY + idx * NODE_VSPACING;
      if (output.namespace === "kraterion-tool") {
        const tool = (output.facets["kraterion.tool"] ?? {}) as Record<
          string,
          unknown
        >;
        const sui = (output.facets["sui"] ?? {}) as Record<string, unknown>;
        const walrus = (output.facets["walrus"] ?? {}) as Record<string, unknown>;
        const data: ToolOutputNodeData = {
          kind: "tool",
          tool_name: String(tool["tool_name"] ?? "tool"),
          tool_call_id: output.name.split("/").pop() ?? output.name,
          status: String(tool["status"] ?? "unknown"),
          tx_digest: (sui["tx_digest"] as string | null) ?? null,
          walrus_blob_id: (walrus["blob_id"] as string | null) ?? null,
          pooled_blob_object_id:
            (walrus["pooled_blob_object_id"] as string | null) ?? null,
          output_hash_sha256:
            (tool["output_hash_sha256"] as string | null) ?? null,
        };
        const id = `tool/${run.runId}/${idx}`;
        nodes.push({
          id,
          type: "tool",
          position: { x: COL_X.output, y },
          data: data as unknown as Record<string, unknown>,
        });
        edges.push(makeEdge(runId, id, "tool_call"));
      } else {
        // kraterion-output → ResponseNode
        const out = (output.facets["kraterion.output"] ?? {}) as Record<
          string,
          unknown
        >;
        const cited = (out["cited_chunk_hashes_sha256"] as string[]) ?? [];
        const data: ResponseNodeData = {
          kind: "response",
          invocation_id: run.runId,
          text_preview: String(out["text_preview"] ?? ""),
          text_truncated: Boolean(out["text_truncated"]),
          retrieved_count: run.inputs.length,
          cited_count: cited.length,
        };
        const id = `response/${run.runId}`;
        nodes.push({
          id,
          type: "response",
          position: { x: COL_X.output, y },
          data: data as unknown as Record<string, unknown>,
        });
        edges.push(makeEdge(runId, id, "generation"));
      }
    });

    // Advance the cursor past the tallest column in this row,
    // plus a gap so the next turn doesn't crowd this one.
    cursorY += rowSlots * NODE_VSPACING + ROW_GAP;
  });

  return { nodes, edges };
}

function makeEdge(
  source: string,
  target: string,
  kind: "retrieval" | "tool_call" | "generation",
): Edge {
  return {
    id: `${kind}:${source}→${target}`,
    source,
    target,
    type: "smoothstep",
    animated: kind === "generation",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke:
        kind === "retrieval"
          ? "var(--text-secondary)"
          : kind === "tool_call"
            ? "var(--text-secondary)"
            : "var(--krater, var(--success))",
      strokeWidth: 1.5,
    },
  };
}
