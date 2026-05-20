import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BOUNCE, GENTLE } from "../motion/springs";

type Step = {
  label: string;
  appearAt: number;
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
        fontSize: 22,
        color: color.stone[500],
        fontWeight: weight.medium,
      }}
    >
      {steps.map((step, i) => {
        const local = frame - step.appearAt;
        const sProg = spring({
          frame: local,
          fps,
          config: step.emphasis ? BOUNCE : GENTLE,
        });

        const opacity = interpolate(sProg, [0, 0.6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const x = interpolate(sProg, [0, 1], [-12, 0]);
        const scale = step.emphasis
          ? interpolate(sProg, [0, 1], [0.85, 1])
          : 1;

        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateX(${x}px) scale(${scale})`,
              transformOrigin: "left center",
              color: step.emphasis ? color.krater : color.stone[500],
              fontWeight: step.emphasis ? weight.bold : weight.medium,
              willChange: "transform, opacity",
            }}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
};
