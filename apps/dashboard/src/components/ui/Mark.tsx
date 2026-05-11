/**
 * Kraterion aperture mark — top-down view of a krater, three concentric rings.
 * Theme variants match the four sanctioned asset versions: light (default
 * for Cream surfaces), dark (for Ink surfaces), krater (for accent fill),
 * mono (currentColor — for ink-on-glass usages).
 */

type Variant = "light" | "dark" | "krater" | "mono";
type Animate = "none" | "pulse" | "spin" | "iris";

interface Props {
  size?: number;
  variant?: Variant;
  animate?: Animate;
  className?: string;
}

const VARIANTS: Record<Variant, { outer: string; middle: string; dot: string }> = {
  light:  { outer: "#A89C82", middle: "#0F0E0C", dot: "#C45B36" },
  dark:   { outer: "#7C7158", middle: "#F8F4EC", dot: "#C45B36" },
  krater: { outer: "#F8F4EC", middle: "#F8F4EC", dot: "#F8F4EC" },
  mono:   { outer: "currentColor", middle: "currentColor", dot: "currentColor" },
};

export function Mark({ size = 24, variant = "light", animate = "none", className }: Props) {
  const c = VARIANTS[variant];
  const stroke = Math.max(1.5, size * 0.025);
  const classes = ["k-mark"];
  if (animate !== "none") classes.push(`k-${animate}`);
  if (className) classes.push(className);
  return (
    <svg
      className={classes.join(" ")}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle data-ring="outer"  cx="128" cy="128" r="110" fill="none" stroke={c.outer}  strokeWidth={stroke * 2.4} />
      <circle data-ring="middle" cx="128" cy="128" r="68"  fill="none" stroke={c.middle} strokeWidth={stroke * 2.4} />
      <circle data-ring="dot"    cx="128" cy="128" r="22"  fill={c.dot} />
    </svg>
  );
}
