import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "@/components/marketing/BucketFlowRibbon";
import { AgentRunPanel } from "@/components/marketing/AgentRunPanel";
import { MCPCallout } from "@/components/marketing/MCPCallout";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, MessageCircle, Layers } from "lucide-react";
import { DashboardChrome, FileRow } from "@/components/marketing/rich/DashboardSlice";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Knowledge & Agents — Kraterion",
  description:
    "Your bucket, now answerable. Hybrid search via Reciprocal Rank Fusion, OpenAI-compatible agents, verifiable citations.",
};

const AGENT_TABS = [
  {
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const reply = await client.chat.completions.create({
  model: "support",
  messages: [
    { role: "user", content: "What is our refund policy?" },
  ],
});

console.log(reply.choices[0].message.content);
// → Refunds are processed within 7 business days
//   from the original payment method.
//
// citations: [pricing-faq.md · §3 · 0.92]`,
  },
  {
    lang: "python",
    filename: "openai.py",
    code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.kraterion.com/v1/agents/support",
    api_key=os.environ["KRATERION_KEY"],
)

reply = client.chat.completions.create(
    model="support",
    messages=[
        {"role": "user", "content": "What is our refund policy?"},
    ],
)

print(reply.choices[0].message.content)`,
  },
  {
    lang: "bash",
    filename: "curl",
    code: `curl https://api.kraterion.com/v1/agents/support/chat/completions \\
  -H "Authorization: Bearer $KRATERION_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "support",
    "messages": [
      {"role": "user", "content": "What is our refund policy?"}
    ]
  }'`,
  },
];

const KNOWLEDGE_STATS = [
  { value: "BM25 + vec", label: "Hybrid retrieval", sub: "Lexical and semantic" },
  { value: "top-k 8", label: "Retrieval depth", sub: "Fused via RRF" },
  { value: "100%", label: "Of answers cited", sub: "Source-bound" },
  { value: "6", label: "Built-in agent tools", sub: "search, list-buckets, list-objects, read, write, manifest" },
];

