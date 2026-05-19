"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AgentCitationJson, AgentJson, AgentToolCallJson } from "@/lib/api";
import { findToolMeta } from "@/lib/agent-tools";
import { renderMarkdown } from "./markdown";
import { useCpSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { suiscanObjectUrl, walruscanUrl } from "@/lib/format";

interface Props {
  agent: AgentJson;
  /** Override the bearer token used to authenticate chat completions.
   *  Defaults to the signed-in dashboard session. The embed widget
   *  passes a `kr_share_*` token here — the iframe runs cross-origin
   *  and can't read the dashboard's localStorage session. */
  authTokenOverride?: string;
  /** Hide the "New chat" header bar — used by the embed widget where
   *  the launcher chrome already owns the close affordance. */
  hideHeader?: boolean;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AgentCitationJson[];
  /** Per-call tool trail. Keyed by tool_call_id so streaming
   *  `pending → completed` updates land on the same row. */
  toolCalls?: AgentToolCallJson[];
  pending?: boolean;
  errored?: boolean;
}

/**
 * Inline chat panel for an agent's detail page. Speaks the agent's
 * own `/chat/completions` endpoint with SSE streaming so the response
 * paints as it generates. Single-turn — multi-turn conversation
 * history is on the post-hackathon backlog.
 *
 * Citation strip: each assistant turn that ends with a `kraterion`
 * extension frame keeps the citations on the side; clicking through
 * opens the chunk's source object in the bucket browser and the
 * on-chain manifest blob (Walruscan) when available.
 */
export function AgentChatPanel({ agent, authTokenOverride, hideHeader }: Props) {
  const { session } = useCpSession();
  const authToken = authTokenOverride ?? session?.token;
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest turn as content streams in.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  // Hard-stop in-flight streams on unmount so we don't leak fetches.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const disabled = agent.status !== "active" || !authToken;

  const send = async () => {
    const message = input.trim();
    if (!message || streaming || disabled) return;
    // Build the conversation history we'll send on this turn: every
    // previously-completed turn in order, plus the new user message.
    // Pending / errored turns are excluded — there's no useful content
    // there, and including a pending row would race with the
    // setState below. We capture this BEFORE setTurns so we don't
    // depend on stale closure references.
    const messageHistory: Array<{ role: "user" | "assistant"; content: string }> = [
      ...turns
        .filter((t) => !t.pending && !t.errored && t.content.length > 0)
        .map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: message },
    ];

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
    };
    const assistantTurn: ChatTurn = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      pending: true,
    };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `${env.controlPlaneUrl}/v1/agents/${agent.id}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken!}`,
          },
          body: JSON.stringify({
            messages: messageHistory,
            stream: true,
            include_retrieval_info: true,
            include_citations: true,
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      // SSE reader. Each `data: { ... }` line is one frame; `[DONE]`
      // ends the stream. The Kraterion citation frame arrives as
      // `data: { "object": "kraterion.extension", ... }` just before
      // [DONE].
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let citations: AgentCitationJson[] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          if (!data) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          const frame = parsed as {
            object?: string;
            choices?: { delta?: { content?: string } }[];
            kraterion?: {
              citations?: AgentCitationJson[];
              tool_calls?: AgentToolCallJson[];
            };
            // kraterion.tool_call (per-call delta) shape:
            round?: number;
            tool_call_id?: string;
            tool_name?: string;
            status?: "pending" | "completed" | "failed";
            arguments?: unknown;
            output?: string;
            output_json?: unknown;
            tx_digest?: string;
            walrus_blob_id?: string;
            pooled_blob_object_id?: string;
            error_detail?: string;
            latency_ms?: number;
            error?: { message?: string };
          };
          if (frame.object === "error") {
            throw new Error(frame.error?.message ?? "Stream error");
          }
          if (frame.object === "kraterion.extension") {
            citations = frame.kraterion?.citations;
            // Replace the per-call deltas with the authoritative final
            // list (preserves order; lets us patch status/tx_digest).
            if (frame.kraterion?.tool_calls) {
              const finalCalls = frame.kraterion.tool_calls;
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantTurn.id ? { ...t, toolCalls: finalCalls } : t,
                ),
              );
            }
            continue;
          }
          if (frame.object === "kraterion.tool_call" && frame.tool_call_id) {
            const incoming: AgentToolCallJson = {
              tool_call_id: frame.tool_call_id,
              tool_name: frame.tool_name ?? "(unknown)",
              status: frame.status ?? "pending",
              round: frame.round ?? 0,
              arguments: frame.arguments,
              output: frame.output ?? null,
              output_json: frame.output_json,
              tx_digest: frame.tx_digest ?? null,
              walrus_blob_id: frame.walrus_blob_id ?? null,
              pooled_blob_object_id: frame.pooled_blob_object_id ?? null,
              error_detail: frame.error_detail ?? null,
              latency_ms: frame.latency_ms ?? null,
            };
            setTurns((prev) =>
              prev.map((t) => {
                if (t.id !== assistantTurn.id) return t;
                const existing = t.toolCalls ?? [];
                const at = existing.findIndex(
                  (c) => c.tool_call_id === incoming.tool_call_id,
                );
                const next =
                  at < 0
                    ? [...existing, incoming]
                    : existing.map((c, i) => (i === at ? incoming : c));
                return { ...t, toolCalls: next };
              }),
            );
            continue;
          }
          const delta = frame.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantTurn.id ? { ...t, content: accumulated } : t,
              ),
            );
          }
        }
      }

      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantTurn.id
            ? citations
              ? { ...t, pending: false, citations }
              : { ...t, pending: false }
            : t,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Stopped."
          : err instanceof Error
            ? err.message
            : "Couldn't send the message.";
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantTurn.id
            ? { ...t, pending: false, errored: true, content: message }
            : t,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  /**
   * "New chat" reset. Aborts any in-flight stream first (otherwise the
   * SSE reader keeps appending into a turn we just removed), then drops
   * every turn and the draft input. Cheap — no server-side conversation
   * state today, so the client wiping its own state is sufficient.
   */
  const resetChat = () => {
    abortRef.current?.abort();
    setTurns([]);
    setInput("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        // Dashboard chat tab uses a fixed 560px panel; the embed iframe
        // (hideHeader=true) flexes to fill its parent so the input row
        // stays on-screen regardless of the iframe's actual height.
        height: hideHeader ? "100%" : 560,
        // The embed iframe already has an outer border + radius via the
        // loader's `.kr-iframe-wrap` shell. Dropping the inner one
        // here avoids the "box inside a box" look and gives the chat
        // content the full iframe width.
        border: hideHeader ? "none" : "1px solid var(--border)",
        borderRadius: hideHeader ? 0 : "var(--radius-md)",
        background: "var(--bg-elevated)",
        minHeight: 0,
      }}
    >
      {hideHeader ? null : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            minHeight: 40,
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            onClick={resetChat}
            disabled={turns.length === 0 && !input}
            title="Start a fresh conversation. The current turns will be cleared from the panel; server-side audit rows stay intact."
          >
            New chat
          </Button>
        </div>
      )}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {turns.length === 0 ? (
          <div
            className="muted"
            style={{
              margin: "auto",
              textAlign: "center",
              fontSize: 13,
              maxWidth: 360,
            }}
          >
            Try a question grounded in the attached bucket
            {agent.bucket_ids.length === 1 ? "" : "s"}. Answers cite the chunks
            they're built from.
          </div>
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} />)
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: 12,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            disabled
              ? agent.status === "revoked"
                ? "Agent is revoked"
                : "Sign in to chat"
              : "Ask the agent…"
          }
          rows={2}
          disabled={disabled || streaming}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          style={{ resize: "none", lineHeight: 1.45 }}
        />
        {streaming ? (
          <Button variant="ghost" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="cta"
            onClick={() => void send()}
            disabled={disabled || input.trim().length === 0}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  const cited = turn.citations?.filter((c) => c.cited) ?? [];
  // Stable ids per-turn so multiple turns in the same conversation
  // don't collide when the inline badges scroll/expand the panel.
  const sourceDomId = (index: number) => `src-${turn.id}-${index}`;
  const panelDomId = `srcpanel-${turn.id}`;

  // Index → citation map for the inline badge resolver. The model's
  // `[chunk N]` numbers use the citation's `index` field (1-based
  // position in the retrieved top-K), so this lookup matches what
  // the model actually wrote.
  const citationByIndex = new Map<number, AgentCitationJson>();
  for (const c of cited) citationByIndex.set(c.index, c);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: isUser ? "flex-end" : "stretch",
      }}
    >
      <div
        className={isUser ? undefined : "ks-md-bubble"}
        style={{
          maxWidth: isUser ? "82%" : "100%",
          alignSelf: isUser ? "flex-end" : "flex-start",
          padding: "10px 14px",
          borderRadius: "var(--radius-md)",
          background: isUser
            ? "var(--krater)"
            : turn.errored
              ? "var(--stone-100)"
              : "var(--bg-surface)",
          color: isUser
            ? "var(--cream)"
            : turn.errored
              ? "var(--error)"
              : "var(--text-primary)",
          border: isUser ? "none" : "1px solid var(--border)",
          fontSize: 14,
          lineHeight: 1.6,
          // User turn = plain text typed by the user → preserve
          // exact whitespace. Assistant turn = markdown blocks own
          // their spacing (we'd double up if pre-wrap was on too).
          whiteSpace: isUser ? "pre-wrap" : "normal",
          overflowWrap: "anywhere",
        }}
      >
        {turn.content ? (
          isUser ? (
            // User text rendered verbatim (no markdown — typing
            // `**bold**` should land as literal asterisks).
            turn.content
          ) : (
            renderMarkdown(turn.content, {
              citationByIndex,
              sourceDomId,
              panelDomId,
              CitationBadge,
            })
          )
        ) : turn.pending ? (
          <Typing />
        ) : null}
      </div>
      {turn.toolCalls && turn.toolCalls.length > 0 ? (
        <ToolCallList toolCalls={turn.toolCalls} />
      ) : null}
      {cited.length > 0 ? (
        <SourcesCard
          citations={cited}
          sourceDomId={sourceDomId}
          panelDomId={panelDomId}
        />
      ) : null}
    </div>
  );
}

