"use client";

import { useMemo, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import {
  ControlPlaneError,
  type AgentJson,
  type ShareTokenJson,
} from "@/lib/api";
import { env } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import {
  useRevokeShareToken,
  useShareTokens,
} from "@/lib/queries";
import { CreateShareTokenDialog } from "./CreateShareTokenDialog";
import { EditShareTokenDialog } from "./EditShareTokenDialog";

interface Props {
  agent: AgentJson;
}

/**
 * P6 — Embed widget management surface.
 *
 * Lists every share token minted against this agent and lets the user
 * mint a new one or revoke an existing row. Each token gets the
 * install snippet pre-filled when minted (the cleartext is shown
 * exactly once); for older tokens the snippet shows the prefix only
 * so the user knows which one they're looking at — they have to keep
 * their saved cleartext for the actual install.
 */
export function AgentSharePanel({ agent }: Props) {
  const { show } = useToast();
  const { data, error, isLoading } = useShareTokens(agent.id);
  const revoke = useRevokeShareToken(agent.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<ShareTokenJson | null>(null);
  const [editTarget, setEditTarget] = useState<ShareTokenJson | null>(null);

  const tokens = data?.share_tokens ?? [];
  const active = useMemo(() => tokens.filter((t) => !t.revoked_at), [tokens]);
  const revoked = useMemo(() => tokens.filter((t) => t.revoked_at), [tokens]);

  const onRevoke = async () => {
    if (!confirmRevoke) return;
    try {
      await revoke.mutateAsync(confirmRevoke.id);
      show({
        tone: "success",
        title: `Revoked "${confirmRevoke.name}"`,
        body: "The widget on that site will fail its next request with 401.",
      });
      setConfirmRevoke(null);
    } catch (err) {
      show({
        tone: "error",
        title: "Revoke failed",
        body:
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Try again.",
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              Embed on your site
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 4,
                lineHeight: 1.55,
              }}
            >
              Paste a one-line <code>&lt;script&gt;</code> on any page to drop
              this agent as a floating chat widget. Each share token is
              scoped to one or more origins and capped at a daily request
              + dollar limit — runaway widgets can&apos;t drain your
              project budget.
            </div>
          </div>
          <Button
            variant="cta"
            icon="plus"
            onClick={() => setCreateOpen(true)}
            disabled={agent.status !== "active"}
          >
            New share link
          </Button>
        </div>

        {agent.status !== "active" ? (
          <div style={{ padding: 20 }}>
            <Banner
              tone="warning"
              title="Agent revoked"
              body="Existing share tokens are dormant. Restore the agent before minting a new token."
            />
          </div>
        ) : null}

        {error ? (
          <div style={{ padding: 20 }}>
            <Banner
              tone="error"
              title="Couldn't load share tokens"
              body={error instanceof ControlPlaneError ? error.message : "Try again."}
            />
          </div>
        ) : null}

        {isLoading ? (
          <div style={{ padding: 20, fontSize: 13 }} className="muted">
            Loading…
          </div>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon="link-2"
            title="No share links yet"
            body="Mint a share link to drop this agent as a chat widget on a website. We'll give you a one-line snippet."
            action={
              <Button
                variant="cta"
                icon="plus"
                onClick={() => setCreateOpen(true)}
                disabled={agent.status !== "active"}
              >
                New share link
              </Button>
            }
          />
        ) : (
          <ShareTokenTable
            rows={[...active, ...revoked]}
            onEdit={(t) => setEditTarget(t)}
            onRevoke={(t) => setConfirmRevoke(t)}
          />
        )}
      </Card>

      {active[0] ? <InstallSnippetCard agent={agent} token={active[0]} /> : null}

      <CreateShareTokenDialog
        open={createOpen}
        agent={agent}
        onClose={() => setCreateOpen(false)}
      />

      <EditShareTokenDialog
        open={editTarget !== null}
        agentId={agent.id}
        token={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmModal
        open={confirmRevoke !== null}
        onCancel={() => (revoke.isPending ? undefined : setConfirmRevoke(null))}
        onConfirm={onRevoke}
        busy={revoke.isPending}
        danger
        confirmLabel={revoke.isPending ? "Revoking…" : "Revoke share link"}
        title={`Revoke "${confirmRevoke?.name ?? ""}"?`}
        body={
          <>
            <p>
              The widget on every site using this token stops working
              immediately. Any in-flight chats fail with{" "}
              <code>401 Unauthorized</code>.
            </p>
            <p style={{ marginTop: 8 }}>
              You can&apos;t un-revoke — mint a new share link if you need
              continued access.
            </p>
          </>
        }
      />
    </div>
  );
}

function ShareTokenTable({
  rows,
  onEdit,
  onRevoke,
}: {
  rows: ShareTokenJson[];
  onEdit: (t: ShareTokenJson) => void;
  onRevoke: (t: ShareTokenJson) => void;
}) {
  return (
    <div className="ks-table" style={{ border: "none", borderRadius: 0 }}>
      <div className="ks-thead">
        <div style={{ flex: "2 1 0" }}>Name</div>
        <div style={{ flex: "2 1 0" }}>Token</div>
        <div style={{ flex: "2 1 0" }}>Origins</div>
        <div style={{ flex: "1 1 0" }}>Daily caps</div>
        <div style={{ flex: "1 1 0" }}>Status</div>
        <div style={{ width: 140 }} />
      </div>
      {rows.map((t) => {
        const revoked = Boolean(t.revoked_at);
        return (
          <div
            key={t.id}
            className="ks-trow"
            style={{ cursor: "default", opacity: revoked ? 0.55 : 1 }}
          >
            <div style={{ flex: "2 1 0", minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                created {formatRelative(t.created_at)}
              </div>
            </div>
            <div
              style={{
                flex: "2 1 0",
                fontFamily:
                  "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                fontSize: 13,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.token_prefix}
            </div>
            <div
              style={{
                flex: "2 1 0",
                fontSize: 12,
                color: "var(--text-secondary)",
                minWidth: 0,
              }}
            >
              {t.allowed_origins.length === 0
                ? <span className="muted">(none)</span>
                : t.allowed_origins.slice(0, 2).join(", ") +
                  (t.allowed_origins.length > 2
                    ? ` +${t.allowed_origins.length - 2}`
                    : "")}
            </div>
            <div
              style={{
                flex: "1 1 0",
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span>{capLabel(t)}</span>
              {t.cite_sources ? null : (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  citations off
                </span>
              )}
            </div>
            <div style={{ flex: "1 1 0" }}>
              {revoked ? (
                <Pill tone="error" dot>Revoked</Pill>
              ) : (
                <Pill tone="success" dot>Active</Pill>
              )}
            </div>
            <div
              style={{
                width: 140,
                display: "flex",
                justifyContent: "flex-end",
                gap: 4,
              }}
            >
              {revoked ? null : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(t)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(t)}
                    style={{ color: "var(--error)" }}
                  >
                    Revoke
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function capLabel(t: ShareTokenJson): string {
  const parts: string[] = [];
  if (t.max_requests_per_day !== null) {
    parts.push(`${t.max_requests_per_day.toLocaleString()} req`);
  }
  if (t.max_spend_usd_per_day !== null) {
    parts.push(`$${t.max_spend_usd_per_day.toFixed(2)}`);
  }
  return parts.length === 0 ? "Unlimited" : parts.join(" · ");
}

/**
 * Renders the install-snippet card under the table, prefilled with
 * the FIRST active token's prefix (so the user can copy a fresh
 * one-liner without scrolling back into the create modal). The
 * cleartext is replaced with a placeholder — the user re-mints if
 * they lost it.
 */
function InstallSnippetCard({
  agent,
  token,
}: {
  agent: AgentJson;
  token: ShareTokenJson;
}) {
  const { show } = useToast();
  // The loader is served from the dashboard's own origin.
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://app.kraterion.com";
  const snippet = buildSnippet({
    origin,
    agentId: agent.id,
    tokenPlaceholder: token.token_prefix,
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      show({ tone: "success", title: "Copied" });
    } catch {
      show({
        tone: "error",
        title: "Couldn't copy",
        body: "Select the text and copy manually.",
      });
    }
  };
  // Surface env for the snippet's hardcoded dashboard origin without
  // re-reading at every render — also satisfies the unused-import lint
  // when we choose not to thread env through here.
  void env;
  return (
    <Card style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Install snippet</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Using <code>{token.name}</code>. Replace the placeholder with
          the cleartext token you saved at mint time.
        </div>
      </div>
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
      <div>
        <Button variant="secondary" size="sm" icon="copy" onClick={copy}>
          Copy
        </Button>
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
        The snippet must be loaded from an origin in this token&apos;s
        allow-list. Other origins get a 403 on the chat call (the iframe
        loads but won&apos;t answer).
      </div>
    </Card>
  );
}

function buildSnippet({
  origin,
  agentId,
  tokenPlaceholder,
}: {
  origin: string;
  agentId: string;
  tokenPlaceholder: string;
}): string {
  return `<script src="${origin}/embed/v1.js"
        data-agent-id="${agentId}"
        data-token="${tokenPlaceholder}"
        async></script>`;
}
