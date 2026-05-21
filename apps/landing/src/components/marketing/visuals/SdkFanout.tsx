"use client";

import { KraterionMark } from "@/components/ui/KraterionMark";
import { cn } from "@/lib/cn";

type Item = { label: string; angle: number };

// Angles in degrees, 0 = right, 90 = down
const ITEMS: Item[] = [
  { label: "boto3", angle: -150 },
  { label: "aws-cli", angle: -100 },
  { label: "aws-sdk-js", angle: -55 },
  { label: "rclone", angle: -15 },
  { label: "MinIO mc", angle: 30 },
  { label: "terraform", angle: 75 },
  { label: "Next.js", angle: 120 },
  { label: "curl", angle: 165 },
];

// Tightened layout — pucks sit comfortably inside the 440 viewBox
const VIEW = 440;
const CENTER = VIEW / 2; // 220
const RADIUS = 150; // ring radius for spoke endpoints
const PUCK_W = 92;
const PUCK_H = 28;
// Spokes stop just outside the brand mark so they reach toward — but
// never touch — the icon at the center.
const MARK_SIZE = 44;
const SPOKE_INNER = MARK_SIZE / 2 + 8;

function pointAt(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r };
}

export function SdkFanout({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          One endpoint · every S3 client works
        </span>
        <span className="font-mono text-[11px] text-stone-600">s3.kraterion.com</span>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-6 py-8">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="block w-full max-w-[440px]"
          aria-label="S3 SDKs connecting to Kraterion endpoint"
        >
          {/* Outer ring + inner ring — CAD reference */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#E1D9C7"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS - 50}
            fill="none"
            stroke="#E1D9C7"
            strokeWidth="1"
          />

          {/* Spokes — reach toward the brand mark but leave a clean gap */}
          {ITEMS.map((item) => {
            const p = pointAt(item.angle, RADIUS - 6);
            const inner = pointAt(item.angle, SPOKE_INNER);
            return (
              <line
                key={item.label}
                x1={inner.x}
                y1={inner.y}
                x2={p.x}
                y2={p.y}
                stroke="#C9BFA8"
                strokeWidth="1"
              />
            );
          })}

          {/* Endpoint pucks — kept fully inside viewBox */}
          {ITEMS.map((item) => {
            const p = pointAt(item.angle, RADIUS);
            return (
              <g key={item.label}>
                <rect
                  x={p.x - PUCK_W / 2}
                  y={p.y - PUCK_H / 2}
                  width={PUCK_W}
                  height={PUCK_H}
                  rx="4"
                  fill="#F8F4EC"
                  stroke="#A89C82"
                  strokeWidth="1"
                />
                <text
                  x={p.x}
                  y={p.y + 4}
                  fontFamily="ui-monospace, monospace"
                  fontSize="11"
                  fill="#403930"
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            );
          })}

        </svg>

        {/* Brand mark — sits alone in the center, in ink */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <KraterionMark
            variant="mono"
            size={MARK_SIZE}
            className="text-ink"
          />
        </div>
      </div>
      {/* Footer band — anchors the diagram, eliminates dead space at the bottom */}
      <div className="grid grid-cols-3 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60">
        <FootStat label="Clients" value="8" />
        <FootStat label="S3 ops" value="11" />
        <FootStat label="Rewrites" value="0" />
      </div>
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span className="font-mono tabular-nums text-[14px] text-ink">{value}</span>
    </div>
  );
}
