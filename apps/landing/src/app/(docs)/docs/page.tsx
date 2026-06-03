import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Docs — Kraterion",
  description: "Reference docs for the Kraterion API, SDKs, knowledge layer, agents, and embed widget.",
};

export default function Page() {
  return (
    <section className="mx-auto max-w-[1080px] px-6 pt-24 pb-24">
      <p className="micro text-stone-500">Docs</p>
      <h1 className="mt-4 text-[48px] leading-[1.05] tracking-[-0.01em]">Docs</h1>
      <p className="mt-6 max-w-[640px] text-[18px] text-stone-700">
        Wrap an agent you already have, run it, and replay it from a receipt — in
        under five minutes.
      </p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link
          href="/docs/quickstart"
          className="rounded-lg border border-stone-200/60 p-6 hover:bg-stone-50"
        >
          <div className="text-[15px] font-medium">Quickstart</div>
          <div className="mt-2 text-[14px] text-stone-600">
            Run an agent, record it, and replay it from its receipt.
          </div>
        </Link>
        <Link
          href="/docs/langgraph"
          className="rounded-lg border border-stone-200/60 p-6 hover:bg-stone-50"
        >
          <div className="text-[15px] font-medium">LangGraph</div>
          <div className="mt-2 text-[14px] text-stone-600">
            Swap the checkpointer for WalrusCheckpointSaver. One import.
          </div>
        </Link>
        <Link
          href="/docs/vercel-ai-sdk"
          className="rounded-lg border border-stone-200/60 p-6 hover:bg-stone-50"
        >
          <div className="text-[15px] font-medium">Vercel AI SDK</div>
          <div className="mt-2 text-[14px] text-stone-600">
            Wrap any model with withKraterion. No other change.
          </div>
        </Link>
      </div>
    </section>
  );
}
