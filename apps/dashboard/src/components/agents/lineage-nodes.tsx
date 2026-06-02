"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  suiscanTxUrl,
  suiscanObjectUrl,
  walrusAggregatorUrl,
} from "@/lib/format";

/**
 * P9 Feature 2 (D5) — Custom node components for the lineage graph.
 *
 * Each node renders a small card sized for the React Flow canvas. The
 * design follows the kraterion-design rules: no shadows, no gradients,
 * no font weight ≥ 600, sentence case. Edges run left-to-right
 * (`sourcePosition=Right`, `targetPosition=Left`).
 *
 * Click handling is up to the parent; nodes accept the `selected`
 * state and tint accordingly. The "blooms backward" demo beat in the
 * memo is implemented via React Flow's selection state on the
 * response node, which highlights upstream subgraph by edge animation.
 */

const CARD = {
  // Border is longhand so per-state overrides (selected, cited) can
  // change `borderColor` alone without React's mixed-shorthand warning.
  base: {
    minWidth: 180,
    maxWidth: 260,
    padding: 10,
    borderRadius: 8,
    background: "var(--surface)",
    borderWidth: 1,
    borderStyle: "solid" as const,
    borderColor: "var(--border)",
    fontSize: 12,
    lineHeight: 1.4,
  },
  selected: {
    borderColor: "var(--krater, var(--success))",
  },
  label: {
    color: "var(--text-secondary)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  mono: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 11,
    color: "var(--text-secondary)",
  },
  link: {
    fontSize: 11,
    marginTop: 6,
    display: "inline-block",
  },
} as const;

function cardStyle(selected: boolean) {
  return selected ? { ...CARD.base, ...CARD.selected } : CARD.base;
}

// === Chunk node — one per retrieved knowledge chunk =========================

export interface ChunkNodeData {
  kind: "chunk";
  /** SHA-256 hex of the chunk plaintext — the verify handle. */
  content_hash: string;
  /** Walrus blob id of the source object the chunk came from. Links to
   *  Walruscan when present. */
  source_blob_id: string | null;
  /** Walrus blob id of the K5 indexing manifest. Powers the Verify
   *  button — null while the worker hasn't archived the manifest yet. */
  manifest_blob_id: string | null;
  /** True iff the assistant cited this chunk in its answer. The viewer
   *  uses this to highlight cited chunks vs. retrieved-but-unused. */
  cited: boolean;
  /** 0-indexed position in the retrieval results, for the ordinal badge. */
  ordinal: number;
  s3_key: string;
  rrf_score: number;
  chunk_id: string;
  bucket_id: string;
}

export function ChunkNode({ data, selected }: NodeProps) {
  const d = data as unknown as ChunkNodeData;
  return (
    <div
      style={{
        ...cardStyle(selected ?? false),
        ...(d.cited
          ? { borderColor: "var(--krater, var(--success))" }
          : {}),
      }}
    >
      <Handle type="source" position={Position.Right} />
      <div style={CARD.label}>
        chunk #{d.ordinal + 1}
        {d.cited ? " · cited" : ""}
      </div>
      <div style={CARD.mono}>
        {d.content_hash.slice(0, 12)}…{d.content_hash.slice(-4)}
      </div>
      <div
        style={{
          fontSize: 11,
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--text-primary)",
        }}
        title={d.s3_key}
      >
        {d.s3_key}
      </div>
      {d.source_blob_id ? (
        <a
          href={walrusAggregatorUrl(d.source_blob_id)}
          target="_blank"
          rel="noreferrer"
          style={CARD.link}
          onClick={(e) => e.stopPropagation()}
        >
          source ↗
        </a>
      ) : null}
    </div>
  );
}

// === Run node — the agent invocation itself ================================

export interface RunNodeData {
  kind: "run";
  ordinal: number;
  invocation_id: string;
  model_resolved: string | null;
  seed: number | null;
  system_fingerprint: string | null;
}

