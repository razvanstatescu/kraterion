import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { SpringBounce } from "../components/SpringBounce";
import { BeatPulse } from "../components/BeatPulse";
import { ForwardZoom } from "../components/ForwardZoom";
import { LINEAR_EASE, EASE_OUT } from "../motion/easings";
import { BAR, BEAT } from "../motion/timing";
import { SETTLE } from "../motion/springs";

/**
 * Promise — 3 bars (~5.8 s). Opens on pure cream (handed off from S00's
 * letter-zoom wash). The cream contracts into a circle that shrinks toward
 * the centre until it reaches the aperture's inner-disc size. The two outer
 * rings then stroke-draw around that disc. Aperture finally moves up and the
 * tagline lands.
 *
 *   frames 0–28:    cream disc contracts from screen-spanning to 72 px
 *                   (the inner disc at the 420-px aperture size)
 *   frames 28–60:   outer + middle rings stroke-draw around the resting disc
 *   bar 2 (frame 58+): the whole mark slides up + scales down to make room
 *   bar 3 (BEAT × 6+): tagline pops in, "own." beat-pulses
 */
export const S01_Promise: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 3);

  // === Geometry that mirrors ApertureMark @ size 420 ===
  const apertureSize = 420;
  const apertureMax = (apertureSize / 2) * 0.86;         // 180.6
  const innerR = apertureMax * 0.20;                     // 36.12
  const middleR = apertureMax * 0.618;                   // 111.6
  const outerR = apertureMax;                             // 180.6
  const strokeW = Math.max(2, apertureSize * 0.024);     // 10.08

  // === Phase 1: cream contracts from screen-cover to inner-disc size ===
  // Screen diagonal ≈ √(1920² + 1080²) ≈ 2203 → start with diameter 2400
  // to guarantee full coverage on frame 0.
  const contractStart = 4;   // hold full cream for ~4 frames after S00 hands off
  const contractEnd = 28;
  const discDiameter = interpolate(
    frame,
    [contractStart, contractEnd],
    [2400, innerR * 2],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    },
  );

  // === Phase 2: outer rings stroke-draw (starting just before disc settles) ===
  const ringsBegin = 24;
  const drawDur = 22;
  const middleDraw = interpolate(frame, [ringsBegin, ringsBegin + drawDur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const outerDraw = interpolate(
    frame,
    [ringsBegin + 6, ringsBegin + drawDur + 6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: LINEAR_EASE },
  );

  // === Phase 3: aperture moves up and shrinks at bar 2 ===
  const moveStart = Math.round(BAR * 1);
  const moveProg = spring({ frame: frame - moveStart, fps, config: SETTLE });
  const apertureY = interpolate(moveProg, [0, 1], [0, -280]);
  const apertureScale = interpolate(moveProg, [0, 1], [1, 0.42]);

  // === Phase 4: tagline ===
  const taglineFrame = Math.round(BAR * 1 + BEAT * 2);

  // Background grid stays subdued during the disc contraction (the cream is
  // still covering everything anyway); the visible grid emerges as ink does.
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
          {/* Aperture mark — disc + rings, both moved together by the bar-2 transform */}
          <div
            style={{
              position: "relative",
              width: apertureSize,
              height: apertureSize,
              transform: `translateY(${apertureY}px) scale(${apertureScale})`,
              willChange: "transform",
            }}
          >
            {/* Cream disc — contracts from screen-spanning to inner disc size */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: discDiameter,
                height: discDiameter,
                borderRadius: "50%",
                background: color.cream,
                transform: "translate(-50%, -50%)",
                willChange: "width, height",
              }}
            />

            {/* Outer + middle rings — stroke-draw once the disc has nearly settled */}
            <svg
              width={apertureSize}
              height={apertureSize}
              viewBox={`0 0 ${apertureSize} ${apertureSize}`}
              style={{
                position: "absolute",
                inset: 0,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              {[
                { r: middleR, prog: middleDraw },
                { r: outerR, prog: outerDraw },
              ].map(({ r, prog }, i) => {
                const circ = 2 * Math.PI * r;
                return (
                  <circle
                    key={i}
                    cx={apertureSize / 2}
                    cy={apertureSize / 2}
                    r={r}
                    fill="none"
                    stroke={color.cream}
                    strokeWidth={strokeW}
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - prog)}
                    transform={`rotate(-90 ${apertureSize / 2} ${apertureSize / 2})`}
                  />
                );
              })}
            </svg>
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
                    Object storage<br />stays{" "}
                    <span style={{ color: color.krater }}>yours.</span>
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
