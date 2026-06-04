import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "LangGraph — Kraterion docs",
  description:
    "Make any existing LangGraph graph replayable and auditable with one import. Swap the checkpointer for WalrusCheckpointSaver — no other code change.",
};

const HEADINGS = [
  { id: "install", label: "Install", level: 2 as const },
  { id: "swap", label: "Swap the checkpointer", level: 2 as const },
  { id: "run", label: "Run and replay", level: 2 as const },
  { id: "memory", label: "Add memory", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Roadmap</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">LangGraph</h1>
        <div className="mt-6 border-l-2 border-krater bg-stone-50 px-5 py-4 text-[14px] leading-[1.65] text-stone-700">
          <span className="text-ink">Coming soon — not yet available.</span> This
          page previews the intended design. The package below doesn&apos;t exist
          yet; treat the snippets as a preview, not working code. See the{" "}
          <a href="/docs/roadmap" className="text-krater underline-offset-2 hover:underline">
            roadmap
          </a>
          .
        </div>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Make any existing LangGraph graph replayable and auditable with one
          import. LangGraph already checkpoints state at every step — point that
          checkpointer at Kraterion and every run records itself.
        </p>

        <h2 id="install" className="mt-16 text-[24px] leading-[1.2] text-ink">Install</h2>
        <div className="mt-4">
          <CodeBlock tabs={[{ lang: "bash", filename: "shell", code: "pip install kraterion-langgraph" }]} />
        </div>

        <h2 id="swap" className="mt-16 text-[24px] leading-[1.2] text-ink">Swap the checkpointer</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Replace your existing checkpointer with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">WalrusCheckpointSaver</code>.
          Nothing else about your graph changes.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "graph.py",
                code: `from langgraph.graph import StateGraph
from kraterion.langgraph import WalrusCheckpointSaver

builder = StateGraph(State)
# ... add your nodes and edges as usual ...

graph = builder.compile(
    checkpointer=WalrusCheckpointSaver(project="support"),
)`,
              },
            ]}
          />
        </div>

        <h2 id="run" className="mt-16 text-[24px] leading-[1.2] text-ink">Run and replay</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Run the graph as you always have. Each run prints a receipt you can
          replay against the same inputs and the same retrieved data.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "run.py",
                code: `result = graph.invoke({"question": "What is our refund policy?"})
# run recorded · receipt 3f4d…ae`,
              },
              {
                lang: "bash",
                filename: "shell",
                code: `kraterion replay 3f4d…ae
# ✓ replay matches original · verified`,
              },
            ]}
          />
        </div>

        <h2 id="memory" className="mt-16 text-[24px] leading-[1.2] text-ink">Add memory</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Turn on persistent memory and the graph gets{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">memory.remember</code>{" "}
          and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">memory.recall</code>{" "}
          as tools. The model decides when to use them, and every call is scoped
          to the agent and recorded with the run.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "memory.py",
                code: `graph = builder.compile(
    checkpointer=WalrusCheckpointSaver(project="support", memory=True),
)`,
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
