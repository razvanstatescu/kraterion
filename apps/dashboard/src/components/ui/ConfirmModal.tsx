"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Portal } from "./Portal";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: ReactNode;
  onchainNote?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Disable the confirm button. Use with type-to-confirm flows where
   *  the parent owns the gating state (the input value, a checkbox). */
  confirmDisabled?: boolean;
}

export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  onchainNote,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  confirmDisabled = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, busy]);

  if (!open) return null;
  return (
    <Portal>
      <div className="ks-modal-scrim" onClick={busy ? undefined : onCancel} role="dialog" aria-modal="true">
        <div className="ks-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ks-modal-head">
            <div style={{ fontSize: 18, fontWeight: 500 }}>{title}</div>
            <IconButton name="x" label="Cancel" onClick={onCancel} disabled={busy} />
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>{body}</div>
          {onchainNote ? (
            <div className="ks-onchain-note">
              <Icon name="link-2" size={14} />
              <span>{onchainNote}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => void onConfirm()}
              loading={busy}
              disabled={confirmDisabled || busy}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
