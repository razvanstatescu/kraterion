"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";

// Deterministic pseudo-random so SSR/client match.
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

type Dot = { x: number; y: number; label: string };

function generateDots(): Dot[] {
  const rand = seededRand(42);
  const labels = [
    "refund", "billing", "invoice", "cancel", "plan",
    "upgrade", "checkout", "trial", "subscription", "dispute",
    "card", "tax", "credit", "discount", "coupon",
    "renewal", "term", "proration", "annual", "monthly",
    "pricing", "tier", "downgrade", "policy",
  ];
  return labels.map((label) => ({
    label,
    x: 60 + rand() * 580,
    y: 40 + rand() * 280,
  }));
}

// Manually pick the query position and the 4 nearest dots by hand
// — looks better than computing live for an illustration.
const QUERY = { x: 320, y: 160 };
const NEAREST_INDICES = [0, 1, 14, 21]; // refund, billing, coupon, tier

export function VectorDotField({ className }: { className?: string }) {
  const dots = useMemo(generateDots, []);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Vector neighborhood · 24 chunks
        </span>
        <span className="font-mono text-[11px] text-stone-600">1,536 dims · cosine</span>
      </div>
      <div className="px-4 py-6">
        <svg
          viewBox="0 0 700 360"
          className="block w-full"
          aria-label="Vector dot field"
        >
          {/* Faint dot grid */}
          <defs>
            <pattern id="vec-dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.75" fill="#C9BFA8" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="700" height="360" fill="url(#vec-dotgrid)" />

          {/* Lines from query to nearest */}
          {NEAREST_INDICES.map((idx) => {
            const d = dots[idx];
            return (
              <line
                key={idx}
                x1={QUERY.x}
                y1={QUERY.y}
                x2={d.x}
                y2={d.y}
                stroke="#C45B36"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            );
          })}

          {/* All dots */}
          {dots.map((d, i) => {
            const isNearest = NEAREST_INDICES.includes(i);
            return (
              <g key={d.label}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={isNearest ? 5 : 3}
                  fill={isNearest ? "#C45B36" : "#A89C82"}
                  opacity={isNearest ? 1 : 0.55}
                />
                <text
                  x={d.x + 8}
                  y={d.y + 3}
                  fontFamily="ui-monospace, monospace"
                  fontSize="10"
                  fill={isNearest ? "#403930" : "#7C7158"}
                  opacity={isNearest ? 1 : 0.6}
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* Query dot */}
          <g>
            <circle cx={QUERY.x} cy={QUERY.y} r="9" fill="none" stroke="#C45B36" strokeWidth="1.5" />
            <circle cx={QUERY.x} cy={QUERY.y} r="9" fill="none" stroke="#C45B36" strokeWidth="1.5" opacity="0.35">
              <animate attributeName="r" from="9" to="18" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.35" to="0" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx={QUERY.x} cy={QUERY.y} r="3" fill="#C45B36" />
            <text
              x={QUERY.x + 14}
              y={QUERY.y + 3}
              fontFamily="Inter"
              fontSize="11"
              fontWeight="500"
              fill="#0F0E0C"
            >
              your query
            </text>
          </g>
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-px border-t border-stone-200/60 bg-stone-200/60">
        {NEAREST_INDICES.map((idx, i) => (
          <div key={idx} className="bg-cream px-3 py-2.5 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
              #{i + 1}
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-ink">{dots[idx].label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
