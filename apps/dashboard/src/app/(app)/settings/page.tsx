"use client";

import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Pill } from "@/components/ui/Pill";
import { env } from "@/lib/env";
import { formatRelative, suiscanObjectUrl } from "@/lib/format";
import { useMe } from "@/lib/queries";

/**
 * Account settings. Subscription cancellation lives in the Billing tab
 * (Stripe, cancel-at-period-end); this page is account info + connected
 * agent management only.
 */
export default function SettingsPage() {
  const { data, isLoading } = useMe();

  const account = data?.account;
  const isCancelled = account?.status === "cancelled";

  return (
    <>
      <Topbar crumbs={[{ label: "Settings" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Settings</h1>
            <p className="lead">Account information and account-level actions.</p>
          </div>
        </div>

        {isLoading || !account ? (
          <div className="muted">Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            <section className="ks-card">
              <div className="ks-card-head">
                <div>
                  <div className="ks-card-title">Account</div>
                  <div className="ks-card-sub">The Google identity Kraterion signs in with.</div>
                </div>
              </div>
              <div className="ks-card-body" style={{ display: "grid", gap: 12 }}>
                <Field label="Email" value={account.email} />
                <Field
                  label="Sui address"
                  value={
                    <a
                      className="ks-onchain-mono"
                      href={suiscanObjectUrl(account.sui_address, env.network)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {account.sui_address}
                    </a>
                  }
                />
                <Field
                  label="Status"
                  value={
                    <Pill tone={isCancelled ? "warning" : "success"}>
                      {isCancelled ? "Cancelled" : "Active"}
                    </Pill>
                  }
                />
                <Field label="Member since" value={formatRelative(account.created_at)} />
              </div>
            </section>

            <section className="ks-card">
              <div className="ks-card-head">
                <div>
                  <div className="ks-card-title">Connected agents</div>
                  <div className="ks-card-sub">
                    MCP clients like Claude Desktop and Cursor that you&apos;ve authorized.
                  </div>
                </div>
              </div>
              <div
                className="ks-card-body"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
              >
                <div className="muted" style={{ fontSize: 13 }}>
                  Review, audit, or disconnect any agent that&apos;s
                  signed in to your account.
                </div>
                <Link href="/agents" className="btn btn-secondary btn-sm">
                  Manage agents
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div className="micro">{label}</div>
      <div style={{ fontSize: 14, color: "var(--text-primary)", textAlign: "right", minWidth: 0 }}>
        {value}
      </div>
    </div>
  );
}
