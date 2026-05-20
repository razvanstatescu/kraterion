"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";

export type Frame = {
  label: string;
  node: React.ReactNode;
};

export function StateTransition({
  frames,
  interval = 2400,
  className,
  tone = "cream",
  size = "default",
}: {
  frames: Frame[];
  interval?: number;
  className?: string;
  tone?: "cream" | "ink";
  size?: "default" | "compact";
}) {
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const dark = tone === "ink";

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const obs = new IntersectionObserver(
      ([entry]) => (visibleRef.current = entry.isIntersecting),
      { threshold: 0.4 }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    const t = window.setInterval(() => {
      if (visibleRef.current) setIdx((i) => (i + 1) % frames.length);
    }, interval);
    return () => {
      obs.disconnect();
      window.clearInterval(t);
    };
  }, [frames.length, interval]);

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-4", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border",
          dark ? "border-stone-800 bg-stone-900" : "border-stone-200/60 bg-cream",
          size === "compact" ? "min-h-[220px]" : "min-h-[300px]"
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            {frames[idx].node}
          </motion.div>
        </AnimatePresence>
      </div>
      <div role="tablist" className="flex items-center gap-2">
        {frames.map((f, i) => (
          <button
            key={f.label}
            type="button"
            role="tab"
            aria-selected={i === idx}
            onClick={() => setIdx(i)}
            className={cn(
              "group relative flex flex-col gap-1.5",
              "text-left text-[12px]"
            )}
          >
            <span
              className={cn(
                "inline-flex h-0.5 w-12 rounded-full transition-colors",
                i === idx
                  ? "bg-krater"
                  : dark
                  ? "bg-stone-800 group-hover:bg-stone-700"
                  : "bg-stone-200 group-hover:bg-stone-300"
              )}
            />
            <span
              className={cn(
                "transition-colors",
                i === idx
                  ? dark
                    ? "text-cream"
                    : "text-ink"
                  : dark
                  ? "text-stone-500"
                  : "text-stone-500"
              )}
            >
              {f.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
