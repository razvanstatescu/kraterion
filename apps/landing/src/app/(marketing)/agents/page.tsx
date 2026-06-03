import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { AgentRunPanel } from "@/components/marketing/AgentRunPanel";
import { MCPCallout } from "@/components/marketing/MCPCallout";
import { RuntimeCapabilities } from "@/components/marketing/RuntimeCapabilities";
import { EmbedSnippet } from "@/components/marketing/EmbedSnippet";
import { EmbedPreview } from "@/components/marketing/EmbedPreview";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import {
  BookOpen,
  MessageCircle,
  MessageSquare,
  Globe,
  Lock,
  Quote,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Agents — Kraterion",
  description:
    "Build an agent over your own data. OpenAI-compatible, scoped by a credential you can revoke, and every run recorded as a replayable, auditable trail.",
};

const AGENT_TABS = [
  {
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

// Already OpenAI-compatible — point the base URL at your agent.
const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const reply = await client.chat.completions.create({
  model: "support",
  messages: [{ role: "user", content: "What is our refund policy?" }],
});
// → Refunds are processed within 7 business days.
// citations: [pricing-faq.md · §3 · 0.92] · run recorded`,
  },
  {
    lang: "python",
    filename: "langgraph.py",
    code: `from kraterion.langgraph import WalrusCheckpointSaver

# Bring your own graph. One import makes every run replayable.
graph = builder.compile(
    checkpointer=WalrusCheckpointSaver(project="support"),
)

result = graph.invoke({"question": "What is our refund policy?"})
# run recorded · receipt 3f4d…ae`,
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

const STATS = [
  { value: "OpenAI", label: "compatible API", sub: "Swap the base URL" },
  { value: "1", label: "credential per agent", sub: "Grant, audit, revoke" },
  { value: "6", label: "built-in tools", sub: "Plus your own" },
  { value: "every", label: "run recorded", sub: "Replayable and audited" },
];

const CLAIMS = [
  {
    n: "01",
    title: "OpenAI-compatible.",
    body: "Point your existing OpenAI client at an agent's base URL. No new client to learn, no rewrite — your code already works.",
  },
  {
    n: "02",
    title: "Scoped by default.",
    body: "Each agent gets its own credential, scoped to the buckets and tools it needs. Grant it, audit it, revoke it — per agent, not one master key.",
  },
  {
    n: "03",
    title: "Grounded in your data.",
    body: "Agents read from your knowledge bases and answer with citations you can verify against the exact source.",
  },
  {
    n: "04",
    title: "On the record.",
    body: "Every run an agent makes is recorded as a replayable, tamper-evident trail — retrievals, tool calls, memory, and outputs.",
  },
];

const TOOLS: { name: string; sig: string; description: string }[] = [
  { name: "search", sig: "search(bucket, query)", description: "Hybrid retrieval over indexed chunks. Returns ranked hits with file and section refs." },
  { name: "list-buckets", sig: "list_buckets()", description: "Enumerate the buckets the agent's credential is scoped to." },
  { name: "list-objects", sig: "list_objects(bucket, prefix?)", description: "List object keys in a bucket, optionally filtered by prefix." },
  { name: "read", sig: "read_object(bucket, key)", description: "Fetch full object bytes, decrypted under the agent's own credential." },
  { name: "write", sig: "write_object(bucket, key, body)", description: "Write a new object back to the bucket — only for read-write agents." },
  { name: "memory", sig: "memory.remember / recall", description: "Save and fetch long-term notes when persistent memory is enabled." },
];

const EMBED_PROPS: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: Globe, title: "Origin-locked tokens", detail: "Each share token only works on the domains you allow." },
  { icon: Lock, title: "Only cited answers ship", detail: "The agent answers from your buckets; the raw files never leave." },
  { icon: Quote, title: "Citations included", detail: "Every reply links back to the source it came from." },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <FadeUp>
            <NumberedEyebrow n="AG" label="Agents" />
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Agents over your data.
              <br />
              <span className="text-stone-500">Scoped and on the record.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Build an agent over your own files. It speaks the OpenAI wire format, runs on a credential you can revoke, and every run it makes is recorded as a replayable, auditable trail.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="mailto:hello@kraterion.com?subject=Beta%20access%20request" variant="primary">
                Get early access →
              </ButtonLink>
              <ButtonLink href="/docs" variant="ghost">
                Read the docs
              </ButtonLink>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
              <span>OpenAI-compatible</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Scoped</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Recorded</span>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mx-auto w-full max-w-[520px]">
              <AgentRunPanel className="w-full" />
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={STATS} />
        </div>
      </section>

      {/* Drop-in endpoint */}
      <section className="bg-cream pb-24 md:pb-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Connect" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                The client you already use.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Swap the base URL, or wrap an existing LangGraph or Vercel AI SDK agent with one import. Either way, the run records itself.
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
        </div>
      </section>

      {/* Four claims */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="What you get" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                An agent you can
                <br />
                actually govern.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {CLAIMS.map((c) => (
              <FadeUp key={c.n} className="bg-cream p-8 md:p-10">
                <div className="font-mono text-[12px] tabular-nums text-krater">{c.n}</div>
                <h3 className="mt-4 text-[24px] leading-[1.25] text-ink">{c.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.65] text-stone-700">{c.body}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Built-in tools */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Built-in tools" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Tools, ready out of the box.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Every agent ships with tools for searching and reading your data. Add your own, and each call shows up in the run record.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
            {TOOLS.map((t, i) => (
              <FadeUp
                key={t.name}
                className={`grid grid-cols-1 gap-1 px-5 py-5 md:grid-cols-[180px_1fr] md:gap-6 ${
                  i < TOOLS.length - 1 ? "border-b border-stone-200/60" : ""
                }`}
              >
                <span className="font-mono text-[13px] text-krater">{t.sig}</span>
                <span className="text-[14px] leading-[1.6] text-stone-700">{t.description}</span>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <BridgeHeadline align="left">
        Every run an agent makes.
        <br />
        <span className="text-stone-500">Recorded and replayable.</span>
      </BridgeHeadline>

      {/* Tie into the runtime */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="On the runtime" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Built on the runtime.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Because an agent runs through Kraterion, you get replay, lineage, and memory for free.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <RuntimeCapabilities />
            </div>
          </FadeUp>

          <div className="mt-20">
            <MCPCallout />
          </div>
        </div>
      </section>

      {/* Embed — put the agent on any site */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="Embed" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Put your agent on any site.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Issue a share token, paste one script tag, and your customers can ask the agent questions — answered with citations from the buckets you connect. The raw files never leave your project.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid items-stretch gap-x-10 gap-y-8 md:grid-cols-2">
            {/* Left — the one line, then what ships (compact) */}
            <FadeUp className="flex flex-col gap-4">
              <EmbedSnippet />
              <div className="hairline flex flex-1 flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                <div className="border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  What ships
                </div>
                <ul className="flex-1 divide-y divide-stone-200/60">
                  {EMBED_PROPS.map((p) => (
                    <li key={p.title} className="flex items-start gap-3 px-4 py-4">
                      <p.icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-stone-500" />
                      <span>
                        <span className="block text-[14px] text-ink">{p.title}</span>
                        <span className="block text-[13px] leading-[1.5] text-stone-600">{p.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-stone-200/60 px-4 py-4">
                  <ButtonLink href="/embed" variant="ghost">
                    Customize the widget
                  </ButtonLink>
                </div>
              </div>
            </FadeUp>

            {/* Right — the widget as it appears on a customer's site */}
            <FadeUp delay={0.1} className="flex flex-col">
              <span className="mb-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                Live preview
              </span>
              <EmbedPreview className="flex-1" />
            </FadeUp>
          </div>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Agents"
        headline={
          <>
            Ship an agent
            <br />
            <span className="text-stone-500">you can stand behind.</span>
          </>
        }
        sub="OpenAI-compatible. Scoped per agent. Every run on the record."
        satellites={[
          { icon: BookOpen, label: "Read the docs", detail: "Endpoints, tools, and the SDKs.", href: "/docs" },
          { icon: MessageSquare, label: "Embed a chat", detail: "Drop an agent on any site in one line.", href: "/embed" },
          { icon: MessageCircle, label: "Talk to us", detail: "Custom tools and scopes.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}
