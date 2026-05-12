"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError, cpFetch } from "@/lib/api";

/**
 * OAuth 2.1 consent screen for the MCP `/mcp` resource (K3b).
 *
 * Lands here after CP's `GET /oauth/authorize` validates the request
 * and 302s to `${DASHBOARD_ORIGIN}/oauth/consent?request_id=...`.
 *
 * We re-fetch the stashed request via authenticated
 * `GET /oauth/authorize/state` so a tampered URL still hits validated
 * state. On approve/deny we `POST /oauth/authorize/decision` and let
 * the browser navigate to the returned `redirect_uri` (which carries
 * the auth code back to the MCP client).
 */
interface AuthorizeState {
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  scopes: string[];
  resource: string;
}

const SCOPE_COPY: Record<string, { title: string; body: string }> = {
  "mcp:read": {
    title: "Read buckets and objects",
    body: "List your buckets, list and fetch objects, and read returned content.",
  },
  "mcp:write": {
    title: "Write objects",
    body: "Create new objects in buckets it can already read.",
  },
  "mcp:ask": {
    title: "Run Knowledge searches",
    body: "Query the hybrid search and ask endpoints on Knowledge-enabled buckets.",
  },
};

export default function ConsentPage() {
  const params = useSearchParams();
  const requestId = params?.get("request_id") ?? "";

  const [state, setState] = useState<AuthorizeState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setLoadError("This consent link is missing its request id.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await cpFetch<AuthorizeState>(
          `/oauth/authorize/state?request_id=${encodeURIComponent(requestId)}`,
        );
        if (!cancelled) setState(res);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Couldn't load the authorization request.";
        setLoadError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setPostError(null);
    try {
      const res = await cpFetch<{ redirect_uri: string }>(
        "/oauth/authorize/decision",
        { method: "POST", body: { request_id: requestId, approve } },
      );
      window.location.replace(res.redirect_uri);
    } catch (err) {
      const msg =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't submit the decision.";
      setPostError(msg);
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar crumbs={[{ label: "Authorize" }]} />
      <main className="ks-page" style={{ maxWidth: 640 }}>
        {loadError ? (
          <Banner tone="error" title="Can't show this request" body={loadError} />
        ) : !state ? (
          <Card>
            <div style={{ padding: 24, color: "var(--text-secondary)" }}>
              Loading authorization request…
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ padding: 24, display: "grid", gap: 20 }}>
              <header style={{ display: "grid", gap: 8 }}>
                <Pill tone="info">MCP authorization</Pill>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>
                  Grant access to your Kraterion data?
                </h1>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                    {state.client_name ?? "An MCP client"}
                  </strong>{" "}
                  is requesting access to your buckets through the Kraterion MCP server.
                </p>
              </header>

              <section style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Permissions
                </h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                  {state.scopes.map((s) => {
                    const copy = SCOPE_COPY[s];
                    return (
                      <li
                        key={s}
                        style={{
                          padding: 16,
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {copy?.title ?? s}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          {copy?.body ?? "Custom scope."}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section style={{ display: "grid", gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Returns to
                </h2>
                <code style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {state.redirect_uri}
                </code>
              </section>

              {postError ? (
                <Banner tone="error" title="Couldn't authorize" body={postError} />
              ) : null}

              <footer style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => decide(false)} disabled={busy}>
                  Deny
                </Button>
                <Button onClick={() => decide(true)} disabled={busy}>
                  {busy ? "Authorizing…" : "Authorize"}
                </Button>
              </footer>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
