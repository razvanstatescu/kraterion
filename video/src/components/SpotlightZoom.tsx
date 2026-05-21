import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

type Props = {
  /** Frame at which the zoom-IN begins. */
  zoomInFrame: number;
  /** Frame at which the zoom-OUT begins (pull-back). */
  zoomOutFrame: number;
  /** Normalized 0..1 focal point in the parent surface. */
  target?: { x: number; y: number };
  /**
   * Peak zoom scale. Research validates:
   *   1.2  — barely-noticeable soft emphasis
   *   1.5  — the most useful camera-move number (default)
   *   2.0  — when surrounding context should disappear; reserve for max one
   * 3.5×+ is too aggressive for anything containing text — kept available
   * but no longer the default.
   */
  zoomScale?: number;
  /** Optional background blur (px) applied to the zoomed layer during hold. */
  backgroundBlur?: number;
  children: React.ReactNode;
};

/**
 * Click-driven camera zoom. Per the SaaS-video research:
 *   - Push-in: ~16 frames with snappy spring (damping 22, stiffness 130)
 *   - Hold zoomed: caller controls via the gap between zoomIn/zoomOut frames
 *   - Pull-back: ~10 frames with faster spring (damping 26, stiffness 220)
 *     — the cinematic release is always quicker than the push-in.
 */
export const SpotlightZoom: React.FC<Props> = ({
  zoomInFrame,
  zoomOutFrame,
  target = { x: 0.5, y: 0.5 },
  zoomScale = 1.5,
  backgroundBlur = 0,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inProg = spring({
    frame: frame - zoomInFrame,
    fps,
    config: { damping: 22, stiffness: 130, mass: 1 },
  });
  const outProg = spring({
    frame: frame - zoomOutFrame,
    fps,
    config: { damping: 26, stiffness: 220, mass: 1 },
  });

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
