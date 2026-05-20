import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { WordReveal } from "../components/WordReveal";
import { HairlineDraw } from "../components/HairlineDraw";

type Row = {
  name: string;
  gloss: string;
  delay: number;
};

const rows: Row[] = [
  {
    name: "Sui",
    gloss: "The ledger. Your files are objects you own.",
    delay: 18,
  },
  {
    name: "Walrus",
    gloss: "The substrate. Files live across a decentralized network, sharded and resilient.",
    delay: 258,
  },
  {
    name: "Seal",
    gloss: "The lock. Files are encrypted before they leave your browser.",
    delay: 498,
  },
];

export const S06_SuiWalrusSeal: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "0 240px",
        gap: space[16],
        color: color.ink,
        fontFamily: fonts.sans,
      }}
    >
      {rows.map((row) => (
        <div
          key={row.name}
          style={{ display: "flex", flexDirection: "column", gap: space[3], width: "100%" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: space[4],
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: color.krater,
                transform: "translateY(-6px)",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: fs.h1,
                fontWeight: weight.semibold,
                letterSpacing: tracking.title,
                color: color.ink,
              }}
            >
              <WordReveal text={row.name} delay={row.delay} />
            </div>
          </div>
          <div
            style={{
              paddingLeft: space[4] + 8,
              fontSize: fs.body,
              color: color.stone[500],
              letterSpacing: tracking.body,
              lineHeight: 1.45,
              maxWidth: 1100,
            }}
          >
            <WordReveal text={row.gloss} delay={row.delay + 14} />
          </div>
          <div style={{ paddingLeft: space[4] + 8, marginTop: space[2] }}>
            <HairlineDraw
              delay={row.delay + 40}
              durationFrames={28}
              width={"60%"}
              stroke={color.hairlineLight}
            />
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
