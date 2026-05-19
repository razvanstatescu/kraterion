"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { BillingAccountJson } from "@/lib/api";
import { useOpenBillingPortal } from "@/lib/queries";
import { InlineCardForm } from "./InlineCardForm";

/**
 * Payment method card.
 *
 * Two states:
 *
 *   - **No card on file** — renders the inline `<PaymentElement />`
 *     form directly inside the card body (the Vercel / Supabase
 *     shape). Submitting confirms the SetupIntent client-side; Stripe
 *     attaches the PM to the customer and fires `setup_intent.succeeded`,
 *     and our webhook flips `has_payment_method`. The card refetches
 *     and switches to the present state.
 *
 *   - **Card present** — shows brand + last4 (no actual digits leave
 *     Stripe — we only show the masked rep on file), exposes
 *     "Manage in Stripe" which deep-links to the Customer Portal.
 *
 * No third option ("swap card") in our UI — the Portal handles
 * card swap. We hide the "remove" action when there's unbilled
 * usage (server-side guard documented in the plan; UI mirrors).
 */
interface Props {
  projectId: string;
  account: BillingAccountJson | null;
}

export function PaymentMethodCard({ projectId, account }: Props) {
  const hasCard = Boolean(account?.has_payment_method);
  const openPortal = useOpenBillingPortal(projectId);
  const { show } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);

  const onManage = async () => {
    try {
      const { url } = await openPortal.mutateAsync();
      window.location.href = url;
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't open Stripe portal.";
      show({ tone: "error", title: "Open portal failed", body: message });
    }
  };

  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">Payment method</div>
          <div className="ks-card-sub">
            We bill monthly based on usage. The card stays on file in Stripe — you
            never enter it on our servers.
          </div>
        </div>
      </div>
      <div className="ks-card-body" style={{ display: "grid", gap: 16 }}>
        {hasCard ? (
          <CardOnFileRow
            onManage={onManage}
            isPending={openPortal.isPending}
          />
        ) : showAddForm ? (
          <InlineCardForm
            projectId={projectId}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <NoCardRow onAdd={() => setShowAddForm(true)} />
        )}
      </div>
    </section>
  );
}

function CardOnFileRow({
  onManage,
  isPending,
}: {
  onManage: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 24,
            borderRadius: 3,
            border: "1px solid var(--border)",
            display: "grid",
            placeItems: "center",
            background: "var(--stone-50)",
          }}
          aria-hidden
        >
          <Icon name="key" size={14} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              fontWeight: 500,
            }}
          >
            Card on file
          </span>
          <Pill tone="success">Active</Pill>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        iconRight="arrow-up-right"
        onClick={onManage}
        disabled={isPending}
      >
        {isPending ? "Opening…" : "Manage in Stripe"}
      </Button>
    </div>
  );
}

function NoCardRow({ onAdd }: { onAdd: () => void }) {
  return (
    <>
      <Banner
        tone="info"
        title="Add a payment method to start using Kraterion"
        body={
          <>
            Your free tier covers the first 10 GB of storage and modest
            usage. You only pay for what you use above the free band.
          </>
        }
      />
      <div>
        <Button onClick={onAdd}>Add card</Button>
      </div>
    </>
  );
}
