"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STORAGE_DEFAULT_MB } from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { formatStorageMb } from "@/lib/format";
import {
  useBillingAccount,
  useMe,
  useUsageCurrentPeriod,
} from "@/lib/queries";

const DISMISS_PREFIX = "kraterion.billing-banner.dismissed.";

/**
 * Single billing banner mounted at the top of `(app)/layout.tsx`.
 *
 * Priority (highest first — only one banner is ever shown):
 *
 *   1. **Payment method missing** — hard blocker for write paths.
 *      Persistent CTA, not dismissable.
 *   2. **Subscription past_due / cancelled** — red, dismissible per
 *      session.
 *   3. **Spend cap exceeded** — red, persistent.
 *   4. **Spend cap 80%+** — amber, dismissible.
 *
 * Each tone:dismissible variant has its own dismiss key so dismissing
 * one tier doesn't hide the next. The dismiss flag is per-session in
 * sessionStorage; it returns on the next nav so the user never loses
 * sight of an unresolved billing issue across sessions.
 */
export function BillingBanner() {
  const me = useMe();
  const project = me.data?.projects[0];
  const projectId = project?.id;
  const account = useBillingAccount(projectId);
  const usage = useUsageCurrentPeriod(projectId);

  const billing = account.data?.account ?? null;
  const u = usage.data;

  // Compute the active banner kind from current data.
  const banner = pickBanner({
    accountStatus: billing?.status ?? null,
    hasPaymentMethod: billing?.has_payment_method ?? false,
    accrued: u?.total_accrued_usd_cents ?? 0,
    cap: billing?.hard_spend_cap_usd_cents ?? null,
  });

  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(DISMISS_PREFIX)) ids.push(k.slice(DISMISS_PREFIX.length));
    }
    setDismissed(ids);
  }, []);

  if (!banner) return null;
  if (banner.dismissible && dismissed.includes(banner.id)) return null;

  return (
    <div className="ks-topbar-notice">
      <Banner
        tone={banner.tone}
        title={banner.title}
        body={banner.body}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/billing" className="btn btn-secondary btn-sm">
              {banner.cta}
            </Link>
            {banner.dismissible ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  window.sessionStorage.setItem(
                    DISMISS_PREFIX + banner.id,
                    "1",
                  );
                  setDismissed((d) => [...d, banner.id]);
                }}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}

type BannerKind = {
  id: string;
  tone: "info" | "warning" | "error";
  title: string;
  body: React.ReactNode;
  cta: string;
  dismissible: boolean;
};

function pickBanner(args: {
  accountStatus: string | null;
  hasPaymentMethod: boolean;
  accrued: number;
  cap: number | null;
}): BannerKind | null {
  // No billing account at all (new project) → use the "no PM" banner.
  if (!args.hasPaymentMethod) {
    return {
      id: "no-payment-method",
      tone: "info",
      title: "Add a payment method to unlock writes",
      body: (
        <>
          Reads and existing data stay open. New buckets, agents, and uploads
          need a card on file. Free tier covers the first{" "}
          {formatStorageMb(STORAGE_DEFAULT_MB)} of storage plus a modest
          usage band.
        </>
      ),
      cta: "Add card →",
      dismissible: false,
    };
  }
  if (args.accountStatus === "past_due") {
    return {
      id: "past-due",
      tone: "error",
      title: "Your last invoice is past due",
      body: (
        <>
          Update your payment method to keep writes flowing. Your data is
          safe — we don't evict on billing failures.
        </>
      ),
      cta: "Update card →",
      dismissible: true,
    };
  }
  if (args.accountStatus === "cancelled") {
    return {
      id: "cancelled",
      tone: "warning",
      title: "Subscription cancelled",
      body: <>You keep full access until the end of the current period.</>,
      cta: "Re-subscribe →",
      dismissible: true,
    };
  }
  if (args.cap != null && args.accrued >= args.cap) {
    return {
      id: "cap-exceeded",
      tone: "error",
      title: "Hard spend cap exceeded",
      body: (
        <>
          Metered writes are paused for this billing period. Lift the cap or
          wait until the next period.
        </>
      ),
      cta: "Manage cap →",
      dismissible: false,
    };
  }
  if (args.cap != null && args.accrued >= args.cap * 0.8) {
    const pct = Math.floor((args.accrued / args.cap) * 100);
    return {
      id: `cap-${pct}`,
      tone: "warning",
      title: `You've used ${pct}% of your spend cap`,
      body: (
        <>
          Writes pause when accrued usage hits the cap. Raise it or adjust
          if you want to keep going.
        </>
      ),
      cta: "Manage cap →",
      dismissible: true,
    };
  }
  return null;
}
