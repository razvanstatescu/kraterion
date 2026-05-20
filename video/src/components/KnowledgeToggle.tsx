import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { LINEAR_EASE } from "../motion/easings";
import { SNAP } from "../motion/springs";

type Props = {
  /** Frame at which the toggle flips from Off → On (relative to scene). */
  toggleFrame: number;
};

export const KnowledgeToggle: React.FC<Props> = ({ toggleFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const swap = interpolate(
    frame - toggleFrame,
    [0, 18],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: LINEAR_EASE,
    },
  );

  const pillSnap = spring({
    frame: frame - toggleFrame,
    fps,
    config: SNAP,
  });

  const fill = swap;
  const offColor = color.stone[300];
  const onColor = color.krater;
  const pillBg = `rgba(196,91,54, ${fill})`;

  // Knob position: 0 → left, 1 → right
  const knobX = interpolate(pillSnap, [0, 1], [0, 22]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${space[4]}px ${space[6]}px`,
        border: `1px solid ${color.hairlineLight}`,
        borderRadius: radius.card,
        background: color.cream,
        fontFamily: fonts.sans,
        width: 520,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: fs.body,
            fontWeight: weight.medium,
            color: color.ink,
            letterSpacing: "-0.01em",
          }}
        >
          Knowledge
        </span>
        <span style={{ fontSize: fs.caption, color: color.stone[500] }}>
          Index this bucket for chat & MCP.
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: space[4] }}>
        <span
          style={{
            fontSize: fs.caption,
            fontWeight: weight.medium,
            color: fill > 0.5 ? onColor : offColor,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontVariantNumeric: "tabular-nums",
            padding: `${space[1]}px ${space[3]}px`,
            border: `1px solid ${fill > 0.5 ? onColor : color.hairlineLight}`,
            borderRadius: 999,
            background:
              fill > 0.5 ? `rgba(196,91,54,0.08)` : "transparent",
          }}
        >
          {fill > 0.5 ? "On" : "Off"}
        </span>

        <div
          style={{
            position: "relative",
            width: 52,
            height: 30,
            borderRadius: 999,
            background: fill > 0 ? pillBg : color.stone[100],
            border: `1px solid ${fill > 0.5 ? onColor : color.hairlineLight}`,
            transition: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: color.cream,
              transform: `translateX(${knobX}px)`,
              boxShadow: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
};
