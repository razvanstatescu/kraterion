import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { BEAT } from "../motion/timing";

type Props = {
  /** Whether to flash the grid on each downbeat. */
  flashOnBeat?: boolean;
  /** Base opacity of the grid dots. */
  opacity?: number;
  /**
   * Scene-local frame at which the beat grid starts. Defaults to 0 — all
   * top-level scenes are placed on bar downbeats by `motion/timing.ts`, so
   * scene-local frame 0 IS a downbeat in every scene that uses this.
   */
  beatOrigin?: number;
};

export const BackgroundGrid: React.FC<Props> = ({
  flashOnBeat = false,
  opacity = 0.08,
  beatOrigin = 0,
}) => {
  const frame = useCurrentFrame();

  let dotOpacity = opacity;
  if (flashOnBeat && frame >= beatOrigin) {
    const sinceOrigin = frame - beatOrigin;
    const localBeat = sinceOrigin % BEAT;
    const peak = BEAT * 0.15;
    dotOpacity =
      localBeat < peak
        ? interpolate(localBeat, [0, peak], [0.22, opacity])
        : opacity;
  }

  const dotSize = 2;
  const gap = 48;
  const bg = `radial-gradient(${color.krater} ${dotSize}px, transparent ${dotSize}px)`;

  return (
    <AbsoluteFill style={{ background: color.ink, zIndex: 0 }}>
      <AbsoluteFill
        style={{
          backgroundImage: bg,
          backgroundSize: `${gap}px ${gap}px`,
          backgroundPosition: "0 0",
          opacity: dotOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
