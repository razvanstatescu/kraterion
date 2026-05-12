"use client";

import { useState } from "react";
import { ConnectedAgents } from "@/components/oauth/ConnectedAgents";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { formatRelative, suiscanObjectUrl } from "@/lib/format";
import { useCancelSubscription, useMe } from "@/lib/queries";

/**
 * Account settings + the demo's "twist 1" (cancel subscription). Cancelling
 * doesn't burn the user's data — the on-chain Bucket / SharedBlob objects
 * keep paying rent until their funding pools dry up. The persistent
 * `CancelledBanner` in the (app) layout drives that point home.
 */
export default function SettingsPage() {
  const { data, isLoading } = useMe();
  const cancel = useCancelSubscription();
  const { show } = useToast();
  const [confirm, setConfirm] = useState(false);

  const account = data?.account;
  const isCancelled = account?.status === "cancelled";

  const onCancel = async () => {
    try {
      await cancel.mutateAsync();
      setConfirm(false);
      show({
        tone: "success",
        title: "Subscription cancelled",
        body: "Your files remain on-chain.",
        sticky: true,
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Cancel failed.";
      show({ tone: "error", title: "Couldn't cancel", body: message });
    }
  };

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

            <ConnectedAgents />

            <section className="ks-card ks-card-danger">
              <div className="ks-card-head">
                <div>
                  <div className="ks-card-title">Cancel subscription</div>
                  <div className="ks-card-sub">
                    Stops billing. Your files don&apos;t move — they stay on-chain at your Sui
                    address. Anyone can keep funding their storage via the CLI.
                  </div>
                </div>
              </div>
              <div
                className="ks-card-body"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
              >
                <div className="muted" style={{ fontSize: 13 }}>
                  {isCancelled
                    ? "Already cancelled. Nothing more to do here."
                    : "This is the demo's signature move — proving you actually own the data."}
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon="alert"
                  onClick={() => setConfirm(true)}
                  disabled={isCancelled || cancel.isPending}
                >
                  {isCancelled ? "Cancelled" : "Cancel subscription"}
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>

      <ConfirmModal
        open={confirm}
        onCancel={() => (cancel.isPending ? undefined : setConfirm(false))}
        onConfirm={onCancel}
        busy={cancel.isPending}
        danger
        confirmLabel={cancel.isPending ? "Cancelling…" : "Yes, cancel"}
        title="Cancel your Kraterion subscription?"
        body={
          <>
            <p style={{ margin: 0 }}>
              Your buckets and files won&apos;t be deleted. Their on-chain funding pools keep
              paying Walrus storage costs until they run out — which can be days, weeks, or
              years depending on how much WAL they hold.
            </p>
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              The dashboard stays read-only after cancellation. To re-activate, sign in again —
              your address and buckets are still there.
            </p>
          </>
        }
        onchainNote="Files remain encrypted on-chain at your Sui address. We never had a copy."
      />
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
