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

const RADIUS = 180;
const CENTER = 220;

function pointAt(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r };
}

export function SdkFanout({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          One endpoint · every S3 client works
        </span>
        <span className="font-mono text-[11px] text-stone-600">s3.kraterion.com</span>
      </div>
      <div className="relative w-full">
        <svg
          viewBox="0 0 440 440"
          className="block w-full"
          aria-label="S3 SDKs connecting to Kraterion endpoint"
        >
          {/* Outer ring */}
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#E1D9C7" strokeWidth="1" strokeDasharray="3 4" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 60} fill="none" stroke="#E1D9C7" strokeWidth="1" />

          {/* Spokes */}
          {ITEMS.map((item) => {
            const p = pointAt(item.angle, RADIUS - 20);
            return (
              <line
                key={item.label}
                x1={CENTER}
                y1={CENTER}
                x2={p.x}
                y2={p.y}
                stroke="#C9BFA8"
                strokeWidth="1"
              />
            );
          })}

          {/* Endpoint pucks */}
          {ITEMS.map((item) => {
            const p = pointAt(item.angle, RADIUS);
            return (
              <g key={item.label}>
                <rect
                  x={p.x - 50}
                  y={p.y - 16}
                  width="100"
                  height="32"
                  rx="4"
                  fill="#F8F4EC"
                  stroke="#A89C82"
                  strokeWidth="1"
                />
                <text
                  x={p.x}
                  y={p.y + 4}
                  fontFamily="ui-monospace, monospace"
                  fontSize="12"
                  fill="#403930"
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              </g>
            );
          })}

          {/* Center node */}
          <g>
            <circle cx={CENTER} cy={CENTER} r="72" fill="#0F0E0C" />
            <circle cx={CENTER} cy={CENTER} r="60" fill="none" stroke="#C45B36" strokeWidth="1.5" opacity="0.7" />
          </g>
        </svg>

        {/* Center label overlaid */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2">
            <KraterionMark variant="dark" size={44} />
            <div className="font-mono text-[11px] text-cream/80">s3.kraterion.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}
