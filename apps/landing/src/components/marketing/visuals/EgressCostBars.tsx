"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Egress cost benchmark for the pricing page. Three providers across the
 * spectrum of "what the same workload actually costs":
 *
 *   - AWS S3      — what the egress trap looks like at scale
 *   - Kraterion   — much cheaper egress, plus encryption + ownership
 *   - Cloudflare R2 — cheapest pure $/GB, no client-side encryption or
 *                     ownership layer (the honest trade-off)
 *
 * Scenario: 1 TB stored, 10 TB read per month. Numbers reflect each
 * provider's published rates as of 2026-05.
 */

type Provider = {
  name: string;
  storage: number;
  egress: number;
  total: number;
  note: string;
  accent?: boolean;
};

const PROVIDERS: Provider[] = [
  {
    name: "AWS S3",
    storage: 23.55,
    egress: 921.6,
    total: 945.15,
    note: "Server-side KMS · plaintext on the wire to AWS",
  },
  {
    name: "Kraterion",
    storage: 61.44,
    egress: 101.9,
    total: 163.34,
    note: "Sealed client-side · owned bytes · 50 GB egress free",
    accent: true,
  },
  {
    name: "Cloudflare R2",
    storage: 15.36,
    egress: 0,
    total: 15.36,
    note: "Zero egress · no client-side encryption or ownership",
  },
];

const MAX = Math.max(...PROVIDERS.map((p) => p.total));

export function EgressCostBars({ className }: { className?: string }) {
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
          let raf: number;
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / 1100);
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
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-lg border border-stone-200/60 bg-cream",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          1 TB stored · 10 TB read / month
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          USD / month · published rates
        </span>
      </div>

      <div className="px-6 py-8 md:px-10 md:py-10">
        <div className="space-y-7">
          {PROVIDERS.map((p) => {
            const totalPct = (p.total / MAX) * 100 * progress;
            const storagePct = p.total > 0 ? (p.storage / p.total) * totalPct : 0;
            const egressPct = totalPct - storagePct;
            return (
              <div key={p.name}>
                <div className="flex items-baseline justify-between">
                  <span
                    className={cn(
                      "flex items-center gap-2 text-[14px] font-medium",
                      p.accent ? "text-krater" : "text-ink"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        p.accent ? "bg-krater" : "bg-stone-400"
                      )}
                    />
                    {p.name}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      p.accent ? "text-krater" : "text-ink"
                    )}
                  >
                    <span className="text-[22px] leading-none tracking-[-0.01em]">
                      ${p.total.toFixed(2)}
                    </span>
                    <span className="ml-1 text-[11px] uppercase tracking-[0.12em] text-stone-500">
                      /mo
                    </span>
                  </span>
                </div>

                {/* Bar track */}
                <div className="mt-3 h-8 w-full overflow-hidden rounded-md bg-stone-100">
                  <div className="flex h-full">
                    {/* Storage segment */}
                    <div
                      className={cn(
                        "h-full transition-[width] duration-700 ease-out",
                        p.accent ? "bg-krater" : "bg-stone-600"
                      )}
                      style={{ width: `${storagePct}%` }}
                      title={`Storage: $${p.storage.toFixed(2)}`}
                    />
                    {/* Egress segment */}
                    <div
                      className={cn(
                        "h-full transition-[width] duration-700 ease-out",
                        p.accent ? "bg-krater/40" : "bg-stone-400"
                      )}
                      style={{ width: `${egressPct}%` }}
                      title={`Egress: $${p.egress.toFixed(2)}`}
                    />
                  </div>
                </div>

                {/* Breakdown + honest note */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-stone-600">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 rounded-sm",
                          p.accent ? "bg-krater" : "bg-stone-600"
                        )}
                      />
                      Storage ${p.storage.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 rounded-sm",
                          p.accent ? "bg-krater/40" : "bg-stone-400"
                        )}
                      />
                      Egress{" "}
                      <span
                        className={
                          p.egress === 0
                            ? "text-[color:var(--color-success)]"
                            : ""
                        }
                      >
                        ${p.egress.toFixed(2)}
                      </span>
                    </span>
                  </span>
                  <span className="text-stone-500">{p.note}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Axis */}
        <div className="mt-8 grid grid-cols-5 border-t border-stone-200/60 pt-2 font-mono text-[10px] text-stone-500">
          <span>$0</span>
          <span className="text-center">$250</span>
          <span className="text-center">$500</span>
          <span className="text-center">$750</span>
          <span className="text-right">$1,000</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-stone-200/60 bg-stone-50 px-4 py-2.5 font-mono text-[11px] text-stone-600">
        <span>
          S3 per aws.amazon.com/s3/pricing · R2 per developers.cloudflare.com/r2/pricing
        </span>
        <span className="text-krater">~83% lower than S3 · ~9× cheaper egress</span>
      </div>
    </div>
  );
}
