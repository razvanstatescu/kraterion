"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { BillingAccountJson } from "@/lib/api";
import { useCancelBillingSubscription } from "@/lib/queries";

/**
 * Danger zone — cancel subscription. Cancellation is at end of
 * billing period: the user keeps their reservation + free band
 * through the boundary so they can export data without rushing.
 *
 * Account-level "delete" is a separate flow (still in /settings) —
 * the dangerous one is the data wipe, which we don't want to
 * collocate with the routine "I'm done paying" action.
 */
interface Props {
  projectId: string;
  account: BillingAccountJson | null;
}

export function DangerZoneCard({ projectId, account }: Props) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelBillingSubscription(projectId);
  const { show } = useToast();

  const hasActive = account?.status === "active";

  const onConfirm = async () => {
    try {
      const { cancel_at } = await cancel.mutateAsync();
      setOpen(false);
      const date = cancel_at
        ? new Date(cancel_at * 1000).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "the end of the current period";
      show({
        tone: "info",
        title: "Subscription cancellation scheduled",
        body: `Your access continues until ${date}.`,
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Cancellation failed.";
      show({ tone: "error", title: "Couldn't cancel", body: message });
    }
  };

  return (
    <section className="ks-card ks-card-danger">
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
          <div className="ks-card-title">Cancel subscription</div>
          <div className="ks-card-sub">
            Stop billing at the end of the current period. You keep full
            access until the boundary so you can export or change plans.
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          disabled={!hasActive}
          onClick={() => setOpen(true)}
        >
          Cancel subscription
        </Button>
      </div>
      <ConfirmModal
        open={open}
        title="Cancel your Kraterion subscription?"
        body={
          <>
            Your subscription stays active until the end of the current
            billing period. After that, metered usage is paused and your
            storage pool stops auto-renewing.
            <br />
            <br />
            You can re-enable billing any time before the boundary by
            re-opening this page.
          </>
        }
        confirmLabel="Cancel subscription"
        danger
        busy={cancel.isPending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
