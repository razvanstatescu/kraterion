import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { BOUNCE } from "../motion/springs";

type Props = {
  /** Composition frame at which the bounce-in starts. */
  startFrame?: number;
  /** Where the spring starts visually. Defaults to scale 0.6. */
  fromScale?: number;
  /** Slight overshoot allowance. */
  toScale?: number;
  /** Optional rotation overshoot in degrees (defaults to ±1°). */
  rotateDeg?: number;
  /** Apply opacity fade-in synced to spring. */
  fadeIn?: boolean;
  /** Children to animate. */
  children: React.ReactNode;
  /** Optional inline style on the wrapper. */
  style?: React.CSSProperties;
};

/**
 * Wraps children with a spring-overshoot scale-in + optional small rotation
 * wiggle. This is THE primary entrance gesture in the film.
 */
export const SpringBounce: React.FC<Props> = ({
  startFrame = 0,
  fromScale = 0.6,
  toScale = 1,
  rotateDeg = 0,
  fadeIn = true,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: BOUNCE,
  });

  const scale = interpolate(progress, [0, 1], [fromScale, toScale]);
  const rot = rotateDeg
    ? interpolate(progress, [0, 0.5, 1], [-rotateDeg, rotateDeg * 0.4, 0])
    : 0;
  const opacity = fadeIn
    ? interpolate(progress, [0, 0.4], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <div
      style={{
        ...style,
        transform: `scale(${scale}) rotate(${rot}deg)`,
        opacity,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
};
