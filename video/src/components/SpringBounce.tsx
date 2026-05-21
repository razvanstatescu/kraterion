import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { EASE_BRAND } from "../motion/easings";

/**
 * Soft entrance — fade + tiny Y translate, brand easing.
 *
 * Previously named SpringBounce because it overshot with a bouncy spring.
 * That's banned by the brand ("No bouncy springs"). Same export name kept
 * for code compatibility; underlying motion is now critically damped
 * (mirrors the landing's FadeUp component).
 */
type Props = {
  startFrame?: number;
  /** Total entrance duration in frames. */
  durationInFrames?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;

  // Legacy props kept for compat; no longer bouncy or rotating.
  /** @deprecated — used to scale from. Now ignored (we fade + Y only). */
  fromScale?: number;
  /** @deprecated */
  toScale?: number;
  /** @deprecated — rotation entrance banned. Ignored. */
  rotateDeg?: number;
  /** @deprecated — opacity is always animated. */
  fadeIn?: boolean;
};

export const SpringBounce: React.FC<Props> = ({
  startFrame = 0,
  durationInFrames = 22,
  children,
  style,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame - startFrame,
    [0, Math.round(durationInFrames * 0.7)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_BRAND,
    },
  );

  const y = interpolate(
    frame - startFrame,
    [0, durationInFrames],
    [12, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_BRAND,
    },
  );

  return (
    <div
      style={{
        ...style,
        opacity,
        transform: `translateY(${y}px)`,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
};
