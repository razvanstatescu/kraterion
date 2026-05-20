import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Counter } from "../components/Counter";
import { Chip } from "../components/Chip";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Billing — 7 bars (~13.5 s). Recontextualizes the whole product with one
 * sentence and one number. Receipt-shaped card, not a dashboard chart.
 *
 *   bar 1: receipt card pops in (vertical, paper-receipt vibe)
 *   bar 2: line items appear one per beat (Storage, Walrus, RAG, MCP)
 *   bar 3: hairline divider draws, "TOTAL" appears
 *   bar 4: $ counter ticks up to $3.14
 *   bar 5: "That's it." subtitle drops below
 *   bar 6: "Owned by you" pill — the on-chain wink
 *   bar 7: hold + small "BUILT ON SUI" mono mark appears
 */
export const S08_Billing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 7);

  const rowsBase = Math.round(BAR * 1);
  const totalLineFrame = Math.round(BAR * 2);
  const counterFrame = Math.round(BAR * 3);
  const thatsItFrame = Math.round(BAR * 4);
  const ownershipFrame = Math.round(BAR * 5);
  const suiMarkFrame = Math.round(BAR * 6);

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: space[6],
          }}
        >
          <SpringBounce startFrame={0} fromScale={0.8} rotateDeg={-1.5}>
            <div
              style={{
                width: 720,
                background: color.cream,
                border: `2px solid ${color.ink}`,
                borderRadius: radius.window,
                boxShadow: cardShadow({ offset: 14, color: color.krater }),
                padding: `${space[8]}px ${space[8]}px ${space[6]}px`,
                fontFamily: fonts.sans,
                color: color.ink,
                display: "flex",
                flexDirection: "column",
                gap: space[4],
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div
                  style={{
                    fontSize: 42,
                    fontWeight: weight.bold,
                    fontFamily: fonts.display,
                    letterSpacing: tracking.title,
                  }}
                >
                  This week
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: color.stone[500],
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: weight.bold,
                  }}
                >
                  WEEK 22 · 2026
                </div>
              </div>

              <BillingRow
                appearAt={rowsBase}
                label="STORAGE"
                detail="847 GB"
                price="$1.42"
              />
              <BillingRow
                appearAt={rowsBase + Math.round(BEAT * 1)}
                label="WALRUS · EGRESS"
                detail="2.4 TB"
                price="$1.32"
              />
              <BillingRow
                appearAt={rowsBase + Math.round(BEAT * 2)}
                label="KNOWLEDGE · INDEXED"
                detail="142 chunks"
                price="$0.40"
              />
              <BillingRow
                appearAt={rowsBase + Math.round(BEAT * 3)}
                label="MCP · 7 TOOLS"
                detail="unlimited"
                price="INCLUDED"
              />

              {/* Hairline divider */}
              {frame >= totalLineFrame && (
                <div
                  style={{
                    height: 2,
                    background: color.ink,
                    marginTop: space[2],
                    transformOrigin: "left",
                    transform: `scaleX(${interpolate(
                      frame,
                      [totalLineFrame, totalLineFrame + 12],
                      [0, 1],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                    )})`,
                  }}
                />
              )}

              {/* Total row */}
              {frame >= counterFrame && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingTop: space[2],
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      color: color.ink,
                      fontWeight: weight.bold,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    YOU PAY
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: fonts.display,
                        fontSize: 84,
                        fontWeight: weight.bold,
                        color: color.krater,
                        lineHeight: 1,
                      }}
                    >
                      $
                    </span>
                    <Counter
                      startFrame={counterFrame}
                      to={3.14}
                      decimals={2}
                      fontSize={84}
                      fg={color.krater}
                    />
                  </div>
                </div>
              )}
            </div>
          </SpringBounce>

          {/* "That's it." */}
          {frame >= thatsItFrame && (
            <SpringBounce startFrame={thatsItFrame} fromScale={0.9}>
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: 48,
                  fontWeight: weight.bold,
                  letterSpacing: tracking.title,
                  color: color.cream,
                  fontVariationSettings: "'wonk' 1",
                }}
              >
                That's it.
              </div>
            </SpringBounce>
          )}

          {/* Ownership pill */}
          {frame >= ownershipFrame && (
            <Chip
              startFrame={ownershipFrame}
              surface="ink"
              dotColor={color.krater}
              shadowColor={color.krater}
              mono
            >
              OWNED BY YOU
            </Chip>
          )}

          {/* Small "BUILT ON SUI" mark */}
          {frame >= suiMarkFrame && (
            <div
              style={{
                opacity: interpolate(frame, [suiMarkFrame, suiMarkFrame + 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                fontFamily: fonts.mono,
                fontSize: 14,
                color: color.stone[500],
                letterSpacing: "0.18em",
                marginTop: -space[3],
              }}
            >
              VERIFIED · ON SUI
            </div>
          )}
        </AbsoluteFill>
      </ForwardZoom>
    </AbsoluteFill>
  );
};

const BillingRow: React.FC<{
  appearAt: number;
  label: string;
  detail: string;
  price: string;
}> = ({ appearAt, label, detail, price }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sProg = spring({ frame: frame - appearAt, fps, config: BOUNCE });
  const opacity = interpolate(sProg, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(sProg, [0, 1], [-16, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        willChange: "transform, opacity",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 13,
            color: color.stone[500],
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: weight.bold,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 18,
            color: color.ink,
            fontFamily: fonts.mono,
            fontWeight: weight.medium,
          }}
        >
          {detail}
        </span>
      </div>
      <span
        style={{
          fontSize: 28,
          color: color.ink,
          fontFamily: fonts.mono,
          fontWeight: weight.bold,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {price}
      </span>
    </div>
  );
};
