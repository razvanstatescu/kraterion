import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ApertureMark } from "../components/ApertureMark";

export const S12_Outro: React.FC = () => {
  const frame = useCurrentFrame();

  // Scene length: 240 frames. Tagline appears ~ frame 90.
  const taglineOpacity = interpolate(frame, [60, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Frame 180 (00:02:56 absolute) → in-scene frame 180 - 0 = 180
  // Scene starts at 5100; "Built for…" should appear at 5280 → in-scene 180.
  const builtForOpacity = interpolate(frame, [170, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The 5th orange moment — aperture inner ring fills.
  // Should land near the very end of the scene.
  const fillStart = 210;

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[12],
      }}
    >
      <ApertureMark
        size={320}
        stroke={color.ink}
        delay={6}
        drawDurationFrames={30}
        staggerFrames={8}
        fillInner
        fillStartFrame={fillStart}
      />

      <div
        style={{
          opacity: taglineOpacity,
          fontFamily: fonts.sans,
          fontSize: fs.h2,
          fontWeight: weight.medium,
          color: color.ink,
          letterSpacing: tracking.title,
          textAlign: "center",
        }}
      >
        Object storage you actually own.
      </div>

      <div
        style={{
          opacity: builtForOpacity,
          fontFamily: fonts.sans,
          fontSize: fs.caption,
          color: color.stone[500],
          fontWeight: weight.regular,
          letterSpacing: "0.04em",
        }}
      >
        Built for Sui&nbsp;Overflow&nbsp;2026.
      </div>
    </AbsoluteFill>
  );
};
