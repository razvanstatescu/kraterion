"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AgentChatPanel } from "@/components/agents/AgentChatPanel";
import { AgentSettingsForm } from "@/components/agents/AgentSettingsForm";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Topbar } from "@/components/shell/Topbar";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useAgent, useDeleteAgent, useRevokeAgent } from "@/lib/queries";

type Tab = "chat" | "settings" | "connect";

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();
  const { show } = useToast();
  const { data, error, isLoading } = useAgent(agentId);
  const revoke = useRevokeAgent(agentId, data?.agent.project_id);
  const remove = useDeleteAgent(agentId, data?.agent.project_id);
  const [tab, setTab] = useState<Tab>("chat");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <>
        <Topbar
          crumbs={[{ label: "Agents", href: "/agents" }, { label: "…" }]}
          actions={<SignOutButton />}
        />
        <main className="ks-screen">
          <div className="muted" style={{ fontSize: 14 }}>
            Loading agent…
          </div>
        </main>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <Topbar
          crumbs={[{ label: "Agents", href: "/agents" }, { label: "Not found" }]}
          actions={<SignOutButton />}
        />
        <main className="ks-screen">
          <Banner
            tone="error"
            title="Agent not found"
            body={
              error instanceof ControlPlaneError
                ? error.message
                : "We couldn't load that agent."
            }
          />
        </main>
      </>
    );
  }

  const agent = data.agent;
  const onRevoke = async () => {
    try {
      await revoke.mutateAsync();
      show({
        tone: "success",
        title: "Agent revoked",
        body: "Future /chat/completions requests fail with a 409.",
      });
      setConfirmRevoke(false);
    } catch (err) {
      show({
        tone: "error",
        title: "Couldn't revoke",
        body: err instanceof Error ? err.message : "Try again.",
      });
    }
  };
  const onDelete = async () => {
    try {
      await remove.mutateAsync();
      show({ tone: "success", title: "Agent deleted" });
      router.push("/agents");
    } catch (err) {
      show({
        tone: "error",
        title: "Couldn't delete",
        body: err instanceof Error ? err.message : "Try again.",
      });
    }
  };

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Agents", href: "/agents" },
          { label: agent.name },
        ]}
        actions={<SignOutButton />}
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h1 style={{ margin: 0 }}>{agent.name}</h1>
              {agent.status === "revoked" ? (
                <Pill tone="error" dot>
                  Revoked
                </Pill>
              ) : (
                <Pill tone="success" dot>
                  Active
                </Pill>
              )}
            </div>
            {agent.description ? (
              <p
                className="lead"
                style={{ fontSize: 14, marginTop: 4, maxWidth: 760 }}
              >
                {agent.description}
              </p>
            ) : null}
            <div
              className="muted"
              style={{ fontSize: 12, marginTop: 8 }}
            >
              <span className="mono">{agent.model}</span>
              <span style={{ margin: "0 6px" }}>·</span>
              {agent.bucket_ids.length} bucket
              {agent.bucket_ids.length === 1 ? "" : "s"}
              <span style={{ margin: "0 6px" }}>·</span>
              created {formatRelative(agent.created_at)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {agent.status === "active" ? (
              <Button
                variant="ghost"
                icon="shieldOff"
                onClick={() => setConfirmRevoke(true)}
                style={{ color: "var(--error)" }}
              >
                Revoke
              </Button>
            ) : null}
            <Button
              variant="ghost"
              icon="trash"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "var(--error)" }}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="ks-subtabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "chat"}
            className={`ks-subtab${tab === "chat" ? " is-active" : ""}`}
            onClick={() => setTab("chat")}
            type="button"
          >
            <Icon name="text" size={14} />
            Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === "settings"}
            className={`ks-subtab${tab === "settings" ? " is-active" : ""}`}
            onClick={() => setTab("settings")}
            type="button"
          >
            <Icon name="settings" size={14} />
            Settings
          </button>
          <button
            role="tab"
            aria-selected={tab === "connect"}
            className={`ks-subtab${tab === "connect" ? " is-active" : ""}`}
            onClick={() => setTab("connect")}
            type="button"
          >
            <Icon name="link" size={14} />
            Connect
          </button>
        </div>

        {tab === "chat" ? (
          <div style={{ maxWidth: 900 }}>
            {agent.bucket_ids.length === 0 ? (
              <Banner
                tone="info"
                title="No buckets attached"
                body={
                  <>
                    Attach at least one bucket on the{" "}
                    <Link href={`/agents/${agent.id}?tab=settings`}>
                      Settings tab
                    </Link>{" "}
                    so the agent has something to retrieve from. Without
                    attachments the response will be the no-context
                    fallback.
                  </>
                }
              />
            ) : null}
            <div style={{ marginTop: 16 }}>
              <AgentChatPanel agent={agent} />
            </div>
          </div>
        ) : tab === "settings" ? (
          <Card style={{ padding: 24, maxWidth: 760 }}>
            <AgentSettingsForm agent={agent} />
          </Card>
        ) : (
          <ConnectPanel agent={agent} />
        )}
      </main>

      <ConfirmModal
        open={confirmRevoke}
        title={`Revoke "${agent.name}"?`}
        body={
          <Banner
            tone="warning"
            title="Future chat calls fail immediately."
            body="Existing chunks aren't touched; the agent's sub-wallet is preserved on chain for audit. You can delete the agent entirely from this page."
          />
        }
        confirmLabel={revoke.isPending ? "Revoking…" : "Revoke agent"}
        danger
        busy={revoke.isPending}
        onConfirm={onRevoke}
        onCancel={() => setConfirmRevoke(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title={`Delete "${agent.name}"?`}
        body={
          <>
            <p>
              Deletes the agent record, its bucket attachments, and the
              invocation history. The sub-wallet row stays in the
              database — the seed isn't reused.
            </p>
            <p style={{ marginTop: 8 }}>This can't be undone.</p>
          </>
        }
        confirmLabel={remove.isPending ? "Deleting…" : "Delete agent"}
        danger
        busy={remove.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function ConnectPanel({ agent }: { agent: { id: string; sub_wallet_address: string } }) {
  const endpoint = `/v1/agents/${agent.id}/chat/completions`;
  const curl = `curl -X POST '<your-control-plane-url>${endpoint}' \\
  -H 'Authorization: Bearer <your-session-or-api-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "messages": [{ "role": "user", "content": "What does the latest contract say about indemnity?" }],
    "stream": false
  }'`;

  return (
    <Card style={{ padding: 24, maxWidth: 760 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
        OpenAI-compatible endpoint
      </h3>
      <p
        className="lead"
        style={{ fontSize: 13, marginTop: 4, color: "var(--text-secondary)" }}
      >
        The agent answers at the URL below using the OpenAI Chat
        Completions wire format. Drop in any OpenAI SDK with{" "}
        <code>base_url = &lt;your-control-plane-url&gt;/v1/agents/{agent.id}</code>{" "}
        and an API key issued from <Link href="/keys">Access keys</Link>.
      </p>

      <div style={{ marginTop: 16 }}>
        <div className="micro" style={{ marginBottom: 6 }}>
          Endpoint
        </div>
        <div className="ks-codeline mono">
          <span style={{ flex: 1, overflow: "auto" }}>POST {endpoint}</span>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="micro" style={{ marginBottom: 6 }}>
          Curl example
        </div>
        <pre
          className="mono"
          style={{
            fontSize: 12,
            padding: 14,
            background: "var(--ink)",
            color: "var(--cream)",
            borderRadius: "var(--radius-md)",
            overflow: "auto",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {curl}
        </pre>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="micro" style={{ marginBottom: 6 }}>
          Sub-wallet (on-chain identity)
        </div>
        <div className="ks-codeline mono" style={{ cursor: "default" }}>
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {agent.sub_wallet_address}
          </span>
        </div>
        <div
          className="muted"
          style={{ fontSize: 12, marginTop: 6 }}
        >
          Each agent is provisioned with its own Sui sub-wallet so per-agent
          on-chain capabilities can be granted on the bucket's
          api_decryption_addresses list. The grant flow is a follow-up;
          today this address is the agent's stable identity for audit.
        </div>
      </div>
    </Card>
  );
}
