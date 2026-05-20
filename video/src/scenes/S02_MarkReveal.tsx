import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { ApertureMark } from "../components/ApertureMark";
import { HairlineDraw } from "../components/HairlineDraw";

export const S02_MarkReveal: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.ink,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 64,
      }}
    >
      <ApertureMark
        size={320}
        stroke={color.cream}
        delay={6}
        drawDurationFrames={30}
        staggerFrames={8}
      />
      <HairlineDraw
        delay={70}
        durationFrames={28}
        width={420}
        stroke={color.hairlineDark}
      />
    </AbsoluteFill>
  );
};
