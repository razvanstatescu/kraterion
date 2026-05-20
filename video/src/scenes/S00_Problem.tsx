import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { VerbHit } from "../components/VerbHit";
import { BOUNCE } from "../motion/springs";
import { LINEAR_EASE, EASE_OUT } from "../motion/easings";
import { BAR, BEAT, MUSIC_START } from "../motion/timing";

/**
 * Pill → aperture morph. The chip lives for ~20 frames, then over the next ~30
 * frames its pill compresses to a circle, the text dissolves, and the krater dot
 * blooms in the middle. Two outer ring strokes draw on top, completing the brand
 * mark just before the scene cuts to S01_Promise.
 */
const ChipToApertureMorph: React.FC<{ startFrame: number; sceneEndFrame: number }> = ({
  startFrame,
  sceneEndFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  // Phase 0: chip bounces in (~14 frames)
  const sIn = spring({ frame: local, fps, config: BOUNCE });
  const inScale = interpolate(sIn, [0, 1], [0.6, 1]);

  // Morph timing (per research: ~18 frames total in 3 phases)
  //   Phase 1 (16–24): compression — width 240 → 44, text fades
  //   Phase 2 (22–30): scale-up — 44 → 420 (matches S01's aperture size)
  //   Phase 3 (26–34): rings draw
  const phase1 = interpolate(local, [16, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const phase2 = interpolate(local, [22, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const phase3Mid = interpolate(local, [26, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const phase3Outer = interpolate(local, [28, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });

  // Phase 1: pill compresses width to a 44px circle
  const compressedSize = 44;
  const finalSize = 420;
  const width = interpolate(phase1, [0, 1], [240, compressedSize]);
  const height = compressedSize;
  const textOpacity = interpolate(phase1, [0, 0.5], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textScaleX = interpolate(phase1, [0, 1], [1, 0.6]);

  // Phase 2: the now-circle scales up to brand-mark size
  const phase2Scale = interpolate(phase2, [0, 1], [1, finalSize / compressedSize]);

  // Background shifts cream → ink during phase 1 (so by the time it scales up it's ink)
  const bgIsInk = phase1 > 0.5;

  // Inner krater disc — grows as part of phase 2
  const innerDiscRel = interpolate(phase2, [0, 1], [1, 0.20 * 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const driftY = interpolate(phase1, [0, 1], [0, -30]);

  const maxR = finalSize / 2;
  const ringOuterR = maxR * 0.95;
  const ringMidR = maxR * 0.618;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width,
          height,
          background: bgIsInk ? color.ink : color.cream,
          border: `2px solid ${color.cream}`,
          borderRadius: 999,
          boxShadow: phase1 < 0.5 ? `4px 4px 0 ${color.krater}` : "none",
          transform: `translateY(${driftY}px) scale(${inScale * phase2Scale})`,
          transformOrigin: "center center",
          willChange: "width, height, background, transform",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Pill label — fades + scaleX squeeze as morph begins */}
        <span
          style={{
            opacity: textOpacity,
            transform: `scaleX(${textScaleX})`,
            fontFamily: fonts.display,
            fontSize: 18,
            fontWeight: weight.bold,
            color: color.ink,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          BUT WHAT IF
        </span>

        {/* Krater inner disc — visible once we're past the compression */}
        {phase1 > 0.5 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: `${innerDiscRel * 100}%`,
              height: `${innerDiscRel * 100}%`,
              borderRadius: 999,
              background: color.krater,
              transform: "translate(-50%, -50%)",
              willChange: "width, height",
            }}
          />
        )}

        {/* Outer rings draw on phase 3 — rendered at the FINAL (un-scaled) size */}
        {phase1 > 0.5 && (
          <svg
            width={finalSize / phase2Scale}
            height={finalSize / phase2Scale}
            viewBox={`0 0 ${finalSize} ${finalSize}`}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${1 / phase2Scale})`,
              transformOrigin: "center center",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            {[
              { r: ringOuterR, prog: phase3Outer },
              { r: ringMidR, prog: phase3Mid },
            ].map(({ r, prog }, i) => {
              const c = 2 * Math.PI * r;
              return (
                <circle
                  key={i}
                  cx={finalSize / 2}
                  cy={finalSize / 2}
                  r={r}
                  fill="none"
                  stroke={color.cream}
                  strokeWidth={10}
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - prog)}
                  transform={`rotate(-90 ${finalSize / 2} ${finalSize / 2})`}
                />
              );
            })}
          </svg>
        )}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Problem — ~8.7s (30 silent + 4 bars music).
 *
 * Modern infra demos open with a single line of indictment. We hold it
 * in silence, then the music kicks in and we let the receipt of the
 * broken status quo appear underneath. Hard cuts on beat to "Rented." →
 * "Theirs.", setting up the contrast for the Promise.
 *
 *   0–30 (silent):       INDICTMENT line lands on ink
 *   30–94 (bar 1):       music in. receipt subtitle types out
 *   94–152 (bar 2):      "Rented." verb hit
 *   152–210 (bar 3):     "Theirs." verb hit
 *   210–262 (bar 4 wind-up): all elements clear, ink with a faint "yours?" wink
 */
export const S00_Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const indictmentFrame = 0;
  const subtitleFrame = MUSIC_START;
  const rentedFrame = MUSIC_START + Math.round(BAR * 1);     // ~88
  const theirsFrame = MUSIC_START + Math.round(BAR * 2);     // ~146
  const yoursWinkFrame = MUSIC_START + Math.round(BAR * 3);  // ~204

  // Indictment scales in from 1.15 → 1, holds, then exits before "Rented."
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
      {frame >= theirsFrame && frame < yoursWinkFrame && (
        <VerbHit
          text="Theirs."
          startFrame={theirsFrame}
          fontSize={320}
          fg={color.krater}
          rotateDeg={3}
        />
      )}

      {/* Wind-up: "BUT WHAT IF" chip lands, then morphs into the aperture mark
          (the chip's pill compresses to a circle, text dissolves, krater dot blooms inside).
          Last ~24 frames before scene end. */}
      {frame >= yoursWinkFrame && (
        <ChipToApertureMorph startFrame={yoursWinkFrame} sceneEndFrame={262} />
      )}
    </AbsoluteFill>
  );
};
