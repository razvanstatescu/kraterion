import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { BEAT } from "../motion/timing";

type Props = {
  /** Children to pulse on each beat. */
  children: React.ReactNode;
  /** Pulse amount on the beat. Defaults to 1.025 (2.5%). */
  amount?: number;
  /** Pulse on every Nth beat. Defaults to 1 (every quarter). */
  every?: number;
  /**
   * Scene-local frame at which pulsing should start. Defaults to 0 —
   * scenes are placed on bar downbeats, so scene-frame 0 is a beat.
   */
  fromFrame?: number;
};

/**
 * Wraps children with a beat-synced scale pulse. The element scales up to
 * `amount` on each downbeat then settles back over the rest of the beat.
 * Useful for keeping UI alive while music plays underneath.
 */
export const BeatPulse: React.FC<Props> = ({
  children,
  amount = 1.025,
  every = 1,
  fromFrame = 0,
}) => {
  const frame = useCurrentFrame();

  if (frame < fromFrame) {
    return <>{children}</>;
  }

  const beatLen = BEAT * every;
  const sinceMusic = frame - fromFrame;
  const localBeat = sinceMusic % beatLen;

  // Sharp attack on beat (first ~25% of beat), gentle decay over the rest.
  const peak = beatLen * 0.18;
  const scale =
    localBeat < peak
      ? interpolate(localBeat, [0, peak], [amount, 1.0])
      : interpolate(localBeat, [peak, beatLen], [1.0, 1.0]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
};
