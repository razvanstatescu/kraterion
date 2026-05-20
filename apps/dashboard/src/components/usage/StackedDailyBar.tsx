"use client";

import { useMemo, useState } from "react";
import type { UsageByDayJson } from "@/lib/api";
import { METER_COLORS, METER_LABELS, METER_STACK_ORDER } from "./meter-colors";

/**
 * Stacked daily bar chart — Cloudflare R2 billable-usage shape,
 * hand-rolled SVG (zero chart deps per the plan).
 *
 * One bar per UTC day. Each bar is split into stacked segments
 * proportional to that day's metered usage **converted to USD
 * cost**, so a 1 GB write and a 1 ms read aren't visually equal —
 * the user sees what's actually moving the bill.
 *
 * Interaction model:
 *
 *   - Hover a day → tooltip with the per-meter breakdown for that
 *     day in dollars.
 *   - Click a day → emits the selected day via `onDaySelect` (the
 *     /usage page wires this to filter the table below).
 *
 * Accessibility:
 *
 *   - Each bar is a `<button>` so keyboard nav + screen readers
 *     announce "May 18, $4.20 across 4 meters".
 *   - The chart has an `<svg role="img" aria-label="…">` summary
 *     for SR users who don't drill.
 */
interface Props {
  data: UsageByDayJson;
  onDaySelect?: (day: string | null) => void;
  selectedDay?: string | null;
}

interface DayMetric {
  day: string;
  totalCents: number;
  byMeter: Array<{ meter: string; cents: number }>;
}

export function StackedDailyBar({
  data,
  onDaySelect,
  selectedDay,
}: Props) {
  const days: DayMetric[] = useMemo(
    () =>
      data.days.map((d) => {
        const byMeter: Array<{ meter: string; cents: number }> = [];
        for (const m of METER_STACK_ORDER) {
          const cell = d.meters[m];
          if (!cell || cell.cost_usd_cents <= 0) continue;
          byMeter.push({ meter: m, cents: cell.cost_usd_cents });
        }
        const totalCents = byMeter.reduce((acc, x) => acc + x.cents, 0);
        return { day: d.day, totalCents, byMeter };
      }),
    [data],
  );

  const maxTotalCents = useMemo(
    () => Math.max(1, ...days.map((d) => d.totalCents)),
    [days],
  );

  const [hoverDay, setHoverDay] = useState<string | null>(null);

  if (days.length === 0) {
    return (
      <div
        className="muted"
        style={{ padding: 24, fontSize: 13, textAlign: "center" }}
      >
        No usage in this period yet.
      </div>
    );
  }

  // Chart geometry. We rely on a CSS-driven height so the chart
  // grows with the card. The bar width is responsive — `flex: 1` on
  // each column makes the chart fill its container, with a small
  // gutter between bars.
  const CHART_HEIGHT = 200;
  const MIN_VISIBLE_PX = 1; // ensure a non-zero bar reads as "present"

  return (
    <div
      role="img"
      aria-label={`Daily usage chart, ${days.length} days, peak $${(maxTotalCents / 100).toFixed(2)}`}
      style={{ display: "grid", gap: 10 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height: CHART_HEIGHT,
          padding: "0 4px",
        }}
      >
        {days.map((d) => {
          const heightPct =
            d.totalCents === 0
              ? 0
              : Math.max(
                  (d.totalCents / maxTotalCents) * 100,
                  (MIN_VISIBLE_PX / CHART_HEIGHT) * 100,
                );
          const isHovered = hoverDay === d.day;
          const isSelected = selectedDay === d.day;
          return (
            <button
              key={d.day}
              type="button"
              onMouseEnter={() => setHoverDay(d.day)}
              onMouseLeave={() => setHoverDay(null)}
              onFocus={() => setHoverDay(d.day)}
              onBlur={() => setHoverDay(null)}
              onClick={() =>
                onDaySelect?.(d.day === selectedDay ? null : d.day)
              }
              aria-label={`${formatDayLong(d.day)}, $${(d.totalCents / 100).toFixed(2)}`}
              style={{
                flex: 1,
                minWidth: 4,
                height: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                opacity: selectedDay && !isSelected ? 0.5 : 1,
                transition: "opacity 120ms var(--ease)",
              }}
            >
              <div
                style={{
                  height: `${heightPct}%`,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column-reverse",
                  borderRadius: 2,
                  overflow: "hidden",
                  outline: isHovered || isSelected
                    ? "1px solid var(--text-primary)"
                    : "none",
                  outlineOffset: 0,
                }}
              >
                {d.byMeter.map((m) => {
                  const segPct = (m.cents / d.totalCents) * 100;
                  return (
                    <div
                      key={m.meter}
                      style={{
                        height: `${segPct}%`,
                        background:
                          METER_COLORS[m.meter] ?? "var(--stone-400)",
                      }}
                      title={`${METER_LABELS[m.meter] ?? m.meter}: $${(m.cents / 100).toFixed(2)}`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <DayAxis days={days.map((d) => d.day)} />

      {hoverDay ? (
        <Tooltip day={days.find((d) => d.day === hoverDay)!} />
      ) : null}
    </div>
  );
}

function DayAxis({ days }: { days: string[] }) {
  // Show first, last, and ~5 evenly-spaced ticks in between so the
  // axis reads at any width.
  const showAt = useMemo(() => {
    if (days.length <= 7) return new Set(days);
    const idxs = new Set<number>([0, days.length - 1]);
    const step = Math.floor(days.length / 5);
    for (let i = step; i < days.length - 1; i += step) idxs.add(i);
    return new Set(Array.from(idxs).map((i) => days[i]!));
  }, [days]);

  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        padding: "0 4px",
      }}
    >
      {days.map((day) => (
        <div
          key={day}
          style={{
            flex: 1,
            minWidth: 4,
            fontSize: 10,
            color: "var(--text-secondary)",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {showAt.has(day) ? formatDayShort(day) : " "}
        </div>
      ))}
    </div>
  );
}

function Tooltip({ day }: { day: DayMetric }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        fontSize: 13,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          {formatDayLong(day.day)}
        </span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          ${(day.totalCents / 100).toFixed(2)}
        </span>
      </div>
      {day.byMeter.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          No metered usage this day.
        </div>
      ) : (
        day.byMeter.map((m) => (
          <div
            key={m.meter}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                color: "var(--text-secondary)",
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: METER_COLORS[m.meter] ?? "var(--stone-400)",
                }}
              />
              {METER_LABELS[m.meter] ?? m.meter}
            </span>
            <span style={{ color: "var(--text-primary)", fontSize: 12 }}>
              ${(m.cents / 100).toFixed(2)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function formatDayShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m!)}/${Number(d!)}`;
}
function formatDayLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
