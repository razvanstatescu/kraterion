"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { StorageBillingStateJson } from "@/lib/api";
import { formatStorageMb } from "@/lib/format";
import { useCancelPendingDowngrade } from "@/lib/queries";
import { ResizeStorageModal } from "./ResizeStorageModal";

/**
 * Storage reservation card — the centrepiece of the `/billing` page.
 * Shows current vs used, monthly cost, next bill date, the resize
 * action, and (if applicable) the pending-downgrade banner with
 * cancel.
 *
 * Empty state when `state` is null → the project hasn't gone through
 * Checkout yet. In B5 this becomes the inline Stripe Elements card
 * form; for B3 we just nudge the user to start a session.
 */
interface Props {
  projectId: string;
  state: StorageBillingStateJson | null;
}

export function StorageCard({ projectId, state }: Props) {
  const [resizeOpen, setResizeOpen] = useState(false);
  const cancelDowngrade = useCancelPendingDowngrade(projectId);
  const { show } = useToast();

  if (!state) {
    return (
      <section className="ks-card">
        <div className="ks-card-head">
          <div>
            <div className="ks-card-title">Storage reservation</div>
            <div className="ks-card-sub">
              Add a payment method to set up your monthly storage subscription.
            </div>
          </div>
        </div>
        <div className="ks-card-body">
          <div className="muted" style={{ fontSize: 13 }}>
            Storage is a monthly reservation. The first 500 MB are
            free; you only pay for what you reserve above that.
          </div>
        </div>
      </section>
    );
  }

  const fillPct = state.reserved_mb > 0
    ? Math.min(100, (state.used_mb / state.reserved_mb) * 100)
    : 0;
  const monthlyUsd = (state.monthly_cost_usd_cents / 100).toFixed(2);
  const nextBill = state.next_bill_at
    ? new Date(state.next_bill_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const onCancelDowngrade = async () => {
    try {
      await cancelDowngrade.mutateAsync();
      show({
        tone: "success",
        title: "Scheduled downgrade cancelled",
        body: "Your storage stays at the current size.",
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Cancel failed.";
      show({
        tone: "error",
        title: "Couldn't cancel the downgrade",
        body: message,
      });
    }
  };

  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">Storage reservation</div>
          <div className="ks-card-sub">
            Monthly subscription. Upgrade applies immediately; downsize
            takes effect on the next billing cycle.
          </div>
        </div>
      </div>
      <div className="ks-card-body" style={{ display: "grid", gap: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {formatStorageMb(state.used_mb)} <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>used of</span> {formatStorageMb(state.reserved_mb)}
            </div>
            <div
              style={{
                marginTop: 12,
                height: 4,
                background: "var(--stone-100)",
                borderRadius: 2,
                overflow: "hidden",
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
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {fillPct.toFixed(1)}% used
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Monthly cost" value={`$${monthlyUsd}`} />
            <Field label="Next bill" value={nextBill} />
            <Field label="Free tier covers" value="500 MB" />
          </div>
        </div>

        {state.pending_downgrade ? (
          <div
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--surface-2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13 }}>
              <Pill tone="warning">Scheduled</Pill>{" "}
              Drops to <strong>{formatStorageMb(state.pending_downgrade.new_mb)}</strong> on{" "}
              <strong>
                {new Date(state.pending_downgrade.effective_at).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </strong>
              .
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancelDowngrade}
              disabled={cancelDowngrade.isPending}
            >
              {cancelDowngrade.isPending ? "Cancelling…" : "Cancel"}
            </Button>
          </div>
        ) : null}

        <div>
          <Button onClick={() => setResizeOpen(true)}>Resize storage</Button>
        </div>
      </div>

      {resizeOpen ? (
        <ResizeStorageModal
          projectId={projectId}
          state={state}
          onClose={() => setResizeOpen(false)}
        />
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}
