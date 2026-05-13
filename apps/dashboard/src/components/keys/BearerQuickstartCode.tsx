"use client";

import { TabbedCode } from "@/components/ui/TabbedCode";
import { env } from "@/lib/env";

interface Props {
  /** Cleartext token (`kr_live_…` / `kr_test_…`). Pass `null` to render
   *  snippets with a placeholder (used on the tokens list where the
   *  cleartext isn't available). */
  token: string | null;
}

const TABS = ["curl", "OpenAI SDK", "MCP", "fetch"] as const;

/**
 * Quickstart snippets for the unified bearer token. Covers the four
 * paths a dev is most likely to land on after minting:
 *
 *   1. `curl` — generic CRUD hit, the universal smoke test.
 *   2. OpenAI Python SDK — agents chat endpoint speaks the OpenAI wire
 *      shape, so `client = OpenAI(base_url=...)` is the killer demo.
 *   3. MCP `claude_desktop_config.json` — Claude Desktop / Cursor will
 *      use OAuth in practice, but the static-bearer form works too.
 *   4. `fetch` — vanilla browser/node JS, copy-paste into a script.
 *
 * Token is rendered verbatim where present; we don't reformat or mask
 * it because the parent dialog is the show-once panel that owns its
 * sensitivity.
 */
export function BearerQuickstartCode({ token }: Props) {
  const cpUrl = env.controlPlaneUrl;
  const placeholder = "kr_test_••••••••••••••••••••••••••••••••••••";
  const t = token ?? placeholder;

  return (
    <div className="ks-tabcode">
      <TabbedCode tabs={[...TABS]}>
        {(active) => {
          if (active === "curl") {
            return (
              <pre>{`# List agents
curl ${cpUrl}/v1/agents?project_id=$PROJECT_ID \\
  -H "Authorization: Bearer ${t}"

# Run a chat completion (OpenAI-compatible)
curl ${cpUrl}/v1/agents/$AGENT_ID/chat/completions \\
  -H "Authorization: Bearer ${t}" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"hello"}]}'`}</pre>
            );
          }
          if (active === "OpenAI SDK") {
            return (
              <pre>{`from openai import OpenAI

client = OpenAI(
    base_url="${cpUrl}/v1/agents/$AGENT_ID",
    api_key="${t}",
)

stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hello"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`}</pre>
            );
          }
          if (active === "MCP") {
            return (
              <pre>{`// claude_desktop_config.json
{
  "mcpServers": {
    "kraterion": {
      "url": "${cpUrl}/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${t}"
      }
    }
  }
}`}</pre>
            );
          }
          // fetch
          return (
            <pre>{`const res = await fetch(
  "${cpUrl}/v1/agents/$AGENT_ID/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer ${t}",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "hello" }],
    }),
  },
);
console.log(await res.json());`}</pre>
          );
        }}
      </TabbedCode>
    </div>
  );
}