export function RunNode({ data, selected }: NodeProps) {
  const d = data as unknown as RunNodeData;
  return (
    <div
      style={{
        ...cardStyle(selected ?? false),
        background: "var(--surface-elevated, var(--surface))",
        minWidth: 200,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={CARD.label}>turn {d.ordinal + 1}</div>
      <div style={{ color: "var(--text-primary)", marginBottom: 4 }}>
        {d.model_resolved ?? "agent"}
      </div>
      <div style={CARD.mono}>
        seed {d.seed ?? "—"} · fp{" "}
        {d.system_fingerprint
          ? d.system_fingerprint.slice(0, 8) + "…"
          : "—"}
      </div>
    </div>
  );
}

// === Tool-output node — one per captured tool_call =========================

export interface ToolOutputNodeData {
  kind: "tool";
  tool_name: string;
  tool_call_id: string;
  status: string;
  /** Sui tx digest if the tool wrote on chain. */
  tx_digest: string | null;
  /** Walrus blob id of the tool's output, when stored on Walrus. */
  walrus_blob_id: string | null;
  /** PooledBlob object id, for Sui Explorer object link. */
  pooled_blob_object_id: string | null;
  output_hash_sha256: string | null;
}

export function ToolOutputNode({ data, selected }: NodeProps) {
  const d = data as unknown as ToolOutputNodeData;
  return (
    <div style={cardStyle(selected ?? false)}>
      <Handle type="target" position={Position.Left} />
      <div style={CARD.label}>
        tool · {d.status}
      </div>
      <div style={{ color: "var(--text-primary)" }}>{d.tool_name}</div>
      {d.output_hash_sha256 ? (
        <div style={{ ...CARD.mono, marginTop: 4 }}>
          out {d.output_hash_sha256.slice(0, 10)}…
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {d.tx_digest ? (
          <a
            href={suiscanTxUrl(d.tx_digest)}
            target="_blank"
            rel="noreferrer"
            style={CARD.link}
            onClick={(e) => e.stopPropagation()}
          >
            suiscan ↗
          </a>
        ) : null}
        {d.walrus_blob_id ? (
          <a
            href={walrusAggregatorUrl(d.walrus_blob_id)}
            target="_blank"
            rel="noreferrer"
            style={CARD.link}
            onClick={(e) => e.stopPropagation()}
          >
            blob ↗
          </a>
        ) : null}
        {d.pooled_blob_object_id && !d.walrus_blob_id ? (
          <a
            href={suiscanObjectUrl(d.pooled_blob_object_id)}
            target="_blank"
            rel="noreferrer"
            style={CARD.link}
            onClick={(e) => e.stopPropagation()}
          >
            on-chain ref ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

// === Response node — the assistant's final text per invocation =============

export interface ResponseNodeData {
  kind: "response";
  invocation_id: string;
  text_preview: string;
  text_truncated: boolean;
  /** Total chunks the retrieval stage returned for this turn. */
  retrieved_count: number;
  /** Subset of retrieved chunks the model cited inline via `[chunk N]`
   *  markers in its output. Can be zero even when retrieved_count is
   *  high — that means the model didn't cite inline, NOT that the
   *  answer wasn't grounded. */
  cited_count: number;
}

export function ResponseNode({ data, selected }: NodeProps) {
  const d = data as unknown as ResponseNodeData;
  // Style the cited badge muted when zero so the empty-cited case
  // reads as "no inline citations" rather than "ungrounded answer."
  // The retrieved count is the source-of-truth for whether the run
  // actually consulted the knowledge base.
  return (
    <div
      style={{
        ...cardStyle(selected ?? false),
        minWidth: 220,
        maxWidth: 320,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={CARD.label}>response</div>
      <div
        style={{
          color: "var(--text-primary)",
          marginBottom: 4,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {d.text_preview}
        {d.text_truncated ? "…" : ""}
      </div>
      <div style={CARD.mono}>
        retrieved {d.retrieved_count} ·{" "}
        <span
          style={{
            color:
              d.cited_count === 0
                ? "var(--text-secondary)"
                : "var(--text-primary)",
          }}
        >
          cited {d.cited_count}
        </span>
      </div>
    </div>
  );
}

// === Type union exposed to LineageGraph ====================================

export type LineageNodeData =
  | ChunkNodeData
  | RunNodeData
  | ToolOutputNodeData
  | ResponseNodeData;

export const NODE_TYPES = {
  chunk: ChunkNode,
  run: RunNode,
  tool: ToolOutputNode,
  response: ResponseNode,
} as const;
