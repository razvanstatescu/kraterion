import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { EASE_BRAND, EASE_IRIS } from "../motion/easings";
import { color } from "../tokens/color";

type Variant = "light" | "dark" | "mono" | "on-krater";

type Props = {
  /** Overall size of the SVG square in px. */
  size?: number;
  /**
   * Brand-sanctioned color variant (design-system/README.md §Iconography).
   *
   *   "light"      — default for cream surfaces.
   *                  outer #7C7158, middle #403930, dot #1A1610.
   *                  Three EARTH-TONE rings. **No krater accent.**
   *   "dark"       — for ink surfaces.
   *                  outer #7C7158, middle #F8F4EC (cream), dot #C45B36 (krater).
   *   "on-krater"  — for krater-fill heroes. All rings #F8F4EC.
   *   "mono"       — currentColor throughout.
   */
  variant?: Variant;
  /** Override stroke for `mono` variant or custom use. */
  monoColor?: string;
  /** Frame at which drawing begins (relative to parent scene). */
  delay?: number;
  /** Frames each ring takes to draw. Brand default ≈ 22. */
  drawDurationFrames?: number;
  /** Stagger between successive ring draws (concentric ripple). */
  staggerFrames?: number;
  /** Frame at which the inner disc starts the iris-open. */
  fillStartFrame?: number;
  /** Iris-open duration. Brand spec: 400ms ≈ 12 frames at 30fps. */
  fillDurationFrames?: number;
  /** Stroke width as a fraction of size (≈ 6/256 of the brand mark). */
  strokeRatio?: number;
};

const PALETTE: Record<Variant, { outer: string; middle: string; dot: string }> = {
  light:       { outer: color.stone[500], middle: color.stone[700], dot: color.stone[900] },
  dark:        { outer: color.stone[500], middle: color.cream,      dot: color.krater     },
  "on-krater": { outer: color.cream,      middle: color.cream,      dot: color.cream      },
  mono:        { outer: "currentColor",   middle: "currentColor",   dot: "currentColor"   },
};

/**
 * Kraterion aperture mark.
 *
 * Brand proportions are locked at outer/middle/inner = 110/68/22.
 * Default variant is `light` (the canonical cream-surface mark — three
 * EARTH-TONE rings, no krater accent in the mark itself).
 *
 * Motion: concentric ripple draw (outer → middle, 80 ms stagger per brand),
 * then iris-open on the inner dot (scale 0 → 1 over 400 ms).
 */
export const ApertureMark: React.FC<Props> = ({
  size = 256,
  variant = "light",
  monoColor = color.ink,
  delay = 0,
  drawDurationFrames = 22,
  staggerFrames = 6,
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

  const palette = PALETTE[variant];
  const outerStroke  = variant === "mono" ? monoColor : palette.outer;
  const middleStroke = variant === "mono" ? monoColor : palette.middle;
  const dotFill      = variant === "mono" ? monoColor : palette.dot;

  const innerFillFrame =
    fillStartFrame ?? delay + staggerFrames * 2 + drawDurationFrames * 0.5;

  // Iris-open: brand-named motion. EASE_IRIS curve, 400ms duration default.
  const fillScale = interpolate(
    frame - innerFillFrame,
    [0, fillDurationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_IRIS,
    },
  );

  const rings = [
    { r: ringOuter,  stroke: outerStroke  },
    { r: ringMiddle, stroke: middleStroke },
  ] as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      {rings.map((ring, i) => {
        const circ = 2 * Math.PI * ring.r;
        const localFrame = frame - (delay + i * staggerFrames);
        const drawProgress = interpolate(
          localFrame,
          [0, drawDurationFrames],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          },
        );
        const offset = circ * (1 - drawProgress);
        return (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={ring.r}
            fill="none"
            stroke={ring.stroke}
            strokeWidth={strokeW}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
      })}
      {/* Inner disc — iris-opens via radius interpolation. */}
      <circle
        cx={center}
        cy={center}
        r={discInner * fillScale}
        fill={dotFill}
      />
    </svg>
  );
};
