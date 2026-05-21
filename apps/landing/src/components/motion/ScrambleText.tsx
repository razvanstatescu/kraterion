"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const HEX_POOL = "0123456789abcdef";

/**
 * Renders `text` and re-animates a "cipher decode" effect every time the
 * prop changes. Unsettled characters cycle through a random pool while
 * settled characters appear left-to-right, like a string being decrypted.
 *
 * - First render is static (no animation) — only subsequent prop changes
 *   trigger the scramble.
 * - Whitespace is preserved verbatim so word boundaries stay intact.
 * - Honors `prefers-reduced-motion`: hard-cuts to the new text.
 */
export function ScrambleText({
  text,
  className,
  pool = HEX_POOL,
  durationMs = 620,
  tickMs = 32,
  startDelayMs = 0,
}: {
  text: string;
  className?: string;
  pool?: string;
  durationMs?: number;
  tickMs?: number;
  startDelayMs?: number;
}) {
  const [display, setDisplay] = useState(text);
  const prevTextRef = useRef(text);
  const reduceRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    reduceRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    if (text === prevTextRef.current) return;
    prevTextRef.current = text;

    // Clear any in-flight animation
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    if (reduceRef.current) {
      setDisplay(text);
      return;
    }

    const start = () => {
      const targetLen = text.length;
      const totalTicks = Math.max(1, Math.floor(durationMs / tickMs));
      // Distribute settlement progress evenly across totalTicks.
      let tick = 0;

      intervalRef.current = window.setInterval(() => {
        tick += 1;
        const progress = Math.min(1, tick / totalTicks);
        const settled = Math.floor(progress * targetLen);

        let next = "";
        for (let i = 0; i < targetLen; i++) {
          const ch = text[i];
          // Preserve whitespace + punctuation that's already settled.
          if (i < settled || ch === " " || ch === "\n" || ch === "\t") {
            next += ch;
          } else {
            next += pool[Math.floor(Math.random() * pool.length)];
          }
        }
        setDisplay(next);

        if (progress >= 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          setDisplay(text);
        }
      }, tickMs);
    };

    if (startDelayMs > 0) {
      timeoutRef.current = window.setTimeout(start, startDelayMs);
    } else {
      start();
    }

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [text, pool, durationMs, tickMs, startDelayMs]);

  return <span className={cn(className)}>{display}</span>;
}
