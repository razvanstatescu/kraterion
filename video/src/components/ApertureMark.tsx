import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { LINEAR_EASE } from "../motion/easings";
import { color } from "../tokens/color";

type Props = {
  /** Overall size of the SVG square in px. */
  size?: number;
  /**
   * Single color used for all three elements. Matches the canonical
   * `kraterion-mono.svg` (`currentColor` for every ring & disc).
   * On dark canvas: cream. On light canvas: ink. No krater orange — the
   * brand mark on either neutral surface is single-color only.
   */
  stroke?: string;
  /** Frame at which drawing begins (relative to the parent scene). */
  delay?: number;
  /** How many frames each ring takes to draw. */
  drawDurationFrames?: number;
  /** Stagger between ring draws. */
  staggerFrames?: number;
  /** Frame at which the inner disc fills in. */
  fillStartFrame?: number;
  /** Frames over which the inner disc grows from 0 → full radius. */
  fillDurationFrames?: number;
  /** Stroke width as a fraction of size (0.024 ≈ 6/256 of the real mark). */
  strokeRatio?: number;
};

/**
 * Brand-true Kraterion aperture mark in MONO mode. Three concentric elements
 * (outer ring, middle ring, inner disc) all rendered in a single color.
 * Proportions locked to the brand SVG: 110 / 68 / 22 (1.0 / 0.618 / 0.20).
 */
export const ApertureMark: React.FC<Props> = ({
  size = 320,
  stroke = color.cream,
  delay = 0,
  drawDurationFrames = 22,
  staggerFrames = 8,
  fillStartFrame,
  fillDurationFrames = 12,
  strokeRatio = 0.024,
}) => {
  const frame = useCurrentFrame();
  const center = size / 2;
  const max = (size / 2) * 0.86;
  const ringOuter = max;
  const ringMiddle = max * 0.618;
  const discInner = max * 0.20;
  const strokeW = Math.max(2, size * strokeRatio);

  const innerFillFrame = fillStartFrame ?? (delay + staggerFrames * 2 + drawDurationFrames * 0.4);
  const fillScale = interpolate(
    frame - innerFillFrame,
    [0, fillDurationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: LINEAR_EASE,
    },
  );

  const rings = [ringOuter, ringMiddle] as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      {rings.map((r, i) => {
        const circ = 2 * Math.PI * r;
        const localFrame = frame - (delay + i * staggerFrames);
        const drawProgress = interpolate(
          localFrame,
          [0, drawDurationFrames],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: LINEAR_EASE,
          },
        );
        const offset = circ * (1 - drawProgress);
        return (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
      })}
      {/* Inner solid disc — radius grows from 0 to discInner. */}
      <circle
        cx={center}
        cy={center}
        r={discInner * fillScale}
        fill={stroke}
      />
    </svg>
  );
};
