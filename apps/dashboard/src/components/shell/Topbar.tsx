"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { CancelledBanner } from "@/components/shell/CancelledBanner";
import { Icon } from "@/components/ui/Icon";

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs: Crumb[];
  actions?: ReactNode;
}

/**
 * Sticky page header. Two parts:
 *
 *   1. The crumb + actions bar (the visible "topbar").
 *   2. Persistent app-shell banners (cancelled subscription, billing
 *      status) stacked directly underneath so they share the same
 *      sticky-top context.
 *
 * Why mounted here rather than in `(app)/layout.tsx`: each page renders
 * its own `<Topbar>` inside the scroll column so the header sticks to
 * the content area, not the viewport. The banners need to stick with
 * it — mounting at the layout level put them ABOVE the topbar with no
 * horizontal padding and a gap that swallowed the brand logo. Wrapping
 * banner + header in one sticky container fixes the visual + the
 * padding alignment in one place.
 *
 * Banners self-gate: each component renders nothing when its predicate
 * is false (no banner needed, account is active, etc.), so the stack
 * collapses to just the header bar in the happy path.
 */
export function Topbar({ crumbs, actions }: Props) {
  return (
    <div className="ks-topbar-stack">
      <header className="ks-topbar">
        <div className="ks-crumbs">
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {i > 0 ? <Icon name="chevron" size={14} /> : null}
              {c.href ? (
                <Link href={c.href} className="ks-crumb-link">{c.label}</Link>
              ) : (
                <span className="ks-crumb" style={{ color: "var(--text-primary)" }}>{c.label}</span>
              )}
            </span>
          ))}
        </div>
        <div className="ks-topbar-actions">{actions}</div>
      </header>
      <CancelledBanner />
      <BillingBanner />
    </div>
  );
}
