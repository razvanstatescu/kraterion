"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const STEPS = [
  { label: "DEK", detail: "Data Encryption Key — generated on your device" },
  { label: "KEK", detail: "Key Encryption Key — wraps the DEK" },
  { label: "Policy", detail: "Move-defined access policy gates the KEK" },
];

export function EnvelopeSealingSchema({ className }: { className?: string }) {
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
            const p = Math.min(1, (t - start) / 1400);
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

  // Each ring appears in turn
  const ringScale = (i: number) => {
    const start = (i / STEPS.length) * 0.7;
    const end = start + 0.25;
    return Math.max(0, Math.min(1, (progress - start) / (end - start)));
  };

  return (
    <div ref={ref} className={cn("overflow-hidden rounded-lg border border-stone-800 bg-ink", className)}>
      <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/60 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-400">
          Envelope encryption · client-side
        </span>
        <span className="font-mono text-[11px] text-stone-500">photo-final-v3.jpg</span>
      </div>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto]">
        {/* Visual */}
        <div className="relative grid place-items-center px-6 py-12 md:py-16">
          <svg viewBox="0 0 360 360" className="block w-full max-w-[360px]" aria-label="Envelope encryption">
            {/* Outer ring — Policy (largest) */}
            <g style={{ transform: `scale(${ringScale(2)})`, transformOrigin: "180px 180px" }}>
              <rect x="40" y="40" width="280" height="280" rx="20" fill="none" stroke="#7C7158" strokeWidth="1.25" strokeDasharray="6 6" />
              <text x="60" y="65" fontFamily="ui-monospace, monospace" fontSize="11" fill="#A89C82" letterSpacing="1">
                policy
              </text>
            </g>
            {/* Middle ring — KEK */}
            <g style={{ transform: `scale(${ringScale(1)})`, transformOrigin: "180px 180px" }}>
              <rect x="80" y="80" width="200" height="200" rx="14" fill="none" stroke="#A89C82" strokeWidth="1.25" />
              <text x="98" y="105" fontFamily="ui-monospace, monospace" fontSize="11" fill="#A89C82" letterSpacing="1">
                kek
              </text>
            </g>
            {/* Inner ring — DEK */}
            <g style={{ transform: `scale(${ringScale(0)})`, transformOrigin: "180px 180px" }}>
              <rect x="120" y="120" width="120" height="120" rx="10" fill="none" stroke="#C45B36" strokeWidth="1.5" />
              <text x="134" y="142" fontFamily="ui-monospace, monospace" fontSize="11" fill="#C45B36" letterSpacing="1">
                dek
              </text>
            </g>
            {/* File icon at center */}
            <g transform="translate(160, 152)">
              <rect x="0" y="0" width="40" height="50" rx="3" fill="#F8F4EC" />
              <polygon points="28,0 40,0 40,12" fill="#E1D9C7" />
              <line x1="6" y1="22" x2="34" y2="22" stroke="#A89C82" strokeWidth="1" />
              <line x1="6" y1="30" x2="34" y2="30" stroke="#A89C82" strokeWidth="1" />
              <line x1="6" y1="38" x2="22" y2="38" stroke="#A89C82" strokeWidth="1" />
            </g>

            {/* Key glyph docking */}
            <g
              transform={`translate(${280 - 40 * (1 - progress)}, 180)`}
              opacity={progress > 0.85 ? (progress - 0.85) / 0.15 : 0}
            >
              <circle cx="0" cy="0" r="8" fill="none" stroke="#C45B36" strokeWidth="1.5" />
              <line x1="6" y1="0" x2="20" y2="0" stroke="#C45B36" strokeWidth="1.5" />
              <line x1="16" y1="0" x2="16" y2="6" stroke="#C45B36" strokeWidth="1.5" />
            </g>
          </svg>
        </div>

        {/* Step list */}
        <div className="border-t border-stone-800 md:border-l md:border-t-0">
          <ul className="divide-y divide-stone-800 md:min-w-[280px]">
            {STEPS.map((s, i) => {
              const active = progress > (i + 1) / (STEPS.length + 1);
              return (
                <li key={s.label} className="flex items-start gap-3 px-6 py-5">
                  <span
                    className={cn(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]",
                      active
                        ? "border-krater bg-krater text-cream"
                        : "border-stone-700 text-stone-500"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-mono text-[13px] text-cream">{s.label}</div>
                    <div className="mt-1 text-[12px] leading-[1.55] text-stone-400">{s.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
