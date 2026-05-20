import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking } from "../tokens/type";
import { LetterReveal } from "../components/LetterReveal";

export const S01_ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();

  // 12-frame fade-in from black to ink (gentler than hard cut)
  const wash = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Period-flash on last letter: frame ~ 24 (after letters fully revealed)
  // "yours." = 6 chars, 40ms each ≈ 1.2 frames/char → fully visible by ~12
  const flashFrame = 28;

  return (
    <AbsoluteFill
      style={{
        background: color.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: wash,
          color: color.cream,
          fontFamily: fonts.sans,
          fontSize: fs.display,
          fontWeight: 500,
          letterSpacing: tracking.title,
        }}
      >
        <LetterReveal
          text="yours."
          delay={18}
          msPerChar={40}
          fadeFrames={6}
          highlightLastCharFrame={flashFrame}
          highlightColor={color.krater}
        />
      </div>
    </AbsoluteFill>
  );
};
