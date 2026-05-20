import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BOUNCE, SNAP } from "../motion/springs";

type Props = {
  /** Frame at which the toggle flips from Off → On (relative to scene). */
  toggleFrame: number;
};

export const KnowledgeToggle: React.FC<Props> = ({ toggleFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pillSnap = spring({
    frame: frame - toggleFrame,
    fps,
    config: SNAP,
  });

  const on = pillSnap > 0.5;
  // Knob moves 28 px right when on
  const knobX = interpolate(pillSnap, [0, 1], [0, 28]);
  // Bounce overshoot on the pill itself
  const pillScale = spring({
    frame: frame - toggleFrame,
    fps,
    config: BOUNCE,
    from: 1,
    to: 1.05,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${space[4]}px ${space[6]}px`,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.card,
        background: color.cream,
        fontFamily: fonts.sans,
        width: 620,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: weight.bold,
            color: color.ink,
            letterSpacing: "-0.02em",
            fontFamily: fonts.display,
          }}
        >
          Knowledge
        </span>
        <span style={{ fontSize: 16, color: color.stone[500], fontWeight: weight.medium }}>
          Index this bucket for chat & MCP.
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: space[4] }}>
        <div
          style={{
            transform: `scale(${pillScale})`,
            fontSize: 16,
            fontWeight: weight.bold,
            color: on ? color.cream : color.stone[500],
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: `6px 14px`,
            border: `2px solid ${color.ink}`,
            borderRadius: 999,
            background: on ? color.krater : color.cream,
            willChange: "transform",
          }}
        >
          {on ? "On" : "Off"}
        </div>

        <div
          style={{
            position: "relative",
            width: 64,
            height: 36,
            borderRadius: 999,
            background: on ? color.krater : color.stone[100],
            border: `2px solid ${color.ink}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              width: 26,
              height: 26,
              borderRadius: 999,
              background: color.cream,
              border: `2px solid ${color.ink}`,
              transform: `translateX(${knobX}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
