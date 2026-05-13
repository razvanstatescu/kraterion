"use client";

import Link from "next/link";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useAgents } from "@/lib/queries";

interface Props {
  projectId: string | undefined;
  /** Fired when the user clicks "New agent" from the EmptyState. The
   *  page owns the actual dialog state (and renders the button in the
   *  Topbar to match the buckets/keys pattern). */
  onCreate: () => void;
}

/**
 * Lists every KraterionAgent in the project. The page hosts the
 * `New agent` action in the Topbar — same shape as the buckets and
 * keys pages — so this component only handles the empty/loading/data
 * states.
 */
export function AgentsListTab({ projectId, onCreate }: Props) {
  const { data, error, isLoading } = useAgents(projectId);

  const agents = data?.agents ?? [];

  if (error) {
    return (
      <Banner
        tone="error"
        title="Couldn't load agents"
        body={error instanceof ControlPlaneError ? error.message : "Try again in a moment."}
      />
    );
  }
  if (isLoading) {
    return <div className="muted" style={{ fontSize: 14 }}>Loading…</div>;
  }
  if (agents.length === 0) {
    return (
      <EmptyState
        icon="settings"
        title="No agents yet"
        body="Create your first agent to expose a configured chat endpoint over your buckets. Each agent has its own system prompt, chat model, and on-chain sub-wallet identity."
        action={
          <Button variant="cta" icon="plus" onClick={onCreate}>
            New agent
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="ks-table" style={{ border: "none", borderRadius: 0 }}>
          <div className="ks-thead">
            <div style={{ flex: "2 1 0" }}>Name</div>
            <div style={{ flex: "2 1 0" }}>Model</div>
            <div style={{ flex: "1 1 0" }}>Buckets</div>
            <div style={{ flex: "1 1 0" }}>Status</div>
            <div style={{ flex: "1 1 0" }}>Created</div>
          </div>
          {agents.map((a) => {
            const revoked = a.status === "revoked";
            return (
              <Link
                key={a.id}
                href={`/agents/${a.id}`}
                className="ks-trow"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  opacity: revoked ? 0.55 : 1,
                }}
              >
                <div
                  style={{
                    flex: "2 1 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <Icon
                    name="settings"
                    size={16}
                    style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </div>
                    {a.description ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.description}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div
                  style={{
                    flex: "2 1 0",
                    fontFamily:
                      "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  {a.model}
                </div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                  {a.bucket_ids.length === 0
                    ? "—"
                    : `${a.bucket_ids.length} bucket${a.bucket_ids.length === 1 ? "" : "s"}`}
                </div>
                <div style={{ flex: "1 1 0" }}>
                  {revoked ? (
                    <Pill tone="error" dot>
                      Revoked
                    </Pill>
                  ) : (
                    <Pill tone="success" dot>
                      Active
                    </Pill>
                  )}
                </div>
                <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                  {formatRelative(a.created_at)}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </>
  );
}
