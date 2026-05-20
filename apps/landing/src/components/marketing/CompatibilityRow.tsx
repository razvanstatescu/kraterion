"use client";

import { useState } from "react";
import { Check, Minus, Clock, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Support } from "@/lib/mock/s3";

const meta: Record<Support, { icon: LucideIcon; label: string; toneClass: string }> = {
  full: { icon: Check, label: "Supported", toneClass: "text-[color:var(--color-success)]" },
  partial: { icon: Minus, label: "Partial", toneClass: "text-[color:var(--color-warning)]" },
  roadmap: { icon: Clock, label: "Roadmap", toneClass: "text-stone-500" },
};

export function CompatibilityRow({
  feature,
  support,
  note,
}: {
  feature: string;
  support: Support;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = meta[support].icon;
  const expandable = !!note;

  return (
    <div
      className={cn(
        "border-b border-stone-200/60 last:border-b-0",
        expandable ? "cursor-pointer" : ""
      )}
      onClick={() => expandable && setOpen((v) => !v)}
    >
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 text-[14px]">
        <span className="text-ink">{feature}</span>
        <span className={cn("inline-flex items-center gap-1.5 font-medium", meta[support].toneClass)}>
          <Icon size={14} strokeWidth={2} />
          {meta[support].label}
        </span>
        {expandable ? (
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className={cn("text-stone-400 transition-transform", open ? "rotate-180" : "")}
          />
        ) : (
          <span className="w-[14px]" />
        )}
      </div>
      {expandable && open && (
        <div className="px-4 pb-4 text-[13px] text-stone-600">{note}</div>
      )}
    </div>
  );
}
