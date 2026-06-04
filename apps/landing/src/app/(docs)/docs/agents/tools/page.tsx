import type { Metadata } from "next";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Agent tools — Kraterion docs",
  description:
    "The eight built-in tools an agent can call: search, list, read, write, manifests, and memory. Read tools observe; write tools record on-chain transactions.",
};

const HEADINGS = [
  { id: "enabling-tools", label: "Enabling tools", level: 2 as const },
  { id: "the-eight-tools", label: "The eight tools", level: 2 as const },
  { id: "read-vs-write", label: "Read vs write", level: 2 as const },
  { id: "tool-call-trace", label: "Tool-call trace", level: 2 as const },
];

const TOOLS = [
  ["kraterion_search", "read", "bucket, query, top_k?", "Hybrid keyword + vector search over a knowledge-enabled bucket."],
  ["kraterion_list_buckets", "read", "—", "List the buckets attached to the agent."],
  ["kraterion_list_objects", "read", "bucket, prefix?, limit?", "List object keys in a bucket."],
  ["kraterion_read_object", "read", "bucket, key", "Read an object's contents."],
  ["kraterion_write_object", "write", "bucket, key, content, content_type?", "Create or overwrite an object."],
  ["kraterion_get_manifest", "read", "bucket, key", "Fetch an object's knowledge manifest (chunks, hashes, blob ids)."],
  ["memory_remember", "write", "content", "Save a fact to the agent's memory."],
  ["memory_recall", "read", "query", "Retrieve relevant facts from the agent's memory."],
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Agents</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">Tools</h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Tools are the actions an agent can take during a turn. You choose which
          ones it&apos;s allowed to use; the model decides when to call them.
        </p>

        <h2
          id="enabling-tools"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Enabling tools
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          List the tool names in the agent&apos;s{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            tools
          </code>{" "}
          field. A tool is only useful if the agent also has what it needs:{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion_search
          </code>{" "}
          requires a knowledge-enabled bucket, and the read/write tools require the
          relevant bucket to be attached and granted to the agent&apos;s sub-wallet.
        </p>

        <h2
          id="the-eight-tools"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          The eight tools
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-stone-200/60 text-left">
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Tool
                </th>
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Kind
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
              {TOOLS.map(([tool, kind, args, does]) => (
                <tr key={tool} className="border-b border-stone-200/60 align-top">
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[12px] text-ink">{tool}</code>
                  </td>
                  <td className="py-2.5 pr-4 text-stone-600">{kind}</td>
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

        <h2
          id="read-vs-write"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Read vs write
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Read tools observe your data and have no side effects. Write tools change
          it:{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion_write_object
          </code>{" "}
          stores a new object — which encrypts the bytes, uploads them to Walrus,
          and records the result on-chain — and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            memory_remember
          </code>{" "}
          appends to the agent&apos;s memory. Grant write tools only to agents you
          intend to let modify storage.
        </p>

        <h2
          id="tool-call-trace"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Tool-call trace
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Every tool the agent calls during a turn is surfaced in the chat
          response, under the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion.tool_calls
          </code>{" "}
          field (and as streaming{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion.tool_call
          </code>{" "}
          frames). Write tools that touch storage include the resulting on-chain
          transaction and Walrus blob ids, so an answer that changed something is
          traceable end to end. See the{" "}
          <a
            href="/docs/agents/chat-api"
            className="text-krater underline-offset-2 hover:underline"
          >
            Chat API
          </a>{" "}
          for the exact shape.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
