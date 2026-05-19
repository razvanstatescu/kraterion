"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { StorageBillingStateJson } from "@/lib/api";
import { useResizeStorage } from "@/lib/queries";

/**
 * Resize modal — pick a new storage tier. Server decides
 * upgrade-vs-downgrade based on direction; the modal surfaces the
 * right copy per case.
 *
 * Tier presets are pinned in `packages/shared/src/billing-constants.ts`
 * (`STORAGE_TIER_PRESETS_GB`); we duplicate the list here so the
 * dashboard doesn't reach into a server-only package. Keep in sync.
 */
const TIER_PRESETS_GB = [10, 50, 100, 250, 500, 1000, 2000, 5000];

interface Props {
  projectId: string;
  state: StorageBillingStateJson;
  onClose: () => void;
}

export function ResizeStorageModal({ projectId, state, onClose }: Props) {
  // Minimum is current usage × 1.1 (10 % indexer-lag buffer), clamped to
  // the 10 GB tier-1 floor. Cannot drop below it.
  const minGb = Math.max(10, Math.ceil(state.used_gb * 1.1));
  const currentGb = state.reserved_gb;
  const [selected, setSelected] = useState<number>(
    pickInitialTier(currentGb, minGb),
  );
  const [customMode, setCustomMode] = useState(false);
  const [customGb, setCustomGb] = useState<string>(String(currentGb));
  const resize = useResizeStorage(projectId);
  const { show } = useToast();

  // Escape to close. Matches the convention from ConfirmModal so the
  // modal feels native to the rest of the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resize.isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, resize.isPending]);

  const targetGb = customMode ? Number(customGb) : selected;
  const direction = useMemo(() => {
    if (!Number.isFinite(targetGb) || targetGb < minGb) return "invalid";
    if (targetGb === currentGb) return "noop";
    return targetGb > currentGb ? "upgrade" : "downgrade";
  }, [targetGb, currentGb, minGb]);

  // Stripe storage is $0.06/GB-mo above the 10 GB free tier.
  const delta = Math.max(0, targetGb - 10) - Math.max(0, currentGb - 10);
  const monthlyDeltaUsd = (delta * 6) / 100; // cents → dollars

  const onSubmit = async () => {
    if (direction === "invalid" || direction === "noop") return;
    try {
      const result = await resize.mutateAsync({ new_reserved_gb: targetGb });
      if (result.direction === "upgrade") {
        show({
          tone: "success",
          title: "Storage upgraded",
          body: `${currentGb} GB → ${targetGb} GB. Prorated charge added to this period.`,
        });
      } else if (result.direction === "downgrade") {
        const when = result.effective_at
          ? new Date(result.effective_at).toLocaleDateString()
          : "next billing cycle";
        show({
          tone: "success",
          title: "Downgrade scheduled",
          body: `Will drop to ${targetGb} GB on ${when}.`,
        });
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Resize failed.";
      show({ tone: "error", title: "Couldn't resize storage", body: message });
    }
  };

  return (
    <Portal>
      <div
        className="ks-modal-scrim"
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget && !resize.isPending) onClose();
        }}
      >
        <div
          className="ks-modal"
          style={{ width: 520, maxWidth: "calc(100vw - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ks-modal-head">
            <div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>Resize storage</div>
              <div
                className="muted"
                style={{ fontSize: 13, marginTop: 4 }}
              >
                Choose a new monthly reservation. Currently {currentGb} GB.
              </div>
            </div>
            <IconButton
              name="x"
              label="Cancel"
              onClick={onClose}
              disabled={resize.isPending}
            />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {TIER_PRESETS_GB.map((g) => {
                const disabled = g < minGb;
                const active = !customMode && selected === g;
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setCustomMode(false);
                      setSelected(g);
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 4,
                      border: `1px solid ${active ? "var(--krater)" : "var(--border)"}`,
                      background: active
                        ? "var(--krater)"
                        : "var(--bg-elevated)",
                      color: active
                        ? "var(--cream)"
                        : disabled
                          ? "var(--text-tertiary)"
                          : "var(--text-primary)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      opacity: disabled ? 0.4 : 1,
                      transition: "background 120ms var(--ease), border-color 120ms var(--ease)",
                    }}
                  >
                    {g} GB
                  </button>
                );
              })}
            </div>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>
                Or enter a custom size (GB)
              </span>
              <input
                type="number"
                min={minGb}
                step={1}
                value={customGb}
                onChange={(e) => {
                  setCustomMode(true);
                  setCustomGb(e.target.value);
                }}
                onFocus={() => setCustomMode(true)}
                className="input"
                placeholder={`Minimum ${minGb} GB`}
              />
            </label>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 4,
                background: "var(--stone-100)",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
              }}
            >
              <ResizeCopy
                direction={direction}
                targetGb={targetGb}
                currentGb={currentGb}
                monthlyDeltaUsd={monthlyDeltaUsd}
                minGb={minGb}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 20,
            }}
          >
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={resize.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onSubmit}
              loading={resize.isPending}
              disabled={
                direction === "invalid" ||
                direction === "noop" ||
                resize.isPending
              }
            >
              {direction === "upgrade"
                ? "Upgrade now"
                : direction === "downgrade"
                  ? "Schedule downgrade"
                  : "Confirm"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function ResizeCopy({
  direction,
  targetGb,
  currentGb,
  monthlyDeltaUsd,
  minGb,
}: {
  direction: "upgrade" | "downgrade" | "noop" | "invalid";
  targetGb: number;
  currentGb: number;
  monthlyDeltaUsd: number;
  minGb: number;
}) {
  if (direction === "invalid") {
    return (
      <>
        Pick at least <strong>{minGb} GB</strong>. Storage cannot drop
        below current usage plus a 10 % buffer.
      </>
    );
  }
  if (direction === "noop") {
    return <>This is already your current reservation.</>;
  }
  if (direction === "upgrade") {
    return (
      <>
        <strong>Effective immediately.</strong> Prorated charge of about
        <strong> ${monthlyDeltaUsd.toFixed(2)}</strong> for the rest of
        this month. New reservation: {targetGb} GB.
      </>
    );
  }
  return (
    <>
      Takes effect at the end of the current billing period. You keep
      <strong> {currentGb} GB</strong> until then.
    </>
  );
}

function pickInitialTier(currentGb: number, minGb: number): number {
  const aboveMin = TIER_PRESETS_GB.find((g) => g >= minGb && g >= currentGb);
  if (aboveMin) return aboveMin;
  return Math.max(currentGb, minGb);
}
