import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { fonts, weight } from "../tokens/type";
import { color } from "../tokens/color";

type Props = {
  /** Frame at which the counter begins ticking. */
  startFrame: number;
  /** Frames over which the counter reaches `to`. */
  durationInFrames?: number;
  from?: number;
  to: number;
  /** Suffix string (e.g. " chunks", " ms", "TB"). */
  suffix?: string;
  /** Prefix string (e.g. "+"). */
  prefix?: string;
  /** Number of decimal places. */
  decimals?: number;
  /** Font size in px. */
  fontSize?: number;
  /** Foreground color. */
  fg?: string;
  /** Family — defaults to display (Bricolage). */
  family?: string;
  /** Inline style override. */
  style?: React.CSSProperties;
};

/**
 * Animated number counter with a slight overshoot landing.
 * tabular-nums prevents digit-width wobble.
 */
export const Counter: React.FC<Props> = ({
  startFrame,
  durationInFrames = 36,
  from = 0,
  to,
  suffix = "",
  prefix = "",
  decimals = 0,
  fontSize = 84,
  fg = color.cream,
  family,
  style,
}) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Overshoot by 6% then settle
  const raw = interpolate(local, [0, durationInFrames * 0.7, durationInFrames], [
    from,
    to * 1.06 + from * -0.06,
    to,
  ], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0.9, 0.3, 1.0),
  });

  const display = raw.toFixed(decimals);

  return (
    <span
      style={{
        fontFamily: family ?? fonts.display,
        fontSize,
        fontWeight: weight.bold,
        color: fg,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.03em",
        lineHeight: 1,
        ...style,
      }}
    >
      {prefix}
      {display}
      {suffix}
    </span>
  );
};
