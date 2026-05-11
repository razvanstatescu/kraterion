"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs: Crumb[];
  actions?: ReactNode;
}

export function Topbar({ crumbs, actions }: Props) {
  return (
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
  );
}
