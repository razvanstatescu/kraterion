import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { GENTLE } from "../motion/springs";

type Step = {
  label: string;
  /** Frame at which the step appears (relative to scene start). */
  appearAt: number;
  /** Style of the final step (pattern 4 scale-blur breath). */
  emphasis?: boolean;
};

type Props = {
  steps: Step[];
};

export const IndexingProgress: React.FC<Props> = ({ steps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space[2],
        marginTop: space[4],
        fontFamily: fonts.mono,
        fontSize: fs.codeSmall,
        color: color.stone[500],
      }}
    >
      {steps.map((step, i) => {
        const localFrame = frame - step.appearAt;
        const opacity = interpolate(localFrame, [0, 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const settle = spring({
          frame: Math.max(0, localFrame),
          fps,
          config: GENTLE,
          from: 2,
          to: 0,
        });

        // Pattern 4 for emphasis: scale-blur breath
        const emphasisScale = step.emphasis
          ? interpolate(localFrame, [0, 18], [0.96, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 1;
        const emphasisBlur = step.emphasis
          ? interpolate(localFrame, [0, 18], [8, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 0;

        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateY(${settle}px) scale(${emphasisScale})`,
              filter: step.emphasis ? `blur(${emphasisBlur}px)` : undefined,
              color: step.emphasis ? color.ink : color.stone[500],
              fontWeight: step.emphasis ? weight.medium : weight.regular,
              transformOrigin: "left center",
              willChange: "transform, opacity, filter",
            }}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
};
