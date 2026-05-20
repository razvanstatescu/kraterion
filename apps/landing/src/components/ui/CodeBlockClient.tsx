"use client";

import { useState } from "react";
import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

type Tab = { lang: string; filename: string; code: string; html: string };

export function CodeBlockClient({
  tabs,
  copy,
  tone,
  controlledActive,
  onActiveChange,
}: {
  tabs: Tab[];
  copy: boolean;
  tone: "cream" | "ink";
  controlledActive?: number;
  onActiveChange?: (i: number) => void;
}) {
  const [internalActive, setInternalActive] = useState(0);
  const active = controlledActive ?? internalActive;
  const tab = tabs[active];

  const setActive = (i: number) => {
    setInternalActive(i);
    onActiveChange?.(i);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center justify-between border-b px-2 py-1.5",
          tone === "ink" ? "border-stone-800" : "border-stone-200/60"
        )}
      >
        <div role="tablist" className="flex items-center gap-1">
          {tabs.map((t, i) => (
            <button
              key={t.filename + i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "relative rounded-sm px-2 py-1 text-[12px] font-medium",
                "transition-colors duration-[160ms]",
                i === active
                  ? tone === "ink"
                    ? "text-cream"
                    : "text-ink"
                  : tone === "ink"
                  ? "text-stone-400 hover:text-stone-200"
                  : "text-stone-500 hover:text-ink"
              )}
            >
              {t.filename}
              {i === active && (
                <motion.span
                  layoutId="codeblock-underline"
                  className="absolute inset-x-1 -bottom-[7px] h-px bg-krater"
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
            </button>
          ))}
        </div>
        {copy && <CopyButton value={tab.code} />}
      </div>
      <div
        className={cn(
          "overflow-x-auto px-4 py-4 text-[13px] leading-[1.6] font-mono",
          "[&_pre]:!bg-transparent [&_pre]:p-0"
        )}
        dangerouslySetInnerHTML={{ __html: tab.html }}
      />
    </div>
  );
}
