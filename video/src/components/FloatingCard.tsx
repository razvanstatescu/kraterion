import React from "react";
import { color } from "../tokens/color";
import { radius } from "../tokens/spacing";

/**
 * Card primitive — brand-true.
 *
 * Per design-system/README.md §Cards:
 *   "Cream/Stone-50 background, stone-200 hairline, **no shadow**,
 *    radius-md, padding 16–24px. That's it."
 *
 * The previous brutalist offset-shadow implementation is gone.
 * `shadowColor` / `shadowOffset` props are kept as a no-op for
 * compatibility while scenes migrate.
 */
type Props = {
  children: React.ReactNode;
  /** Cream (default, on cream surface) or ink (e.g. terminal). */
  surface?: "cream" | "stone-50" | "ink";
  /** Border radius. Brand: 4 (sm), 8 (md, default), or 12 (lg). */
  rounded?: number;
  width?: number | string;
  height?: number | string;
  padding?: number | string;
  style?: React.CSSProperties;

  /** @deprecated — shadows are banned. Ignored. */
  shadowColor?: string;
  /** @deprecated — shadows are banned. Ignored. */
  shadowOffset?: number;
  /** @deprecated — kept for migration; renders as standard 1 px hairline. */
  borderWidth?: number;
  /** @deprecated — tilt is brand-incompatible. Ignored. */
  tiltDeg?: number;
};

const SURFACES: Record<NonNullable<Props["surface"]>, { bg: string; fg: string; border: string }> = {
  cream:      { bg: color.cream,      fg: color.ink,   border: color.border },
  "stone-50": { bg: color.stone[50],  fg: color.ink,   border: color.border },
  ink:        { bg: color.ink,        fg: color.cream, border: color.stone[800] },
};

export const FloatingCard: React.FC<Props> = ({
  children,
  surface = "cream",
  rounded = radius.card,
  width,
  height,
  padding,
  style,
}) => {
  const s = SURFACES[surface];
  return (
    <div
      style={{
        width,
        height,
        padding,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        borderRadius: rounded,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
