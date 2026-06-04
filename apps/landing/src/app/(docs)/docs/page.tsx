import type { Metadata } from "next";
import Link from "next/link";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Docs — Kraterion",
  description:
    "Run AI agents on storage you own on-chain. Reference docs for Kraterion agents, knowledge, the S3 API, MCP, and the decentralized architecture underneath.",
};

const HEADINGS = [
  { id: "what-is-kraterion", label: "What is Kraterion", level: 2 as const },
  { id: "agents-first", label: "Agents, first", level: 2 as const },
  { id: "how-it-fits", label: "How it fits together", level: 2 as const },
  { id: "where-to-next", label: "Where to go next", level: 2 as const },
];

const CARDS = [
  {
    href: "/docs/quickstart",
    title: "Quickstart",
    body: "Bucket to a cited agent answer in a few minutes. The real flow, end to end.",
  },
  {
    href: "/docs/agents",
    title: "Agents",
    body: "Configure an agent, give it tools and knowledge, and call it over an OpenAI-compatible API.",
  },
  {
    href: "/docs/architecture",
    title: "How it works",
    body: "The web3 layer in plain terms: on-chain ownership, Seal encryption, and revocable access.",
  },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Docs</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Run agents on storage you own
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Kraterion is an S3-compatible storage platform where every file is owned
          on-chain by you and encrypted by default — and where AI agents read,
          write, and reason over that storage with access you can revoke at any
          time.
        </p>

        <h2
          id="what-is-kraterion"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          What is Kraterion
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Put files in a bucket the way you already do with S3. Underneath, each
          file is stored on{" "}
          <a href="/docs/architecture" className="text-krater underline-offset-2 hover:underline">
            Walrus
          </a>{" "}
          as a blob owned by your Sui account, encrypted before it ever leaves the
          gateway. Kraterion can read your data only because your on-chain bucket
          grants it that access — and a single transaction takes it away. No file
          is custodial; nothing is readable once you revoke.
        </p>

        <h2 id="agents-first" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Agents, first
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The reason most teams come to Kraterion is the agent layer. Define an
          agent once — a system prompt, a model, the buckets it can see, the tools
          it can call — then talk to it over an OpenAI-compatible endpoint. It
          searches your documents, cites every claim back to the exact bytes on
          Walrus, remembers what matters, and can be embedded on your own site
          with scoped, rate-limited access.
        </p>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Storage, knowledge, and MCP are the foundation that makes those agents
          trustworthy: the data they reason over is owned and verifiable, and the
          access they hold is on-chain and revocable.
        </p>

        <h2 id="how-it-fits" className="mt-16 text-[24px] leading-[1.2] text-ink">
          How it fits together
        </h2>
        <ul className="mt-4 flex flex-col gap-3 text-[15px] leading-[1.7] text-stone-700">
          <li>
            <span className="text-ink">Storage</span> — an S3-compatible API for
            buckets and objects, encrypted by default. Use any S3 client.
          </li>
          <li>
            <span className="text-ink">Knowledge</span> — turn a bucket into a
            searchable index with hybrid keyword + vector retrieval and verifiable
            citations.
          </li>
          <li>
            <span className="text-ink">Agents</span> — configurable assistants
            with tools, memory, and knowledge, reachable over an OpenAI-compatible
            chat API.
          </li>
          <li>
            <span className="text-ink">MCP</span> — the same buckets, search, and
            agents exposed to Claude Desktop, Cursor, and any MCP client.
          </li>
        </ul>

        <h2
          id="where-to-next"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Where to go next
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          New here? Start with the concepts, then the quickstart.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-stone-200/60 p-6 hover:bg-stone-50"
            >
              <div className="text-[15px] text-ink">{c.title}</div>
              <div className="mt-2 text-[14px] leading-[1.6] text-stone-600">
                {c.body}
              </div>
            </Link>
          ))}
        </div>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
