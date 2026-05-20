import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { WordReveal } from "../components/WordReveal";
import { HairlineDraw } from "../components/HairlineDraw";

export const S04_Pivot: React.FC = () => {
  const frame = useCurrentFrame();
  // Optional gentle fade-out of the line near the end (last 24 frames)
  const fadeOut = interpolate(frame, [380, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
        color: color.ink,
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          fontSize: fs.display,
          fontWeight: weight.medium,
          letterSpacing: tracking.title,
          lineHeight: 1.1,
          textAlign: "center",
          maxWidth: 1500,
          opacity: fadeOut,
        }}
      >
        <WordReveal text={"Object storage you actually own."} delay={20} />
      </div>
      <HairlineDraw
        delay={350}
        durationFrames={36}
        width={420}
        stroke={color.hairlineLight}
      />
    </AbsoluteFill>
  );
};
