"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AgentsListTab } from "@/components/agents/AgentsListTab";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { ConnectedAgents } from "@/components/oauth/ConnectedAgents";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useMe } from "@/lib/queries";

type Tab = "my-agents" | "connections";

/**
 * Agents — top-level surface for the project's first-class agents
 * (KraterionAgent), plus the external MCP clients that have consented
 * through OAuth (Connections).
 *
 * Mirrors `/keys`: a top hairline tab strip with one Krater underline
 * on the active tab.
 */
export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const params = useSearchParams();
  const router = useRouter();
  const initialTab: Tab =
    params.get("tab") === "connections" ? "connections" : "my-agents";
  const [tab, setTab] = useState<Tab>(initialTab);
  // Lifted from AgentsListTab so the "New agent" action can live in
  // the Topbar — matches the buckets + keys pages.
  const [createOpen, setCreateOpen] = useState(false);

  // Honour ?new=1 from the onboarding card's step-3 CTA. Strip the
  // param after opening so a reload doesn't re-trigger the dialog.
  useEffect(() => {
    if (params.get("new") === "1") {
      setCreateOpen(true);
      router.replace("/agents");
    }
  }, [params, router]);

  return (
    <>
      <Topbar
        crumbs={[
          { label: tab === "connections" ? "Connections" : "My agents" },
        ]}
        actions={
          <>
            {tab === "my-agents" ? (
              <Button
                variant="cta"
                icon="plus"
                onClick={() => setCreateOpen(true)}
              >
                New agent
              </Button>
            ) : null}
            <SignOutButton />
          </>
        }
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Agents</h1>
            <p
              className="lead"
              style={{ fontSize: 14, marginTop: 4, maxWidth: 720 }}
            >
              {tab === "my-agents"
                ? "Configured RAG agents you own. Each has a system prompt, a chat model, attached buckets, and a stable OpenAI Chat Completions endpoint at /v1/agents/{id}/chat/completions."
                : "External MCP clients (Claude Desktop, Cursor, anything that walked your OAuth flow). Disconnect to revoke their access."}
            </p>
          </div>
        </div>

        <div className="ks-subtabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "my-agents"}
            className={`ks-subtab${tab === "my-agents" ? " is-active" : ""}`}
            onClick={() => setTab("my-agents")}
            type="button"
          >
            <Icon name="settings" size={14} />
            My agents
          </button>
          <button
            role="tab"
            aria-selected={tab === "connections"}
            className={`ks-subtab${tab === "connections" ? " is-active" : ""}`}
            onClick={() => setTab("connections")}
            type="button"
          >
            <Icon name="link" size={14} />
            Connections
          </button>
        </div>

        {tab === "my-agents" ? (
          <AgentsListTab
            projectId={projectId}
            onCreate={() => setCreateOpen(true)}
          />
        ) : (
          <div style={{ maxWidth: 880 }}>
            <ConnectedAgents />
          </div>
        )}
      </main>

      <CreateAgentDialog
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
