import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Memory & sessions — Kraterion docs",
  description:
    "Give an agent persistent memory it can write and recall, tracked in sessions that anchor on-chain so a conversation can be referenced and replayed.",
};

const HEADINGS = [
  { id: "memory-tools", label: "Memory tools", level: 2 as const },
  { id: "sessions", label: "Sessions", level: 2 as const },
  { id: "on-chain-anchoring", label: "On-chain anchoring", level: 2 as const },
  { id: "replay", label: "Replay", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Agents</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Memory &amp; sessions
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          An agent can remember facts across conversations, and its activity is
          grouped into sessions that are anchored on-chain — so a run can be pointed
          to and verified later.
        </p>

        <h2
          id="memory-tools"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Memory tools
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Enable the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            memory_remember
          </code>{" "}
          and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            memory_recall
          </code>{" "}
          tools to give the agent a private memory namespace. The model decides when
          to save something worth keeping and when to look it back up; each agent&apos;s
          memory is its own, scoped to that agent.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "json",
                filename: "agent.json",
                code: `{
  "name": "support-bot",
  "system_prompt": "Help customers. Remember preferences they tell you.",
  "model": "gpt-4o-mini",
  "bucket_ids": ["<bucket_id>"],
  "tools": ["kraterion_search", "memory_remember", "memory_recall"]
}`,
              },
            ]}
          />
        </div>

        <h2 id="sessions" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Sessions
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          When an agent has at least one attached bucket, its invocations are
          grouped into a session. List them to see when a session opened, how many
          invocations it holds, and its current status.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "sessions.sh",
                code: `curl https://api.kraterion.com/v1/agents/<agent_id>/sessions \\
  -H "Authorization: Bearer kr_live_..."
# → [{ id, status, opened_at, last_activity_at,
#       invocation_count, tx_digest, ... }]`,
              },
            ]}
          />
        </div>

        <h2
          id="on-chain-anchoring"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          On-chain anchoring
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A session flushes when it goes idle and anchors its state on-chain,
          producing a transaction digest (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            tx_digest
          </code>
          ). That digest is a durable, third-party-verifiable handle to what the
          agent did during the session — not just a row in Kraterion&apos;s
          database. You can also end a session explicitly with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/agents/:id/sessions/:sessionId/end
          </code>
          .
        </p>

        <h2 id="replay" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Replay
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Because a session carries the model, the retrieved chunks (by content
          hash), and the tool calls it made, its record is enough to reconstruct
          what happened and why an answer came out the way it did. The{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            tx_digest
          </code>{" "}
          is the anchor you reference when you need to point at a specific run.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
