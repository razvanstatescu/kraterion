"use client";

import { useEffect, useState } from "react";
import { ArrowDown, File, Quote } from "lucide-react";
import { cn } from "@/lib/cn";
import { CornerTicks } from "./visuals/CornerTicks";

/**
 * Hero visual — three small connected cards that read top-to-bottom:
 *   01 Storage   — files in a bucket, with indexed/sealed state
 *   02 Knowledge — chunk strip + retrieval config
 *   03 Agents    — live Q/A with a verifiable citation
 *
 * Each card stands alone; small "flow connectors" between them name the
 * relationship (indexed → queried) so the three-layer story is legible
 * without reading the prose.
 *
 * Reference vibe: Linear's product slices stacked with explicit edges;
 * Vercel's hairline detail; Stripe's surgical use of a single accent.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full max-w-[520px]", className)}>
      <CornerTicks color="#A89C82" size={10} inset={-8} />
      <div className="relative flex flex-col">
        <BucketCard />
        <FlowConnector label="indexed · hybrid retrieval" />
        <IndexCard />
        <FlowConnector label="queried · /v1/agents/support" />
        <AgentCallCard />
      </div>
    </div>
  );
}

/* ─── Cards ─────────────────────────────────────────────────────── */

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

function IndexCard() {
  return (
    <Card eyebrow="02 · Knowledge" meta="48 chunks · 1,536 dims">
      <div className="space-y-3 px-4 py-3.5">
        {/* Chunk strip — 16 cells in a single row, a few highlighted to
            imply "top-k" matches on a query. */}
        <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5">
          {Array.from({ length: 16 }).map((_, i) => {
            const hot = i === 2 || i === 7 || i === 11;
            return (
              <div
                key={i}
                aria-hidden
                className={cn(
                  "aspect-square rounded-[1px]",
                  hot ? "bg-krater/80" : "bg-krater/20"
                )}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-stone-600">
          <span>BM25 + dense vectors</span>
          <span>top-k 8 → rerank to 4</span>
        </div>
      </div>
    </Card>
  );
}

function AgentCallCard() {
  const question = "What is our refund policy?";
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTyped(question.length);
      return;
    }
    const id = window.setInterval(() => {
      setTyped((n) => {
        if (n >= question.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 38);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card eyebrow="03 · Agents" meta="agent · support · 184 ms">
      <div className="space-y-2.5 px-4 py-3.5">
        {/* Question */}
        <div className="flex items-start gap-2.5">
          <span className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            Q
          </span>
          <p className="text-[13px] leading-[1.45] text-stone-700">
            {question.slice(0, typed)}
            {typed < question.length && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-px translate-y-[2px] bg-ink animate-[pulse_1.1s_steps(2,end)_infinite]"
              />
            )}
          </p>
        </div>

        {/* Answer */}
        <div className="flex items-start gap-2.5">
          <span className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            A
          </span>
          <p className="text-[13px] leading-[1.45] text-ink">
            Refunds are processed within 7 business days from the original payment method.
          </p>
        </div>

        {/* Citation chips — the only Krater accent in the whole visual */}
        <div className="flex flex-wrap items-center gap-1.5 pl-[22px] pt-0.5">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.06] px-2 py-1 font-mono text-[11px] text-krater">
            <Quote size={10} strokeWidth={1.5} />
            pricing-faq.md · §3
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200/80 bg-cream px-2 py-1 font-mono text-[11px] text-stone-600">
            score · 0.92
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-500">
            <span
              aria-hidden
              className="h-1 w-1 rounded-full bg-[color:var(--color-success)]"
            />
            verified
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
  meta?: string;
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

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="relative flex h-12 items-center justify-center">
      {/* Vertical hairline that runs the full height of the gap */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-stone-200/80"
      />
      {/* Endpoint caps so it reads as a route, not a random line */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-300"
      />
      <span
        aria-hidden
        className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-300"
      />
      {/* Mid-line pill with the relationship label */}
      <span className="relative inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-cream px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
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
