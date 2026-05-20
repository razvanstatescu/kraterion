import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";

export const S13_FadeOut: React.FC = () => {
  const frame = useCurrentFrame();
  // 12-frame ease from cream to ink, then hold.
  const t = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: color.cream }}>
      <AbsoluteFill style={{ background: color.ink, opacity: t }} />
    </AbsoluteFill>
  );
};
