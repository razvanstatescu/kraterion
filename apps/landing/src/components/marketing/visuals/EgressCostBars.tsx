"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Provider = {
  name: string;
  storage: number;
  egress: number;
  total: number;
  accent?: boolean;
};

// Scenario: 1 TB stored, 10 TB read per month
const PROVIDERS: Provider[] = [
  { name: "AWS S3", storage: 23.55, egress: 921.6, total: 945.15 },
  { name: "Cloudflare R2", storage: 15.0, egress: 0, total: 15.0 },
  { name: "Kraterion", storage: 12.0, egress: 0, total: 12.0, accent: true },
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
        <span className="font-mono text-[11px] text-stone-600">USD / month · linear scale</span>
      </div>

      {/* Horizontal bars — the breakdown reads at a glance */}
      <div className="px-6 py-8 md:px-10 md:py-10">
        <div className="space-y-7">
          {PROVIDERS.map((p) => {
            const totalPct = (p.total / MAX) * 100 * progress;
            const storagePct = (p.storage / p.total) * totalPct;
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
                    {/* Egress segment — lighter, hatched-feel via opacity */}
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

                {/* Breakdown row */}
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-stone-600">
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
                  {p.egress === 0 && (
                    <span className="text-[color:var(--color-success)]">
                      no egress
                    </span>
                  )}
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

      <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50 px-4 py-2.5 font-mono text-[11px] text-stone-600">
        <span>
          S3 pricing per aws.amazon.com/s3/pricing · R2 per
          developers.cloudflare.com/r2/pricing
        </span>
        <span className="text-krater">~98% lower than S3</span>
      </div>
    </div>
  );
}
