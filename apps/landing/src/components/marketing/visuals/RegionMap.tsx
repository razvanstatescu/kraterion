"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// 6 regions positioned over a stylised equirectangular canvas (1000 × 500).
// Coords picked by hand, not geographically perfect — premium illustration, not GIS.
const REGIONS = [
  { id: "us-east", label: "US-EAST", x: 290, y: 220, p50: "32 ms" },
  { id: "us-west", label: "US-WEST", x: 180, y: 230, p50: "28 ms" },
  { id: "eu-central", label: "EU-CENTRAL", x: 510, y: 195, p50: "21 ms" },
  { id: "ap-south", label: "AP-SOUTH", x: 670, y: 280, p50: "44 ms" },
  { id: "ap-southeast", label: "AP-SOUTHEAST", x: 760, y: 320, p50: "39 ms" },
  { id: "sa-east", label: "SA-EAST", x: 340, y: 380, p50: "58 ms" },
];

// Pairs of region indices to draw arcs between.
const ARCS: Array<[number, number]> = [
  [1, 0], // us-west → us-east
  [0, 2], // us-east → eu-central
  [2, 3], // eu-central → ap-south
  [3, 4], // ap-south → ap-southeast
  [0, 5], // us-east → sa-east
];

function arcPath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // pull control point up — convex arc
  const lift = Math.min(80, Math.hypot(x2 - x1, y2 - y1) * 0.18);
  const cx = mx;
  const cy = my - lift;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

export function RegionMap({ className }: { className?: string }) {
  const [tracer, setTracer] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = window.setInterval(() => setTracer((i) => (i + 1) % ARCS.length), 1800);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Global edge · 6 regions
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          live · p50 21–58 ms
        </span>
      </div>
      <div className="px-4 py-6 md:px-8 md:py-10">
        <svg
          viewBox="0 0 1000 500"
          className="block w-full"
          aria-label="World map with region dots"
        >
          {/* Faint dot grid as canvas */}
          <defs>
            <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#C9BFA8" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="1000" height="500" fill="url(#dotgrid)" />

          {/* Stylised hairline coastlines — just suggestion of continents */}
          <g stroke="#A89C82" strokeWidth="1.25" fill="none" opacity="0.55" strokeLinejoin="round">
            {/* Americas */}
            <path d="M120,160 L180,140 L220,180 L260,210 L240,260 L260,310 L300,360 L310,400 L290,440 L260,430 L240,400 L210,370 L200,320 L180,290 L150,260 L130,230 Z" />
            {/* Europe / Africa */}
            <path d="M460,150 L520,140 L560,160 L580,180 L575,210 L560,235 L575,270 L590,320 L580,360 L555,390 L530,400 L505,380 L490,340 L500,290 L490,250 L470,210 Z" />
            {/* Asia / Oceania */}
            <path d="M610,140 L690,135 L760,155 L820,175 L840,200 L835,235 L800,260 L770,275 L745,295 L770,320 L780,355 L760,380 L730,375 L710,350 L680,320 L660,285 L645,245 L630,210 Z" />
          </g>

          {/* Arcs */}
          {ARCS.map(([a, b], i) => {
            const A = REGIONS[a];
            const B = REGIONS[b];
            const active = i === tracer;
            return (
              <path
                key={i}
                d={arcPath(A.x, A.y, B.x, B.y)}
                stroke={active ? "#C45B36" : "#A89C82"}
                strokeWidth={active ? "1.5" : "1"}
                fill="none"
                opacity={active ? 1 : 0.5}
                strokeDasharray={active ? "0" : "3 4"}
              />
            );
          })}

          {/* Tracer dot on active arc */}
          {(() => {
            const [a, b] = ARCS[tracer];
            const A = REGIONS[a];
            const B = REGIONS[b];
            return (
              <g>
                <path
                  id={`tracer-path-${tracer}`}
                  d={arcPath(A.x, A.y, B.x, B.y)}
                  fill="none"
                />
                <circle r="6" fill="#C45B36">
                  <animateMotion
                    key={tracer}
                    dur="1.6s"
                    repeatCount="indefinite"
                    path={arcPath(A.x, A.y, B.x, B.y)}
                  />
                </circle>
              </g>
            );
          })()}

          {/* Region pucks */}
          {REGIONS.map((r) => (
            <g key={r.id}>
              <circle cx={r.x} cy={r.y} r="14" fill="#F8F4EC" stroke="#0F0E0C" strokeWidth="1.5" />
              <circle cx={r.x} cy={r.y} r="4" fill="#0F0E0C" />
            </g>
          ))}

          {/* Region labels */}
          {REGIONS.map((r) => (
            <g key={`label-${r.id}`} transform={`translate(${r.x + 20},${r.y - 8})`}>
              <text
                x="0"
                y="0"
                fontFamily="Inter"
                fontSize="11"
                fontWeight="500"
                fill="#5B5142"
                letterSpacing="1.5"
              >
                {r.label}
              </text>
              <text
                x="0"
                y="14"
                fontFamily="ui-monospace, monospace"
                fontSize="10"
                fill="#7C7158"
              >
                p50 {r.p50}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
