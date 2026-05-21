import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { VerbHit } from "../components/VerbHit";
import { BOUNCE } from "../motion/springs";
import { EASE_OUT } from "../motion/easings";
import { BAR, BEAT, MUSIC_START } from "../motion/timing";

/**
 * Problem — ~8.7 s (30 silent + 4 bars music).
 *
 *   0–30 (silent):      INDICTMENT line lands on ink
 *   30–94 (bar 1):      music in. receipt subtitle types out
 *   94–152 (bar 2):     "Rented." verb hit
 *   152–210 (bar 3):    "Theirs." verb hit
 *   210–262 (bar 4):    "BUT WHAT IF" plain BIG text lands, then CAMERA DIVES THROUGH
 *                       the "A" of WHAT — text scales up massively while an ink
 *                       overlay fades in, so the scene cuts to S01 on pure ink.
 *                       Saul-Bass / Wes-Anderson "iris dive" technique.
 */
export const S00_Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const indictmentFrame = 0;
  const subtitleFrame = MUSIC_START;
  const rentedFrame = MUSIC_START + Math.round(BAR * 1);
  const theirsFrame = MUSIC_START + Math.round(BAR * 2);
  const whatIfFrame = MUSIC_START + Math.round(BAR * 3);  // bar 4 start ≈ 204
  const sceneEnd = MUSIC_START + Math.round(BAR * 4);     // ≈ 262

  // Indictment scale-in
  const sInd = spring({ frame: frame - indictmentFrame, fps, config: BOUNCE });
  const indScale = interpolate(sInd, [0, 1], [1.15, 1]);
  const indExit = interpolate(frame, [rentedFrame - 6, rentedFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle types in
  const subOpacity = interpolate(frame, [subtitleFrame, subtitleFrame + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subExit = interpolate(frame, [rentedFrame - 6, rentedFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.06} flashOnBeat />

      {/* Indictment + subtitle (bars 0–1) */}
      {frame < rentedFrame && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 32,
            padding: "0 120px",
          }}
        >
          <div
            style={{
              opacity: indExit,
              transform: `scale(${indScale})`,
              fontFamily: fonts.display,
              fontSize: 156,
              fontWeight: weight.bold,
              letterSpacing: tracking.display,
              color: color.cream,
              textAlign: "center",
              lineHeight: 0.92,
              fontVariationSettings: "'wonk' 1",
            }}
          >
            Your storage<br />
            isn't{" "}
            <span style={{ color: color.stone[500], textDecoration: "line-through" }}>
              yours.
            </span>
          </div>

          <div
            style={{
              opacity: subOpacity * subExit,
              fontFamily: fonts.mono,
              fontSize: 22,
              color: color.stone[500],
              letterSpacing: "0.04em",
              textAlign: "center",
            }}
          >
            LAST BILL · $4,217 &nbsp;·&nbsp; ACCESS · REVOKED
          </div>
        </AbsoluteFill>
      )}

      {/* Verb hit: Rented. */}
      {frame >= rentedFrame && frame < theirsFrame && (
        <VerbHit
          text="Rented."
          startFrame={rentedFrame}
          fontSize={300}
          fg={color.cream}
          rotateDeg={-3}
        />
      )}

      {/* Verb hit: Theirs. */}
      {frame >= theirsFrame && frame < whatIfFrame && (
        <VerbHit
          text="Theirs."
          startFrame={theirsFrame}
          fontSize={320}
          fg={color.krater}
          rotateDeg={3}
        />
      )}

      {/* "BUT WHAT IF" — plain big text, no pill, dives through the A */}
      {frame >= whatIfFrame && (
        <WhatIfDive startFrame={whatIfFrame} sceneEnd={sceneEnd} />
      )}
    </AbsoluteFill>
  );
};

/**
 * Letter-zoom transition. Renders "BUT WHAT IF" in **SVG** (vectors scale
 * cleanly at any zoom — no rasterisation wall, no flicker). The viewBox
 * shrinks toward the **H** at the dead-centre of the line, so the camera
 * doesn't pan horizontally as it zooms — the text appears to stay put while
 * the world dives into it. By the time the viewBox is a ~10×6 px window on
 * the H's crossbar, every visible pixel is inside the cream stroke and the
 * screen is genuinely white from the letter itself. No wash overlay needed.
 */
const WhatIfDive: React.FC<{ startFrame: number; sceneEnd: number }> = ({
  startFrame,
  sceneEnd,
}) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // === Text layout inside the SVG viewBox (1920 × 1080) ===
  // ZERO pan: both focal coords must equal the viewport centre (960, 540).
  //
  //   - X: the "H" sits at the dead centre of "BUT WHAT IF" (position 6 of
  //     11), so its centre lines up with the text anchor at x = 960.
  //   - Y: most grotesque fonts (Inter, Helvetica, Bricolage) place the H's
  //     crossbar somewhere between 40-50% from cap top, and the crossbar is
  //     ~12-15% of cap height TALL. We pick baseline y = 627 so that an
  //     assumed crossbar at 45% from cap top lands on y = 540, with room for
  //     ±8 px of font variation while still hitting cream.
  //
  // Visual centring: text occupies y = 469 → 627, visual centre at y = 548,
  // viewport centre at y = 540 → text appears 8 px (0.7 %) below dead
  // centre, which reads as "centred" to the eye.
  const TEXT_BASELINE_Y = 627;
  const focalX = 960;
  const focalY = 540;

  // === Phase 1 (0–8): text fades in ===
  const entryOpacity = interpolate(local, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // === Phase 2 (8–16): hold ===
  // === Phase 3 (16–40): dive — viewBox shrinks 1920 × 1080 → 9.6 × 5.4
  //                     That's a 200× vector zoom, well past the point where
  //                     the visible region is entirely inside the H's
  //                     crossbar cream stroke. EASE_OUT for "fast then settle".
  const dive = interpolate(local, [16, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  const vbW = interpolate(dive, [0, 1], [1920, 9.6]);
  const vbH = interpolate(dive, [0, 1], [1080, 5.4]);
  const vbX = focalX - vbW / 2;
  const vbY = focalY - vbH / 2;

  // Safety cream disc behind the text. Invisible during the readable phase of
  // the zoom (dive < 0.85), then fades in over the last few frames as the
  // viewBox shrinks toward the disc's radius. By the time the viewBox is at
  // its smallest (9.6 × 5.4 px), the disc fills the entire visible window —
  // guaranteeing pure cream at scene end regardless of where the H's actual
  // crossbar happens to render. Radius 12 covers the final viewBox diagonal.
  const safetyOpacity = interpolate(dive, [0.85, 0.98], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ opacity: entryOpacity, background: color.ink }}
        >
          {/* Safety disc — invisible until the last few frames of the dive */}
          <circle
            cx={focalX}
            cy={focalY}
            r={12}
            fill={color.cream}
            opacity={safetyOpacity}
          />
          <text
            x={960}
            y={TEXT_BASELINE_Y}
            fontFamily={fonts.display}
            fontSize={220}
            fontWeight={700}
            fill={color.cream}
            textAnchor="middle"
            style={{ letterSpacing: "-0.04em" }}
          >
            BUT WHAT IF
          </text>
        </svg>
      </AbsoluteFill>

    </>
  );
};
