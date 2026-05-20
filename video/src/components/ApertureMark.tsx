import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { LINEAR_EASE } from "../motion/easings";
import { color } from "../tokens/color";

type Props = {
  size?: number;
  stroke?: string;
  delay?: number;
  drawDurationFrames?: number;
  staggerFrames?: number;
  fillInner?: boolean;
  fillStartFrame?: number;
  fillColor?: string;
};

export const ApertureMark: React.FC<Props> = ({
  size = 320,
  stroke = color.ink,
  delay = 0,
  drawDurationFrames = 30,
  staggerFrames = 8,
  fillInner = false,
  fillStartFrame = 0,
  fillColor = color.krater,
}) => {
  const frame = useCurrentFrame();
  const radii = [140, 100, 60];
  const center = size / 2;

  const fillOpacity = fillInner
    ? interpolate(frame - fillStartFrame, [0, 12], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: LINEAR_EASE,
      })
    : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      {radii.map((r, i) => {
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
        const isInner = i === radii.length - 1;
        return (
          <g key={r}>
            {isInner && fillInner && (
              <circle
                cx={center}
                cy={center}
                r={r}
                fill={fillColor}
                opacity={fillOpacity}
              />
            )}
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          </g>
        );
      })}
    </svg>
  );
};
