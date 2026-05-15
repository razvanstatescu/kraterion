"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import {
  ControlPlaneError,
  type AgentJson,
  type MintShareTokenResponse,
} from "@/lib/api";
import { env } from "@/lib/env";
import { useMintShareToken } from "@/lib/queries";

interface Props {
  open: boolean;
  agent: AgentJson;
  onClose: () => void;
}

const NAME_RE = /^[A-Za-z0-9 _.\-]{1,64}$/;
const ORIGIN_RE = /^https?:\/\/[^/\s]+$/;

/**
 * P6 — Mint a share token, reveal it once with the install snippet
 * pre-filled.
 *
 * Two stages:
 *   1. Form — name, origins (one per line), daily caps.
 *   2. Reveal — the cleartext token + install snippet + copy buttons.
 *
 * Closing the dialog drops the cleartext from state. The dashboard
 * never persists it client-side.
 */
export function CreateShareTokenDialog({ open, agent, onClose }: Props) {
  const { show } = useToast();
  const mint = useMintShareToken(agent.id);

  const [name, setName] = useState("");
  const [originsRaw, setOriginsRaw] = useState("");
  const [maxRequests, setMaxRequests] = useState<string>("1000");
  const [maxSpendUsd, setMaxSpendUsd] = useState<string>("5");
  const [citeSources, setCiteSources] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintShareTokenResponse | null>(null);
  const [copied, setCopied] = useState<"token" | "snippet" | null>(null);

  const busy = mint.isPending;
  const isTestnet = env.network !== "mainnet";

  useEffect(() => {
    if (open) {
      setName("");
      // Pre-fill with the dashboard's origin as a starting point —
      // most users embed on their own marketing site, which they'll
      // edit. Leaving it empty is the only failure mode where the
      // token mints "dormant" (the API refuses all origins until
      // the user adds one).
      setOriginsRaw("");
      setMaxRequests("1000");
      setMaxSpendUsd("5");
      setCiteSources(true);
      setError(null);
      setMinted(null);
      setCopied(null);
    }
  }, [open]);

  if (!open) return null;

  const onSubmit = async () => {
    // Local validation up-front so the user sees errors without
    // burning a network round-trip.
    if (!NAME_RE.test(name)) {
      setError(
        "Use 1–64 chars: letters, digits, spaces, dots, hyphens, underscores.",
      );
      return;
    }
    const origins = originsRaw
      .split(/\s+/)
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
    if (origins.length === 0) {
      setError("Add at least one origin (e.g. https://docs.example.com).");
      return;
    }
    for (const o of origins) {
      if (!ORIGIN_RE.test(o)) {
        setError(`"${o}" isn't a valid origin. Use https://host (no trailing path).`);
        return;
      }
    }
    const reqCap = maxRequests.trim() === "" ? null : Number(maxRequests);
    if (reqCap !== null && (!Number.isInteger(reqCap) || reqCap < 1)) {
      setError("Daily request cap must be a positive whole number, or blank for unlimited.");
      return;
    }
    const spendCap = maxSpendUsd.trim() === "" ? null : Number(maxSpendUsd);
    if (spendCap !== null && (!Number.isFinite(spendCap) || spendCap < 0)) {
      setError("Daily spend cap must be a positive number (in USD), or blank for unlimited.");
      return;
    }

    setError(null);
    try {
      const res = await mint.mutateAsync({
        name: name.trim(),
        allowed_origins: origins,
        max_requests_per_day: reqCap,
        max_spend_usd_per_day: spendCap,
        cite_sources: citeSources,
      });
      setMinted(res);
      show({
        tone: "success",
        title: `Share link "${res.share_token.name}" created`,
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the share link. Try again.";
      setError(message);
    }
  };

  const onCopy = async (which: "token" | "snippet", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Non-secure context — leave the textarea selectable.
    }
  };

  const snippet = minted
    ? buildSnippet({
        origin:
          typeof window !== "undefined"
            ? window.location.origin
            : "https://kraterion.app",
        agentId: agent.id,
        token: minted.token,
      })
    : "";

  return (
    <Portal>
      <div className="ks-modal-scrim" onClick={busy ? undefined : onClose}>
        <div
          className="ks-modal"
          style={{ width: 640, maxWidth: "calc(100vw - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ks-modal-head">
            <div style={{ fontSize: 18, fontWeight: 500 }}>
              {minted ? "Save your share link" : "New share link"}
            </div>
            <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
          </div>

          {minted ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Banner
                tone="warning"
                icon="alert"
                title="This is the only time the token is shown"
                body="The full token appears once. Save the snippet (or the token) somewhere you can paste it from later — revoke and re-mint if you lose it."
              />

              <FormField label="Cleartext token">
                <div
                  className="ks-codeline mono"
                  style={{ cursor: "default", background: "var(--stone-100)" }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {minted.token}
                  </span>
                  <button
                    className="icon-btn"
                    onClick={() => void onCopy("token", minted.token)}
                    title="Copy token"
                    type="button"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </div>
                {copied === "token" ? (
                  <div
                    className="ks-field-helper"
                    style={{ color: "var(--success)" }}
                  >
                    Copied
                  </div>
                ) : null}
              </FormField>

              <FormField
                label="Install snippet"
                helper="Paste anywhere in your site's HTML — before </body> works on every CMS."
              >
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: "var(--stone-100)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    fontFamily:
                      "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    overflowX: "auto",
                    whiteSpace: "pre",
                  }}
                >
                  {snippet}
                </pre>
                <div style={{ marginTop: 8 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="copy"
                    onClick={() => void onCopy("snippet", snippet)}
                  >
                    Copy snippet
                  </Button>
                  {copied === "snippet" ? (
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--success)",
                        fontSize: 12,
                      }}
                    >
                      Copied
                    </span>
                  ) : null}
                </div>
              </FormField>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="cta" onClick={onClose}>
                  I&apos;ve saved the snippet
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pill tone={isTestnet ? "info" : "success"} dot>
                  {isTestnet ? "Testnet" : "Mainnet"}
                </Pill>
                <span className="muted" style={{ fontSize: 13 }}>
                  You&apos;ll get a{" "}
                  <code className="mono">
                    {isTestnet ? "kr_share_test_…" : "kr_share_live_…"}
                  </code>{" "}
                  token scoped to this agent.
                </span>
              </div>

              <FormField
                label="Name"
                helper="A short label so you remember where this snippet is installed."
                required
              >
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="marketing site widget"
                  disabled={busy}
                />
              </FormField>

              <FormField
                label="Allowed origins"
                helper="One per line. Match exactly — protocol + host. e.g. https://docs.example.com"
                required
              >
                <textarea
                  className="input"
                  value={originsRaw}
                  onChange={(e) => setOriginsRaw(e.target.value)}
                  rows={3}
                  disabled={busy}
                  placeholder={"https://www.example.com\nhttps://docs.example.com"}
                  style={{ resize: "vertical", lineHeight: 1.55 }}
                />
              </FormField>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <FormField
                  label="Daily request cap"
                  helper="Leave blank for unlimited."
                >
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={maxRequests}
                    onChange={(e) => setMaxRequests(e.target.value)}
                    disabled={busy}
                    placeholder="1000"
                  />
                </FormField>
                <FormField
                  label="Daily spend cap (USD)"
                  helper="Per UTC day. Output tokens × model price."
                >
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={maxSpendUsd}
                    onChange={(e) => setMaxSpendUsd(e.target.value)}
                    disabled={busy}
                    placeholder="5"
                  />
                </FormField>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: busy ? "not-allowed" : "pointer",
                  background: citeSources
                    ? "var(--bg-elevated)"
                    : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={citeSources}
                  onChange={(e) => setCiteSources(e.target.checked)}
                  disabled={busy}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    Cite sources
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginTop: 4,
                      lineHeight: 1.55,
                    }}
                  >
                    When on, replies include inline{" "}
                    <code className="mono">[chunk N]</code> markers and a
                    Sources panel under each answer. Turn off for
                    public-facing widgets where surfacing internal source
                    paths is inappropriate — the model produces clean
                    prose grounded in the same retrieval, just without
                    visible references.
                  </div>
                </div>
              </label>

              {error ? <div className="ks-field-error">{error}</div> : null}

              <p className="lead" style={{ fontSize: 13 }}>
                Each chat call validates the request&apos;s{" "}
                <code>Origin</code> against the allow-list and bumps the
                daily counters before invoking the model. Revoking the
                token here kills traffic immediately.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="cta" onClick={onSubmit} loading={busy}>
                  {busy ? "Creating…" : "Create share link"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

function buildSnippet({
  origin,
  agentId,
  token,
}: {
  origin: string;
  agentId: string;
  token: string;
}): string {
  return `<script src="${origin}/embed/v1.js"
        data-agent-id="${agentId}"
        data-token="${token}"
        async></script>`;
}
