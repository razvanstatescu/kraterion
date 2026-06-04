import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Agents — Kraterion docs",
  description:
    "Configure an AI agent with a system prompt, model, buckets, and tools. Each agent gets its own on-chain sub-wallet and scoped, revocable access to your data.",
};

const HEADINGS = [
  { id: "what-is-an-agent", label: "What is an agent", level: 2 as const },
  { id: "configuration", label: "Configuration", level: 2 as const },
  { id: "create", label: "Create an agent", level: 2 as const },
  { id: "lifecycle", label: "Sub-wallet & grants", level: 2 as const },
  { id: "revoke", label: "Revoke vs delete", level: 2 as const },
];

const FIELDS = [
  ["name", "string, 1–64 chars", "Required. Identifies the agent."],
  ["description", "string, ≤ 280 chars", "Optional human-readable note."],
  ["system_prompt", "string, ≤ 8 KiB", "Required. The agent's instructions. Callers cannot override it."],
  ["model", "string", "The chat model the agent runs, e.g. gpt-4o-mini."],
  ["temperature", "number, 0–2", "Optional sampling temperature."],
  ["max_tokens", "number, ≤ 8192", "Optional cap on completion length."],
  ["top_k", "number, 1–32", "How many knowledge chunks to retrieve per turn."],
  ["bucket_ids", "string[] (uuid)", "Buckets the agent may read, search, and write."],
  ["tools", "string[]", "Which built-in tools the agent may call."],
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Agents</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Agents
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          An agent is a saved configuration you talk to over an OpenAI-compatible
          API. It carries its own instructions, model, the buckets it can see, and
          the tools it can call — and its access to your storage is on-chain and
          revocable.
        </p>

        <h2
          id="what-is-an-agent"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          What is an agent
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Rather than wiring a model, a retrieval pipeline, and a tool layer
          yourself, you describe the agent once and Kraterion runs it. On each
          turn it can search the attached buckets, read and write objects, recall
          memory, and answer with citations. The same agent is reachable from your
          backend, from a website embed, and from{" "}
          <a
            href="/docs/mcp"
            className="text-krater underline-offset-2 hover:underline"
          >
            MCP clients
          </a>
          .
        </p>

        <h2
          id="configuration"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Configuration
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          These are the fields you set when creating or updating an agent.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-stone-200/60 text-left">
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Field
                </th>
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Type
                </th>
                <th className="py-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(([field, type, notes]) => (
                <tr key={field} className="border-b border-stone-200/60 align-top">
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[13px] text-ink">{field}</code>
                  </td>
                  <td className="py-2.5 pr-4 text-stone-600">{type}</td>
                  <td className="py-2.5 leading-[1.6] text-stone-700">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          See{" "}
          <a
            href="/docs/agents/tools"
            className="text-krater underline-offset-2 hover:underline"
          >
            Tools
          </a>{" "}
          for the values that go in{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            tools
          </code>
          .
        </p>

        <h2 id="create" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Create an agent
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Create agents in the dashboard, or over the API with a bearer token.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "create.sh",
                code: `curl -X POST https://api.kraterion.com/v1/projects/<project_id>/agents \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "handbook-bot",
    "description": "Answers from the company handbook",
    "system_prompt": "Answer questions using the handbook. Cite your sources.",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "top_k": 8,
    "bucket_ids": ["<bucket_id>"],
    "tools": ["kraterion_search", "kraterion_read_object"]
  }'`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          List, fetch, update, and delete with the matching endpoints:{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            GET /v1/agents?project_id=…
          </code>
          ,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            GET /v1/agents/:id
          </code>
          ,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            PATCH /v1/agents/:id
          </code>
          ,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            DELETE /v1/agents/:id
          </code>
          .
        </p>

        <h2 id="lifecycle" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Sub-wallet &amp; grants
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Each agent is issued its own on-chain identity — a{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            sub_wallet_address
          </code>{" "}
          — separate from the gateway and from your other agents. For the agent to
          read a private bucket, that sub-wallet has to be granted access on-chain,
          the same revocable mechanism the platform uses for itself. This means an
          agent&apos;s reach is explicit and auditable: you can see, per bucket,
          whether a given agent is allowed in.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "grants.sh",
                code: `curl https://api.kraterion.com/v1/agents/<agent_id>/grants \\
  -H "Authorization: Bearer kr_live_..."
# → per-bucket grant status for this agent's sub-wallet`,
              },
            ]}
          />
        </div>

        <h2 id="revoke" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Revoke vs delete
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Revoking an agent (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/agents/:id/revoke
          </code>
          ) flips its status to <em>revoked</em>: the chat endpoint refuses new
          requests, but the record and its history stay for audit. Deleting removes
          the agent entirely. To cut an agent off from a specific bucket without
          retiring it, revoke that bucket&apos;s on-chain grant instead.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
