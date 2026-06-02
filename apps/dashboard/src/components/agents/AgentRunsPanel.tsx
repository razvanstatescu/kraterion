"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { type AgentJson } from "@/lib/api";
import { formatRelative, suiscanTxUrl } from "@/lib/format";
import {
  useAgentSessions,
  useRunLineage,
  useRunReplay,
  type AgentSessionJson,
} from "@/lib/queries";
import { LineageGraph } from "./LineageGraph";
import { LineageNodeDetail } from "./LineageNodeDetail";
import type { LineageNodeData } from "./lineage-nodes";

interface Props {
  agent: AgentJson;
}

/**
 * P9 (D12) — Agent detail "Runs" tab.
 *
 * Renders the agent's recent anchored sessions and lets the user open
 * one to inspect the on-chain trace + optionally re-execute the
 * captured turns. Mirrors the CLI's behaviour in a UI surface for the
 * demo flow.
 */
export function AgentRunsPanel({ agent }: Props) {
  const sessions = useAgentSessions(agent.id);
  const [openDigest, setOpenDigest] = useState<string | null>(null);

  if (sessions.isLoading) {
    return (
      <Card style={{ padding: 24 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Loading runs…
        </div>
      </Card>
    );
  }
  if (sessions.error) {
    return (
      <Banner
        tone="error"
        title="Could not load runs"
        body="Refresh the page or try again in a moment."
      />
    );
  }
  const rows = sessions.data?.sessions ?? [];
  if (rows.length === 0) {
    return (
      <Banner
        tone="info"
        title="No runs yet"
        body={
          <>
            Each chat turn rolls into an <strong>AgentSession</strong>.
            Sessions go idle after this project&apos;s
            <code> session_idle_seconds </code>
            and the worker anchors the trace on chain. They&apos;ll show
            up here, latest first.
          </>
        }
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <SessionRow
            key={row.id}
            row={row}
            expanded={row.tx_digest === openDigest}
            onToggle={() => {
              if (!row.tx_digest) return;
              setOpenDigest(
                openDigest === row.tx_digest ? null : row.tx_digest,
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SessionRow({
  row,
  expanded,
  onToggle,
}: {
  row: AgentSessionJson;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canOpen = row.tx_digest !== null && row.status === "anchored";
  return (
    <Card
      style={{
        padding: 16,
        opacity: canOpen ? 1 : 0.7,
      }}
    >
      <div
        onClick={canOpen ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          cursor: canOpen ? "pointer" : "default",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusPill status={row.status} />
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--text-secondary)" }}
            >
              {row.invocation_count} turn{row.invocation_count === 1 ? "" : "s"}
            </span>
            <span
              className="muted"
              style={{ fontSize: 12 }}
            >
              · {formatRelative(row.opened_at)}
            </span>
            {row.close_reason ? (
              <span
                className="muted"
                style={{ fontSize: 12 }}
              >
                · closed: {row.close_reason}
              </span>
            ) : null}
          </div>
          {row.tx_digest ? (
            <div
              className="mono"
              style={{ fontSize: 11, marginTop: 6, color: "var(--text-secondary)" }}
            >
              {row.tx_digest.slice(0, 18)}…{row.tx_digest.slice(-6)}
            </div>
          ) : null}
        </div>
        {row.tx_digest ? (
          <a
            href={suiscanTxUrl(row.tx_digest)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <Icon name="link" size={14} />
            Suiscan
          </a>
        ) : null}
      </div>
      {expanded && row.tx_digest ? (
        <div style={{ marginTop: 16 }}>
          <ReplayInline txDigest={row.tx_digest} />
        </div>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }: { status: AgentSessionJson["status"] }) {
  switch (status) {
    case "anchored":
      return (
        <Pill tone="success" dot>
          anchored
        </Pill>
      );
    case "open":
      return (
        <Pill tone="info" dot>
          open
        </Pill>
      );
    case "flushing":
      return (
        <Pill tone="warning" dot>
          flushing
        </Pill>
      );
    case "failed":
      return (
        <Pill tone="error" dot>
          failed
        </Pill>
      );
    default:
      return <Pill>{status}</Pill>;
  }
}

type ReplayView = "trace" | "lineage";

function ReplayInline({ txDigest }: { txDigest: string }) {
  const [rerun, setRerun] = useState(false);
  const [view, setView] = useState<ReplayView>("trace");
  const [selectedNode, setSelectedNode] = useState<LineageNodeData | null>(null);
  const replay = useRunReplay({ txDigest, rerun });
  const lineage = useRunLineage(view === "lineage" ? txDigest : undefined);

  if (replay.isLoading) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        Fetching trace…
      </div>
    );
  }
  if (replay.error) {
    return (
      <Banner
        tone="error"
        title="Could not load trace"
        body={
          replay.error instanceof Error ? replay.error.message : "Try again."
        }
      />
    );
  }
  const data = replay.data;
  if (!data) return null;

  const trace = data.trace as Record<string, unknown>;
  const invocations = (trace["invocations"] ?? []) as Array<
    Record<string, unknown>
  >;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12 }}>
          <span
            style={{
              color: data.trace_hash_matches ? "var(--success)" : "var(--error)",
            }}
          >
            {data.trace_hash_matches ? "✓" : "✗"} trace_hash{" "}
            {data.trace_hash_matches ? "matches" : "MISMATCH"}
          </span>
          <span
            className="mono muted"
            style={{ marginLeft: 8, fontSize: 11 }}
          >
            {data.trace_hash_hex.slice(0, 16)}…
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ViewToggle value={view} onChange={setView} />
          {view === "trace" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRerun(true)}
              disabled={rerun}
            >
              {rerun ? "Replaying…" : "Re-run against OpenAI"}
            </Button>
          ) : null}
        </div>
      </div>

      {view === "trace" ? (
        data.replay ? (
          <ReplayDiff replay={data.replay} />
        ) : (
          <TraceInvocations invocations={invocations} />
        )
      ) : (
        <LineageView
          txDigest={txDigest}
          query={lineage}
          selectedNode={selectedNode}
          onSelect={setSelectedNode}
        />
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ReplayView;
  onChange: (v: ReplayView) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <ToggleButton active={value === "trace"} onClick={() => onChange("trace")}>
        Trace
      </ToggleButton>
      <ToggleButton
        active={value === "lineage"}
        onClick={() => onChange("lineage")}
      >
        Lineage
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--surface-elevated, var(--surface))" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        border: "none",
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LineageView({
  query,
  selectedNode,
  onSelect,
}: {
  txDigest: string;
  query: ReturnType<typeof useRunLineage>;
  selectedNode: LineageNodeData | null;
  onSelect: (node: LineageNodeData | null) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        Building lineage envelope…
      </div>
    );
  }
  if (query.error) {
    return (
      <Banner
        tone="error"
        title="Could not load lineage"
        body={
          query.error instanceof Error ? query.error.message : "Try again."
        }
      />
    );
  }
  if (!query.data) return null;
  // Side-by-side layout: graph on the left (flexible), inspector
  // sticky on the right. The rail uses `position: sticky` so it
  // stays visible while the user pans/zooms inside the graph card
  // — no more "click node, scroll down to inspect" trip. Stacks
  // below the graph on narrower viewports.
  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        alignItems: "start",
      }}
      className="ks-lineage-layout"
    >
      <style>{LINEAGE_LAYOUT_CSS}</style>
      <div style={{ minWidth: 0 }}>
        <LineageGraph envelope={query.data} onNodeClick={onSelect} />
      </div>
      <div
        style={{
          position: "sticky",
          top: 16,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
        }}
      >
        <LineageNodeDetail
          node={selectedNode}
          sessionAnchorDigest={query.data.session.anchored_tx_digest}
        />
      </div>
    </div>
  );
}

/** Stack the inspector below the graph at narrow viewports — the rail
 *  fixed-width column is fine on a laptop but pinches the canvas on
 *  smaller screens. Breakpoint matches the dashboard's medium gutter. */
const LINEAGE_LAYOUT_CSS = `
@media (max-width: 960px) {
  .ks-lineage-layout {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .ks-lineage-layout > div:last-child {
    position: static !important;
    max-height: none !important;
  }
}
`;

function TraceInvocations({
  invocations,
}: {
  invocations: Array<Record<string, unknown>>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {invocations.map((inv, i) => {
        const input = (inv["input"] as Record<string, unknown>) ?? {};
        const output = (inv["output"] as Record<string, unknown>) ?? {};
        const text = String(output["text"] ?? "");
        const user = String(input["last_user_message"] ?? "");
        return (
          <div
            key={String(inv["invocation_id"] ?? i)}
            style={{
              padding: 12,
              borderRadius: 8,
              background: "var(--surface-elevated)",
            }}
          >
            <div
              className="muted"
              style={{ fontSize: 11, marginBottom: 8 }}
            >
              turn {String(inv["ordinal"] ?? i)}
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>user:</strong> {truncate(user, 280)}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>assistant:</strong> {truncate(text, 600)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReplayDiff({
  replay,
}: {
  replay: NonNullable<
    ReturnType<typeof useRunReplay>["data"]
  >["replay"];
}) {
  if (!replay) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12 }}>
        {replay.any_output_differs ? (
          <span style={{ color: "var(--warning)" }}>
            ⚠ Some turns drifted from the captured run.
          </span>
        ) : (
          <span style={{ color: "var(--success)" }}>
            ✓ All turns reproduced verbatim.
          </span>
        )}
        {replay.any_fingerprint_mismatch ? (
          <span
            className="muted"
            style={{ marginLeft: 8, fontSize: 12 }}
          >
            (OpenAI fingerprint drift detected)
          </span>
        ) : null}
      </div>
      {replay.turns.map((turn) => (
        <div
          key={turn.invocation_id}
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--surface-elevated)",
          }}
        >
          <div
            className="muted"
            style={{ fontSize: 11, marginBottom: 8 }}
          >
            turn {turn.ordinal} ·{" "}
            {turn.system_fingerprint_matched
              ? "fingerprint matched"
              : "fingerprint drifted"}
          </div>
          {turn.diff.differs ? (
            <pre
              className="mono"
              style={{
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
              }}
            >
              {turn.diff.lines.map((line, idx) => (
                <span
                  key={idx}
                  style={{
                    display: "block",
                    color:
                      line.kind === "captured"
                        ? "var(--error)"
                        : line.kind === "replay"
                          ? "var(--success)"
                          : "var(--text-secondary)",
                  }}
                >
                  {line.kind === "equal"
                    ? "  "
                    : line.kind === "captured"
                      ? "- "
                      : "+ "}
                  {line.text}
                </span>
              ))}
            </pre>
          ) : (
            <div style={{ fontSize: 13 }}>
              <strong>output:</strong> {truncate(turn.replay_output, 600)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
