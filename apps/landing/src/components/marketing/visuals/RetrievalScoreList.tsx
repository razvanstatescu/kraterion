"use client";

import { useEffect, useRef, useState } from "react";
import { Search, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

const RESULTS = [
  { file: "pricing-faq.md", chunk: "§3", score: 0.92, excerpt: "Refunds are processed within 7 business days from the original payment method…" },
  { file: "annual-plans.md", chunk: "§2", score: 0.81, excerpt: "Annual plans are pro-rated. Unused months are refunded on the original card…" },
  { file: "billing-policy.md", chunk: "§1.4", score: 0.74, excerpt: "Cancellation initiates immediate refund processing for any unused period…" },
  { file: "support-runbook.md", chunk: "§8", score: 0.62, excerpt: "When a customer raises a refund request, link the policy excerpt before responding…" },
];

export function RetrievalScoreList({ className }: { className?: string }) {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setProgress(1);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Animate progress 0 → 1 once
          let raf: number;
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / 900);
            setProgress(p);
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          obs.disconnect();
          return () => cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      {/* Query bar */}
      <div className="flex items-center gap-3 border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <Search size={14} strokeWidth={1.75} className="text-stone-500" />
        <span className="font-mono text-[13px] text-ink">how do I refund an annual plan?</span>
        <span className="ml-auto rounded-sm bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600">
          ⌘K
        </span>
      </div>

      {/* Result rows */}
      <ul>
        {RESULTS.map((r, i) => (
          <li
            key={r.file}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4",
              i < RESULTS.length - 1 && "border-b border-stone-200/60",
              i === 0 && "bg-krater/[0.04]"
            )}
          >
            <div className="flex items-center gap-2">
              <FileText
                size={14}
                strokeWidth={1.5}
                className={i === 0 ? "text-krater" : "text-stone-500"}
              />
              <div>
                <div className="flex items-center gap-2 font-mono text-[13px] text-ink">
                  {r.file}
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-500">{r.chunk}</span>
                </div>
                <div className="mt-1 max-w-[420px] truncate text-[12px] text-stone-600">
                  {r.excerpt}
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-[12px] tabular-nums text-stone-700">
                {r.score.toFixed(2)}
              </span>
              <div className="h-1 w-[120px] overflow-hidden rounded-full bg-stone-200/60">
                <div
                  className={cn(
                    "h-full transition-[width] duration-300",
                    i === 0 ? "bg-krater" : "bg-stone-500"
                  )}
                  style={{ width: `${r.score * progress * 100}%` }}
                />
              </div>
            </div>

            <span className="rounded-sm border border-stone-200/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
              {i === 0 ? "top" : `#${i + 1}`}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-stone-200/60 bg-stone-50 px-4 py-2.5 font-mono text-[11px] text-stone-600">
        retrieved 8 · reranked to 4 · top score 0.92
      </div>
    </div>
  );
}
