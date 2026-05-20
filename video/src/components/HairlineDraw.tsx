import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { LINEAR_EASE } from "../motion/easings";
import { color } from "../tokens/color";

type Props = {
  delay?: number;
  durationFrames?: number;
  width?: number | string;
  thickness?: number;
  stroke?: string;
  direction?: "ltr" | "rtl";
  style?: React.CSSProperties;
};

export const HairlineDraw: React.FC<Props> = ({
  delay = 0,
  durationFrames = 24,
  width = "100%",
  thickness = 1,
  stroke = color.hairlineLight,
  direction = "ltr",
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame - delay,
    [0, durationFrames],
    [100, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: LINEAR_EASE,
    },
  );

  const clip =
    direction === "ltr"
      ? `inset(0 ${progress}% 0 0)`
      : `inset(0 0 0 ${progress}%)`;

  return (
    <div
      style={{
        width,
        height: thickness,
        background: stroke,
        clipPath: clip,
        WebkitClipPath: clip,
        ...style,
      }}
    />
  );
};
