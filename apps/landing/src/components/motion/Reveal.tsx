"use client";

import * as motion from "motion/react-client";

export function Reveal({
  text,
  mode = "words",
  delay = 0,
  className,
}: {
  text: string;
  mode?: "words" | "lines";
  delay?: number;
  className?: string;
}) {
  const parts = mode === "words" ? text.split(/(\s+)/) : text.split(/\n/);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{
              duration: 0.42,
              ease: [0.16, 1, 0.3, 1],
              delay: delay + i * 0.024,
            }}
            className="inline-block will-change-transform"
          >
            {part}
          </motion.span>
        );
      })}
    </span>
  );
}
