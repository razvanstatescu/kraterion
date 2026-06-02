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
  useRunReplay,
  type AgentSessionJson,
} from "@/lib/queries";

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
          alignItems: "center",
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
            style={{ fontSize: 12 }}
          >
            <Icon name="link" size={14} /> Suiscan
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

function ReplayInline({ txDigest }: { txDigest: string }) {
  const [rerun, setRerun] = useState(false);
  const replay = useRunReplay({ txDigest, rerun });

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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRerun(true)}
          disabled={rerun}
        >
          {rerun ? "Replaying…" : "Re-run against OpenAI"}
        </Button>
      </div>

      {data.replay ? (
        <ReplayDiff replay={data.replay} />
      ) : (
        <TraceInvocations invocations={invocations} />
      )}
    </div>
  );
}

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
