"use client";

import { useEffect, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from "@kraterion/shared";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";
import { Portal } from "@/components/ui/Portal";

interface Props {
  open: boolean;
  busy: boolean;
  /** Currently-saved default. Pre-selects the radio. */
  current: string | null;
  onCancel: () => void;
  onConfirm: (modelId: string) => void | Promise<void>;
}

/**
 * Single-step picker for the bucket's default chat model. Lightweight
 * by design — changing the chat model is free (per-request override
 * still works) and never touches indexed chunks. Use the Re-index flow
 * for embedding/chunking changes.
 */
export function ChangeChatModelDialog({
  open,
  busy,
  current,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string>(current ?? DEFAULT_CHAT_MODEL_ID);

  // Re-sync selection whenever the dialog opens so a previous in-flight
  // pick doesn't leak into the next open.
  useEffect(() => {
    if (open) setSelected(current ?? DEFAULT_CHAT_MODEL_ID);
  }, [open, current]);

  if (!open) return null;

  return (
    <Portal>
    <div
      className="ks-modal-scrim"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="ks-modal"
        style={{ width: 560, maxWidth: "calc(100vw - 32px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ks-modal-head">
          <div style={{ fontSize: 18, fontWeight: 500 }}>Change chat model</div>
          <IconButton name="x" label="Close" onClick={onCancel} disabled={busy} />
        </div>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 0,
            marginBottom: 16,
          }}
        >
          Default model used by <code>/ask</code> on this bucket. Indexed
          chunks aren&apos;t touched — switching is free and reversible.
          Callers can still override per request.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CHAT_MODELS.map((m) => {
            const isSelected = m.id === selected;
            return (
              <label
                key={m.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: 12,
                  border: `1px solid ${isSelected ? "var(--krater)" : "var(--border)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: isSelected ? "var(--bg-elevated)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="chat-model"
                  checked={isSelected}
                  onChange={() => setSelected(m.id)}
                  style={{ marginTop: 3 }}
                  disabled={busy}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontWeight: 500, fontSize: 14 }}
                    >
                      {m.label}
                    </span>
                    {m.default ? <Pill tone="success">Recommended</Pill> : null}
                    {m.id === current ? <Pill tone="neutral">Current</Pill> : null}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      marginTop: 4,
                    }}
                  >
                    {m.description}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      marginTop: 4,
                    }}
                  >
                    ~${m.price_per_m_tokens_usd.toFixed(2)} / million output tokens
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 24,
          }}
        >
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="cta"
            onClick={() => void onConfirm(selected)}
            loading={busy}
            disabled={selected === current}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
