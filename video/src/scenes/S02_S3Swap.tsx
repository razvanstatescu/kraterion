import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ApertureMark } from "../components/ApertureMark";
import { ScaleSettle } from "../components/Entrances";
import { EASE_IRIS } from "../motion/easings";

/**
 * S02 — THE SLAM (5 s). "Kraterion." Product named, big.
 *
 * Entrance: scale-down settle (1.08 → 1.0 with damping 14) — the Apple
 * pattern. Massive hero type (220 px) lands. Aperture mark draws to the
 * LEFT of the wordmark as a separate beat ~10 frames later.
 *
 * This is candidate wow #1. The other is the orbit at S07.
 */
export const S02_S3Swap: React.FC = () => {
  const frame = useCurrentFrame();

  // Mark draws in slightly after the type lands
  const MARK_DELAY = 18;
  // Slight horizontal slide of the wordmark to make room for the mark
  const slideProg = interpolate(frame, [MARK_DELAY, MARK_DELAY + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IRIS,
  });
  const wordmarkX = interpolate(slideProg, [0, 1], [0, 50]);
  const markOpacity = interpolate(slideProg, [0, 1], [0, 1]);
  const markX = interpolate(slideProg, [0, 1], [-30, 0]);

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: space[8],
      }}
    >
      {/* Aperture mark — appears after the slam */}
      <div
        style={{
          opacity: markOpacity,
          transform: `translateX(${markX}px)`,
          willChange: "transform, opacity",
        }}
      >
        <ApertureMark
          size={140}
          variant="light"
          delay={MARK_DELAY}
          drawDurationFrames={18}
          staggerFrames={5}
          fillDurationFrames={10}
        />
      </div>

      {/* The wordmark slam */}
      <div
        style={{
          transform: `translateX(${-wordmarkX}px)`,
          willChange: "transform",
        }}
      >
        <ScaleSettle startFrame={2} fromScale={1.08}>
          <h1
            style={{
              margin: 0,
              fontFamily: fonts.sans,
              fontSize: fs.hero,
              fontWeight: weight.regular,
              letterSpacing: tracking.hero,
              color: color.ink,
              lineHeight: 1,
            }}
          >
            Kraterion.
          </h1>
        </ScaleSettle>
      </div>
    </AbsoluteFill>
  );
};
