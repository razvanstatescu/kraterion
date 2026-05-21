import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { MaskReveal } from "../components/Entrances";

/**
 * S01 — THE SHIFT (3 s). "Until now."
 *
 * Entrance: clip-path mask reveal with a KRATER ORANGE RAZOR edge —
 * one of the 3 sanctioned krater moments in the whole video. Reads as
 * intent. Stone-colored type (the shift is subtractive, not loud).
 */
export const S01_Promise: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaskReveal startFrame={6} durationInFrames={16} razor>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontSize: fs.display,
            fontWeight: weight.regular,
            letterSpacing: tracking.display,
            color: color.stone[600],
            lineHeight: 1,
          }}
        >
          Until now.
        </h2>
      </MaskReveal>
    </AbsoluteFill>
  );
};
