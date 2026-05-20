"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { StorageBillingStateJson } from "@/lib/api";
import { formatStorageMb } from "@/lib/format";
import { useResizeStorage } from "@/lib/queries";

/**
 * Resize modal — pick a new storage tier. Server decides
 * upgrade-vs-downgrade based on direction; the modal surfaces the
 * right copy per case.
 *
 * Tier presets are pinned in `packages/shared/src/billing-constants.ts`
 * (`STORAGE_TIER_PRESETS_MB`); we duplicate the list here so the
 * dashboard doesn't reach into a server-only package. Keep in sync.
 *
 * All values flow as **MiB** (matches Stripe subscription-item
 * quantity); the modal renders them via `formatStorageMb()` so the
 * unit reads naturally (e.g. "500 MB" → "1 GB" → "1 TB").
 */
const TIER_PRESETS_MB = [
  500,        // 500 MB (== free tier)
  1_024,      // 1 GB
  5_120,      // 5 GB
  10_240,     // 10 GB
  51_200,     // 50 GB
  102_400,    // 100 GB
  256_000,    // 250 GB
  512_000,    // 500 GB
  1_048_576,  // 1 TB
];

interface Props {
  projectId: string;
  state: StorageBillingStateJson;
  onClose: () => void;
}

export function ResizeStorageModal({ projectId, state, onClose }: Props) {
  // Minimum is current usage × 1.1 (10 % indexer-lag buffer), clamped
  // to the 500 MB tier-1 floor. Cannot drop below it.
  const minMb = Math.max(500, Math.ceil(state.used_mb * 1.1));
  const currentMb = state.reserved_mb;
  const [selected, setSelected] = useState<number>(
    pickInitialTier(currentMb, minMb),
  );
  const [customMode, setCustomMode] = useState(false);
  const [customMb, setCustomMb] = useState<string>(String(currentMb));
  const resize = useResizeStorage(projectId);
  const { show } = useToast();

  // Escape to close. Matches ConfirmModal so the interaction is
  // identical across the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resize.isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, resize.isPending]);

  const targetMb = customMode ? Number(customMb) : selected;
  const direction = useMemo(() => {
    if (!Number.isFinite(targetMb) || targetMb < minMb) return "invalid";
    if (targetMb === currentMb) return "noop";
    return targetMb > currentMb ? "upgrade" : "downgrade";
  }, [targetMb, currentMb, minMb]);

  // Stripe storage is $0.06/GB-mo = 0.005859375¢/MB above the 500 MB
  // free tier. Subtract the band from both sides to get the price
  // delta the customer actually pays.
  const billableNew = Math.max(0, targetMb - 500);
  const billableOld = Math.max(0, currentMb - 500);
  const deltaMb = billableNew - billableOld;
  // cents = mb × 6 / 1024; dollars = cents / 100
  const monthlyDeltaUsd = (deltaMb * 6) / 1024 / 100;

  const onSubmit = async () => {
    if (direction === "invalid" || direction === "noop") return;
    try {
      const result = await resize.mutateAsync({ new_reserved_mb: targetMb });
      if (result.direction === "upgrade") {
        show({
          tone: "success",
          title: "Storage upgraded",
          body: `${formatStorageMb(currentMb)} → ${formatStorageMb(targetMb)}. Prorated charge added to this period.`,
        });
      } else if (result.direction === "downgrade") {
        const when = result.effective_at
          ? new Date(result.effective_at).toLocaleDateString()
          : "next billing cycle";
        show({
          tone: "success",
          title: "Downgrade scheduled",
          body: `Will drop to ${formatStorageMb(targetMb)} on ${when}.`,
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
                Choose a new monthly reservation. Currently {formatStorageMb(currentMb)}.
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
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {TIER_PRESETS_MB.map((mb) => {
                const disabled = mb < minMb;
                const active = !customMode && selected === mb;
                return (
                  <button
                    key={mb}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setCustomMode(false);
                      setSelected(mb);
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
                    {formatStorageMb(mb)}
                  </button>
                );
              })}
            </div>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>
                Or enter a custom size (MB)
              </span>
              <input
                type="number"
                min={minMb}
                step={1}
                value={customMb}
                onChange={(e) => {
                  setCustomMode(true);
                  setCustomMb(e.target.value);
                }}
                onFocus={() => setCustomMode(true)}
                className="input"
                placeholder={`Minimum ${minMb} MB`}
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
                targetMb={targetMb}
                currentMb={currentMb}
                monthlyDeltaUsd={monthlyDeltaUsd}
                minMb={minMb}
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
  targetMb,
  currentMb,
  monthlyDeltaUsd,
  minMb,
}: {
  direction: "upgrade" | "downgrade" | "noop" | "invalid";
  targetMb: number;
  currentMb: number;
  monthlyDeltaUsd: number;
  minMb: number;
}) {
  void targetMb;
  if (direction === "invalid") {
    return (
      <>
        Pick at least <strong>{formatStorageMb(minMb)}</strong>. Storage
        cannot drop below current usage plus a 10% buffer.
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
        this month. New reservation: {formatStorageMb(targetMb)}.
      </>
    );
  }
  return (
    <>
      Takes effect at the end of the current billing period. You keep
      <strong> {formatStorageMb(currentMb)}</strong> until then.
    </>
  );
}

function pickInitialTier(currentMb: number, minMb: number): number {
  const aboveMin = TIER_PRESETS_MB.find((mb) => mb >= minMb && mb >= currentMb);
  if (aboveMin) return aboveMin;
  return Math.max(currentMb, minMb);
}
