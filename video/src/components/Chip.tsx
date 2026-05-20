import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { BOUNCE } from "../motion/springs";

type Props = {
  /** Frame at which the chip appears. */
  startFrame?: number;
  /** Cream chip on ink (default) or ink chip on cream. */
  surface?: "cream" | "ink";
  /** Optional accent color override for the dot. */
  dotColor?: string;
  /** Children content — usually short, monospace, all-caps. */
  children: React.ReactNode;
  /** Mono font flag — defaults to display (Bricolage). */
  mono?: boolean;
  /** Hard offset shadow color. */
  shadowColor?: string;
  /** Slight tilt in degrees. */
  tiltDeg?: number;
};

/**
 * Brutalist pill / chip. Small, opinionated, used as labels, badges,
 * and verb-hit accents in the climax montage.
 */
export const Chip: React.FC<Props> = ({
  startFrame = 0,
  surface = "cream",
  dotColor,
  children,
  mono = false,
  shadowColor = color.ink,
  tiltDeg = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sProg = spring({ frame: frame - startFrame, fps, config: BOUNCE });
  const scale = interpolate(sProg, [0, 1], [0.6, 1]);
  const opacity = interpolate(sProg, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bg = surface === "cream" ? color.cream : color.ink;
  const fg = surface === "cream" ? color.ink : color.cream;
  const border = surface === "cream" ? color.ink : color.cream;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        background: bg,
        color: fg,
        border: `2px solid ${border}`,
        borderRadius: 999,
        boxShadow: `4px 4px 0 ${shadowColor}`,
        fontFamily: mono ? fonts.mono : fonts.display,
        fontSize: 22,
        fontWeight: weight.bold,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        opacity,
        transform: `scale(${scale}) rotate(${tiltDeg}deg)`,
        willChange: "transform, opacity",
      }}
    >
      {dotColor !== undefined && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: dotColor,
            border: `1.5px solid ${border}`,
          }}
        />
      )}
      {children}
    </div>
  );
};
