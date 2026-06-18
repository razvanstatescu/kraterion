import type { CSSProperties } from "react";

interface SkelProps {
  /** Width of the block — number (px) or any CSS length. */
  width?: number | string;
  /** Height of the block in px. Ignored for `shape="pill"` (fixed 22px). */
  height?: number;
  /** `bar` = text/value placeholder, `pill` = status chip, `circle` = icon. */
  shape?: "bar" | "pill" | "circle";
  style?: CSSProperties;
}

/**
 * A single skeleton block. Pulses opacity rather than running a gradient
 * shimmer (gradients are off-brand). Purely decorative — hidden from the
 * accessibility tree; the wrapping container carries the `aria-busy` /
 * status semantics.
 */
export function Skel({ width, height = 12, shape = "bar", style }: SkelProps) {
  const cls =
    shape === "circle" ? "ks-skel ks-skel-circle" : shape === "pill" ? "ks-skel ks-skel-pill" : "ks-skel";
  return (
    <span
      className={cls}
      aria-hidden="true"
      style={{ width, height: shape === "pill" ? 22 : height, ...style }}
    />
  );
}
