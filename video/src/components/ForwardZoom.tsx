import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

type Props = {
  /** Total frames the zoom spans (usually the parent scene's duration). */
  durationInFrames: number;
  /** Start scale. */
  from?: number;
  /** End scale. */
  to?: number;
  children: React.ReactNode;
};

/**
 * Subtle constant forward zoom — applied to every scene to give the camera
 * a feeling of always pushing forward. Linear (no easing) for steady creep.
 */
export const ForwardZoom: React.FC<Props> = ({
  durationInFrames,
  from = 1.0,
  to = 1.04,
  children,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
};
