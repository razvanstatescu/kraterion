"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Provider = { name: string; storage: number; egress: number; total: number; accent?: boolean };

// Scenario: 1 TB stored, 10 TB read per month
const PROVIDERS: Provider[] = [
  { name: "AWS S3", storage: 23.55, egress: 921.6, total: 945.15 },
  { name: "Cloudflare R2", storage: 15.0, egress: 0, total: 15.0 },
  { name: "Kraterion", storage: 12.0, egress: 0, total: 12.0, accent: true },
];

const MAX = 1000; // y-axis max in $

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
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          1 TB stored · 10 TB read / month
        </span>
        <span className="font-mono text-[11px] text-stone-600">USD / month</span>
      </div>
      <div className="px-6 py-10 md:px-10 md:py-12">
        <div className="grid grid-cols-3 items-end gap-12 md:gap-20">
          {PROVIDERS.map((p) => {
            const totalPct = (p.total / MAX) * 100 * progress;
            const storagePct = (p.storage / MAX) * 100 * progress;
            return (
              <div key={p.name} className="flex flex-col items-stretch gap-4">
                <div className="relative h-[320px] w-full">
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-stretch">
                    {/* Total bar — split into storage + egress */}
                    <div
                      className={cn(
                        "w-full transition-[height] duration-700 ease-out",
                        p.accent ? "bg-krater" : "bg-stone-700"
                      )}
                      style={{ height: `${Math.min(100, totalPct - storagePct)}%`, minHeight: 0 }}
                    />
                    <div
                      className={cn(
                        "w-full border-t transition-[height] duration-700 ease-out",
                        p.accent
                          ? "border-cream/30 bg-krater"
                          : "border-stone-500 bg-stone-500"
                      )}
                      style={{ height: `${storagePct}%`, minHeight: 0 }}
                    />
                  </div>
                  {/* Total label */}
                  <div className="absolute inset-x-0 -top-8 text-center">
                    <div
                      className={cn(
                        "text-[24px] leading-none tracking-[-0.01em] tabular-nums",
                        p.accent ? "text-krater" : "text-ink"
                      )}
                    >
                      ${p.total.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-[13px] font-medium text-ink">{p.name}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex flex-col items-center">
                      <span className="text-stone-500">Storage</span>
                      <span className="font-mono tabular-nums text-stone-700">${p.storage.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-stone-500">Egress</span>
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          p.egress === 0 ? "text-[color:var(--color-success)]" : "text-stone-700"
                        )}
                      >
                        ${p.egress.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50 px-4 py-2.5 font-mono text-[11px] text-stone-600">
        <span>S3 pricing per aws.amazon.com/s3/pricing · R2 per developers.cloudflare.com/r2/pricing</span>
        <span className="text-krater">~98% lower than S3</span>
      </div>
    </div>
  );
}
