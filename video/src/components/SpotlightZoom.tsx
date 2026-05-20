import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { BOUNCE } from "../motion/springs";

type Props = {
  /** Frame at which the zoom IN begins. */
  zoomInFrame: number;
  /** Frame at which the zoom OUT begins (pull-back). */
  zoomOutFrame: number;
  /** Center of zoom in normalized 0..1 coords (defaults to {0.5, 0.5}). */
  target?: { x: number; y: number };
  /** Peak scale (3.5 is the modern sweet spot). */
  zoomScale?: number;
  /** Background dim/blur amount on the un-zoomed layer. */
  backgroundBlur?: number;
  /** Children rendered in normal scale and zoomed in. */
  children: React.ReactNode;
};

/**
 * Spotlight zoom — push into a target point on the canvas, hold zoomed,
 * pull back. The non-zoomed area is implicitly dimmed/blurred since the
 * camera is "looking elsewhere." Modern push-in is 3–4x; the pull-back
 * is faster than the push-in (cinematic release).
 */
export const SpotlightZoom: React.FC<Props> = ({
  zoomInFrame,
  zoomOutFrame,
  target = { x: 0.5, y: 0.5 },
  zoomScale = 3.5,
  backgroundBlur = 0,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inProg = spring({
    frame: frame - zoomInFrame,
    fps,
    config: { damping: 18, stiffness: 100, mass: 1 },
  });
  const outProg = spring({
    frame: frame - zoomOutFrame,
    fps,
    config: { damping: 14, stiffness: 200, mass: 1 },
  });

  // Effective progress: ramp up to 1, then ramp back down to 0
  const progress = Math.max(0, inProg - outProg);

  const scale = interpolate(progress, [0, 1], [1, zoomScale]);
  const blur = interpolate(progress, [0, 1], [0, backgroundBlur]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: `${target.x * 100}% ${target.y * 100}%`,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        willChange: "transform, filter",
      }}
    >
      {children}
    </div>
  );
};
