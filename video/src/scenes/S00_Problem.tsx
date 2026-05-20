import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { VerbHit } from "../components/VerbHit";
import { Chip } from "../components/Chip";
import { BOUNCE } from "../motion/springs";
import { LINEAR_EASE } from "../motion/easings";
import { BAR, BEAT, MUSIC_START } from "../motion/timing";

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

      {/* Wind-up: small "yours?" lands at bottom, sets up Promise */}
      {frame >= yoursWinkFrame && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Chip
            startFrame={yoursWinkFrame}
            surface="ink"
            dotColor={color.krater}
            shadowColor={color.krater}
            mono
          >
            BUT WHAT IF
          </Chip>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
