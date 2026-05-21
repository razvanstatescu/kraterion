import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { LetterStagger } from "../components/Entrances";

/**
 * S00 — COLD OPEN (4 s). "Your storage isn't yours."
 *
 * Entrance: per-letter stagger from below (2-frame delays). Massive type
 * (hero size, 220 px) lands one letter at a time over ~1.2 s. Holds for
 * the remaining ~2.5 s. No decoration.
 */
export const S00_Problem: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 64px",
      }}
    >
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: fs.hero,
          fontWeight: weight.regular,
          letterSpacing: tracking.hero,
          color: color.ink,
          lineHeight: 0.92,
          textAlign: "center",
        }}
      >
        <LetterStagger text="Your storage" startFrame={2} stagger={2} fromY={48} />
        <br />
        <LetterStagger text="isn't yours." startFrame={28} stagger={2} fromY={48} />
      </div>
    </AbsoluteFill>
  );
};
