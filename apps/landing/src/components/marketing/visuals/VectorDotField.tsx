"use client";

import { cn } from "@/lib/cn";

type Dot = {
  label: string;
  x: number;
  y: number;
  /** Label position relative to dot — controls which side label sits on. */
  side?: "right" | "left" | "top" | "bottom";
  nearest?: boolean;
};

const QUERY = { x: 360, y: 180 };

/* Hand-placed positions on a 720 × 360 viewBox.
   - No two labels overlap.
   - Nearest 4 sit symmetrically around the query within 100px radius.
   - Far dots are pushed to the perimeter, labels biased outward. */
const DOTS: Dot[] = [
  // Near query — nearest 4 (drawn larger, krater)
  { label: "refund", x: 290, y: 130, side: "left", nearest: true },
  { label: "billing", x: 430, y: 138, side: "right", nearest: true },
  { label: "policy", x: 304, y: 232, side: "left", nearest: true },
  { label: "credit", x: 432, y: 224, side: "right", nearest: true },

  // Middle ring
  { label: "invoice", x: 230, y: 90, side: "left" },
  { label: "discount", x: 250, y: 264, side: "left" },
  { label: "renewal", x: 488, y: 92, side: "right" },
  { label: "tier", x: 488, y: 270, side: "right" },

  // Outer ring — biased so labels never collide
  { label: "card", x: 76, y: 60, side: "right" },
  { label: "trial", x: 70, y: 168, side: "right" },
  { label: "cancel", x: 80, y: 290, side: "right" },
  { label: "checkout", x: 168, y: 312, side: "top" },
  { label: "coupon", x: 372, y: 322, side: "top" },
  { label: "downgrade", x: 552, y: 312, side: "top" },
  { label: "tax", x: 632, y: 290, side: "left" },
  { label: "annual", x: 646, y: 198, side: "left" },
  { label: "monthly", x: 640, y: 96, side: "left" },
  { label: "term", x: 548, y: 50, side: "bottom" },
  { label: "proration", x: 360, y: 42, side: "bottom" },
  { label: "dispute", x: 172, y: 50, side: "bottom" },
  { label: "upgrade", x: 148, y: 196, side: "right" },
  { label: "subscription", x: 568, y: 178, side: "right" },
  { label: "plan", x: 196, y: 132, side: "right" },
  { label: "pricing", x: 542, y: 130, side: "left" },
];

function labelXY(d: Dot, isNear: boolean) {
  const pad = isNear ? 12 : 9;
  switch (d.side) {
    case "left":
      return { x: d.x - pad, y: d.y + 3, anchor: "end" as const };
    case "top":
      return { x: d.x, y: d.y - pad, anchor: "middle" as const };
    case "bottom":
      return { x: d.x, y: d.y + pad + 8, anchor: "middle" as const };
    case "right":
    default:
      return { x: d.x + pad, y: d.y + 3, anchor: "start" as const };
  }
}

export function VectorDotField({ className }: { className?: string }) {
  const nearest = DOTS.filter((d) => d.nearest);
  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Vector neighborhood · {DOTS.length} chunks
        </span>
        <span className="font-mono text-[11px] text-stone-600">1,536 dims · cosine</span>
      </div>
      <div className="px-4 py-6">
        <svg
          viewBox="0 0 720 360"
          className="block w-full"
          aria-label="Vector dot field"
        >
          {/* Faint dot grid */}
          <defs>
            <pattern id="vec-dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.75" fill="#C9BFA8" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="720" height="360" fill="url(#vec-dotgrid)" />

          {/* Concentric reference rings to imply distance */}
          <circle
            cx={QUERY.x}
            cy={QUERY.y}
            r="70"
            fill="none"
            stroke="#E1D9C7"
            strokeWidth="0.75"
            strokeDasharray="2 4"
          />
          <circle
            cx={QUERY.x}
            cy={QUERY.y}
            r="140"
            fill="none"
            stroke="#E1D9C7"
            strokeWidth="0.75"
            strokeDasharray="2 4"
          />

          {/* Lines from query to nearest only */}
          {nearest.map((d) => (
            <line
              key={`l-${d.label}`}
              x1={QUERY.x}
              y1={QUERY.y}
              x2={d.x}
              y2={d.y}
              stroke="#C45B36"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.55"
            />
          ))}

          {/* All dots + labels */}
          {DOTS.map((d) => {
            const isNear = !!d.nearest;
            const l = labelXY(d, isNear);
            return (
              <g key={d.label}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={isNear ? 4.5 : 2.5}
                  fill={isNear ? "#C45B36" : "#A89C82"}
                  opacity={isNear ? 1 : 0.6}
                />
                <text
                  x={l.x}
                  y={l.y}
                  fontFamily="ui-monospace, monospace"
                  fontSize={isNear ? 11 : 9.5}
                  fill={isNear ? "#403930" : "#7C7158"}
                  opacity={isNear ? 1 : 0.7}
                  textAnchor={l.anchor}
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* Query dot — drawn last so it sits on top */}
          <g>
            <circle cx={QUERY.x} cy={QUERY.y} r="10" fill="#FAF7EF" stroke="#C45B36" strokeWidth="1.5" />
            <circle cx={QUERY.x} cy={QUERY.y} r="10" fill="none" stroke="#C45B36" strokeWidth="1.5" opacity="0.35">
              <animate attributeName="r" from="10" to="22" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.35" to="0" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx={QUERY.x} cy={QUERY.y} r="3.5" fill="#C45B36" />
            <text
              x={QUERY.x}
              y={QUERY.y - 16}
              fontFamily="Inter, sans-serif"
              fontSize="11"
              fontWeight="500"
              fill="#0F0E0C"
              textAnchor="middle"
            >
              your query
            </text>
          </g>
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-px border-t border-stone-200/60 bg-stone-200/60">
        {nearest.map((d, i) => (
          <div key={d.label} className="bg-cream px-3 py-2.5 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
              #{i + 1}
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-ink">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
