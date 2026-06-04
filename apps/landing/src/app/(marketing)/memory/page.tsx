import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import {
  Brain,
  Check,
  BookOpen,
  GitBranch,
  MessageCircle,
  Infinity as InfinityIcon,
  ArrowLeftRight,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Agent memory — Kraterion",
  description:
    "Turn on persistent memory and your agent decides when to remember and recall. Built on Walrus Memory — an open, decentralized memory layer — so memory is persistent, portable, private, and owned by you.",
};

const STATS = [
  { value: "2", label: "tools: remember & recall", sub: "The agent decides when" },
  { value: "1", label: "credential scopes it", sub: "Revoke it, revoke memory" },
  { value: "MCP", label: "in your assistant", sub: "Claude Desktop, Cursor" },
  { value: "yours", label: "stored in your project", sub: "Recorded with the run" },
];

const WHY_WALRUS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: InfinityIcon,
    title: "Persistent",
    body: "Memory outlives sessions, restarts, and deploys. Your agent picks up where it left off instead of starting from scratch every time.",
  },
  {
    icon: ArrowLeftRight,
    title: "Portable",
    body: "It isn't locked to Kraterion. The same memory can move with your agent across apps and models — no vendor lock-in.",
  },
  {
    icon: Lock,
    title: "Private",
    body: "Every note is encrypted before it's stored. The network keeps your memory available but can't read what's inside it.",
  },
  {
    icon: ShieldCheck,
    title: "Verifiable",
    body: "Each memory is tamper-evident. You can confirm a note is exactly what was written — handy when a decision needs an audit trail.",
  },
];

const HOW = [
  { n: "01", title: "Turn it on", body: "Flip “Enable persistent memory” on an agent. Two tools appear alongside your own: remember and recall." },
  { n: "02", title: "The agent decides", body: "Mid-task, the model chooses when to save something and when to fetch prior context. It is just another tool call." },
  { n: "03", title: "Scoped to the agent", body: "Memory access is derived from the agent’s own credential. It can only touch its own memory." },
  { n: "04", title: "Recorded and revocable", body: "Each remember and recall lands in the run record. Revoke the agent and its memory access stops with it." },
];

