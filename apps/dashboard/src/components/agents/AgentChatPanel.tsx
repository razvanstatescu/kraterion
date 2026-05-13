"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import type { AgentCitationJson, AgentJson } from "@/lib/api";
import { useCpSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { walruscanUrl } from "@/lib/format";

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
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
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
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {turn.content || (turn.pending ? <Typing /> : null)}
      </div>
      {turn.citations && turn.citations.some((c) => c.cited) ? (
        <CitationStrip citations={turn.citations.filter((c) => c.cited)} />
      ) : null}
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

function CitationStrip({ citations }: { citations: AgentCitationJson[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 4,
      }}
    >
      {citations.map((c) => (
        <a
          key={`${c.chunk_hash}`}
          href={walruscanUrl(c.source_walrus_blob_id)}
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Pill>
            <Icon name="link-2" size={14} />
            <span
              className="mono"
              style={{
                fontSize: 11,
                marginLeft: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 220,
                display: "inline-block",
                verticalAlign: "middle",
              }}
            >
              {c.s3_key}#{c.ordinal}
            </span>
          </Pill>
        </a>
      ))}
    </div>
  );
}
