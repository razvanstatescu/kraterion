"use client";

import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";

export function FadeUp({
  children,
  delay = 0,
  distance = 16,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  as?: "div" | "section" | "p" | "h2" | "h3" | "span" | "li";
}) {
  // motion exposes each tag (e.g. motion.div). We index it dynamically.
  type MotionTag = keyof typeof motion;
  const Tag = motion[as as MotionTag] as typeof motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1], delay }}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
