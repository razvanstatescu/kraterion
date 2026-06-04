import type { Metadata } from "next";
import Link from "next/link";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Roadmap — Kraterion docs",
  description:
    "What's coming next: a LangGraph checkpointer, a Vercel AI SDK wrapper, and a command-line tool. Previews of work that isn't available yet.",
};

const HEADINGS = [
  { id: "langgraph", label: "LangGraph", level: 2 as const },
  { id: "vercel-ai-sdk", label: "Vercel AI SDK", level: 2 as const },
  { id: "cli", label: "CLI", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Roadmap</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Coming soon
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          A few things we&apos;re building but haven&apos;t shipped. The pages below
          describe the intended shape — none of it is available yet, so treat the
          snippets as previews, not working code.
        </p>

        <h2 id="langgraph" className="mt-16 text-[24px] leading-[1.2] text-ink">
          LangGraph
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A drop-in checkpointer (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            WalrusCheckpointSaver
          </code>
          ) that makes any LangGraph run record itself to a project you own — no
          other change to your graph. Preview:{" "}
          <Link
            href="/docs/langgraph"
            className="text-krater underline-offset-2 hover:underline"
          >
            LangGraph
          </Link>
          .
        </p>

        <h2
          id="vercel-ai-sdk"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Vercel AI SDK
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A model wrapper (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            withKraterion
          </code>
          ) that captures every generation and tool call from a Vercel AI SDK app.
          Preview:{" "}
          <Link
            href="/docs/vercel-ai-sdk"
            className="text-krater underline-offset-2 hover:underline"
          >
            Vercel AI SDK
          </Link>
          .
        </p>

        <h2 id="cli" className="mt-16 text-[24px] leading-[1.2] text-ink">
          CLI
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion
          </code>{" "}
          command-line tool for scripting buckets, indexing, and runs from your
          terminal. Not yet available. Until then, everything is reachable through
          the S3 client of your choice and the{" "}
          <Link
            href="/docs/agents/chat-api"
            className="text-krater underline-offset-2 hover:underline"
          >
            REST and agent APIs
          </Link>
          .
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
