"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type LenisRef = { lenis?: { raf: (time: number) => void } | null };

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<LenisRef | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const update = (time: number) => ref.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis
      root
      ref={ref as never}
      options={{ lerp: 0.1, duration: 1.2, syncTouch: false, autoRaf: false }}
    >
      {children}
    </ReactLenis>
  );
}

export { useLenis };
