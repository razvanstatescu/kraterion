import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { LetterStagger, ScaleSettle } from "../components/Entrances";
import { EASE_BRAND } from "../motion/easings";

/**
 * S05 — AGENTS (8 s). "OpenAI-compatible."
 *
 * Single big code snippet on cream, scrubbed-in (8-frame clipPath wipe).
 * Below it: a hairline pill "Point any OpenAI client at /v1/agents".
 *
 * Entry mix: headline scale-settles, code scrubs in (with subtle ink
 * vertical line as the scrub head — no krater here; we saved the
 * accent budget for the WOW).
 */
export const S05_Agents: React.FC = () => {
  const frame = useCurrentFrame();

  const HEADLINE_IN = 4;
  const CODE_SCRUB_IN = 36;
  const PILL_IN = 96;

  const scrub = interpolate(
    frame,
    [CODE_SCRUB_IN, CODE_SCRUB_IN + 10],
    [100, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_BRAND },
  );
  const scrubLineOpacity = interpolate(
    frame,
    [CODE_SCRUB_IN, CODE_SCRUB_IN + 8, CODE_SCRUB_IN + 12],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[8],
      }}
    >
      {/* Headline: per-letter stagger */}
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
        <LetterStagger text="Your key." startFrame={HEADLINE_IN} stagger={2} fromY={32} />{" "}
        <span style={{ color: color.stone[600] }}>
          <LetterStagger text="Our API." startFrame={HEADLINE_IN + 14} stagger={2} fromY={32} />
        </span>
      </h2>

      {/* Code card with scrub-in */}
      <ScaleSettle startFrame={CODE_SCRUB_IN - 6} fromScale={1.03}>
        <div
          style={{
            position: "relative",
            width: 900,
            background: color.stone[50],
            border: `1px solid ${color.border}`,
            borderRadius: radius.card,
            padding: `${space[6]}px ${space[8]}px`,
            fontFamily: fonts.mono,
            fontSize: fs.code,
            color: color.ink,
            lineHeight: 1.7,
          }}
        >
          <div
            style={{
              clipPath: `inset(0 ${scrub}% 0 0)`,
              WebkitClipPath: `inset(0 ${scrub}% 0 0)`,
            }}
          >
            <div style={{ color: color.stone[500] }}>{"// drop-in"}</div>
            <div>
              baseURL:{" "}
              <span style={{ color: color.ink }}>
                "kraterion.com/v1/agents"
              </span>
            </div>
            <div>
              apiKey:{" "}
              <span style={{ color: color.ink }}>process.env.OPENAI_API_KEY</span>
            </div>
          </div>
          {/* Scrub head — ink vertical bar tracking the wipe */}
          <div
            style={{
              position: "absolute",
              top: space[6],
              bottom: space[6],
              left: `${100 - scrub}%`,
              width: 2,
              background: color.ink,
              opacity: scrubLineOpacity,
              transform: "translateX(-1px)",
            }}
          />
        </div>
      </ScaleSettle>

      {/* Pill */}
      <div
        style={{
          opacity: interpolate(frame, [PILL_IN, PILL_IN + 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          }),
          padding: "8px 18px",
          border: `1px solid ${color.borderStrong}`,
          borderRadius: 999,
          fontFamily: fonts.sans,
          fontSize: fs.body,
          fontWeight: weight.regular,
          color: color.stone[600],
        }}
      >
        OpenAI-compatible. Plug into any client.
      </div>
    </AbsoluteFill>
  );
};
