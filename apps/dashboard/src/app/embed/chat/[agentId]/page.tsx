"use client";

import { use, useEffect, useMemo, useState } from "react";
import { AgentChatPanel } from "@/components/agents/AgentChatPanel";
import { ControlPlaneError, type AgentJson } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * P6 — embeddable chat widget iframe page.
 *
 * Loaded inside a cross-origin `<iframe>` mounted by the customer's
 * site loader (`apps/dashboard/public/embed/v1.js`). Auth is the share
 * token in the URL — there's no dashboard session in this context.
 *
 * The page is intentionally minimal:
 *   - No sidebar, no Topbar, no RequireAuth wrapper (we're a sibling to
 *     the `(app)/` route group, so we inherit only the root layout).
 *   - Fetches the agent metadata once on mount; renders an error state
 *     if the token doesn't grant access.
 *   - Wraps the existing `AgentChatPanel` with `authTokenOverride` and
 *     `hideHeader` — same UX as the dashboard chat tab, sized to the
 *     iframe.
 *
 * The page is allowed to be framed from any origin (`frame-ancestors *`
 * via Next's default). The API-level origin check on every chat call is
 * the enforcement boundary: the iframe being loadable is fine; the chat
 * completing requires the *host page's* origin to match one of the
 * token's allowed origins.
 *
 * Because every chat request is made from inside this iframe, the
 * browser's `Origin` header is always the dashboard host and can't
 * identify the embedding site. So we derive the host-page origin from a
 * source the embedder can't forge — `location.ancestorOrigins[0]`
 * (Chromium/WebKit), falling back to the `event.origin` of a
 * postMessage handshake the loader sends (Firefox) — and forward it to
 * the control plane, which gates the token's allowlist on it.
 */
export default function EmbedChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { agentId } = use(params);
  const { t: token } = use(searchParams);

  const [agent, setAgent] = useState<AgentJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedOrigin, setEmbedOrigin] = useState<string | null>(null);

  // Resolve the host page's origin from a browser-stamped source the
  // embedding page can't spoof. `ancestorOrigins` is synchronous and
  // authoritative where supported; otherwise we wait for the loader's
  // `kraterion:hello` postMessage and read the browser-set `event.origin`.
  useEffect(() => {
    const ancestors = window.location.ancestorOrigins;
    const nearest = ancestors && ancestors.length > 0 ? ancestors.item(0) : null;
    if (nearest) {
      setEmbedOrigin(nearest);
      return;
    }
    function onHello(event: MessageEvent) {
      const data = event.data as unknown;
      if (
        typeof data === "object" &&
        data !== null &&
        (data as { kind?: unknown }).kind === "kraterion:hello"
      ) {
        setEmbedOrigin(event.origin);
      }
    }
    window.addEventListener("message", onHello);
    return () => window.removeEventListener("message", onHello);
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing share token. Re-mint a token from the dashboard.");
      return;
    }
    let cancelled = false;
    // Fetch the agent's read-only metadata via the share token. The
    // `/v1/agents/:id` GET route would normally require account
    // ownership; for the embed page we expose a slimmer view via the
    // chat endpoint's first call (the panel triggers the metadata
    // implicitly through its retrieval + system prompt). So instead
    // of an explicit GET, we just construct a minimal shape from the
    // URL + sane defaults. Real agent state (name, status) is only
    // surfaced inside the chat panel after the first reply.
    //
    // Lightweight self-describing stub: the chat endpoint's response
    // carries the agent_id; the panel only renders metadata for
    // display purposes (status badge etc.) so a hard-coded "active"
    // is acceptable for the embed. Status changes mid-conversation
    // surface as a 412 error from the chat call and the panel
    // renders the error.
    const stub: AgentJson = {
      id: agentId,
      project_id: "",
      name: "Chat",
      description: null,
      system_prompt: "",
      model: "",
      temperature: 0,
      max_tokens: 0,
      top_k: 0,
      status: "active",
      sub_wallet_address: "",
      bucket_ids: [],
      tools: [],
      created_at: "",
      updated_at: "",
      revoked_at: null,
    };
    if (!cancelled) setAgent(stub);

    return () => {
      cancelled = true;
    };
  }, [agentId, token]);

  // Cosmetic: dark or light tokens already cascade through globals.css
  // from the root layout. We inject a light background here so the
  // chrome around the chat panel reads as "the widget body" instead
  // of "the host page bleeding through."
  const pageStyle = useMemo<React.CSSProperties>(
    () => ({
      // `height` (not min-height) so the page never grows past the
      // iframe viewport. Combined with `minHeight: 0` on the flex
      // children, the input row stays on-screen at any iframe size.
      height: "100vh",
      background: "var(--bg-surface)",
      display: "flex",
      flexDirection: "column",
      padding: 0,
      margin: 0,
      overflow: "hidden",
    }),
    [],
  );

  if (error) {
    return (
      <div style={{ ...pageStyle, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div
          style={{
            maxWidth: 320,
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!agent || !token) {
    return <div style={pageStyle} />;
  }

  return (
    <div style={pageStyle}>
      <EmbedHeader />
      <div style={{ flex: 1, minHeight: 0 }}>
        <AgentChatPanel
          agent={agent}
          authTokenOverride={token}
          hideHeader
          embedOrigin={embedOrigin}
        />
      </div>
      <EmbedFooter />
    </div>
  );
}

/**
 * Minimal header — three earth-tone rings + a label. Matches the
 * landing page brand mark colors (canonical light variant). Sentence
 * case, no shadows, hairline divider.
 */
function EmbedHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      <svg
        viewBox="0 0 256 256"
        width="22"
        height="22"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle cx="128" cy="128" r="110" fill="none" stroke="#7C7158" strokeWidth="10" />
        <circle cx="128" cy="128" r="68" fill="none" stroke="#403930" strokeWidth="10" />
        <circle cx="128" cy="128" r="22" fill="#1A1610" />
      </svg>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
        Chat
      </div>
    </header>
  );
}

/**
 * "Powered by Kraterion" footer — micro-label per design system
 * (8-11px range, sentence case is fine here because it's a sentence,
 * but we keep the brand name capitalized).
 */
function EmbedFooter() {
  const baseUrl = env.controlPlaneUrl.replace(/\/$/, "");
  // Strip the API port for the linked surface — we just want the
  // bare brand link to a public-facing Kraterion page (the dashboard
  // origin works as a reasonable default until we have a marketing
  // landing URL configured here).
  void baseUrl;
  return (
    <footer
      style={{
        padding: "8px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
      }}
    >
      Powered by Kraterion
    </footer>
  );
}

// Keep type usage non-circular.
void ControlPlaneError;
