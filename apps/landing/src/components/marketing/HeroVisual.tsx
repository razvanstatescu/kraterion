"use client";

import { useEffect, useState } from "react";
import * as motion from "motion/react-client";
import { ArrowDown, File, Quote } from "lucide-react";
import { cn } from "@/lib/cn";
import { CornerTicks } from "./visuals/CornerTicks";
import { ScrambleText } from "@/components/motion/ScrambleText";

/**
 * Hero visual — three small connected cards that read top-to-bottom:
 *   01 Storage   — files in a bucket, with indexed/sealed state
 *   02 Knowledge — chunk strip + retrieval config
 *   03 Agents    — live Q/A with a verifiable citation
 *
 * Each card stands alone; flow connectors between them carry small Krater
 * "data packets" that loop softly, implying a live pipeline without ever
 * shouting for attention. Reduced-motion freezes everything.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full max-w-[520px]", className)}>
      <CornerTicks color="#A89C82" size={10} inset={-8} />
      <div className="relative flex flex-col">
        <BucketCard />
        <FlowConnector label="indexed · hybrid retrieval" packetDelay={0.2} />
        <IndexCard />
        <FlowConnector label="queried · /v1/agents/support" packetDelay={1.5} />
        <AgentCallCard />
      </div>
    </div>
  );
}

/* ─── 01 · Storage ───────────────────────────────────────────────── */

function BucketCard() {
  return (
    <Card eyebrow="01 · Storage" meta="support-docs · 4 files · 1.7 MB">
      <ul className="divide-y divide-stone-200/60">
        <FileItem name="pricing-faq.md" size="12 KB" state="indexed" />
        <FileItem name="product-overview.pdf" size="482 KB" state="indexed" />
        <FileItem name="release-notes-2026-05.md" size="8 KB" state="indexed" />
        <FileItem name="onboarding-guide.pdf" size="1.2 MB" state="sealed" />
      </ul>
    </Card>
  );
}

/* ─── 02 · Knowledge ─────────────────────────────────────────────── */

// Predefined "hot cell" sets — they cycle to imply top-k matches rotating
// across the chunk neighborhood as different queries hit different chunks.
const HOT_SETS: number[][] = [
  [2, 7, 11],
  [4, 8, 13],
  [1, 6, 12],
  [3, 9, 14],
  [5, 10, 11],
  [0, 6, 15],
];

