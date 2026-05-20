import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { LINEAR_EASE } from "../motion/easings";

export const S09_HeroTitle: React.FC = () => {
  const frame = useCurrentFrame();

  // Pattern 4: scale-blur breath
  const scale = interpolate(frame, [0, 36], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const blur = interpolate(frame, [0, 36], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const opacity = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // RAG + MCP fades in 8 frames after main
  const subOpacity = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.ink,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[6],
        color: color.cream,
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          filter: `blur(${blur}px)`,
          fontSize: fs.display,
          fontWeight: weight.medium,
          letterSpacing: tracking.title,
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          willChange: "transform, opacity, filter",
        }}
      >
        Build an agent in 60 seconds.
      </div>
      <div
        style={{
          opacity: subOpacity,
          fontSize: fs.h1,
          color: color.stone[300],
          letterSpacing: "0.04em",
          fontWeight: weight.regular,
        }}
      >
        RAG + MCP
      </div>
    </AbsoluteFill>
  );
};
