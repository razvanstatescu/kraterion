"use client";

import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { BillingDetailsCard } from "@/components/billing/BillingDetailsCard";
import { CurrentPeriodCard } from "@/components/billing/CurrentPeriodCard";
import { DangerZoneCard } from "@/components/billing/DangerZoneCard";
import { InvoicesCard } from "@/components/billing/InvoicesCard";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { SpendCapCard } from "@/components/billing/SpendCapCard";
import { StorageCard } from "@/components/billing/StorageCard";
import {
  useBillingAccount,
  useMe,
  useStorageBillingState,
} from "@/lib/queries";

/**
 * Billing — single column of stacked cards, Vercel / Supabase shape.
 *
 * Order (top-down) chosen so the user lands on "what matters now":
 *   1. Current period summary (cost so far + projection)
 *   2. Payment method (the most common action on this page)
 *   3. Storage reservation (the only non-metered subscription line)
 *   4. Spend cap (defensive ceiling)
 *   5. Invoices (paid history)
 *   6. Billing details (email / tax id / country)
 *   7. Cancel subscription (danger zone, bottom)
 *
 * One-project-per-account assumption matches the rest of the
 * dashboard. Multi-project billing is a B7+ concern.
 */
export default function BillingPage() {
  const me = useMe();
  const project = me.data?.projects[0];
  const projectId = project?.id;
  const account = useBillingAccount(projectId);
  const storage = useStorageBillingState(projectId);

  return (
    <>
      <Topbar crumbs={[{ label: "Billing" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Billing</h1>
            <p className="lead">
              Manage your payment method, storage reservation, and monthly
              subscription.
            </p>
          </div>
        </div>

        {me.isLoading || !projectId ? (
          <div className="muted">Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 20, maxWidth: 820 }}>
            <CurrentPeriodCard projectId={projectId} />
            <PaymentMethodCard
              projectId={projectId}
              account={account.data?.account ?? null}
            />
            <StorageCard
              projectId={projectId}
              state={storage.data?.state ?? null}
            />
            <SpendCapCard
              projectId={projectId}
              account={account.data?.account ?? null}
            />
            <InvoicesCard projectId={projectId} />
            <BillingDetailsCard
              projectId={projectId}
              account={account.data?.account ?? null}
            />
            <DangerZoneCard
              projectId={projectId}
              account={account.data?.account ?? null}
            />
            <p
              className="muted"
              style={{ fontSize: 12, marginTop: 4, textAlign: "right" }}
            >
              See per-meter usage on <Link href="/usage">Usage</Link>. Tax
              registration and invoice history live in the Stripe portal.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
