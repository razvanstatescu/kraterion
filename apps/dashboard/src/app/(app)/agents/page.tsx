"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ConnectedAgents } from "@/components/oauth/ConnectedAgents";
import { Topbar } from "@/components/shell/Topbar";

/**
 * Agents — top-level surface for MCP clients (Claude Desktop, Cursor,
 * anything that walked through the OAuth flow on /oauth/authorize).
 *
 * Previously lived as a card inside /settings; promoted to its own
 * page so the AI thesis is discoverable from the sidebar. The actual
 * list + disconnect actions still come from <ConnectedAgents />,
 * unchanged.
 */
export default function AgentsPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Agents" }]} actions={<SignOutButton />} />
      <main className="ks-screen" style={{ maxWidth: 880 }}>
        <div className="ks-screen-head">
          <div>
            <h1>Agents</h1>
            <p className="lead">
              MCP clients you&apos;ve authorized through OAuth. Manage what
              each agent can read or write, or disconnect them entirely.
            </p>
          </div>
        </div>

        <ConnectedAgents />
      </main>
    </>
  );
}
