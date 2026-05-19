"use client";

import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { ControlPlaneError, type UsageCurrentPeriodJson } from "@/lib/api";
import { useMe, useUsageCurrentPeriod } from "@/lib/queries";

/**
 * Current-period usage view. Replaces the editorial hero snapshot
 * with a real meter table backed by the hourly rollup workers.
 *
 * Layout (B4 — header + storage row + meter table + BYOK section,
 * the stacked daily bar chart lands in a polish pass):
 *
 *   1. Header strip: current period range, total accrued, projected
 *      end-of-period, days remaining.
 *   2. Storage row: used / reserved gauge + monthly cost. Resize CTA
 *      points to /billing where the modal lives.
 *   3. Meter table: 5 rows (Storage writes, Storage reads, Download
 *      bandwidth, Knowledge storage, Agent chat messages). Each shows
 *      used, free band, billable, cost-this-period, projected
 *      end-of-period.
 *   4. BYOK section: tokens-on-your-own-OpenAI-key spend; display
 *      only, never billed by Kraterion.
 */
export default function UsagePage() {
  const me = useMe();
  const project = me.data?.projects[0];
  const projectId = project?.id;
  const usage = useUsageCurrentPeriod(projectId);

  const isLoading = me.isLoading || usage.isLoading;
  const data = usage.data;

  return (
    <>
      <Topbar crumbs={[{ label: "Usage" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Usage</h1>
            <p className="lead">
              What you've used this billing period and what it projects to
              by end of month.
            </p>
          </div>
        </div>

        {usage.error ? (
          <Banner
            tone="error"
            title="Couldn't load usage"
            body={
              usage.error instanceof ControlPlaneError
                ? usage.error.message
                : usage.error instanceof Error
                  ? usage.error.message
                  : "Try again in a moment."
            }
          />
        ) : null}

        {isLoading || !data ? (
          <div className="muted" style={{ padding: 32 }}>
            Loading usage…
          </div>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            <Header data={data} />
            <StorageRow data={data} />
            <MetersTable data={data} />
            <ByokSection data={data} />
            <p
              className="muted"
              style={{ fontSize: 12, marginTop: 8, textAlign: "right" }}
            >
              Pricing details on <Link href="/billing">Billing</Link>. Free
              bands apply per meter — usage above them rolls into the next
              invoice.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function Header({ data }: { data: UsageCurrentPeriodJson }) {
  const start = new Date(data.period.start).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const end = new Date(
    new Date(data.period.end).getTime() - 86400000,
  ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const daysLeft = Math.max(0, data.period.days_in_period - data.period.days_elapsed);
  const totalUsd = (data.total_accrued_usd_cents / 100).toFixed(2);
  const projectedUsd = (data.projected_total_usd_cents / 100).toFixed(2);

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
      }}
    >
      <Stat label="Current period" value={`${start} – ${end}`} />
      <Stat label="Total accrued" value={`$${totalUsd}`} />
      <Stat label="Projected end-of-period" value={`$${projectedUsd}`} />
      <Stat label="Days remaining" value={`${daysLeft}`} />
    </section>
  );
}

function StorageRow({ data }: { data: UsageCurrentPeriodJson }) {
  const fillPct = data.storage.reserved_gb > 0
    ? Math.min(100, (data.storage.used_gb / data.storage.reserved_gb) * 100)
    : 0;
  const monthlyUsd = (data.storage.monthly_cost_usd_cents / 100).toFixed(2);

  return (
    <section className="ks-card">
      <div
        className="ks-card-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 24,
          alignItems: "center",
          padding: "20px 24px",
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
            Storage
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
            {data.storage.used_gb} GB used of {data.storage.reserved_gb} GB
            reserved
          </div>
          <div
            style={{
              marginTop: 10,
              height: 3,
              background: "var(--stone-100)",
              borderRadius: 2,
              overflow: "hidden",
              maxWidth: 320,
            }}
          >
            <div
              style={{
                width: `${fillPct}%`,
                height: "100%",
                background: "var(--krater)",
              }}
            />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
            Monthly
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--text-primary)" }}>
            ${monthlyUsd}
          </div>
          <Link
            href="/billing"
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            Resize →
          </Link>
        </div>
      </div>
    </section>
  );
}

function MetersTable({ data }: { data: UsageCurrentPeriodJson }) {
  return (
    <section className="ks-card" style={{ padding: 0 }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Metered usage
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <Th>Meter</Th>
            <Th align="right">Used</Th>
            <Th align="right">Free band</Th>
            <Th align="right">Billable</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Projected</Th>
          </tr>
        </thead>
        <tbody>
          {data.meters.map((m) => (
            <tr key={m.meter_name} style={{ borderBottom: "1px solid var(--border)" }}>
              <Td>
                <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                  {m.label}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {prettyUnit(m.unit)}
                </div>
              </Td>
              <Td align="right">{formatMeterValue(m.used, m.unit)}</Td>
              <Td align="right">
                <span className="muted">{formatMeterValue(m.free_band, m.unit)}</span>
              </Td>
              <Td align="right">{formatMeterValue(m.billable, m.unit)}</Td>
              <Td align="right">
                ${(m.billable_cost_usd_cents / 100).toFixed(2)}
              </Td>
              <Td align="right">
                <span className="muted">
                  ${(m.projected_cost_usd_cents / 100).toFixed(2)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ByokSection({ data }: { data: UsageCurrentPeriodJson }) {
  if (data.byok.by_model.length === 0) return null;
  const totalUsd = (data.byok.total_cost_usd_cents / 100).toFixed(2);
  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">BYOK token spend</div>
          <div className="ks-card-sub">
            ${totalUsd} on your own OpenAI key this period. Not billed by
            Kraterion — shown for transparency.
          </div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <Th>Model</Th>
            <Th align="right">Input tokens</Th>
            <Th align="right">Output tokens</Th>
            <Th align="right">Cost</Th>
          </tr>
        </thead>
        <tbody>
          {data.byok.by_model.map((m) => (
            <tr key={m.model} style={{ borderBottom: "1px solid var(--border)" }}>
              <Td>{m.model}</Td>
              <Td align="right">{Number(m.input_tokens).toLocaleString()}</Td>
              <Td align="right">{Number(m.output_tokens).toLocaleString()}</Td>
              <Td align="right">${(m.cost_usd_cents / 100).toFixed(2)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// === Atoms =================================================================

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ks-card" style={{ padding: "16px 20px" }}>
      <div
        className="muted"
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 16px",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--text-secondary)",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "12px 16px",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </td>
  );
}

function prettyUnit(unit: string): string {
  switch (unit) {
    case "ops":
      return "Requests";
    case "bytes":
      return "Total bytes";
    case "byte·s":
      return "Storage-time";
    case "messages":
      return "Messages";
    default:
      return unit;
  }
}

function formatMeterValue(raw: string, unit: string): string {
  const v = BigInt(raw);
  if (unit === "bytes") return formatBytes(v);
  if (unit === "byte·s") return formatByteSeconds(v);
  return Number(v).toLocaleString();
}

function formatBytes(b: bigint): string {
  if (b < 1024n) return `${b} B`;
  if (b < 1024n * 1024n) return `${(Number(b) / 1024).toFixed(1)} KB`;
  if (b < 1024n * 1024n * 1024n) return `${(Number(b) / (1024 * 1024)).toFixed(1)} MB`;
  if (b < 1024n ** 4n) return `${(Number(b) / (1024 ** 3)).toFixed(2)} GB`;
  return `${(Number(b) / 1024 ** 4).toFixed(2)} TB`;
}

function formatByteSeconds(bs: bigint): string {
  // 1 GB-day = 1024^3 × 86400 byte·s ≈ 9.28e10
  const gbDay = 1_073_741_824n * 86_400n;
  if (bs < gbDay) {
    const mbDay = bs / (1_048_576n * 86_400n);
    return `${Number(mbDay).toLocaleString()} MB-day`;
  }
  return `${(Number(bs / gbDay)).toLocaleString()} GB-day`;
}
