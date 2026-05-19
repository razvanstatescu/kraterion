"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { BillingAccountJson } from "@/lib/api";
import { useUpdateSpendCap } from "@/lib/queries";

/**
 * Spend cap card.
 *
 * Single segmented toggle (No limit / Set a cap) plus a dollar input
 * that appears when the cap is enabled. Inline Save button. The
 * storage subscription is exempt because it's a flat reservation, not
 * a meter — copy on the card calls that out.
 *
 * Alert thresholds are intentionally not surfaced here yet (B6 will
 * wire the email/Slack outputs); the row would just be a no-op
 * control until then.
 */
interface Props {
  projectId: string;
  account: BillingAccountJson | null;
}

export function SpendCapCard({ projectId, account }: Props) {
  const update = useUpdateSpendCap(projectId);
  const { show } = useToast();

  const hasCap = (account?.hard_spend_cap_usd_cents ?? null) !== null;
  const [enabled, setEnabled] = useState(hasCap);
  const [capDollars, setCapDollars] = useState(
    account?.hard_spend_cap_usd_cents != null
      ? (account.hard_spend_cap_usd_cents / 100).toString()
      : "100",
  );

  useEffect(() => {
    if (account == null) return;
    const hasCapNow = account.hard_spend_cap_usd_cents !== null;
    setEnabled(hasCapNow);
    setCapDollars(
      account.hard_spend_cap_usd_cents != null
        ? (account.hard_spend_cap_usd_cents / 100).toString()
        : "100",
    );
  }, [account?.hard_spend_cap_usd_cents]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async () => {
    let hard_cap_usd_cents: number | null = null;
    if (enabled) {
      const dollars = Number(capDollars);
      if (!Number.isFinite(dollars) || dollars < 1) {
        show({
          tone: "error",
          title: "Invalid cap",
          body: "Enter a dollar amount of $1 or more.",
        });
        return;
      }
      hard_cap_usd_cents = Math.round(dollars * 100);
    }
    try {
      await update.mutateAsync({ hard_cap_usd_cents });
      show({
        tone: "success",
        title: enabled ? "Spend cap saved" : "Spend cap removed",
        body: enabled
          ? `Usage above $${(hard_cap_usd_cents! / 100).toFixed(2)} this month will pause writes.`
          : "No cap will be applied. You can re-enable it any time.",
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed.";
      show({ tone: "error", title: "Couldn't save the cap", body: message });
    }
  };

  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">Spend cap</div>
          <div className="ks-card-sub">
            Pause metered usage above a monthly dollar ceiling. Storage
            reservation is exempt — only metered lines are gated.
          </div>
        </div>
      </div>
      <div
        className="ks-card-body"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "grid", gap: 6, flex: "0 0 auto" }}>
          <label
            className="muted"
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Cap mode
          </label>
          <Segmented
            value={enabled ? "capped" : "none"}
            onChange={(v) => setEnabled(v === "capped")}
            options={[
              { value: "none", label: "No limit" },
              { value: "capped", label: "Set a cap" },
            ]}
          />
        </div>

        {enabled ? (
          <div style={{ display: "grid", gap: 6, flex: "0 0 200px" }}>
            <label
              htmlFor="spend-cap"
              className="muted"
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Monthly cap (USD)
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  pointerEvents: "none",
                }}
              >
                $
              </span>
              <Input
                id="spend-cap"
                type="number"
                min={1}
                step={1}
                value={capDollars}
                onChange={(e) => setCapDollars(e.target.value)}
                style={{ paddingLeft: 24 }}
              />
            </div>
          </div>
        ) : null}

        <div style={{ marginLeft: "auto" }}>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      role="radiogroup"
      style={{
        display: "inline-flex",
        padding: 2,
        background: "var(--stone-100)",
        borderRadius: 6,
        border: "1px solid var(--border)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid transparent",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              transition:
                "background 120ms var(--ease), color 120ms var(--ease)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
