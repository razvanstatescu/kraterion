"use client";

import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";

export type Stat = { value: string; label: string; sub?: string };

export function StatStrip({
  stats,
  tone = "cream",
  className,
}: {
  stats: Stat[];
  tone?: "cream" | "ink";
  className?: string;
}) {
  const dark = tone === "ink";
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border md:grid-cols-4",
        dark
          ? "border-stone-800 bg-stone-800"
          : "border-stone-200/60 bg-stone-200/60",
        className
      )}
    >
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.42, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "flex flex-col gap-2 p-6 md:p-8",
            dark ? "bg-ink" : "bg-cream"
          )}
        >
          <div
            className={cn(
              "text-[40px] leading-[1] tracking-[-0.02em] md:text-[56px]",
              dark ? "text-cream" : "text-ink"
            )}
          >
            {s.value}
          </div>
          <div
            className={cn(
              "text-[13px] leading-[1.4]",
              dark ? "text-stone-300" : "text-stone-700"
            )}
          >
            {s.label}
          </div>
          {s.sub && (
            <div
              className={cn(
                "text-[11px] uppercase tracking-[0.16em] font-medium",
                dark ? "text-stone-500" : "text-stone-500"
              )}
            >
              {s.sub}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
