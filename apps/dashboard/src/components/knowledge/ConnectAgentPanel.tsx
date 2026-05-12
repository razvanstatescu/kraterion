"use client";

import { useState } from "react";
import { CreateApiKeyDialog } from "@/components/keys/CreateApiKeyDialog";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TabbedCode } from "@/components/ui/TabbedCode";
import { env } from "@/lib/env";
import { useApiKeys, useMe } from "@/lib/queries";

const PLACEHOLDER_SECRET = "<your-secret-shown-once-at-key-creation>";

interface Props {
  bucketName: string;
}

/**
 * Connect-an-agent panel. Drops three copy-paste snippets:
 *   1. Claude Desktop config — bearer auth via the existing API key.
 *      We pre-fill `<AKIA>:<secret>` with the active key's
 *      access_key_id; secret stays as a placeholder unless the user
 *      just minted a new key inline.
 *   2. Cursor `mcp.json` — same shape, different surface.
 *   3. `curl` JSON-RPC tools/list — works against the same /mcp URL
 *      for ad-hoc inspection.
 *
 * The "Generate a new key for an agent" button opens the existing
 * CreateApiKeyDialog (it's the same shape — name → mint → show secret
 * once). Once the dialog closes the secret is gone from memory and
 * the panel renders the placeholder again.
 */
export function ConnectAgentPanel({ bucketName }: Props) {
  const { data: me } = useMe();
  const projectId = me?.projects[0]?.id;
  const { data: keysData } = useApiKeys(projectId);
  const [createOpen, setCreateOpen] = useState(false);

  const activeKey = (keysData?.api_keys ?? []).find((k) => !k.revoked_at);
  const akia = activeKey?.access_key_id;

  const mcpUrl = `${env.controlPlaneUrl}/mcp`;
  const bearer = akia ? `${akia}:${PLACEHOLDER_SECRET}` : "<AKIA>:<your-secret>";

  return (
    <>
      <div className="ks-card">
        <div className="ks-card-head">
          <div className="ks-card-title">Connect an agent</div>
          <div className="ks-card-sub">
            Paste one of these into your client to expose the seven
            Kraterion MCP tools — search, ask, list_buckets, list_objects,
            read_object, write_object, get_manifest. Calls are scoped to
            the project the API key belongs to.
          </div>
        </div>
        <div className="ks-card-body">
          {akia ? null : (
            <div style={{ marginBottom: 16 }}>
              <Banner
                tone="warning"
                title="No active API key for this project"
                body="Mint a key first — Kraterion never stores the secret, so you'll only see it once."
              />
            </div>
          )}

          <div className="ks-section-label">Snippets</div>
          <TabbedCode tabs={["claude desktop", "cursor", "curl"]}>
            {(active) => snippetFor(active, mcpUrl, bearer, bucketName)}
          </TabbedCode>

          <div className="ks-card-row">
            <div className="ks-card-row-label">
              <Icon name="key" size={14} />
              <span>
                {akia ? (
                  <>
                    Using key <code>{akia}</code>. The secret in the snippets
                    is a placeholder — replace it with the secret you
                    saved when the key was created, or mint a new key
                    here.
                  </>
                ) : (
                  <>
                    There's no active key for this project. Generate one
                    to fill in the snippets.
                  </>
                )}
              </span>
            </div>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setCreateOpen(true)}
            >
              Generate a new key
            </Button>
          </div>
        </div>
      </div>

      <CreateApiKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
      />
    </>
  );
}

function snippetFor(
  active: string,
  mcpUrl: string,
  bearer: string,
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
        "Authorization": "Bearer ${bearer}"
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
        "Authorization": "Bearer ${bearer}"
      }
    }
  }
}`;

    case "curl":
      return `# JSON-RPC tools/list — verifies auth + transport in one shot.
curl -sS "${mcpUrl}" \\
  -H "Authorization: Bearer ${bearer}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

    default:
      return "";
  }
}
