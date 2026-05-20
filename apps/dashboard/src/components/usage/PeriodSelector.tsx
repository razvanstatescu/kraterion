"use client";

import { useMemo } from "react";

/**
 * Period selector — current / previous / last-7-days / custom.
 *
 * Kept deliberately small: a segmented-control of three preset
 * windows. "Custom" lands in a follow-up — the dashboard needs a
 * proper date-range picker (calendar popover, two inputs) and that's
 * its own design surface. The three presets cover ~95% of the use
 * cases (Stripe Billing dashboards default to current period; users
 * rarely look at arbitrary ranges).
 *
 * Returns ISO timestamps via `onChange({ from, to })` — `to` is
 * exclusive (consistent with the server's `getByDay` contract).
 */
export type PeriodKind = "current" | "previous" | "last7";

interface Props {
  value: PeriodKind;
  onChange: (kind: PeriodKind, range: { fromIso: string; toIso: string }) => void;
}

export function PeriodSelector({ value, onChange }: Props) {
  const ranges = useMemo(() => buildRanges(), []);
  const options: Array<{ kind: PeriodKind; label: string }> = [
    { kind: "current", label: "This month" },
    { kind: "previous", label: "Last month" },
    { kind: "last7", label: "Last 7 days" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Period"
      style={{
        display: "inline-flex",
        padding: 2,
        background: "var(--stone-100)",
        borderRadius: 6,
        border: "1px solid var(--border)",
      }}
    >
      {options.map((o) => {
        const active = o.kind === value;
        return (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.kind, ranges[o.kind]!)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid transparent",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              transition:
                "background 120ms var(--ease), color 120ms var(--ease)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Build the three preset ranges anchored to "now". Recomputed once
 *  per mount; if the page is open across midnight UTC the ranges
 *  drift slightly, which is fine for the chart granularity. */
function buildRanges(): Record<PeriodKind, { fromIso: string; toIso: string }> {
  const now = new Date();
  // UTC month boundaries.
  const utcStartOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const utcStartNextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const utcStartPrevMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const utcEndPrevMonth = utcStartOfMonth;
  const utcSevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  utcSevenDaysAgo.setUTCHours(0, 0, 0, 0);
  // For ranges that include today, end at tomorrow-midnight-UTC
  // (exclusive) so today's bar renders.
  const utcStartTomorrow = new Date(now);
  utcStartTomorrow.setUTCHours(0, 0, 0, 0);
  utcStartTomorrow.setUTCDate(utcStartTomorrow.getUTCDate() + 1);

  return {
    current: {
      fromIso: utcStartOfMonth.toISOString(),
      toIso: utcStartNextMonth.toISOString(),
    },
    previous: {
      fromIso: utcStartPrevMonth.toISOString(),
      toIso: utcEndPrevMonth.toISOString(),
    },
    last7: {
      fromIso: utcSevenDaysAgo.toISOString(),
      toIso: utcStartTomorrow.toISOString(),
    },
  };
}

export function defaultRange(): { fromIso: string; toIso: string } {
  return buildRanges().current;
}
