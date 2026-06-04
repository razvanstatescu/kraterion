import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { AgentRunPanel } from "@/components/marketing/AgentRunPanel";
import { LineageGraph } from "@/components/marketing/visuals/LineageGraph";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { Check, BookOpen, Brain, MessageCircle } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Replay & audit — Kraterion",
  description:
    "Every agent run is recorded as a tamper-evident trail you can replay from a receipt and trace backward through every input. Reproduce, audit, and verify any run.",
};

const STATS = [
  { value: "1", label: "receipt anchors every run", sub: "Replay from it anytime" },
  { value: "100%", label: "of steps captured", sub: "Retrieval, tools, memory" },
  { value: "1:1", label: "replay against the same inputs", sub: "Same retrieval, same data" },
  { value: "yours", label: "records you keep", sub: "Not vendor-held" },
];

const CAPTURED = [
  { n: "01", title: "Model and prompt", body: "The model used and a fingerprint of the system prompt, so you know exactly what ran." },
  { n: "02", title: "Inputs", body: "The user inputs that started the run, recorded verbatim." },
  { n: "03", title: "Retrievals", body: "Every chunk the agent retrieved, with the fingerprint of the exact source it came from." },
  { n: "04", title: "Tool calls", body: "Each tool the agent called, with its arguments and its result." },
  { n: "05", title: "Memory", body: "Every remember and recall, tied to the agent that made it." },
  { n: "06", title: "Outputs", body: "Intermediate steps and the final response — the whole chain, not just the answer." },
];

const REPLAY_STEPS = [
  { n: "01", step: "Copy the receipt", detail: "Every finished run prints a short receipt." },
  { n: "02", step: "Replay it", detail: "kraterion replay <receipt> — or call the API." },
  { n: "03", step: "Same inputs", detail: "The run reruns against the same inputs and the same retrieved data." },
  { n: "04", step: "Compare", detail: "See the original and the replay side by side." },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <FadeUp>
            <NumberedEyebrow n="RA" label="Replay & audit" />
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Replay any run.
              <br />
              <span className="text-stone-500">Prove what happened.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Agents are non-deterministic — the same input rarely gives the same output twice. Kraterion records every run as a tamper-evident trail you can replay from a receipt, then trace backward through every input that shaped the answer.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="mailto:hello@kraterion.com?subject=Beta%20access%20request" variant="primary">
                Get early access →
              </ButtonLink>
              <ButtonLink href="#lineage" variant="ghost">
                See lineage
              </ButtonLink>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
              <span>Reproduce</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Audit</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Trace</span>
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

      {/* What a run captures */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="What a run captures" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                The whole chain, not just the answer.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                A run record is everything it took to produce an output. When something goes wrong, you can see exactly which step caused it.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            {CAPTURED.map((c) => (
              <FadeUp key={c.n} className="bg-cream p-8 md:p-10">
                <div className="font-mono text-[12px] tabular-nums text-krater">{c.n}</div>
                <h3 className="mt-4 text-[22px] leading-[1.25] text-ink">{c.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.65] text-stone-700">{c.body}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <BridgeHeadline align="left">
        Run it once.
        <br />
        <span className="text-stone-500">Run it again, exactly.</span>
      </BridgeHeadline>

      {/* How replay works */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="How replay works" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                From a receipt, in seconds.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-4">
            {REPLAY_STEPS.map((s) => (
              <FadeUp key={s.n} className="bg-cream p-6 md:p-7">
                <div className="font-mono text-[12px] tabular-nums text-krater">{s.n}</div>
                <div className="mt-3 text-[16px] font-medium text-ink">{s.step}</div>
                <p className="mt-2 text-[13px] leading-[1.6] text-stone-700">{s.detail}</p>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.1}>
            <div className="mt-12">
              <ReplayDiff />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Lineage — trace any output backward */}
      <section id="lineage" className="scroll-mt-24 bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Audit trail & lineage" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Click any output. See every input.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                The same record that powers replay is a graph. Every artifact an agent reads or writes is a node; every operation is an edge. Start from an output and walk back through the chunks, tool calls, and memory that shaped it — following the OpenLineage mental model, with a verify button on every node.
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <div className="mx-auto mt-12 max-w-[680px]">
              <LineageGraph />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* The boundary — honest about what we verify */}
      <section className="bg-ink py-24 md:py-32 text-cream">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="The boundary" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                What we prove — and what we don&apos;t.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-300">
                We record what the run did and make that record tamper-evident: the inputs, the retrievals, the tool calls, the memory, and the outputs. We don&apos;t claim to prove the model&apos;s internal reasoning was correct — only that this is the run that happened, and you can check it.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Replay & audit"
        headline={
          <>
            Stop guessing.
            <br />
            <span className="text-stone-500">Replay the run.</span>
          </>
        }
        sub="Every run recorded. Every record yours. Every step verifiable."
        satellites={[
          { icon: BookOpen, label: "Read the docs", detail: "The replay API and run format.", href: "/docs" },
          { icon: Brain, label: "Agent memory", detail: "Memory as an edge in the graph.", href: "/memory" },
          { icon: MessageCircle, label: "Talk to us", detail: "Compliance, retention, self-hosting.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}

/* ─── Replay diff panel ─────────────────────────────────────────── */

const DIFF_ROWS = [
  { step: "recall", original: "2 notes", replay: "2 notes" },
  { step: "search", original: "4 hits", replay: "4 hits" },
  { step: "read", original: "pricing-faq.md · §3", replay: "pricing-faq.md · §3" },
  { step: "output", original: "Refunds in 7 business days.", replay: "Refunds in 7 business days." },
];

function ReplayDiff() {
  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="grid grid-cols-2 divide-x divide-stone-200/60 border-b border-stone-200/60 bg-stone-50">
        <div className="px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Original · receipt 3f4d…ae
        </div>
        <div className="px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Replay · just now
        </div>
      </div>
      {DIFF_ROWS.map((row, i) => (
        <div
          key={row.step}
          className={`grid grid-cols-2 divide-x divide-stone-200/60 ${
            i < DIFF_ROWS.length - 1 ? "border-b border-stone-200/60" : ""
          }`}
        >
          <DiffCell step={row.step} value={row.original} />
          <DiffCell step={row.step} value={row.replay} match />
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50/60 px-4 py-3 font-mono text-[12px]">
        <span className="text-stone-600">4 of 4 steps match</span>
        <span className="inline-flex items-center gap-1.5 text-[color:var(--color-success)]">
          <Check size={12} strokeWidth={2} />
          verified
        </span>
      </div>
    </div>
  );
}

function DiffCell({ step, value, match }: { step: string; value: string; match?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-[12px]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="text-stone-500">{step}</span>
        <span className="truncate text-ink">{value}</span>
      </span>
      {match && (
        <Check size={12} strokeWidth={2} className="shrink-0 text-[color:var(--color-success)]" />
      )}
    </div>
  );
}
