"use client";

import { useEffect, useState } from "react";
import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Cycles inline through a list of words. The new word slides down from the
 * top while the previous one slides out to the bottom — odometer-style, à la
 * Linear/Stripe rotating headlines.
 *
 * - Honors `prefers-reduced-motion`: renders the first word as static text.
 * - Width is reserved to the longest word so the line doesn't reflow as
 *   the visible word changes.
 * - Overflow is clipped vertically so the sliding text never leaks above
 *   or below the line.
 */
export function WordCycle({
  words,
  className,
  intervalMs = 2600,
  durationMs = 520,
  startDelayMs = 0,
}: {
  words: string[];
  className?: string;
  intervalMs?: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [started, setStarted] = useState(startDelayMs <= 0);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    if (startDelayMs <= 0) return;
    const t = window.setTimeout(() => setStarted(true), startDelayMs);
    return () => window.clearTimeout(t);
  }, [startDelayMs]);

  useEffect(() => {
    if (reduceMotion || !started || words.length <= 1) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [reduceMotion, started, words.length, intervalMs]);

  // Width reserver — invisible longest word so the inline box never reflows.
  const longest = words.reduce(
    (acc, w) => (w.length > acc.length ? w : acc),
    ""
  );

  if (reduceMotion) {
    return <span className={className}>{words[0]}</span>;
  }

  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden align-baseline",
        className
      )}
    >
      {/* Reserves width AND height matched to font metrics so the
          absolutely-positioned animated layer has a stable box. */}
      <span aria-hidden className="invisible whitespace-pre">
        {longest}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[index]}
          initial={{ y: "-110%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "110%", opacity: 0 }}
          transition={{
            duration: durationMs / 1000,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="absolute inset-0 whitespace-pre"
          aria-live="polite"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
