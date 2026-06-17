"use client";

import { useMemo, useState } from "react";
import * as motion from "motion/react-client";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Smart pricing calculator.
 *
 * Design pattern: preset chips + a single modifier. References:
 *   - Wasabi cost calculator       (industry-preset buttons)
 *   - DigitalOcean droplet sizer   (small set of profiles)
 *   - Render's pricing estimator   (project shape → bill)
 *
 * Two user inputs total:
 *   1. Project shape — Hobby / Indie dev / Startup / Production
 *   2. Knowledge layer — on / off
 *
 * Agent messages are always BYOK (the only supported model) and so are
 * always $0 to Kraterion — surfaced as a row in the bill with the user's
 * own key labeled in the rate column.
 *
 * Each line item exposes (quantity · rate · cost) so the calculator
 * doubles as a price sheet. All numbers are computed from the live
 * catalog in `apps/control-plane/src/billing/catalog.ts`.
 */

/* ─── Catalog mirror ────────────────────────────────────────────── */

const FREE = {
  storageMb: 500,
  reads: 1_000_000,
  writes: 1_000,
  egressGb: 50,
  knowledgeGbDay: 1,
};

const RATES = {
  /** $0.06 / GB-month — expressed per MB-month for sub-GB precision */
  storagePerMbMonth: 0.06 / 1024,
  /** $0.40 / M ops — per single op */
  readsPerOp: 0.4 / 1_000_000,
  /** $5.00 / M ops — per single op */
  writesPerOp: 5 / 1_000_000,
  /** $0.01 / GB */
  egressPerGb: 0.01,
  /** $0.10 / GB-day */
  knowledgePerGbDay: 0.1,
};

const RATE_LABELS = {
  storage: "$0.06 / GB-month",
  reads: "$0.40 / M ops",
  writes: "$5.00 / M ops",
  egress: "$0.01 / GB",
  knowledge: "$0.10 / GB-day",
};

/* ─── Presets ───────────────────────────────────────────────────── */

type Workload = {
  storageMb: number;
  reads: number;
  writes: number;
  egressGb: number;
  knowledgeGbDay: number;
  agentMessages: number;
};

type Preset = {
  id: "hobby" | "indie" | "startup" | "production";
  label: string;
  hint: string;
  workload: Workload;
};

const PRESETS: Preset[] = [
  {
    id: "hobby",
    label: "Hobby",
    hint: "Personal site · weekend project",
    workload: {
      storageMb: 200,
      reads: 10_000,
      writes: 200,
      egressGb: 5,
      knowledgeGbDay: 0.5,
      agentMessages: 50,
    },
  },
  {
    id: "indie",
    label: "Indie dev",
    hint: "Solo dev shipping a product",
    workload: {
      storageMb: 50 * 1024,
      reads: 5_000_000,
      writes: 10_000,
      egressGb: 200,
      knowledgeGbDay: 10,
      agentMessages: 20_000,
    },
  },
  {
    id: "startup",
    label: "Startup",
    hint: "Early traction · small team",
    workload: {
      storageMb: 200 * 1024,
      reads: 20_000_000,
      writes: 50_000,
      egressGb: 800,
      knowledgeGbDay: 60,
      agentMessages: 100_000,
    },
  },
  {
    id: "production",
    label: "Production",
    hint: "Scaling app · live customers",
    workload: {
      storageMb: 2 * 1024 * 1024,
      reads: 100_000_000,
      writes: 500_000,
      egressGb: 5 * 1024,
      knowledgeGbDay: 500,
      agentMessages: 500_000,
    },
  },
];

/* ─── Math ──────────────────────────────────────────────────────── */

