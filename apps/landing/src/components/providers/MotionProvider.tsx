"use client";

import { MotionConfig } from "motion/react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}>
      {children}
    </MotionConfig>
  );
}
