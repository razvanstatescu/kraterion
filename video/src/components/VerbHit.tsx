import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { BOUNCE } from "../motion/springs";

type Props = {
  text: string;
  /** Composition frame at which the verb lands. */
  startFrame: number;
  /** Optional override font size. */
  fontSize?: number;
  /** Foreground color of the text. */
  fg?: string;
  /** Optional second word in accent color (e.g. "S3" in "Drop-in S3."). */
  accent?: { word: string; color?: string };
  /** Optional rotation in degrees for hand-set personality. */
  rotateDeg?: number;
  /** Center horizontally on screen. */
  center?: boolean;
};

/**
 * Single-word/phrase verb hit. Lands hard on the beat with a spring overshoot
 * (1.25 → 0.96 → 1.0), holds, then snap-cuts away with the next sequence.
 */
export const VerbHit: React.FC<Props> = ({
  text,
  startFrame,
  fontSize = 220,
  fg = color.cream,
  accent,
  rotateDeg = 0,
  center = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const local = frame - startFrame;

  const progress = spring({
    frame: local,
    fps,
    config: BOUNCE,
  });

  const scale = interpolate(progress, [0, 1], [1.25, 1]);
  const opacity = interpolate(local, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle wiggle on the rotation so it doesn't sit lifelessly.
  const wiggle = interpolate(local, [0, 14, 28], [0, rotateDeg * 0.3, rotateDeg]);

  const wrapStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: center ? "center" : "flex-start",
    padding: center ? undefined : "0 120px",
  };

  const fontVariationSettings = "'wonk' 1, 'opsz' 96";

  if (accent) {
    return (
      <div style={wrapStyle}>
        <div
          style={{
            opacity,
            transform: `scale(${scale}) rotate(${wiggle}deg)`,
            willChange: "transform, opacity",
            display: "flex",
            alignItems: "baseline",
            gap: 24,
            fontFamily: fonts.display,
            fontSize,
            fontWeight: weight.bold,
            letterSpacing: tracking.display,
            color: fg,
            lineHeight: 0.95,
            fontVariationSettings,
          }}
        >
          <span>{text}</span>
          <span style={{ color: accent.color ?? color.krater }}>
            {accent.word}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div
        style={{
          opacity,
          transform: `scale(${scale}) rotate(${wiggle}deg)`,
          willChange: "transform, opacity",
          fontFamily: fonts.display,
          fontSize,
          fontWeight: weight.bold,
          letterSpacing: tracking.display,
          color: fg,
          lineHeight: 0.95,
          textAlign: "center",
          fontVariationSettings,
        }}
      >
        {text}
      </div>
    </div>
  );
};
