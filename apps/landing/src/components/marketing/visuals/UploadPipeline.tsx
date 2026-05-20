"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const STAGES = [
  { label: "Multipart", detail: "split into 8 MB parts" },
  { label: "Encrypt", detail: "sealed client-side" },
  { label: "Stripe", detail: "erasure coded n=3f+1" },
  { label: "Commit", detail: "manifest published" },
  { label: "Confirm", detail: "200 OK · 184 ms" },
];

export function UploadPipeline({ className }: { className?: string }) {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setProgress(1);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const cycle = () => {
            let raf: number;
            const start = performance.now();
            const tick = (t: number) => {
              const p = ((t - start) / 3200) % 1;
              setProgress(p);
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            return () => cancelAnimationFrame(raf);
          };
          const cleanup = cycle();
          return cleanup;
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const activeStage = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));

  return (
    <div ref={ref} className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Upload pipeline · photo-final-v3.jpg · 2.1 MB
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          stage {activeStage + 1} / {STAGES.length}
        </span>
      </div>

      <div className="px-6 py-10">
        {/* Progress rail */}
        <div className="relative">
          <div className="absolute inset-x-0 top-5 h-px bg-stone-200/80" />
          <div
            className="absolute left-0 top-5 h-px bg-krater"
            style={{ width: `${progress * 100}%` }}
          />
          <div className="relative grid grid-cols-5">
            {STAGES.map((s, i) => {
              const stageProgress = Math.max(0, Math.min(1, progress * STAGES.length - i));
              const done = i < activeStage;
              const active = i === activeStage;
              return (
                <div key={s.label} className="flex flex-col items-center">
                  {/* Dot */}
                  <div
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-full border-2 transition-colors duration-300",
                      done
                        ? "border-krater bg-krater"
                        : active
                        ? "border-krater bg-cream"
                        : "border-stone-300 bg-cream"
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[11px] tabular-nums transition-colors duration-300",
                        done
                          ? "text-cream"
                          : active
                          ? "text-krater"
                          : "text-stone-500"
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Label */}
                  <div className="mt-4 text-center">
                    <div
                      className={cn(
                        "text-[13px] font-medium transition-colors duration-300",
                        done || active ? "text-ink" : "text-stone-500"
                      )}
                    >
                      {s.label}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">{s.detail}</div>
                  </div>

                  {/* Mini bar */}
                  <div className="mt-3 h-1 w-16 overflow-hidden rounded-full bg-stone-200/60">
                    <div
                      className="h-full bg-krater transition-[width] duration-150"
                      style={{ width: `${stageProgress * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
