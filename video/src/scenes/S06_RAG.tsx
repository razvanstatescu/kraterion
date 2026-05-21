import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { MaskReveal, LetterStagger } from "../components/Entrances";
import { EASE_BRAND } from "../motion/easings";

/**
 * S06 — MCP (9 s). "Any agent. That speaks MCP."
 *
 * Two cards reveal from opposite edges (mask wipes), each labelled with
 * a host that supports MCP — Claude on the left, Cursor on the right.
 * Below the cards, a single-line eyebrow notes the wider compatibility
 * ("Claude. Cursor. Continue. Cline. n8n. Any MCP client.") so the
 * scene reads as "these are examples, not an exhaustive list."
 */
export const S06_RAG: React.FC = () => {
  const frame = useCurrentFrame();

  const HEADLINE_IN = 4;
  const CARDS_IN = 48;
  const FOOTNOTE_IN = 132;

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
        <LetterStagger text="Any agent." startFrame={HEADLINE_IN} stagger={2} fromY={32} />
        <br />
        <span style={{ color: color.stone[600] }}>
          <LetterStagger
            text="That speaks MCP."
            startFrame={HEADLINE_IN + 22}
            stagger={2}
            fromY={32}
          />
        </span>
      </h2>

      {/* Two example cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: space[8],
          width: 1280,
        }}
      >
        {[
          { host: "Claude Desktop", call: "kraterion.list_buckets()",     dir: "left"  as const },
          { host: "Cursor",         call: "kraterion.write_object(\"…\")", dir: "right" as const },
        ].map((c, i) => {
          const cardOpacity = interpolate(
            frame,
            [CARDS_IN + i * 8, CARDS_IN + i * 8 + 14],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_BRAND,
            },
          );
          return (
            <MaskReveal
              key={c.host}
              startFrame={CARDS_IN + i * 8}
              durationInFrames={18}
              direction={c.dir === "left" ? "ltr" : "rtl"}
              style={{ width: "100%", opacity: cardOpacity }}
            >
              <div
                style={{
                  background: color.stone[50],
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.card,
                  padding: `${space[6]}px ${space[8]}px`,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: space[3],
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: fs.lead,
                      fontWeight: weight.medium,
                      letterSpacing: tracking.heading,
                      color: color.ink,
                    }}
                  >
                    {c.host}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: fonts.sans,
                      fontSize: fs.micro,
                      fontWeight: weight.medium,
                      color: color.stone[500],
                      letterSpacing: tracking.caps,
                      textTransform: "uppercase",
                    }}
                  >
                    <span
                      style={{ width: 6, height: 6, borderRadius: 999, background: color.success }}
                    />
                    Connected
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: fs.code,
                    color: color.ink,
                  }}
                >
                  {c.call}
                </div>
              </div>
            </MaskReveal>
          );
        })}
      </div>

      {/* Footnote — wider MCP ecosystem */}
      <div
        style={{
          opacity: interpolate(frame, [FOOTNOTE_IN, FOOTNOTE_IN + 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          }),
          fontFamily: fonts.sans,
          fontSize: fs.micro,
          fontWeight: weight.medium,
          color: color.stone[500],
          letterSpacing: tracking.caps,
          textTransform: "uppercase",
        }}
      >
        Claude · Cursor · Continue · Cline · n8n · any MCP client
      </div>
    </AbsoluteFill>
  );
};