const TOOL_TABS = [
  {
    lang: "json",
    filename: "tools.json",
    code: `// Injected when persistent memory is on.
[
  {
    "name": "memory.remember",
    "description": "Save a note to long-term memory.",
    "parameters": { "content": "string", "tags": "string[]?" }
  },
  {
    "name": "memory.recall",
    "description": "Fetch relevant notes from memory.",
    "parameters": { "query": "string", "limit": "number?" }
  }
]`,
  },
  {
    lang: "typescript",
    filename: "run.ts",
    code: `// To the model, memory is just a tool. To you, it is a span
// in the run record and an edge in the lineage graph.

// → recall  query: "user prefs"        → 2 notes
// → search  query: "refund policy"      → 4 hits
// → remember content: "wants markdown"  → saved
//
// run recorded · receipt 3f4d…ae · memory scoped to agent`,
  },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <FadeUp>
            <NumberedEyebrow n="AM" label="Agent memory" />
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Memory agents
              <br />
              <span className="text-stone-500">choose to use.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Turn on persistent memory and your agent gets two tools — remember and recall. The model decides when to use them. Every call is scoped to the agent&apos;s credential, recorded with the run, and reachable from your AI assistant over MCP.
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
              <span>Remember</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Recall</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Revocable</span>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mx-auto w-full max-w-[520px]">
              <MemoryConfigPanel />
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={STATS} />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="How it works" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                A tool, not a hidden round-trip.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Memory is not bolted onto every message behind your back. It is a tool the agent reaches for when it needs to — which means it shows up in the run record and the lineage graph like any other call.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {HOW.map((c) => (
              <FadeUp key={c.n} className="bg-cream p-8 md:p-10">
                <div className="font-mono text-[12px] tabular-nums text-krater">{c.n}</div>
                <h3 className="mt-4 text-[24px] leading-[1.25] text-ink">{c.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.65] text-stone-700">{c.body}</p>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={TOOL_TABS} className="w-full" />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Behind the scenes — Walrus Memory */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Behind the scenes" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Built on Walrus Memory.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Persistent memory runs on Walrus Memory — an open memory layer built for AI agents. Instead of sitting in our database, every note your agent saves is encrypted and kept on an independent, decentralized network that you own. It is the same principle as the rest of Kraterion: your data lives somewhere you control, not somewhere you rent.
              </p>
            </div>
          </FadeUp>

          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {WHY_WALRUS.map((c) => (
              <FadeUp key={c.title} className="bg-cream p-8 md:p-10">
                <c.icon size={20} strokeWidth={1.5} className="text-stone-500" />
                <h3 className="mt-4 text-[22px] leading-[1.25] text-ink md:text-[24px]">{c.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.65] text-stone-700">{c.body}</p>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.1}>
            <p className="mt-8 max-w-[640px] text-[15px] leading-[1.6] text-stone-600">
              When the agent calls remember, the note is encrypted and stored; recall searches it back by meaning, not just keywords.{" "}
              <a
                href="https://memwal.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
              >
                Learn about Walrus Memory
              </a>
              .
            </p>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline align="left">
        Same memory.
        <br />
        <span className="text-stone-500">In your editor.</span>
      </BridgeHeadline>

      {/* MCP dividend */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="In your assistant" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Reachable over MCP.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Kraterion runs an MCP server, so remember and recall work from Claude Desktop, Cursor, or any MCP-compatible client — with the same scoped credentials and the same run record. Your assistant gets durable memory, no code required.
              </p>
              <div className="mt-8">
                <ButtonLink href="/agents" variant="ghost">
                  See the MCP setup
                </ButtonLink>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Honest dependency note */}
      <section className="bg-ink py-24 md:py-32 text-cream">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Worth knowing" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                One honest dependency.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-300">
                Memory runs through Walrus Memory&apos;s hosted service — the part that encrypts and stores each note. If you need strict availability guarantees, you can self-host it. Either way, the memory stays encrypted and owned by you.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Agent memory"
        headline={
          <>
            Give your agents memory
            <br />
            <span className="text-stone-500">you can take back.</span>
          </>
        }
        sub="Opt-in. Scoped per agent. Recorded with the run. Revocable in one step."
        satellites={[
          { icon: BookOpen, label: "Read the docs", detail: "The memory tools and MCP setup.", href: "/docs" },
          { icon: GitBranch, label: "See lineage", detail: "Memory as an edge in the graph.", href: "/runs#lineage" },
          { icon: MessageCircle, label: "Talk to us", detail: "Self-hosting and namespaces.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}

/* ─── Memory config panel ───────────────────────────────────────── */

function MemoryConfigPanel() {
  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="font-mono text-[11px] text-stone-600">agent · support</span>
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Config
        </span>
      </div>

      {/* Toggle row */}
      <div className="flex items-center justify-between border-b border-stone-200/60 px-5 py-4">
        <span className="inline-flex items-center gap-2.5">
          <Brain size={15} strokeWidth={1.5} className="text-krater" />
          <span className="text-[14px] text-ink">Enable persistent memory</span>
        </span>
        <span
          aria-hidden
          className="inline-flex h-5 w-9 items-center rounded-full border border-krater/30 bg-krater/[0.1] px-0.5"
        >
          <span className="ml-auto h-3.5 w-3.5 rounded-full bg-krater" />
        </span>
      </div>

      {/* Injected tools */}
      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Tools added
        </p>
        <ul className="space-y-2">
          {["memory.remember", "memory.recall"].map((t) => (
            <li
              key={t}
              className="flex items-center justify-between gap-3 rounded-md border border-stone-200/60 bg-stone-50/60 px-3.5 py-2.5"
            >
              <span className="font-mono text-[13px] text-ink">{t}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--color-success)]">
                <Check size={11} strokeWidth={2} />
                injected
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Scope footer */}
      <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50/60 px-4 py-3 font-mono text-[11px]">
        <span className="text-stone-600">scope · this agent only</span>
        <span className="text-krater">revoke → memory stops</span>
      </div>
    </div>
  );
}
