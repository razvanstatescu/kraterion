import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Vercel AI SDK — Kraterion docs",
  description:
    "Wrap any Vercel AI SDK model with withKraterion to make every generation replayable and auditable. One import, no other change to your agent.",
};

const HEADINGS = [
  { id: "install", label: "Install", level: 2 as const },
  { id: "wrap", label: "Wrap the model", level: 2 as const },
  { id: "run", label: "Run and replay", level: 2 as const },
  { id: "tools", label: "Tools and memory", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Roadmap</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">Vercel AI SDK</h1>
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
          Wrap any Vercel AI SDK model with one import. Every generation and tool
          call records itself — replayable, auditable, and stored in a project
          you own.
        </p>

        <h2 id="install" className="mt-16 text-[24px] leading-[1.2] text-ink">Install</h2>
        <div className="mt-4">
          <CodeBlock tabs={[{ lang: "bash", filename: "shell", code: "pnpm add @kraterion/ai-sdk" }]} />
        </div>

        <h2 id="wrap" className="mt-16 text-[24px] leading-[1.2] text-ink">Wrap the model</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Pass your model through{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">withKraterion</code>.
          It uses the SDK&apos;s middleware hooks, so the rest of your code is
          unchanged.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "typescript",
                filename: "model.ts",
                code: `import { openai } from "@ai-sdk/openai";
import { withKraterion } from "@kraterion/ai-sdk";

export const model = withKraterion(openai("gpt-4o"), {
  project: "support",
});`,
              },
            ]}
          />
        </div>

        <h2 id="run" className="mt-16 text-[24px] leading-[1.2] text-ink">Run and replay</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Use the wrapped model anywhere you would use the original. Each run
          returns a receipt you can replay later.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "typescript",
                filename: "run.ts",
                code: `import { generateText } from "ai";
import { model } from "./model";

const { text } = await generateText({
  model,
  prompt: "What is our refund policy?",
});
// run recorded · receipt 3f4d…ae`,
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

        <h2 id="tools" className="mt-16 text-[24px] leading-[1.2] text-ink">Tools and memory</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Tool calls are captured at the orchestration layer, so they show up in
          the run record and the lineage graph. Turn on memory to add{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">memory.remember</code>{" "}
          and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">memory.recall</code>{" "}
          as tools the model can call.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "typescript",
                filename: "memory.ts",
                code: `export const model = withKraterion(openai("gpt-4o"), {
  project: "support",
  memory: true,
});`,
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
