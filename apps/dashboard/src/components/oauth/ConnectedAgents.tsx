"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import {
  useDisconnectOAuthClient,
  useOAuthClients,
  type OAuthClientJson,
} from "@/lib/queries";

const SCOPE_LABEL: Record<string, string> = {
  "mcp:read": "Read",
  "mcp:write": "Write",
  "mcp:ask": "Ask",
  "mcp:*": "Full",
};

/**
 * Settings → Connected agents.
 *
 * Lists every MCP client that has consented through this account's
 * OAuth flow, with the union of granted scopes, last consent time,
 * and last token-exchange time. Disconnect deletes the grants —
 * fresh consent required on next authorize.
 */
export function ConnectedAgents() {
  const { data, isLoading, error } = useOAuthClients();
  const disconnect = useDisconnectOAuthClient();
  const { show } = useToast();
  const [confirm, setConfirm] = useState<OAuthClientJson | null>(null);

  const onDisconnect = async () => {
    if (!confirm) return;
    try {
      const res = await disconnect.mutateAsync(confirm.client_id);
      show({
        tone: "success",
        title: `Disconnected ${confirm.client_name ?? "the client"}`,
        body:
          res.grants_deleted > 0
            ? `Removed ${res.grants_deleted} grant${res.grants_deleted === 1 ? "" : "s"}. The next authorize from this client will hit a fresh consent screen.`
            : "No active grants to remove.",
      });
      setConfirm(null);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't disconnect.";
      show({ tone: "error", title: "Disconnect failed", body: message });
    }
  };

  const clients = data?.clients ?? [];

  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">Connected agents</div>
          <div className="ks-card-sub">
            MCP clients you&apos;ve authorized through OAuth — Claude Desktop,
            Cursor, or anything else that walked through{" "}
            <code>/oauth/authorize</code>. Disconnect to require a fresh
            consent on the next connection attempt.
          </div>
        </div>
      </div>
      <div className="ks-card-body">
        {error ? (
          <Banner
            tone="error"
            title="Couldn't load connected agents"
            body={
              error instanceof ControlPlaneError
                ? error.message
                : "Try again."
            }
          />
        ) : isLoading ? (
          <div className="muted small">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="ks-empty-row">
            <Icon name="key" size={16} />
            <span>
              No OAuth connections yet. When you connect Claude Desktop or
              Cursor via their "Add MCP server" flow, the app will appear
              here.
            </span>
          </div>
        ) : (
          <ul className="ks-agents">
            {clients.map((c) => (
              <li key={c.client_id} className="ks-agent">
                <div className="ks-agent-main">
                  <div className="ks-agent-name">
                    <Icon name="key" size={14} />
                    {c.client_name ?? "Unnamed client"}
                  </div>
                  <div className="ks-agent-meta">
                    <code>{c.client_id}</code>
                    <span className="ks-meta-sep">·</span>
                    <span>{c.resource}</span>
                  </div>
                  <div className="ks-agent-scopes">
                    {c.scopes.map((s) => (
                      <Pill key={s} tone="info">
                        {SCOPE_LABEL[s] ?? s}
                      </Pill>
                    ))}
                  </div>
                  <div className="ks-agent-times">
                    <span>
                      <em>Consented</em> {formatRelative(c.last_consent_at)}
                    </span>
                    {c.last_used_at ? (
                      <>
                        <span className="ks-meta-sep">·</span>
                        <span>
                          <em>Last used</em> {formatRelative(c.last_used_at)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="shieldOff"
                  onClick={() => setConfirm(c)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        title={`Disconnect ${confirm?.client_name ?? "this client"}?`}
        body={
          <Banner
            tone="warning"
            title="Access tokens issued in the last 15 minutes stay valid."
            body="Disconnecting clears this client's saved consent — the next OAuth flow walks through the consent screen again. Any access token already in the client's memory keeps working until its 15-minute expiry."
          />
        }
        confirmLabel="Disconnect"
        danger
        busy={disconnect.isPending}
        onConfirm={onDisconnect}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
