import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "@/components/marketing/BucketFlowRibbon";
import { AgentTools } from "@/components/marketing/AgentTools";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { KnowledgeStates } from "@/components/marketing/KnowledgeStates";
import { RetrievalScoreList } from "@/components/marketing/visuals/RetrievalScoreList";
import { VectorDotField } from "@/components/marketing/visuals/VectorDotField";
import { ChunkingRibbon } from "@/components/marketing/visuals/ChunkingRibbon";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, MessageCircle, Layers } from "lucide-react";
import { DashboardChrome, FileRow } from "@/components/marketing/rich/DashboardSlice";

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

const KNOWLEDGE_STATS = [
  { value: "BM25 + vec", label: "hybrid retrieval", sub: "Lexical and semantic" },
  { value: "top-k 8", label: "retrieval depth", sub: "Reranked to 4" },
  { value: "100%", label: "of answers cited", sub: "Source-bound" },
  { value: "5", label: "built-in agent tools", sub: "search, list, read, write, manifest" },
];

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-24">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <FadeUp>
              <NumberedEyebrow n="KL" label="Knowledge & agents" />
              <h1 className="mt-6 max-w-[680px] text-[44px] leading-[1.05] tracking-[-0.02em] md:text-[80px]">
                Your bucket,
                <br />
                <span className="text-stone-500">now answerable.</span>
              </h1>
              <p className="mt-8 max-w-[560px] text-[18px] text-stone-700">
                Flip a switch on a bucket. Every file becomes searchable, citable, and ready to power agents.
              </p>
              <div className="mt-10 flex items-center gap-6">
                <ButtonLink href="mailto:hello@kraterion.com?subject=Beta%20access%20request" variant="primary" size="lg">Get early access →</ButtonLink>
                <a href="/docs" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                  Read the docs
                </a>
              </div>
            </FadeUp>
          </div>
          <FadeUp delay={0.2}>
            <DashboardChrome url="app.kraterion.com" path="/buckets/support-docs">
              <div className="bg-cream">
                <FileRow icon="file" name="pricing-faq.md" size="12 KB" status="indexed" />
                <FileRow icon="file" name="product-overview.pdf" size="482 KB" status="indexed" />
                <FileRow icon="file" name="release-notes-2026-05.md" size="8 KB" status="indexed" />
                <FileRow icon="file" name="onboarding-guide.pdf" size="1.2 MB" status="indexed" />
                <FileRow icon="file" name="support-runbook.md" size="24 KB" status="indexed" />
              </div>
              <div className="border-t border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] font-mono text-stone-600">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
                  18 files · 48 chunks · ready to query
                </span>
              </div>
            </DashboardChrome>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={KNOWLEDGE_STATS} />
        </div>
      </section>

      {/* Ribbon */}
      <section className="bg-ink text-cream">
        <BucketFlowRibbon
          eyebrowN="01"
          eyebrowLabel="How it works"
          headline="Bucket → indexed → answer."
          lede="BM25 + dense vector retrieval. Top-k = 8, reranked to 4. Every answer carries citations back to the source file."
        />
      </section>

      {/* Chunking ribbon — how indexing works */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01a" label="Indexing" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Each file becomes 8 chunks. Each chunk becomes a vector.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <ChunkingRibbon />
            </div>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline align="left">
        Every answer carries a receipt.
      </BridgeHeadline>

      {/* State transition citations + retrieval list */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Citations" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Ask. Retrieve.
                <br />
                <span className="text-stone-500">Answer with sources.</span>
              </h2>
              <p className="mt-6 max-w-[560px] text-[16px] text-stone-700">
                No phantom answers. Watch the agent walk from the question, through retrieval, to a citation-bound response.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <KnowledgeStates />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-8">
              <RetrievalScoreList />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Hybrid search beat */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Hybrid search" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Lexical and semantic, together.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] text-stone-700">
                Pure keyword search misses paraphrases. Pure vector search misses exact phrases. We combine both so neither gap is yours.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            <Card eyebrow="01" title="BM25" detail="Exact terms, exact matches. Stop-word tuned, lemmatized." />
            <Card eyebrow="02" title="Dense vectors" detail="Multilingual embeddings. Semantic recall across paraphrase." />
            <Card eyebrow="03" title="Rerank" detail="Cross-encoder rescores top-k. The final 4 are the relevant 4." />
          </div>
          <FadeUp delay={0.1}>
            <div className="mt-8">
              <VectorDotField />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Agents" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                OpenAI-compatible.
                <br />
                <span className="text-stone-500">Drop-in.</span>
              </h2>
              <p className="mt-6 max-w-[560px] text-[16px] text-stone-700">
                Replace the base URL. Your existing OpenAI client now runs against your bucket.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={AGENT_TABS} />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Tools */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="Tools" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Five built-in agent tools.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] text-stone-700">
                Each tool is just a function. The agent picks which to call. You can see, log, and override every call.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12">
            <AgentTools />
          </div>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Answerable storage"
        headline={
          <>
            Index a bucket.
            <br />
            <span className="text-stone-500">Get answers.</span>
          </>
        }
        sub="Citation-bound responses. Drop-in OpenAI clients. Five built-in tools."
        satellites={[
          { icon: BookOpen, label: "Knowledge docs", detail: "Indexing, retrieval, citations.", href: "/docs" },
          { icon: Layers, label: "Agents", detail: "Built-in tools and quotas.", href: "/knowledge#agents" },
          { icon: MessageCircle, label: "Embed widget", detail: "Drop a chat on any site.", href: "/embed" },
        ]}
      />
    </>
  );
}

function Card({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <FadeUp className="bg-cream p-8">
      <div className="font-mono text-[12px] tabular-nums text-krater">{eyebrow}</div>
      <div className="mt-2 text-[20px] font-medium text-ink">{title}</div>
      <p className="mt-3 text-[14px] leading-[1.6] text-stone-700">{detail}</p>
    </FadeUp>
  );
}
