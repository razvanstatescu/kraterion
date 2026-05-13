"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateBearerTokenDialog } from "@/components/keys/CreateBearerTokenDialog";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TabbedCode } from "@/components/ui/TabbedCode";
import { env } from "@/lib/env";
import { useApiKeys, useMe } from "@/lib/queries";

const PLACEHOLDER_TOKEN = "<your-kr-token-shown-once-at-creation>";

interface Props {
  bucketName: string;
}

/**
 * Connect-an-agent panel. Two methods side by side:
 *
 *   1. Bearer (`kr_live_…` / `kr_test_…`) — copy-paste snippets for
 *      Claude Desktop, Cursor, and ad-hoc curl. The token prefix from
 *      the most-recent active bearer token is shown as a reference;
 *      the body stays a placeholder unless the user mints a fresh
 *      token inline via the dialog.
 *   2. OAuth (zero-config) — for clients that walk the "Add MCP server"
 *      flow (Claude Desktop's catalog onboarding, Cursor's MCP picker).
 *      No credential needed in the snippet — the consent screen prompts
 *      the user at connect time.
 *
 * Both methods point at the same /mcp endpoint; the auth guard branches
 * by token shape (bearer vs OAuth JWT — see `docs/decisions.md`).
 */
export function ConnectAgentPanel({ bucketName }: Props) {
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const { data: keysData } = useApiKeys(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [method, setMethod] = useState<"bearer" | "oauth">("bearer");

  const activeToken = (keysData?.api_keys ?? []).find(
    (k) => k.kind === "bearer" && !k.revoked_at,
  );

  const mcpUrl = `${env.controlPlaneUrl}/mcp`;
  const discoveryUrl = `${env.controlPlaneUrl}/.well-known/oauth-protected-resource`;

  return (
    <>
      <div className="ks-card">
        <div className="ks-card-head">
          <div className="ks-card-title">Connect an agent</div>
          <div className="ks-card-sub">
            Point an MCP client at <code>{mcpUrl}</code> to expose the seven
            Kraterion tools — search, ask, list_buckets, list_objects,
            read_object, write_object, get_manifest. Two ways to authorize.
          </div>
        </div>
        <div className="ks-card-body">
          <div className="ks-method-toggle" role="tablist" aria-label="Auth method">
            <button
              type="button"
              role="tab"
              aria-selected={method === "bearer"}
              className={`ks-method ${method === "bearer" ? "is-active" : ""}`}
              onClick={() => setMethod("bearer")}
            >
              <span className="ks-method-title">
                <Icon name="key" size={14} />
                API token
              </span>
              <span className="ks-method-hint">
                Static credential — best for scripts and CI.
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === "oauth"}
              className={`ks-method ${method === "oauth" ? "is-active" : ""}`}
              onClick={() => setMethod("oauth")}
            >
              <span className="ks-method-title">
                <Icon name="lock" size={14} />
                OAuth
              </span>
              <span className="ks-method-hint">
                One-click consent — best for Claude Desktop and Cursor.
              </span>
            </button>
          </div>

          {method === "bearer" ? (
            <BearerMethod
              tokenPrefix={activeToken?.token_prefix ?? undefined}
              mcpUrl={mcpUrl}
              bucketName={bucketName}
              onMintClick={() => setCreateOpen(true)}
            />
          ) : (
            <OAuthMethod mcpUrl={mcpUrl} discoveryUrl={discoveryUrl} />
          )}
        </div>
      </div>

      <CreateBearerTokenDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
      />
    </>
  );
}

function BearerMethod({
  tokenPrefix,
  mcpUrl,
  bucketName,
  onMintClick,
}: {
  tokenPrefix: string | undefined;
  mcpUrl: string;
  bucketName: string;
  onMintClick: () => void;
}) {
  const display = tokenPrefix ?? PLACEHOLDER_TOKEN;
  return (
    <>
      {tokenPrefix ? null : (
        <div style={{ marginBottom: 16 }}>
          <Banner
            tone="warning"
            title="No active API token for this project"
            body="Mint a token first — Kraterion never stores the cleartext, so you'll only see it once."
          />
        </div>
      )}

      <div className="ks-section-label">Snippets</div>
      <TabbedCode tabs={["claude desktop", "cursor", "curl"]}>
        {(active) => bearerSnippet(active, mcpUrl, display, bucketName)}
      </TabbedCode>

      <div className="ks-card-row">
        <div className="ks-card-row-label">
          <Icon name="key" size={14} />
          <span>
            {tokenPrefix ? (
              <>
                Using token <code>{tokenPrefix}</code>. The body in the
                snippets is a placeholder — paste the full token you saved
                when it was created, or mint a fresh one here.
              </>
            ) : (
              <>
                There&apos;s no active token for this project. Generate one
                to fill in the snippets.
              </>
            )}
          </span>
        </div>
        <Button variant="secondary" icon="plus" onClick={onMintClick}>
          Generate a new token
        </Button>
      </div>
    </>
  );
}

function OAuthMethod({
  mcpUrl,
  discoveryUrl,
}: {
  mcpUrl: string;
  discoveryUrl: string;
}) {
  return (
    <>
      <div className="ks-flow-grid">
        <FlowStep
          n={1}
          title="Paste the MCP URL"
          body="In Claude Desktop or Cursor, choose 'Add MCP server' and paste this URL. The client discovers the OAuth flow from the 401 response."
        />
        <FlowStep
          n={2}
          title="Approve in your browser"
          body="You'll be bounced to the Kraterion consent screen. Sign-in is already done — just review the scopes and approve."
        />
        <FlowStep
          n={3}
          title="Tools light up"
          body="The client picks up the access token automatically. The seven Kraterion tools appear in its picker; no credential is ever pasted into a config file."
        />
      </div>

      <div className="ks-section-label">MCP URL</div>
      <code className="ks-consent-redirect">{mcpUrl}</code>

      <div className="ks-section-label" style={{ marginTop: 16 }}>
        Discovery URL (RFC 9728)
      </div>
      <code className="ks-consent-redirect">{discoveryUrl}</code>

      <div className="ks-card-row">
        <div className="ks-card-row-label">
          <Icon name="info" size={14} />
          <span>
            OAuth grants are scoped per agent, with a 15-minute access
            token. Review or disconnect connected agents from{" "}
            <Link className="ks-link" href="/settings">
              Settings → Connected agents
            </Link>
            .
          </span>
        </div>
      </div>
    </>
  );
}

function FlowStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="ks-flow-step">
      <span className="ks-flow-step-n">{n}</span>
      <div className="ks-flow-step-text">
        <span className="ks-flow-step-title">{title}</span>
        <span className="ks-flow-step-body">{body}</span>
      </div>
    </div>
  );
}

function bearerSnippet(
  active: string,
  mcpUrl: string,
  token: string,
  bucketName: string,
): string {
  switch (active) {
    case "claude desktop":
      return `// claude_desktop_config.json
{
  "mcpServers": {
    "kraterion": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}

// Restart Claude Desktop and ask: "Search ${bucketName} for <topic>."`;

    case "cursor":
      return `// .cursor/mcp.json
{
  "mcpServers": {
    "kraterion": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`;

    case "curl":
      return `# JSON-RPC tools/list — verifies auth + transport in one shot.
curl -sS "${mcpUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

    default:
      return "";
  }
}
