"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
 * the browser navigate to the returned `redirect_uri` — the MCP
 * client picks the code out of that URL and completes the flow.
 */
interface AuthorizeState {
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  scopes: string[];
  resource: string;
}

const SCOPE_COPY: Record<string, { title: string; body: string; icon: "search" | "upload" | "info" }> = {
  "mcp:read": {
    title: "Read buckets and objects",
    body: "List your buckets, list and fetch objects, and read returned content.",
    icon: "search",
  },
  "mcp:write": {
    title: "Write objects",
    body: "Create new objects in buckets it can already read.",
    icon: "upload",
  },
  "mcp:ask": {
    title: "Run Knowledge searches",
    body: "Query the hybrid search and ask endpoints on Knowledge-enabled buckets.",
    icon: "info",
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
      <Topbar
        crumbs={[{ label: "Authorize" }]}
        actions={<SignOutButton />}
      />
      <main className="ks-screen ks-consent">
        {loadError ? (
          <Banner tone="error" title="Can't show this request" body={loadError} />
        ) : !state ? (
          <div className="muted small">Loading authorization request…</div>
        ) : (
          <div className="ks-consent-card">
            <header className="ks-consent-head">
              <Pill tone="info">MCP authorization</Pill>
              <h1 className="ks-consent-title">
                Grant access to your Kraterion data?
              </h1>
              <p className="ks-consent-lead">
                <span className="ks-consent-client">
                  {state.client_name ?? "An MCP client"}
                </span>
                {" "}is requesting access to your buckets through the Kraterion
                MCP server.
              </p>
            </header>

            <section className="ks-consent-section">
              <div className="ks-section-label">Permissions</div>
              <ul className="ks-scope-list">
                {state.scopes.map((s) => {
                  const copy = SCOPE_COPY[s];
                  return (
                    <li key={s} className="ks-scope">
                      <span className="ks-scope-icon" aria-hidden="true">
                        <Icon name={copy?.icon ?? "info"} size={16} />
                      </span>
                      <span className="ks-scope-text">
                        <span className="ks-scope-title">
                          {copy?.title ?? s}
                        </span>
                        <span className="ks-scope-body">
                          {copy?.body ?? "Custom scope."}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="ks-consent-section">
              <div className="ks-section-label">Returns to</div>
              <code className="ks-consent-redirect">{state.redirect_uri}</code>
            </section>

            {postError ? (
              <Banner
                tone="error"
                title="Couldn't authorize"
                body={postError}
              />
            ) : null}

            <footer className="ks-consent-actions">
              <Button
                variant="ghost"
                onClick={() => decide(false)}
                disabled={busy}
              >
                Deny
              </Button>
              <Button
                variant="cta"
                onClick={() => decide(true)}
                disabled={busy}
                loading={busy}
              >
                Authorize
              </Button>
            </footer>
          </div>
        )}
      </main>
    </>
  );
}
