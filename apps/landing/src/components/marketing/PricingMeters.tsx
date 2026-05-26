import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Pricing — pay-as-you-go meters.
 *
 * Single panel that mirrors the structure of every other homepage visual
 * (chrome bar, hairline rows, footer stat band). Each row maps 1:1 to a
 * live Stripe metered price in `apps/control-plane/src/billing/catalog.ts`.
 * Numbers update here ↔ there together.
 *
 * Reference patterns: Cloudflare R2 price sheet, Bunny.net's regional
 * rate table, Anthropic API per-million pricing. Spare, scannable,
 * mono pricing column on the right.
 */

type Meter = {
  meter: string;
  description: string;
  free: string;
  freeUnit: string;
  rate: string;
  rateUnit: string;
};

const METERS: Meter[] = [
  {
    meter: "Storage",
    description: "Object bytes stored, averaged over the month",
    free: "500 MB",
    freeUnit: "/ mo",
    rate: "$0.06",
    rateUnit: "/ GB-month",
  },
  {
    meter: "Reads",
    description: "GET / HEAD / LIST operations on the S3 API",
    free: "1M ops",
    freeUnit: "/ mo",
    rate: "$0.40",
    rateUnit: "/ M ops",
  },
  {
    meter: "Writes",
    description: "PUT / DELETE operations on the S3 API",
    free: "1k ops",
    freeUnit: "/ mo",
    rate: "$5.00",
    rateUnit: "/ M ops",
  },
  {
    meter: "Egress",
    description: "Bytes leaving our edge — ~9× under AWS S3",
    free: "50 GB",
    freeUnit: "/ mo",
    rate: "$0.01",
    rateUnit: "/ GB",
  },
  {
    meter: "Knowledge index",
    description: "Indexed chunks + vector embeddings, by GB-day",
    free: "1 GB-day",
    freeUnit: "/ mo",
    rate: "$0.10",
    rateUnit: "/ GB-day",
  },
  {
    meter: "Agent messages",
    description: "Chat completions on Kraterion's platform key",
    free: "100",
    freeUnit: "/ mo",
    rate: "$0.01",
    rateUnit: "/ message",
  },
];

type Scenario = {
  name: string;
  workload: string[];
  total: string;
  accent?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    name: "Personal",
    workload: [
      "Under all free bands",
      "Static site · docs bucket",
    ],
    total: "$0",
  },
  {
    name: "Side project",
    workload: [
      "50 GB stored · 5M reads",
      "200 GB egress · light knowledge",
    ],
    total: "~$10",
  },
  {
    name: "Production",
    workload: [
      "1 TB stored · 100M reads",
      "10 TB egress · BYOK for agents",
    ],
    total: "~$230",
    accent: true,
  },
];

export function PricingMeters() {
  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      {/* Chrome — header bar */}
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Meters · per project, per month
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          no minimum · cancel anytime
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1.5fr_1fr_1fr] items-center gap-4 border-b border-stone-200/60 bg-stone-50/40 px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        <span>Resource</span>
        <span className="text-right">Free band</span>
        <span className="text-right">Then</span>
      </div>

      {/* Meter rows */}
      <ul className="divide-y divide-stone-200/60">
        {METERS.map((m) => (
          <li
            key={m.meter}
            className="grid grid-cols-[1.5fr_1fr_1fr] items-baseline gap-4 px-5 py-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-medium text-ink">
                {m.meter}
              </span>
              <span className="text-[12px] leading-[1.4] text-stone-500">
                {m.description}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0 text-right">
              <span className="font-mono text-[15px] tabular-nums text-krater">
                {m.free}
              </span>
              <span className="font-mono text-[11px] text-stone-500">
                {m.freeUnit}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0 text-right">
              <span className="font-mono text-[15px] tabular-nums text-ink">
                {m.rate}
              </span>
              <span className="font-mono text-[11px] text-stone-500">
                {m.rateUnit}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* BYOK callout */}
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-200/60 bg-krater/[0.04] px-5 py-3 text-[12px] leading-[1.5] text-stone-700">
        <Sparkles size={13} strokeWidth={1.5} className="text-krater" />
        <span>
          <span className="font-medium text-krater">Bring your own model key</span> — agent messages cost $0, tracked but not billed. Public-link egress through the embed widget is billed at the same $0.01/GB without a separate free band.
        </span>
      </div>

      {/* Footer — example monthly bills */}
      <div className="grid grid-cols-1 divide-y divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {SCENARIOS.map((s) => (
          <div
            key={s.name}
            className="flex flex-col gap-2 px-5 py-4"
          >
            <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
              {s.name}
            </span>
            <ul className="space-y-0.5 font-mono text-[11px] text-stone-600">
              {s.workload.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-mono text-[24px] leading-none tracking-[-0.01em] tabular-nums",
                  s.accent ? "text-krater" : "text-ink"
                )}
              >
                {s.total}
              </span>
              <span className="text-[11px] uppercase tracking-[0.12em] text-stone-500">
                / mo
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* "See full pricing" link as a quiet last row */}
      <Link
        href="/pricing"
        className="group flex items-center justify-between border-t border-stone-200/60 bg-cream px-5 py-3 text-[13px] text-ink transition-colors hover:bg-stone-50"
      >
        <span className="font-medium">See full pricing</span>
        <ArrowRight
          size={14}
          strokeWidth={1.5}
          className="text-stone-500 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}
