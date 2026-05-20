import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { SectionFrame } from "@/components/marketing/SectionFrame";
import { BucketFlowRibbon } from "@/components/marketing/BucketFlowRibbon";
import { AgentTools } from "@/components/marketing/AgentTools";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Knowledge & Agents — Kraterion",
  description:
    "Your bucket, now answerable. Hybrid search, OpenAI-compatible agents, verifiable citations.",
};

const AGENT_TABS = [
  {
    lang: "bash",
    filename: "curl",
    code: `curl https://api.kraterion.com/v1/agents/support/chat/completions \\
  -H "Authorization: Bearer $KRATERION_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"What is our refund policy?"}]}'`,
  },
  {
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const r = await client.chat.completions.create({
  model: "support",
  messages: [{ role: "user", content: "What is our refund policy?" }],
});`,
  },
  {
    lang: "python",
    filename: "openai.py",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.kraterion.com/v1/agents/support",
    api_key=os.environ["KRATERION_KEY"],
)

r = client.chat.completions.create(
    model="support",
    messages=[{"role": "user", "content": "What is our refund policy?"}],
)`,
  },
];

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <p className="micro text-stone-500">Knowledge & agents</p>
            <h1 className="mt-4 max-w-[840px] text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[72px]">
              Your bucket, now answerable.
            </h1>
            <p className="mt-8 max-w-[640px] text-[18px] text-stone-700">
              Flip a switch on a bucket. Every file becomes searchable, citable, and ready to power agents.
            </p>
            <div className="mt-10 flex items-center gap-6">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
              <a href="/docs" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                Read the docs
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-ink text-cream">
        <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-12">
          <p className="micro text-stone-400">How it works</p>
          <h2 className="mt-4 max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
            Bucket → indexed → answer.
          </h2>
          <p className="mt-6 max-w-[760px] text-[18px] text-stone-300">
            BM25 + dense vector retrieval. Top-k = 8, reranked to 4. Every answer carries citations back to the source file.
          </p>
        </div>
        <BucketFlowRibbon />
      </section>

      <SectionFrame
        eyebrow="Hybrid search"
        headline="Lexical and semantic, together."
        lede="Pure keyword search misses paraphrases. Pure vector search misses exact phrases. We combine both so neither gap is yours."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <Card title="BM25" detail="Exact terms, exact matches. Stop-word tuned, lemmatized." />
          <Card title="Dense vectors" detail="Multilingual embeddings. Semantic recall across paraphrase." />
          <Card title="Rerank" detail="Cross-encoder rescore on top-k. The final 4 are the relevant 4." />
        </div>
      </SectionFrame>

      <SectionFrame
        id="agents"
        eyebrow="Agents"
        headline="OpenAI-compatible. Drop-in."
        lede="Replace the base URL. Your existing OpenAI client now runs against your bucket."
      >
        <CodeBlock tabs={AGENT_TABS} />
      </SectionFrame>

      <SectionFrame
        eyebrow="Citations"
        headline="Every answer, bound to a source."
        lede="No phantom answers. Each response carries the file, page, and chunk it came from — independently verifiable."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <FadeUp>
            <div className="rounded-lg border border-stone-200/60 bg-cream p-6">
              <div className="micro text-stone-500">Answer</div>
              <p className="mt-3 text-[15px] text-ink">
                Refunds are processed within 7 business days from the original payment method.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-sm border border-krater/40 bg-krater/10 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-krater">
                src · pricing-faq.md · §3
              </div>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="rounded-lg border border-stone-200/60 bg-stone-50 p-6 font-mono text-[12px]">
              <div className="micro text-stone-500">Cited chunk</div>
              <pre className="mt-3 whitespace-pre-wrap text-stone-700">{`§3 — Refunds

Refunds are processed within 7 business days from the
original payment method. Annual plans are pro-rated.`}</pre>
            </div>
          </FadeUp>
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Tools"
        headline="Five built-in agent tools."
        lede="Each tool is just a function. The agent picks which to call. You can see, log, and override every call."
      >
        <AgentTools />
      </SectionFrame>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Index a bucket. Get answers.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}

function Card({ title, detail }: { title: string; detail: string }) {
  return (
    <FadeUp className="rounded-lg border border-stone-200/60 bg-cream p-6">
      <div className="text-[18px] font-medium text-ink">{title}</div>
      <p className="mt-2 text-[14px] text-stone-700">{detail}</p>
    </FadeUp>
  );
}