/**
 * Compact "Tools used" callout rendered under an assistant message.
 * Each row carries the tool name, a one-line argument summary, the
 * status (running / done / failed) and — for writes — the on-chain
 * `tx_digest` linked to Suiscan. Errors get an inline detail string.
 */
function ToolCallList({ toolCalls }: { toolCalls: AgentToolCallJson[] }) {
  return (
    <details className="ks-tool-calls" open>
      <summary className="ks-tool-calls-summary">
        <Icon name="settings" size={14} strokeWidth={1.6} />
        <span>Tools used</span>
        <span className="ks-tool-calls-count">{toolCalls.length}</span>
      </summary>
      <div className="ks-tool-calls-list">
        {toolCalls.map((tc) => {
          const meta = findToolMeta(tc.tool_name);
          const label = meta?.label ?? tc.tool_name;
          const dotTone =
            tc.status === "completed"
              ? "var(--success)"
              : tc.status === "failed"
                ? "var(--error)"
                : "var(--text-tertiary)";
          return (
            <div key={tc.tool_call_id} className="ks-tool-call-row">
              <span
                className="ks-tool-call-dot"
                style={{ background: dotTone }}
                aria-hidden
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ks-tool-call-line">
                  <span className="ks-tool-call-label">{label}</span>
                  <code className="ks-tool-call-args">
                    {summarizeArgs(tc.arguments)}
                  </code>
                </div>
                {tc.status === "failed" && tc.error_detail ? (
                  <div className="ks-tool-call-error">{tc.error_detail}</div>
                ) : null}
                {tc.tx_digest ? (
                  <a
                    className="ks-tool-call-link"
                    href={suiscanTxUrl(tc.tx_digest)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="arrow-up-right" size={14} strokeWidth={1.6} />
                    <span className="mono">{tc.tx_digest.slice(0, 8)}…</span>
                    <span>· view on Suiscan</span>
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function summarizeArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args !== "object") return String(args);
  const obj = args as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "()";
  return entries
    .map(([k, v]) => {
      if (typeof v === "string") {
        const trimmed = v.length > 40 ? `${v.slice(0, 40)}…` : v;
        return `${k}=${JSON.stringify(trimmed)}`;
      }
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(" ");
}

function suiscanTxUrl(digest: string): string {
  const network = env.network === "mainnet" ? "mainnet" : "testnet";
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

// Citation-only inline renderer was replaced by full markdown support
// in `./markdown.tsx` (2026-05-13). The same `[chunk N]` resolution
// lives there — see `renderMarkdown`'s inline pass.

function CitationBadge({
  n,
  targetId,
  panelId,
}: {
  n: number;
  targetId: string;
  panelId: string;
}) {
  const onClick = () => {
    // Force-open the collapsible Sources panel so the row is visible
    // before we scroll to it. Native <details> exposes `.open` and
    // re-rendering React state on click would race the scroll.
    const panel = document.getElementById(panelId);
    if (panel instanceof HTMLDetailsElement && !panel.open) panel.open = true;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ks-source-row-flash");
    window.setTimeout(() => el.classList.remove("ks-source-row-flash"), 1400);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Jump to source ${n}`}
      className="ks-citation-badge"
    >
      {n}
    </button>
  );
}

function SourcesCard({
  citations,
  sourceDomId,
  panelDomId,
}: {
  citations: AgentCitationJson[];
  sourceDomId: (index: number) => string;
  panelDomId: string;
}) {
  return (
    <details
      id={panelDomId}
      className="ks-sources-details"
      style={{ alignSelf: "flex-start", width: "100%", maxWidth: 720 }}
    >
      <summary className="ks-sources-summary">
        <Icon
          name="chevron"
          size={14}
          className="ks-sources-chevron"
          aria-hidden="true"
        />
        <span>Sources</span>
        <span className="ks-sources-count">{citations.length}</span>
      </summary>
      <div className="ks-sources-list">
        {citations.map((c, i) => (
          <SourceRow
            key={c.chunk_hash}
            citation={c}
            id={sourceDomId(c.index)}
            divider={i > 0}
          />
        ))}
      </div>
    </details>
  );
}

function SourceRow({
  citation,
  id,
  divider,
}: {
  citation: AgentCitationJson;
  id: string;
  divider: boolean;
}) {
  return (
    <div
      id={id}
      style={{
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr) auto",
        columnGap: 10,
        alignItems: "center",
        padding: "6px 10px",
        borderTop: divider ? "1px solid var(--border)" : "none",
        transition: "background var(--dur-base) var(--ease)",
      }}
    >
      <span className="ks-source-num" aria-hidden="true">
        {citation.index}
      </span>
      <div
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {citation.s3_key}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            flexShrink: 0,
          }}
        >
          · #{citation.ordinal}
        </span>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        <Link
          href={`/buckets/${citation.bucket_id}`}
          aria-label="Open in bucket"
          title="Open in bucket"
          className="ks-source-action"
        >
          <Icon name="folder" size={14} />
        </Link>
        <a
          href={walruscanUrl(citation.source_walrus_blob_id)}
          target="_blank"
          rel="noreferrer"
          aria-label="Source blob on Walruscan"
          title="View on Walrus"
          className="ks-source-action"
        >
          <Icon name="database" size={14} />
        </a>
        {citation.manifest_walrus_blob_id ? (
          <a
            href={walruscanUrl(citation.manifest_walrus_blob_id)}
            target="_blank"
            rel="noreferrer"
            aria-label="Indexing manifest on Walruscan"
            title="On-chain manifest"
            className="ks-source-action"
          >
            <Icon name="check" size={14} />
          </a>
        ) : null}
        {citation.source_pooled_blob_object_id ? (
          <a
            href={suiscanObjectUrl(citation.source_pooled_blob_object_id, env.network)}
            target="_blank"
            rel="noreferrer"
            aria-label="PooledBlob on Suiscan"
            title="On Sui"
            className="ks-source-action"
          >
            <Icon name="link-2" size={14} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Typing() {
  // Simple three-dot ellipsis with a CSS keyframe pulse. Inline so we
  // don't need a globals.css addition; ks-typing-* classes are added
  // there alongside the agents work for reuse if other surfaces need
  // typing indicators later.
  return (
    <span
      aria-label="The agent is replying"
      style={{
        display: "inline-flex",
        gap: 4,
        color: "var(--text-tertiary)",
        verticalAlign: "middle",
      }}
    >
      <span className="ks-typing-dot" />
      <span className="ks-typing-dot" />
      <span className="ks-typing-dot" />
    </span>
  );
}

