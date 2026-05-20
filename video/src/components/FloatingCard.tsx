import React from "react";
import { color, cardShadow } from "../tokens/color";
import { radius } from "../tokens/spacing";

type Props = {
  children: React.ReactNode;
  /** Cream (light) or ink (dark) interior. */
  surface?: "cream" | "ink";
  /** Hard offset shadow color (defaults to krater orange). */
  shadowColor?: string;
  /** Shadow offset in px. */
  shadowOffset?: number;
  /** Border thickness in px. */
  borderWidth?: number;
  /** Optional inline overrides. */
  style?: React.CSSProperties;
  /** Optional slight 3D perspective tilt in degrees. Defaults to 0 for crisp brutalism. */
  tiltDeg?: number;
  width?: number | string;
  height?: number | string;
  padding?: number | string;
  /** Border-radius override. */
  rounded?: number;
};

/**
 * Brutalist floating card. Solid surface, hard 2-px ink border, hard offset
 * orange shadow. Optional small Y-tilt for a "stickered onto the page" feel.
 */
export const FloatingCard: React.FC<Props> = ({
  children,
  surface = "cream",
  shadowColor = color.krater,
  shadowOffset = 12,
  borderWidth = 2,
  style,
  tiltDeg = 0,
  width,
  height,
  padding,
  rounded = radius.card,
}) => {
  const bg = surface === "cream" ? color.cream : color.ink;
  const fg = surface === "cream" ? color.ink : color.cream;
  const border = surface === "cream" ? color.ink : color.cream;

  return (
    <div
      style={{
        width,
        height,
        padding,
        background: bg,
        color: fg,
        border: `${borderWidth}px solid ${border}`,
        borderRadius: rounded,
        boxShadow: cardShadow({ offset: shadowOffset, color: shadowColor }),
        transform: tiltDeg ? `perspective(1400px) rotateY(${tiltDeg}deg)` : undefined,
        transformOrigin: "center center",
        willChange: tiltDeg ? "transform" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
