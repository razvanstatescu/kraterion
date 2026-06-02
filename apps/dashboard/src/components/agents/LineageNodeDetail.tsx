"use client";

import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  suiscanObjectUrl,
  suiscanTxUrl,
  walrusAggregatorUrl,
} from "@/lib/format";
import { VerifyChunk } from "@/components/knowledge/VerifyChunk";
import type {
  ChunkNodeData,
  LineageNodeData,
  ResponseNodeData,
  RunNodeData,
  ToolOutputNodeData,
} from "./lineage-nodes";

/**
 * P9 Feature 2 (D7) — Inline detail card. Renders below the lineage
 * graph when a node is selected. Mirrors the visual rhythm of
 * `VerifyChunk` (banner-shaped, mono hash row, link footer) without
 * pulling in its bucket-context-specific verify pipeline. The
 * "verify" beat in the demo is: click chunk → Walruscan opens at the
 * blob → hash visibly matches the on-chain commitment. That holds
 * with the link + the hex row we render here; deeper verify
 * automation is a follow-up.
 */

interface Props {
  node: LineageNodeData | null;
  /** Convenience: the session's anchor digest. Lets the run-node
   *  detail link to Suiscan without re-threading the envelope. */
  sessionAnchorDigest?: string;
}

export function LineageNodeDetail({ node, sessionAnchorDigest }: Props) {
  if (!node) {
    return (
      <Card style={{ padding: 16 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Click a node in the graph to see its on-chain receipt and facets.
        </div>
      </Card>
    );
  }
  switch (node.kind) {
    case "chunk":
      return <ChunkDetail data={node} />;
    case "run":
      return (
        <RunDetail
          data={node}
          {...(sessionAnchorDigest
            ? { sessionAnchorDigest }
            : {})}
        />
      );
    case "tool":
      return <ToolDetail data={node} />;
    case "response":
      return <ResponseDetail data={node} />;
  }
}

// === Per-kind detail blocks =================================================

/**
 * Chunk detail = the audit story for one retrieved knowledge chunk.
 * Layout, top to bottom:
 *
 *   1. Eyebrow + ordinal title + cited / retrieved pill
 *   2. Source file name (the human-readable provenance)
 *   3. Verify button — fetches the K5 manifest from Walrus, finds the
 *      chunk by ordinal, compares its hash to the locally-stored hash.
 *      This is the cryptographic proof beat. When the manifest blob id
 *      is null (older traces, or pre-archival window), the button
 *      reports "Not on chain yet" — a true but visible failure.
 *   4. Side-by-side blob links — source object on Walrus, indexing
 *      manifest on Walrus. Useful even without the verify button.
 *   5. Hash + rrf row — the data the verify button compares against.
 *   6. Internal ids (chunk_id, bucket_id) for operators.
 *
 * Intentionally avoids dumping raw chunk text — that's in the trace
 * blob (which the user can decrypt via the existing replay path) and
 * exposing it inline collapses the audit narrative into a content
 * preview.
 */
function ChunkDetail({ data }: { data: ChunkNodeData }) {
  return (
    <Card style={{ padding: 16 }}>
      <Header
        eyebrow="knowledge chunk"
        title={
          <>
            chunk #{data.ordinal + 1}{" "}
            {data.cited ? (
              <Pill tone="success" dot>
                cited inline
              </Pill>
            ) : (
              <Pill tone="info">retrieved</Pill>
            )}
          </>
        }
      />
      <div
        style={{
          fontSize: 13,
          color: "var(--text-primary)",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={data.s3_key}
      >
        {data.s3_key || "—"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <VerifyChunk
          content_hash={data.content_hash}
          ordinal={data.ordinal}
          manifest_walrus_blob_id={data.manifest_blob_id}
        />
      </div>

      <LinkRow
        items={[
          data.source_blob_id
            ? {
                label: "fetch source object ↗",
                href: walrusAggregatorUrl(data.source_blob_id),
              }
            : null,
          data.manifest_blob_id
            ? {
                label: "fetch indexing manifest ↗",
                href: walrusAggregatorUrl(data.manifest_blob_id),
              }
            : null,
        ]}
      />

      <div style={{ marginTop: 10 }}>
        <HashRow label="content sha256" hex={data.content_hash} />
        <Row label="rrf score">{data.rrf_score.toFixed(4)}</Row>
        {data.chunk_id ? <Row label="chunk id">{shortId(data.chunk_id)}</Row> : null}
      </div>
    </Card>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function RunDetail({
  data,
  sessionAnchorDigest,
}: {
  data: RunNodeData;
  sessionAnchorDigest?: string;
}) {
  return (
    <Card style={{ padding: 16 }}>
      <Header
        eyebrow={`turn ${data.ordinal + 1}`}
        title={data.model_resolved ?? "agent invocation"}
      />
      <Row label="invocation id">{data.invocation_id}</Row>
      <Row label="seed">{data.seed === null ? "—" : data.seed}</Row>
      <Row label="system fingerprint">
        {data.system_fingerprint ?? "—"}
      </Row>
      <LinkRow
        items={[
          sessionAnchorDigest
            ? {
                label: "session anchor tx ↗",
                href: suiscanTxUrl(sessionAnchorDigest),
              }
            : null,
        ]}
      />
    </Card>
  );
}

function ToolDetail({ data }: { data: ToolOutputNodeData }) {
  return (
    <Card style={{ padding: 16 }}>
      <Header
        eyebrow="tool call"
        title={
          <>
            {data.tool_name}{" "}
            <Pill
              tone={data.status === "completed" ? "success" : "warning"}
              dot
            >
              {data.status}
            </Pill>
          </>
        }
      />
      <Row label="tool_call_id">{data.tool_call_id}</Row>
      {data.output_hash_sha256 ? (
        <HashRow label="output sha256" hex={data.output_hash_sha256} />
      ) : null}
      <LinkRow
        items={[
          data.tx_digest
            ? { label: "suiscan tx ↗", href: suiscanTxUrl(data.tx_digest) }
            : null,
          data.walrus_blob_id
            ? { label: "fetch blob ↗", href: walrusAggregatorUrl(data.walrus_blob_id) }
            : null,
          data.pooled_blob_object_id
            ? {
                label: "pooled blob ↗",
                href: suiscanObjectUrl(data.pooled_blob_object_id),
              }
            : null,
        ]}
      />
    </Card>
  );
}

function ResponseDetail({ data }: { data: ResponseNodeData }) {
  return (
    <Card style={{ padding: 16 }}>
      <Header eyebrow="response" title="agent output" />
      <div
        style={{
          fontSize: 13,
          marginBottom: 8,
          padding: 12,
          background: "var(--surface-elevated, var(--surface))",
          borderRadius: 6,
          whiteSpace: "pre-wrap",
        }}
      >
        {data.text_preview}
        {data.text_truncated ? "…" : ""}
      </div>
      <Row label="retrieved">{data.retrieved_count}</Row>
      <Row label="cited inline">{data.cited_count}</Row>
      {data.retrieved_count > 0 && data.cited_count === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Retrieval grounded the answer with{" "}
          {data.retrieved_count} chunk
          {data.retrieved_count === 1 ? "" : "s"} but the model didn&apos;t
          emit inline <code>[chunk N]</code> markers, so the citation list
          is empty.
        </div>
      ) : null}
    </Card>
  );
}

// === Small layout primitives ==============================================

function Header({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--text-secondary)",
          marginBottom: 4,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {title}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        borderTop: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        style={{
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "60%",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function HashRow({ label, hex }: { label: string; hex: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        borderTop: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <code
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 11,
          color: "var(--text-primary)",
        }}
      >
        {hex.slice(0, 16)}…{hex.slice(-6)}
      </code>
    </div>
  );
}

function LinkRow({
  items,
}: {
  items: Array<{ label: string; href: string } | null>;
}) {
  const live = items.filter(
    (i): i is { label: string; href: string } => i !== null,
  );
  if (live.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginTop: 10,
        flexWrap: "wrap",
      }}
    >
      {live.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12 }}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
