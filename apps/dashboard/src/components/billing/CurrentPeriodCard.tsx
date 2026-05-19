"use client";

import Link from "next/link";
import { useUsageCurrentPeriod } from "@/lib/queries";

/**
 * Header summary at the top of `/billing`. Same numbers we surface
 * on `/usage` but condensed into a single row so the billing page
 * reads "what I owe + what I've used + where to dig deeper" without
 * forcing a tab switch.
 *
 * Vercel / Supabase both put this kind of "current period at a
 * glance" right above the payment-method card. Borrowing the
 * pattern.
 */
interface Props {
  projectId: string;
}

export function CurrentPeriodCard({ projectId }: Props) {
  const usage = useUsageCurrentPeriod(projectId);
  const data = usage.data;

  if (!data) {
    return (
      <section
        className="ks-card"
        style={{ padding: "20px 24px", color: "var(--text-secondary)", fontSize: 13 }}
      >
        Loading current-period summary…
      </section>
    );
  }

  const start = formatDate(data.period.start);
  const end = formatDate(
    new Date(new Date(data.period.end).getTime() - 86_400_000).toISOString(),
  );
  const totalUsd = (data.total_accrued_usd_cents / 100).toFixed(2);
  const projectedUsd = (data.projected_total_usd_cents / 100).toFixed(2);
  const daysLeft = Math.max(
    0,
    data.period.days_in_period - data.period.days_elapsed,
  );

  return (
    <section
      className="ks-card"
      style={{
        padding: "20px 24px",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr) auto",
        gap: 24,
        alignItems: "center",
      }}
    >
      <Stat label="Period" value={`${start} – ${end}`} />
      <Stat label="Accrued" value={`$${totalUsd}`} accent />
      <Stat label="Projected" value={`$${projectedUsd}`} muted />
      <Stat label="Days left" value={`${daysLeft}`} muted />
      <Link
        href="/usage"
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          textDecoration: "none",
        }}
      >
        Details →
      </Link>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className="muted"
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: accent
            ? "var(--text-primary)"
            : muted
              ? "var(--text-secondary)"
              : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
