import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { LINEAR_EASE } from "../motion/easings";
import { color } from "../tokens/color";

type Props = {
  /** Overall size of the SVG square in px. */
  size?: number;
  /** Stroke colour used for the two outer rings. */
  stroke?: string;
  /** Frame at which drawing begins (relative to the parent scene). */
  delay?: number;
  /** How many frames each ring takes to draw. Use 1 for "no draw, instant". */
  drawDurationFrames?: number;
  /** Stagger between successive ring draws. */
  staggerFrames?: number;
  /** If true, the inner disc fills with `fillColor`. */
  fillInner?: boolean;
  /** Frame at which the fill begins. */
  fillStartFrame?: number;
  /** Fill colour for the inner disc. */
  fillColor?: string;
  /** Stroke width as a fraction of size (0.018 ≈ 6/256 of the real mark). */
  strokeRatio?: number;
};

/**
 * Brand-true Kraterion aperture mark. Three concentric circles, proportions
 * locked to the actual brand SVG (outer / middle / inner = 110 / 68 / 22).
 */
export const ApertureMark: React.FC<Props> = ({
  size = 320,
  stroke = color.cream,
  delay = 0,
  drawDurationFrames = 30,
  staggerFrames = 8,
  fillInner = false,
  fillStartFrame = 0,
  fillColor = color.krater,
  strokeRatio = 0.024,
}) => {
  const frame = useCurrentFrame();
  const center = size / 2;
  const max = (size / 2) * 0.86; // leave a small margin
  // Locked to brand: 110 / 68 / 22 → 1.0 / 0.618 / 0.20
  const ringOuter = max;
  const ringMiddle = max * 0.618;
  const discInner = max * 0.20;
  const strokeW = Math.max(2, size * strokeRatio);

  const fillOpacity = fillInner
    ? interpolate(frame - fillStartFrame, [0, 12], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: LINEAR_EASE,
      })
    : 0;

  const ringDraws = [ringOuter, ringMiddle] as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      {ringDraws.map((r, i) => {
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
      {/* Inner solid disc — appears at the same time as ring 2, or fills with krater */}
      <circle
        cx={center}
        cy={center}
        r={discInner}
        fill={fillInner ? fillColor : stroke}
        opacity={fillInner ? fillOpacity : interpolate(
          frame - (delay + staggerFrames + drawDurationFrames * 0.5),
          [0, 12],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )}
      />
    </svg>
  );
};
