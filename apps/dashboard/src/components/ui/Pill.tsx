import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "error" | "warning" | "info";

interface Props {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}

export function Pill({ tone = "neutral", dot, children }: Props) {
  const classes = ["pill"];
  if (tone !== "neutral") classes.push(`pill-${tone}`);
  return (
    <span className={classes.join(" ")}>
      {dot ? <span className={`dot dot-${tone === "neutral" ? "idle" : tone}`} /> : null}
      {children}
    </span>
  );
}
