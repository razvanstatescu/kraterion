import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "MCP — Kraterion docs",
  description:
    "Connect Claude Desktop, Cursor, or any MCP client to Kraterion. Seven tools for listing, searching, reading, writing, and invoking agents over your buckets.",
};

const HEADINGS = [
  { id: "endpoint", label: "Endpoint", level: 2 as const },
  { id: "auth", label: "Authentication", level: 2 as const },
  { id: "add-to-claude-desktop", label: "Add to a client", level: 2 as const },
  { id: "the-seven-tools", label: "The seven tools", level: 2 as const },
  { id: "example-call", label: "Example", level: 2 as const },
];

const TOOLS = [
  ["kraterion_list_buckets", "—", "List your buckets."],
  ["kraterion_list_objects", "bucket, prefix?, limit?", "List object keys in a bucket."],
  ["kraterion_search", "bucket, query, top_k?", "Hybrid search over a knowledge bucket."],
  ["kraterion_invoke_agent", "agent_id, input, model?", "Call a configured agent and get its answer."],
  ["kraterion_read_object", "bucket, key", "Read an object (up to 1 MiB)."],
  ["kraterion_write_object", "bucket, key, content, content_type?", "Write an object (up to 5 MiB)."],
  ["kraterion_get_manifest", "bucket, key", "Fetch an object's knowledge manifest."],
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">MCP</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Connect a client
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Kraterion is a Model Context Protocol server. Connect Claude Desktop,
          Cursor, Zed, or any MCP client and your assistant can browse buckets,
          search knowledge, and invoke agents directly.
        </p>

        <h2 id="endpoint" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Endpoint
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The server lives at{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            https://mcp.kraterion.com/mcp
          </code>{" "}
          and speaks the Streamable HTTP transport. It&apos;s stateless — each
          request stands on its own, so there&apos;s no session to keep alive.
        </p>

        <h2 id="auth" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Authentication
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Two ways to authenticate. Clients that support it can use OAuth 2.1 with
          dynamic client registration — the client registers itself and walks you
          through sign-in, no key to paste. Otherwise, pass a{" "}
          <a
            href="/docs/api-keys"
            className="text-krater underline-offset-2 hover:underline"
          >
            bearer token
          </a>{" "}
          (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_live_…
          </code>
          ). S3 keys are not accepted here.
        </p>

        <h2
          id="add-to-claude-desktop"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Add to a client
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          In Claude Desktop, add Kraterion to your MCP servers config. The OAuth
          flow registers the client automatically.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "json",
                filename: "claude_desktop_config.json",
                code: `{
  "mcpServers": {
    "kraterion": {
      "url": "https://mcp.kraterion.com/mcp",
      "auth": {
        "type": "oauth",
        "dcr": true
      }
    }
  }
}`,
              },
            ]}
          />
        </div>

        <h2
          id="the-seven-tools"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          The seven tools
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The MCP server exposes seven tools. Note this set includes{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion_invoke_agent
          </code>{" "}
          — so a client can defer to a fully-configured agent rather than
          orchestrating retrieval itself.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-stone-200/60 text-left">
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Tool
                </th>
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Args
                </th>
                <th className="py-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Does
                </th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([tool, args, does]) => (
                <tr key={tool} className="border-b border-stone-200/60 align-top">
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[12px] text-ink">{tool}</code>
                  </td>
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[12px] text-stone-600">
                      {args}
                    </code>
                  </td>
                  <td className="py-2.5 leading-[1.6] text-stone-700">{does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="example-call" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Example
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Once connected, ask your assistant something that needs your data — it
          calls the tools for you. Under the hood, a tool call is a JSON-RPC request
          with a bearer token:
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "call.sh",
                code: `curl -X POST https://mcp.kraterion.com/mcp \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "kraterion_search",
      "arguments": { "bucket": "my-bucket", "query": "refund window", "top_k": 5 }
    }
  }'`,
              },
            ]}
          />
        </div>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
