"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AgentCitationJson, AgentJson } from "@/lib/api";
import { useCpSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { suiscanObjectUrl, walruscanUrl } from "@/lib/format";

interface Props {
  agent: AgentJson;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AgentCitationJson[];
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
export function AgentChatPanel({ agent }: Props) {
  const { session } = useCpSession();
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

  const disabled = agent.status !== "active" || !session?.token;

  const send = async () => {
    const message = input.trim();
    if (!message || streaming || disabled) return;
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
            Authorization: `Bearer ${session!.token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: message }],
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
            kraterion?: { citations?: AgentCitationJson[] };
            error?: { message?: string };
          };
          if (frame.object === "error") {
            throw new Error(frame.error?.message ?? "Stream error");
          }
          if (frame.object === "kraterion.extension") {
            citations = frame.kraterion?.citations;
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: 560,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elevated)",
      }}
    >
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
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {turn.content
          ? renderAssistantContent(
              turn.content,
              citationByIndex,
              sourceDomId,
              panelDomId,
            )
          : turn.pending
            ? <Typing />
            : null}
      </div>
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
 * Parse assistant text for `[chunk N]` citation markers and replace
 * each with a clickable inline badge that scrolls to the matching
 * source row below. Plain text segments render unchanged.
 *
 * The model is instructed (in the agent's system prompt prelude) to
 * cite using `[chunk N]` markers, where `N` is the 1-indexed position
 * in the retrieval block. The same `N` appears as `index` on the
 * citation row, so we can map markers → sources without ambiguity.
 *
 * Unresolvable markers (out-of-range, hallucinated) render as plain
 * text — the model lying about which chunk it used shouldn't crash
 * the renderer. Same defensive policy as the citation resolver on
 * the backend.
 */
function renderAssistantContent(
  text: string,
  citationByIndex: Map<number, AgentCitationJson>,
  sourceDomId: (index: number) => string,
  panelDomId: string,
): ReactNode[] {
  const re = /\[chunk\s+(\d+)\]/gi;
  const out: ReactNode[] = [];
  let cursor = 0;
  let nodeKey = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      out.push(<span key={`t-${nodeKey++}`}>{text.slice(cursor, m.index)}</span>);
    }
    const n = Number(m[1]);
    const citation = citationByIndex.get(n);
    if (citation) {
      out.push(
        <CitationBadge
          key={`b-${nodeKey++}`}
          n={n}
          targetId={sourceDomId(citation.index)}
          panelId={panelDomId}
        />,
      );
    } else {
      // Drop the marker entirely if it doesn't resolve — printing
      // `[chunk 7]` raw is the noise that prompted this whole change.
      // The space we ate from the surrounding text is preserved by
      // the slice above.
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push(<span key={`t-${nodeKey++}`}>{text.slice(cursor)}</span>);
  }
  return out;
}

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
        <a
          href={suiscanObjectUrl(citation.source_shared_blob_object_id, env.network)}
          target="_blank"
          rel="noreferrer"
          aria-label="SharedBlob on Suiscan"
          title="On Sui"
          className="ks-source-action"
        >
          <Icon name="link-2" size={14} />
        </a>
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

