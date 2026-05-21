import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ScaleSettle } from "../components/Entrances";
import { EASE_BRAND, EASE_IRIS } from "../motion/easings";

/**
 * S04 — VERIFIABLE KNOWLEDGE (9 s).
 *   "Indexed. Searchable. Verifiable."
 *
 * Lattice forms — 64 small squares appear in random order then snap into
 * a clean grid. The grid IS the knowledge index, made visible. Tiny
 * stone-tone squares with a SINGLE krater square pulsing slowly inside.
 * Per research, the "snap into formation" is the satisfying moment.
 */
export const S04_Knowledge: React.FC = () => {
  const frame = useCurrentFrame();

  const HEADLINE_IN = 4;
  const LATTICE_BUILD_START = 36;       // grid starts forming
  const LATTICE_SETTLE = 132;           // by frame 132 lattice is set
  const COUNT_IN = 168;

  // Deterministic shuffle of 64 indices so each render assigns the same delay
  const SHUFFLED = (() => {
    const arr = Array.from({ length: 64 }, (_, i) => i);
    // simple deterministic shuffle via mulberry-style hash
    let s = 12345;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  })();

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[12],
      }}
    >
      {/* Headline */}
      <ScaleSettle startFrame={HEADLINE_IN} fromScale={1.06}>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontSize: fs.display,
            fontWeight: weight.regular,
            letterSpacing: tracking.display,
            color: color.ink,
            lineHeight: 0.95,
            textAlign: "center",
          }}
        >
          Indexed.{" "}
          <span style={{ color: color.stone[600] }}>
            Searchable. Verifiable.
          </span>
        </h2>
      </ScaleSettle>

      {/* Lattice grid — 8×8 squares */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 36px)",
          gridTemplateRows: "repeat(8, 36px)",
          gap: 8,
        }}
      >
        {SHUFFLED.map((shuffledIndex, position) => {
          const appearAt = LATTICE_BUILD_START + position * 1.2;
          const localFrame = frame - appearAt;
          const opacity = interpolate(localFrame, [0, 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          });
          const scale = interpolate(localFrame, [0, 12], [0.4, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_IRIS,
          });

          // The "verifiable" krater accent — one cell turns orange after
          // the lattice settles
          const isAccent = shuffledIndex === 27; // arbitrary deterministic pick
          const accentOn = isAccent && frame >= LATTICE_SETTLE;
          const fill = accentOn ? color.krater : color.stone[300];

          return (
            <div
              key={position}
              style={{
                opacity,
                transform: `scale(${scale})`,
                background: fill,
                borderRadius: 2,
                willChange: "transform, opacity, background",
              }}
            />
          );
        })}
      </div>

      {/* Stat row — appears after settle */}
      <div
        style={{
          opacity: interpolate(frame, [COUNT_IN, COUNT_IN + 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          }),
          display: "flex",
          gap: space[8],
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fs.lead,
            color: color.stone[600],
            letterSpacing: tracking.caps,
            textTransform: "uppercase",
          }}
        >
          64 chunks · 768 dim · proof-of-index on Sui
        </span>
      </div>
    </AbsoluteFill>
  );
};
