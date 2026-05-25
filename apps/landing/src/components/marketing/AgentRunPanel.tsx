"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  Wrench,
  Sparkles,
  Quote,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ScrambleText } from "@/components/motion/ScrambleText";

/**
 * AgentRunPanel — a live "agent run" trace that pairs 1:1 with the code
 * block on the left of the Agents section.
 *
 * It reads like a chat-completions log: header (agent + scoped credential),
 * user message, tool calls, assistant response with citation, and a footer
 * summary. Three runs cycle on a 6.5s interval; ScrambleText handles the
 * cipher-decode transition on each text field so the swap reads as the
 * agent decrypting and replaying a new call from its audit log.
 *
 * Design: refined minimalism — same hairline-only language as the rest of
 * the marketing site, single Krater accent on the citation chip.
 */

type ToolCall = { tool: string; args: string; result: string; ms: string };
type Run = {
  q: string;
  tools: ToolCall[];
  a: string;
  cite: string;
  score: string;
  totalMs: string;
};

const RUNS: Run[] = [
  {
    q: "What is our refund policy?",
    tools: [
      { tool: "search", args: 'query: "refund policy"', result: "4 hits", ms: "62 ms" },
      { tool: "read", args: 'key: "pricing-faq.md"', result: "12 KB", ms: "38 ms" },
    ],
    a: "Refunds are processed within 7 business days from the original payment method.",
    cite: "pricing-faq.md · §3",
    score: "0.92",
    totalMs: "184 ms",
  },
  {
    q: "How does annual plan proration work?",
    tools: [
      { tool: "search", args: 'query: "annual proration"', result: "6 hits", ms: "71 ms" },
      { tool: "read", args: 'key: "billing-policy.md"', result: "18 KB", ms: "44 ms" },
    ],
    a: "Annual plans are pro-rated to the day. Unused time is credited automatically.",
    cite: "billing-policy.md · §1.4",
    score: "0.88",
    totalMs: "212 ms",
  },
  {
    q: "Can I cancel mid-cycle?",
    tools: [
      { tool: "search", args: 'query: "cancel mid-cycle"', result: "3 hits", ms: "55 ms" },
      { tool: "read", args: 'key: "support-runbook.md"', result: "24 KB", ms: "31 ms" },
    ],
    a: "Cancellation takes effect at the end of the current billing period, no further charges.",
    cite: "support-runbook.md · §8",
    score: "0.81",
    totalMs: "171 ms",
  },
];

export function AgentRunPanel({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % RUNS.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

  const run = RUNS[idx];

  return (
    <div
      className={cn(
        "hairline flex h-full min-h-[440px] flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream",
        className
      )}
    >
      {/* Header — agent identity + scoped credential */}
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={12} strokeWidth={1.5} className="text-krater" />
          <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            Agent · support
          </span>
          <span aria-hidden className="text-stone-300">
            ·
          </span>
          <span className="font-mono text-[11px] text-stone-500">
            pk_share_3f4d…
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.05] px-2 py-1 font-mono text-[10px] text-krater">
          scoped · support-docs
        </span>
      </div>

      {/* Trace body — single column, top-down */}
      <div className="flex-1 space-y-4 px-5 py-5">
        <TraceBlock label="USER" icon={MessageSquare}>
          <p className="text-[14px] leading-[1.45] text-ink">
            <ScrambleText text={run.q} durationMs={620} />
          </p>
        </TraceBlock>

        <TraceBlock
          label={`TOOL CALLS · ${run.tools.length} of 5 available`}
          icon={Wrench}
        >
          <ul className="space-y-1">
            {run.tools.map((tc, i) => (
              <li
                key={`${tc.tool}-${i}`}
                className="grid grid-cols-[88px_1fr_auto] items-baseline gap-3 font-mono text-[12px]"
              >
                <span className="text-krater">{tc.tool}</span>
                <span className="truncate text-stone-700">
                  <ScrambleText text={tc.args} durationMs={500} startDelayMs={120 + i * 80} />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
                  <span>→</span>
                  <ScrambleText text={tc.result} durationMs={420} startDelayMs={180 + i * 80} />
                  <span aria-hidden>·</span>
                  <ScrambleText
                    text={tc.ms}
                    className="tabular-nums"
                    durationMs={380}
                    startDelayMs={220 + i * 80}
                  />
                </span>
              </li>
            ))}
          </ul>
        </TraceBlock>

        <TraceBlock label="ASSISTANT" icon={Sparkles}>
          <p className="text-[14px] leading-[1.45] text-ink">
            <ScrambleText text={run.a} durationMs={780} startDelayMs={360} />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.06] px-2 py-1 font-mono text-[11px] text-krater">
              <Quote size={10} strokeWidth={1.5} />
              <ScrambleText text={run.cite} durationMs={520} startDelayMs={520} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200/80 bg-cream px-2 py-1 font-mono text-[11px] text-stone-600">
              score ·{" "}
              <ScrambleText
                text={run.score}
                className="tabular-nums"
                durationMs={360}
                startDelayMs={580}
              />
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-500">
              <span
                aria-hidden
                className="h-1 w-1 rounded-full bg-[color:var(--color-success)]"
              />
              verified
            </span>
          </div>
        </TraceBlock>
      </div>

      {/* Footer — total latency + counts */}
      <div className="grid grid-cols-3 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60">
        <Stat label="Total latency">
          <ScrambleText
            text={run.totalMs}
            className="tabular-nums"
            durationMs={420}
          />
        </Stat>
        <Stat label="Tools called" accent>
          {run.tools.length} of 5
        </Stat>
        <Stat label="Citation">verified</Stat>
      </div>
    </div>
  );
}

/* ─── Subcomponents ─────────────────────────────────────────────── */

function TraceBlock({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={11} strokeWidth={1.5} className="text-stone-500" />
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          {label}
        </span>
      </div>
      <div className="pl-[19px]">{children}</div>
    </div>
  );
}

function Stat({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[13px]",
          accent ? "text-krater" : "text-ink"
        )}
      >
        {children}
      </span>
    </div>
  );
}
