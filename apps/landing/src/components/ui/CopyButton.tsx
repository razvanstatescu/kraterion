"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 800);
    } catch {
      /* clipboard denied — silently ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] font-medium",
        "transition-colors duration-[160ms]",
        copied
          ? "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]"
          : "text-stone-600 hover:bg-stone-100 hover:text-ink",
        className
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
