"use client";

import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import type { InvoiceJson } from "@/lib/api";
import { useInvoices, useOpenBillingPortal } from "@/lib/queries";

/**
 * Recent invoices. Reads live from Stripe (12 most recent in any
 * state) with a 5-minute client cache — invoices don't change often
 * enough to warrant refetching on every navigation.
 *
 * We never mirror the PDF locally; "Download" deep-links to the
 * Stripe-hosted URL. Full history (>12 invoices) lives in the
 * Customer Portal, linked from the empty state and the footer.
 */
interface Props {
  projectId: string;
}

export function InvoicesCard({ projectId }: Props) {
  const invoices = useInvoices(projectId);
  const openPortal = useOpenBillingPortal(projectId);

  const rows = invoices.data?.invoices ?? [];

  return (
    <section className="ks-card" style={{ padding: 0 }}>
      <div
        className="ks-card-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <div className="ks-card-title">Invoices</div>
          <div className="ks-card-sub">
            Last 12 invoices. Full history with PDFs lives in Stripe.
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          iconRight="arrow-up-right"
          onClick={async () => {
            const { url } = await openPortal.mutateAsync();
            window.location.href = url;
          }}
          disabled={openPortal.isPending}
        >
          {openPortal.isPending ? "Opening…" : "View all in Stripe"}
        </Button>
      </div>
      {invoices.isLoading ? (
        <div className="muted" style={{ padding: 24, fontSize: 13 }}>
          Loading invoices…
        </div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ padding: 24, fontSize: 13 }}>
          No invoices yet. Your first invoice arrives at the end of the
          current billing period.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <Th>Date</Th>
              <Th>Period</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function InvoiceRow({ inv }: { inv: InvoiceJson }) {
  const created = new Date(inv.created * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const periodStart = new Date(inv.period_start * 1000).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
  const periodEnd = new Date(inv.period_end * 1000).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
  const amountDue = `$${(inv.amount_due_usd_cents / 100).toFixed(2)}`;
  const status = inv.status ?? "draft";
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <Td>
        <span style={{ color: "var(--text-primary)" }}>{created}</span>
        {inv.number ? (
          <div className="muted" style={{ fontSize: 11 }}>{inv.number}</div>
        ) : null}
      </Td>
      <Td>
        <span className="muted" style={{ fontSize: 13 }}>
          {periodStart} – {periodEnd}
        </span>
      </Td>
      <Td align="right">{amountDue}</Td>
      <Td>{renderStatus(status)}</Td>
      <Td align="right">
        {inv.hosted_invoice_url ? (
          <a
            href={inv.hosted_invoice_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            View →
          </a>
        ) : null}
      </Td>
    </tr>
  );
}

function renderStatus(status: string) {
  switch (status) {
    case "paid":
      return <Pill tone="success">Paid</Pill>;
    case "open":
      return <Pill tone="warning">Open</Pill>;
    case "void":
    case "uncollectible":
      return <Pill tone="neutral">{capitalize(status)}</Pill>;
    case "draft":
      return <Pill tone="neutral">Draft</Pill>;
    default:
      return <Pill tone="neutral">{capitalize(status)}</Pill>;
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
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
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "12px 16px",
        color: "var(--text-primary)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
