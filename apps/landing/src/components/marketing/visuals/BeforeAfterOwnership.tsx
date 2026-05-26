"use client";

import { useEffect, useState } from "react";
import { Key, Lock, ShieldCheck, Wallet, MailWarning, Ban } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Before/After ownership panels. Replaces the previous SVG diagrams with
 * realistic HTML/CSS dashboard mockups: a provider's IAM console (before)
 * and Kraterion's keys panel (after). Pattern reference: Linear & Vercel
 * "before/after" comparisons that use real product surfaces, not abstract
 * art. One ambient revoke cycle on the after panel makes the brand claim
 * "revocation is enforced" visible instead of asserted.
 */

export function BeforeAfterOwnership({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2",
        className
      )}
    >
      {/* === BEFORE — typical S3 === */}
      <div className="flex flex-col bg-cream p-8 md:p-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stone-400" />
            Typical S3
          </span>
          <span className="font-mono text-[11px] text-stone-500">01 · before</span>
        </div>

        <h3 className="mt-6 text-[24px] leading-[1.2] text-ink">
          They hold the keys.
        </h3>

        <div className="mt-8">
          <TypicalS3Panel />
        </div>

        <ul className="mt-auto pt-8 space-y-2.5 text-[13px] text-stone-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Keys live inside the provider boundary.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Revoke is a support ticket, not a property.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
            Exit means copying everything out — at $0.09/GB egress.
          </li>
        </ul>
      </div>

      {/* === AFTER — Kraterion === */}
      <div className="flex flex-col bg-cream p-8 md:p-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-krater/30 bg-krater/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-medium text-krater">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
            Kraterion
          </span>
          <span className="font-mono text-[11px] text-stone-500">02 · after</span>
        </div>

        <h3 className="mt-6 text-[24px] leading-[1.2] text-ink">
          You hold the keys.
        </h3>

        <div className="mt-8">
          <KraterionPanel />
        </div>

        <ul className="mt-auto pt-8 space-y-2.5 text-[13px] text-stone-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Keys live with you. Plaintext never crosses the wire.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Revoke is a policy property — enforced, not promised.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-krater" />
            Exit through any S3 client — at ~9× lower egress than AWS.
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ─── BEFORE — typical provider IAM console ─────────────────────── */

const PROVIDER_KEYS = [
  { id: "AKIA7C4D8E1C…3F", role: "read-only", created: "12 mo" },
  { id: "AKIA92AC6712…A1", role: "read-write", created: "8 mo" },
  { id: "AKIA1A8B4C5D…99", role: "admin", created: "3 mo" },
];

function TypicalS3Panel() {
  return (
    <div className="hairline overflow-hidden rounded-md border border-stone-200/70 bg-cream">
      {/* Chrome bar — looks like a console window */}
      <div className="flex items-center gap-2.5 border-b border-stone-200/60 bg-stone-50/80 px-3 py-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-stone-300" />
          ))}
        </div>
        <span className="flex items-center gap-1 font-mono text-[10.5px] text-stone-500">
          <span>provider.s3</span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-600">/iam/access-keys</span>
        </span>
      </div>

      {/* Section label */}
      <div className="flex items-center justify-between border-b border-stone-200/60 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Access keys · provider-managed
        </span>
        <span className="font-mono text-[10px] text-stone-500">3 active</span>
      </div>

      {/* Keys list */}
      <ul className="divide-y divide-stone-200/60">
        {PROVIDER_KEYS.map((k) => (
          <li
            key={k.id}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-[11.5px]"
          >
            <span className="flex min-w-0 items-center gap-2 truncate font-mono text-stone-700">
              <Lock size={11} strokeWidth={1.5} className="text-stone-400" />
              {k.id}
            </span>
            <span className="inline-flex items-center rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
              {k.role}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-stone-500">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stone-400" />
              active
            </span>
          </li>
        ))}
      </ul>

      {/* Action footer — disabled */}
      <div className="border-t border-stone-200/60 bg-stone-50/60 px-3 py-3">
        <div
          aria-disabled
          className="inline-flex w-full items-center justify-between rounded-sm border border-dashed border-stone-300 bg-stone-100/60 px-3 py-2 text-[12px] text-stone-500"
        >
          <span className="inline-flex items-center gap-2">
            <MailWarning size={13} strokeWidth={1.5} />
            Revoke via support ticket
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400">
            disabled
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-stone-500">
          <Ban size={11} strokeWidth={1.5} className="text-stone-400" />
          Manual process · SLA 2-5 business days
        </p>
      </div>
    </div>
  );
}

