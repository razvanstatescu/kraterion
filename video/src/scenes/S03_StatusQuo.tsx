import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { WordReveal } from "../components/WordReveal";

const lines = [
  { text: "You pay for storage.",        delay: 12 },
  { text: "You don't own it.",           delay: 102 },
  { text: "Cancel the subscription. It's gone.", delay: 192 },
];

export const S03_StatusQuo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "0 200px",
        gap: 32,
        color: color.ink,
        fontFamily: fonts.sans,
      }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontSize: fs.h1,
            fontWeight: weight.medium,
            letterSpacing: tracking.title,
            lineHeight: 1.2,
          }}
        >
          <WordReveal text={l.text} delay={l.delay} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