const TOOLS: { name: string; sig: string; description: string }[] = [
  {
    name: "search",
    sig: "search(bucket, query)",
    description: "Hybrid retrieval over indexed chunks. Returns ranked hits with file + section refs.",
  },
  {
    name: "list-buckets",
    sig: "list_buckets()",
    description: "Enumerate the buckets the agent's credential is scoped to.",
  },
  {
    name: "list-objects",
    sig: "list_objects(bucket, prefix?)",
    description: "List S3 keys in a bucket, optionally filtered by prefix.",
  },
  {
    name: "read",
    sig: "read_object(bucket, key)",
    description: "Fetch full object bytes — decrypted via the agent's sub-credential.",
  },
  {
    name: "write",
    sig: "write_object(bucket, key, body)",
    description: "Write a new object back to the bucket — only enabled for read-write agents.",
  },
  {
    name: "manifest",
    sig: "get_manifest(answer_id)",
    description: "Pull the tamper-evident audit record for an earlier agent answer.",
  },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <div>
            <FadeUp>
              <NumberedEyebrow n="KL" label="Knowledge & agents" />
              <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
                Your bucket,
                <br />
                <span className="text-stone-500">now answerable.</span>
              </h1>
              <p className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
                Flip a switch on a bucket. Every file becomes searchable, citable, and ready to power agents that speak the OpenAI Chat Completions wire format.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <ButtonLink
                  href="mailto:hello@kraterion.com?subject=Beta%20access%20request"
                  variant="primary"
                  size="lg"
                >
                  Get early access →
                </ButtonLink>
                <a
                  href="/docs"
                  className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
                >
                  Read the docs
                </a>
              </div>
            </FadeUp>
          </div>
          <FadeUp delay={0.35} className="mx-auto w-full max-w-[520px]">
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
                  5 files · 24 chunks · ready to query
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

      {/* Ribbon — the full lifecycle, pinned */}
      <section className="bg-ink text-cream">
        <BucketFlowRibbon
          eyebrowN="01"
          eyebrowLabel="How it works"
          headline="Bucket → indexed → answered."
          lede="BM25 + dense vector retrieval, fused via Reciprocal Rank Fusion (RRF). Top-k 8 hybrid candidates feed the agent. Every answer carries citations back to the source file."
        />
      </section>

      {/* Hybrid search — honest 2-card layout */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Hybrid search" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Lexical and semantic, together.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Pure keyword search misses paraphrases. Pure vector search misses exact phrases. We run both legs in parallel and combine them with Reciprocal Rank Fusion — no learned reranker, just the same RRF that Microsoft, Elastic, and the IR community converged on.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            <Card
              eyebrow="01 · Lexical leg"
              title="BM25"
              detail="Exact terms, exact matches. Postgres tsvector + GIN index."
            />
            <Card
              eyebrow="02 · Semantic leg"
              title="Dense vectors"
              detail="text-embedding-3-small at 1024 dims, stored as pgvector halfvec for fast cosine search."
            />
            <Card
              eyebrow="03 · Fusion"
              title="Reciprocal Rank Fusion"
              detail="Each leg contributes 1 / (k + rank). No training, no cross-encoder, no per-query model call."
            />
          </div>
        </div>
      </section>

      <BridgeHeadline align="left">
        Every answer carries a receipt.
      </BridgeHeadline>

      {/* Agents — code + live trace, matching homepage */}
      <section id="agents" className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Agents" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                OpenAI-compatible.
                <br />
                <span className="text-stone-500">Scoped by default.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-700">
                Replace the base URL — your existing OpenAI client now runs against your bucket. Each agent gets its own credential you can grant, audit, and revoke per agent. Bring your own model key (OpenAI, Anthropic, etc.) — Kraterion bills you $0 for the chat call itself.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
            <FadeUp className="flex">
              <div className="flex w-full">
                <CodeBlock tabs={AGENT_TABS} className="w-full min-h-[440px]" />
              </div>
            </FadeUp>
            <FadeUp delay={0.1} className="flex">
              <AgentRunPanel className="w-full" />
            </FadeUp>
          </div>

          <div className="mt-20">
            <MCPCallout />
          </div>
        </div>
      </section>

      {/* Tools inventory — six built-in tools */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Built-in tools" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Six tools the agent already knows how to call.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Each one is a typed function with a JSON schema. The agent picks which to call. You can see, log, and override every call — and add your own.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <ul className="divide-y divide-stone-200/60">
                {TOOLS.map((t) => (
                  <li
                    key={t.name}
                    className="grid grid-cols-1 items-baseline gap-2 px-5 py-4 md:grid-cols-[180px_260px_1fr] md:gap-6"
                  >
                    <span className="font-mono text-[14px] tabular-nums text-krater">
                      {t.name}
                    </span>
                    <code className="font-mono text-[12px] text-stone-700">
                      {t.sig}
                    </code>
                    <span className="text-[13px] leading-[1.55] text-stone-600">
                      {t.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Answerable storage"
        headline={
          <>
            Index a bucket.
            <br />
            <span className="text-stone-500">Get answers with citations.</span>
          </>
        }
        primaryHref="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        primaryLabel="Get early access →"
        sub="Citation-bound responses. Drop-in OpenAI clients. Six built-in tools. BYOK for the model — $0 from us on the chat call itself."
        satellites={[
          { icon: BookOpen, label: "Knowledge docs", detail: "Indexing, retrieval, citations.", href: "/docs" },
          { icon: Layers, label: "Agents", detail: "Built-in tools and scoped credentials.", href: "/knowledge#agents" },
          { icon: MessageCircle, label: "Embed widget", detail: "Drop a chat on any site.", href: "/embed" },
        ]}
      />
    </>
  );
}

function Card({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <FadeUp className="bg-cream p-8">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {eyebrow}
      </div>
      <div className="mt-3 text-[20px] font-medium text-ink">{title}</div>
      <p className="mt-3 text-[14px] leading-[1.6] text-stone-700">{detail}</p>
    </FadeUp>
  );
}
