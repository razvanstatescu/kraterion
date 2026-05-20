import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { ApertureMark } from "../components/ApertureMark";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { SpringBounce } from "../components/SpringBounce";
import { BeatPulse } from "../components/BeatPulse";
import { ForwardZoom } from "../components/ForwardZoom";
import { BAR, BEAT } from "../motion/timing";
import { BOUNCE, SETTLE } from "../motion/springs";

/**
 * Promise — 3 bars (~5.8 s). The answer to the Problem scene.
 *
 *   bar 1 (beat 1): aperture mark SLAMS in HUGE, krater orange inner
 *   bar 2 (beat 1): aperture shrinks to upper-third
 *   bar 2 (beat 3): tagline starts entering
 *   bar 3 (beat 1): "own." in krater orange resolves and beat-pulses
 */
export const S01_Promise: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 3);

  const moveStart = Math.round(BAR * 1);
  const moveProg = spring({ frame: frame - moveStart, fps, config: SETTLE });
  const apertureY = interpolate(moveProg, [0, 1], [0, -280]);
  const apertureScale = interpolate(moveProg, [0, 1], [1, 0.42]);

  const taglineFrame = Math.round(BAR * 1 + BEAT * 2);

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.1} flashOnBeat />

      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              transform: `translateY(${apertureY}px) scale(${apertureScale})`,
              willChange: "transform",
            }}
          >
            <SpringBounce startFrame={0} fromScale={0.2} toScale={1} rotateDeg={6}>
              <ApertureMark
                size={420}
                stroke={color.cream}
                drawDurationFrames={1}
                staggerFrames={0}
                fillInner
                fillStartFrame={0}
                fillColor={color.krater}
              />
            </SpringBounce>
          </div>

          {frame >= taglineFrame && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                padding: "0 80px",
              }}
            >
              <SpringBounce startFrame={taglineFrame} fromScale={0.7} toScale={1} rotateDeg={-2}>
                <BeatPulse amount={1.018} fromFrame={taglineFrame + 24}>
                  <div
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 146,
                      fontWeight: weight.bold,
                      letterSpacing: tracking.display,
                      color: color.cream,
                      textAlign: "center",
                      lineHeight: 0.92,
                      fontVariationSettings: "'wonk' 1",
                    }}
                  >
                    Object storage<br />you actually{" "}
                    <span style={{ color: color.krater }}>own.</span>
                  </div>
                </BeatPulse>
              </SpringBounce>
            </div>
          )}
        </AbsoluteFill>
      </ForwardZoom>
    </AbsoluteFill>
  );
};