function IndexCard() {
  const [hotIdx, setHotIdx] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    if (reduce) return;
    const id = window.setInterval(() => {
      setHotIdx((i) => (i + 1) % HOT_SETS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  const hot = new Set(HOT_SETS[hotIdx]);

  return (
    <Card eyebrow="02 · Knowledge" meta="48 chunks · 1024 dims">
      <div className="space-y-3 px-4 py-3.5">
        <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5">
          {Array.from({ length: 16 }).map((_, i) => (
            <motion.div
              key={i}
              aria-hidden
              animate={
                reduceMotion
                  ? { backgroundColor: hot.has(i) ? "rgba(196,91,54,0.8)" : "rgba(196,91,54,0.2)" }
                  : {
                      backgroundColor: hot.has(i)
                        ? "rgba(196,91,54,0.8)"
                        : "rgba(196,91,54,0.2)",
                    }
              }
              transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
              className="aspect-square rounded-[1px]"
            />
          ))}
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-stone-600">
          <span>BM25 + dense vectors</span>
          <span>top-k = 8 · hybrid</span>
        </div>
      </div>
    </Card>
  );
}

/* ─── 03 · Agents ────────────────────────────────────────────────── */

const AGENT_CALLS = [
  {
    q: "What is our refund policy?",
    a: "Refunds are processed within 7 business days from the original payment method.",
    cite: "pricing-faq.md · §3",
    score: "0.92",
    ms: "184 ms",
  },
  {
    q: "How does annual plan proration work?",
    a: "Annual plans are pro-rated to the day. Unused time is credited automatically.",
    cite: "billing-policy.md · §1.4",
    score: "0.88",
    ms: "212 ms",
  },
  {
    q: "Can I cancel mid-cycle?",
    a: "Cancellation takes effect at the end of the current billing period, no further charges.",
    cite: "support-runbook.md · §8",
    score: "0.81",
    ms: "171 ms",
  },
];

function AgentCallCard() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % AGENT_CALLS.length);
    }, 5400);
    return () => window.clearInterval(id);
  }, []);

  const call = AGENT_CALLS[idx];

  return (
    <Card
      eyebrow="03 · Run"
      meta={
        <span className="flex items-center gap-2">
          <span>agent · support</span>
          <span aria-hidden className="text-stone-300">
            ·
          </span>
          <ScrambleText
            text={call.ms}
            className="inline-block tabular-nums"
            durationMs={420}
          />
        </span>
      }
    >
      <div className="space-y-2.5 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <span className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            Q
          </span>
          <p className="text-[13px] leading-[1.45] text-stone-700">
            <ScrambleText text={call.q} durationMs={620} startDelayMs={80} />
          </p>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            A
          </span>
          <p className="text-[13px] leading-[1.45] text-ink">
            <ScrambleText text={call.a} durationMs={780} startDelayMs={220} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pl-[22px] pt-0.5">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.06] px-2 py-1 font-mono text-[11px] text-krater">
            <Quote size={10} strokeWidth={1.5} />
            <ScrambleText text={call.cite} durationMs={520} startDelayMs={420} />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200/80 bg-cream px-2 py-1 font-mono text-[11px] text-stone-600">
            score ·{" "}
            <ScrambleText
              text={call.score}
              className="tabular-nums"
              durationMs={360}
              startDelayMs={500}
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
        <div className="flex items-center justify-between border-t border-stone-200/60 pl-[22px] pr-1 pt-2.5 font-mono text-[11px] text-stone-500">
          <span>run · 3f4d…ae</span>
          <span className="inline-flex items-center gap-1.5 text-krater">
            recorded · replayable
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ─── Shared chrome ─────────────────────────────────────────────── */

function Card({
  eyebrow,
  meta,
  children,
}: {
  eyebrow: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline relative overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50/70 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
          {eyebrow}
        </span>
        {meta && (
          <span className="font-mono text-[10px] text-stone-500">{meta}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function FlowConnector({
  label,
  packetDelay = 0,
}: {
  label: string;
  packetDelay?: number;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  return (
    <div className="relative flex h-12 items-center justify-center">
      {/* Vertical hairline */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-stone-200/80"
      />
      {/* Endpoint caps */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-300"
      />
      <span
        aria-hidden
        className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-300"
      />

      {/* Soft looping packet — travels down the line, disappears behind
          the label pill, emerges below. */}
      {!reduceMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 z-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-krater"
          style={{ top: 0 }}
          initial={{ y: -2, opacity: 0 }}
          animate={{
            y: [-2, 46],
            opacity: [0, 1, 1, 1, 0],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            repeatDelay: 1.4,
            ease: [0.4, 0, 0.6, 1],
            delay: packetDelay,
            times: [0, 0.08, 0.5, 0.92, 1],
          }}
        />
      )}

      {/* Label pill — sits above the packet (z-10) and has solid cream bg
          so the packet appears to "enter" the label as it passes through. */}
      <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-cream px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
        <ArrowDown size={10} strokeWidth={1.5} />
        {label}
      </span>
    </div>
  );
}

/* ─── Row primitives ────────────────────────────────────────────── */

function FileItem({
  name,
  size,
  state,
}: {
  name: string;
  size: string;
  state: "indexed" | "sealed";
}) {
  const label = state === "indexed" ? "Indexed" : "Sealed";
  return (
    <li className="grid grid-cols-[1fr_auto_84px] items-center gap-3 px-4 py-2 text-[12px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <File size={13} strokeWidth={1.5} className="text-stone-500" />
        <span className="truncate font-mono text-ink">{name}</span>
      </div>
      <span className="font-mono tabular-nums text-[11px] text-stone-600">
        {size}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-600">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]"
        />
        {label}
      </span>
    </li>
  );
}