/* ─── AFTER — Kraterion keys panel ──────────────────────────────── */

type CycleState = "active" | "revoking" | "revoked";

const KRATERION_KEYS: { id: string; role: string }[] = [
  { id: "kr_test_3f4d8e1c…a2", role: "read-only" },
  { id: "kr_test_92ac6712b1…7c", role: "read-write" },
  { id: "kr_share_test_1a8b4c…99", role: "agent" },
];

function KraterionPanel() {
  // Cycle one key through revoke states to make the "enforced" claim visible.
  // active (3.4s) → revoking (0.9s) → revoked (1.8s) → loops back to active.
  const [target, setTarget] = useState(0);
  const [state, setState] = useState<CycleState>("active");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let mounted = true;
    const sequence = [
      { state: "active" as const, duration: 3400 },
      { state: "revoking" as const, duration: 900 },
      { state: "revoked" as const, duration: 1800 },
    ];
    let i = 0;
    let timer: number | null = null;

    const step = () => {
      if (!mounted) return;
      const cur = sequence[i];
      setState(cur.state);
      i = (i + 1) % sequence.length;
      // When we return to "active", advance to the next key
      if (i === 0) setTarget((t) => (t + 1) % KRATERION_KEYS.length);
      timer = window.setTimeout(step, cur.duration);
    };
    step();

    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="hairline overflow-hidden rounded-md border border-stone-200/70 bg-cream">
      {/* Chrome bar */}
      <div className="flex items-center gap-2.5 border-b border-stone-200/60 bg-stone-50/80 px-3 py-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-stone-300" />
          ))}
        </div>
        <span className="flex items-center gap-1 font-mono text-[10.5px] text-stone-500">
          <span>app.kraterion.com</span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-600">/keys</span>
        </span>
      </div>

      {/* Section label — owned by you */}
      <div className="flex items-center justify-between border-b border-stone-200/60 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Your keys · scoped per agent
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-krater">
          <Wallet size={10} strokeWidth={1.5} />
          0x7c…3f4d
        </span>
      </div>

      {/* Keys list */}
      <ul className="divide-y divide-stone-200/60">
        {KRATERION_KEYS.map((k, idx) => {
          const isTarget = idx === target;
          const rowState: CycleState = isTarget ? state : "active";
          return (
            <li
              key={k.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-[11.5px]"
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-2 truncate font-mono transition-colors",
                  rowState === "revoked"
                    ? "text-stone-400 line-through decoration-stone-400"
                    : "text-stone-700"
                )}
              >
                <Key
                  size={11}
                  strokeWidth={1.5}
                  className={cn(
                    rowState === "revoked" ? "text-stone-400" : "text-krater"
                  )}
                />
                {k.id}
              </span>
              <span className="inline-flex items-center rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                {k.role}
              </span>
              <RowAction state={rowState} />
            </li>
          );
        })}
      </ul>

      {/* Footer — enforced */}
      <div className="border-t border-stone-200/60 bg-krater/[0.03] px-3 py-3">
        <div className="inline-flex w-full items-center justify-between rounded-sm border border-krater/30 bg-krater/[0.05] px-3 py-2 text-[12px] text-krater">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={13} strokeWidth={1.5} />
            Revoke per agent · enforced
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-krater/80">
            one click
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-[color:var(--color-success)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
          Keys stop being issued immediately — by structure, not policy.
        </p>
      </div>
    </div>
  );
}

function RowAction({ state }: { state: CycleState }) {
  if (state === "revoking") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-krater">
        <span
          aria-hidden
          className="h-1.5 w-1.5 animate-[pulse_0.9s_ease-in-out_infinite] rounded-full bg-krater"
        />
        revoking…
      </span>
    );
  }
  if (state === "revoked") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-stone-400">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stone-300" />
        revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-stone-600 transition-colors">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]"
      />
      active · revoke
    </span>
  );
}