function computeBill(workload: Workload, withKnowledge: boolean) {
  const storageCost =
    Math.max(0, workload.storageMb - FREE.storageMb) * RATES.storagePerMbMonth;
  const readsCost =
    Math.max(0, workload.reads - FREE.reads) * RATES.readsPerOp;
  const writesCost =
    Math.max(0, workload.writes - FREE.writes) * RATES.writesPerOp;
  const egressCost =
    Math.max(0, workload.egressGb - FREE.egressGb) * RATES.egressPerGb;
  const knowledgeCost = withKnowledge
    ? Math.max(0, workload.knowledgeGbDay - FREE.knowledgeGbDay) *
      RATES.knowledgePerGbDay
    : 0;
  // Agent messages are always BYOK — Kraterion only supports
  // bring-your-own-key, so this line is always $0 (the user pays
  // their model provider directly).
  const agentCost = 0;

  return {
    storage: storageCost,
    reads: readsCost,
    writes: writesCost,
    egress: egressCost,
    knowledge: knowledgeCost,
    agent: agentCost,
    total:
      storageCost +
      readsCost +
      writesCost +
      egressCost +
      knowledgeCost +
      agentCost,
  };
}

/* ─── Formatters ────────────────────────────────────────────────── */

function fmtMoney(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 100) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtStorage(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb >= 100 ? gb.toFixed(0) : gb.toFixed(0)} GB`;
  return `${(gb / 1024).toFixed(0)} TB`;
}

function fmtOps(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtEgress(gb: number): string {
  if (gb < 1024) return `${gb} GB`;
  return `${(gb / 1024).toFixed(0)} TB`;
}

/* ─── Component ─────────────────────────────────────────────────── */

export function PricingCalculator() {
  const [presetId, setPresetId] = useState<Preset["id"]>("indie");
  const [withKnowledge, setWithKnowledge] = useState(true);

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const bill = useMemo(
    () => computeBill(preset.workload, withKnowledge),
    [preset, withKnowledge]
  );

  const lines = [
    {
      id: "storage",
      label: "Storage",
      qty: fmtStorage(preset.workload.storageMb),
      rate: RATE_LABELS.storage,
      cost: bill.storage,
    },
    {
      id: "reads",
      label: "Reads",
      qty: `${fmtOps(preset.workload.reads)} ops`,
      rate: RATE_LABELS.reads,
      cost: bill.reads,
    },
    {
      id: "writes",
      label: "Writes",
      qty: `${fmtOps(preset.workload.writes)} ops`,
      rate: RATE_LABELS.writes,
      cost: bill.writes,
    },
    {
      id: "egress",
      label: "Egress",
      qty: fmtEgress(preset.workload.egressGb),
      rate: RATE_LABELS.egress,
      cost: bill.egress,
    },
    {
      id: "knowledge",
      label: "Knowledge index",
      qty: withKnowledge ? `${preset.workload.knowledgeGbDay} GB-day` : "off",
      rate: withKnowledge ? RATE_LABELS.knowledge : "—",
      cost: bill.knowledge,
      disabled: !withKnowledge,
    },
    {
      id: "agent",
      label: "Agent messages",
      qty: `${fmtOps(preset.workload.agentMessages)} msg`,
      rate: "BYOK · your model key",
      cost: bill.agent,
    },
  ];

  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      {/* Chrome */}
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Estimate · per project, per month
        </span>
        <span className="font-mono text-[11px] text-stone-600">live · USD</span>
      </div>

      {/* Project shape — preset chips */}
      <div className="border-b border-stone-200/60 px-5 py-4 md:px-6">
        <div className="mb-3 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Project shape
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PRESETS.map((p) => {
            const selected = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresetId(p.id)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-krater/40 bg-krater/[0.05]"
                    : "border-stone-200/60 bg-cream hover:border-stone-300/80 hover:bg-stone-50"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      selected ? "bg-krater" : "bg-stone-300"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      selected ? "text-ink" : "text-stone-700"
                    )}
                  >
                    {p.label}
                  </span>
                </span>
                <span className="font-mono text-[10px] leading-[1.3] text-stone-500">
                  {p.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modifier — single toggle (agent messages are always BYOK) */}
      <div className="border-b border-stone-200/60">
        <Toggle
          label="Knowledge layer"
          hint="Index files for hybrid search + agent retrieval"
          options={[
            { id: "on", label: "On" },
            { id: "off", label: "Off" },
          ]}
          value={withKnowledge ? "on" : "off"}
          onChange={(v) => setWithKnowledge(v === "on")}
        />
      </div>

      {/* Column header */}
      <div className="hidden grid-cols-[1.3fr_1fr_1.3fr_0.8fr] items-center gap-4 border-b border-stone-200/60 bg-stone-50/40 px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 md:grid md:px-6">
        <span>Resource</span>
        <span>Usage</span>
        <span>Rate</span>
        <span className="text-right">Cost</span>
      </div>

      {/* Line items */}
      <ul className="divide-y divide-stone-200/60">
        {lines.map((line) => (
          <BillRow key={line.id} {...line} />
        ))}
      </ul>

      {/* Total band */}
      <div className="flex items-baseline justify-between border-t border-stone-200/60 bg-stone-50/60 px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
            Estimated monthly bill
          </span>
          <span className="text-[12px] text-stone-600">
            Based on industry averages for this project shape.
          </span>
          <span
            className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-stone-200/80 px-2.5 py-1 text-[11px] text-stone-600"
            style={{ background: "rgba(196, 91, 54, 0.06)" }}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
            <span className="font-medium text-ink">Private beta</span>
            <span>— rates informational, not final</span>
          </span>
        </div>
        <motion.span
          key={bill.total}
          initial={{ opacity: 0.3, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          className="font-mono text-[36px] leading-none tracking-[-0.01em] tabular-nums text-krater md:text-[44px]"
        >
          {fmtMoney(bill.total)}
        </motion.span>
      </div>

      {/* See full pricing footer link */}
      <Link
        href="/pricing"
        className="group flex items-center justify-between border-t border-stone-200/60 bg-cream px-5 py-3 text-[13px] text-ink transition-colors hover:bg-stone-50 md:px-6"
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

/* ─── Subcomponents ─────────────────────────────────────────────── */

function Toggle({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-6">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        <span className="text-[11px] text-stone-500">{hint}</span>
      </div>
      <div className="inline-flex items-center gap-1 rounded-md border border-stone-200/60 bg-stone-50 p-0.5">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={selected}
              className={cn(
                "rounded-sm px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                selected
                  ? "bg-cream text-krater shadow-[inset_0_0_0_1px_rgba(196,91,54,0.15)]"
                  : "text-stone-500 hover:text-stone-700"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BillRow({
  label,
  qty,
  rate,
  cost,
  disabled = false,
}: {
  label: string;
  qty: string;
  rate: string;
  cost: number;
  disabled?: boolean;
}) {
  const free = !disabled && cost === 0;
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 text-[13px] md:grid-cols-[1.3fr_1fr_1.3fr_0.8fr] md:px-6"
      )}
    >
      {/* Resource name */}
      <span
        className={cn(
          "font-medium",
          disabled ? "text-stone-400" : "text-ink"
        )}
      >
        {label}
      </span>

      {/* Cost (top-right on mobile, last column on desktop) */}
      <span className="flex items-center justify-end gap-2 md:order-last">
        {free && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-success)]">
            <Check size={9} strokeWidth={2.5} />
            free
          </span>
        )}
        <motion.span
          key={cost}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "font-mono tabular-nums text-[14px]",
            disabled ? "text-stone-400" : free ? "text-stone-500" : "text-ink"
          )}
        >
          {fmtMoney(cost)}
        </motion.span>
      </span>

      {/* Usage (full width on mobile, second col on desktop) */}
      <span
        className={cn(
          "col-span-2 font-mono text-[11px] text-stone-600 md:col-span-1 md:text-[12px]",
          disabled && "text-stone-400"
        )}
      >
        <span className="md:hidden text-stone-500">{label === "Storage" ? "" : ""}</span>
        {qty}
      </span>

      {/* Rate (desktop only — third col) */}
      <span
        className={cn(
          "hidden font-mono text-[11px] text-stone-500 md:inline",
          disabled && "text-stone-400"
        )}
      >
        {rate}
      </span>
    </li>
  );
}
