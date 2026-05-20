import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { ChatPanel } from "../components/ChatPanel";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { Counter } from "../components/Counter";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * RAG — 10 bars (~19.4 s). The payoff feature, full weight.
 *
 *   bar 1: chat panel pops in
 *   bar 2: user question types out
 *   bar 3: reply line 1 (with citation)
 *   bar 4: reply line 2
 *   bar 5: reply line 3
 *   bar 6: cursor moves to citation [chunk 47] and clicks
 *   bar 7: citation card pops up as a side detail — shows actual chunk text
 *   bar 8: latency counter "1.4 s" + "CITED · 3 CHUNKS" chip
 *   bar 9: detail card collapses, "GROUNDED" tagline
 *   bar 10: transition prep
 */
export const S06_RAG: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 10);

  const userAt = Math.round(BAR * 1);
  const reply1At = Math.round(BAR * 2);
  const reply2At = Math.round(BAR * 3);
  const reply3At = Math.round(BAR * 4);
  const citationClickAt = Math.round(BAR * 5);
  const citationCardAt = citationClickAt + Math.round(BEAT * 1);
  const counterAt = Math.round(BAR * 7);
  const citedChipAt = counterAt + Math.round(BEAT * 2);
  const groundedAt = Math.round(BAR * 8);

  // Citation card fade out at end
  const citCardExit = interpolate(frame, [groundedAt + Math.round(BEAT * 2), groundedAt + Math.round(BEAT * 4)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 56,
          }}
        >
          <SpringBounce startFrame={0} fromScale={0.85} rotateDeg={-1}>
            <ChatPanel
              width={980}
              height={620}
              userMessage="Summarize the 3 main findings."
              userMessageStartFrame={userAt}
              assistantStartFrame={reply1At}
              bullets={[
                {
                  text: "Walrus shards cut storage cost ~40% vs S3.",
                  citation: "[chunk 47]",
                  startFrame: reply1At,
                },
                {
                  text: "Seal encrypts before upload — platform never sees plaintext.",
                  citation: "[chunk 89]",
                  startFrame: reply2At,
                },
                {
                  text: "Knowledge index auto-updates as new objects land.",
                  citation: "[chunk 112]",
                  startFrame: reply3At,
                },
              ]}
            />
          </SpringBounce>

          {/* Citation detail PiP — slides in from right when cursor clicks [chunk 47] */}
          {frame >= citationCardAt && (
            <div
              style={{
                opacity: citCardExit,
                transform: `translateX(${interpolate(
                  frame,
                  [citationCardAt, citationCardAt + 18],
                  [60, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                )}px)`,
                willChange: "transform, opacity",
              }}
            >
              <CitationCard appearAt={citationCardAt} />
            </div>
          )}
        </AbsoluteFill>

        {/* Stats row — bottom-center, three-up arrangement so nothing clips */}
        {frame >= counterAt && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 80,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 56,
              pointerEvents: "none",
            }}
          >
            {/* Latency */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <Counter
                  startFrame={counterAt}
                  to={1.4}
                  decimals={1}
                  fontSize={72}
                  fg={color.cream}
                />
                <span
                  style={{
                    fontSize: 32,
                    color: color.stone[500],
                    fontWeight: 700,
                  }}
                >
                  s
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: color.stone[500],
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                ANSWERED
              </span>
            </div>

            {/* Cited */}
            {frame >= citedChipAt && (
              <Chip
                startFrame={citedChipAt}
                surface="cream"
                shadowColor={color.krater}
                dotColor={color.krater}
                mono
                tiltDeg={-2}
              >
                CITED · 3 CHUNKS
              </Chip>
            )}

            {/* Grounded */}
            {frame >= groundedAt && (
              <Chip
                startFrame={groundedAt}
                surface="ink"
                shadowColor={color.krater}
                dotColor={color.krater}
                mono
                tiltDeg={2}
              >
                GROUNDED · NO HALLUCINATIONS
              </Chip>
            )}
          </div>
        )}

        {/* Cursor moves to a citation and clicks it */}
        <AnimatedCursor
          waypoints={[
            { frame: Math.round(BAR * 4 + BEAT * 2), pos: { x: 1700, y: 200 } },
            { frame: citationClickAt, pos: { x: 1080, y: 615 }, click: true },
            { frame: citationCardAt + Math.round(BEAT * 2), pos: { x: 1080, y: 300 } },
            { frame: groundedAt + Math.round(BEAT * 2), pos: { x: 1900, y: 1000 } },
          ]}
        />
      </ForwardZoom>
    </AbsoluteFill>
  );
};

/**
 * Side card showing the actual cited chunk text — what RAG retrieved.
 */
const CitationCard: React.FC<{ appearAt: number }> = ({ appearAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sProg = spring({ frame: frame - appearAt, fps, config: BOUNCE });
  const scale = interpolate(sProg, [0, 1], [0.7, 1]);
  const opacity = interpolate(sProg, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Type out chunk content
  const typed = Math.max(
    0,
    Math.min(120, Math.floor((frame - appearAt - 6) * 2)),
  );
  const chunkText =
    "Walrus achieves 40% lower storage cost vs S3-equivalent durability through erasure-coded sharding across the Sui validator set.";

  return (
    <div
      style={{
        width: 400,
        background: color.cream,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.card,
        boxShadow: cardShadow({ offset: 10, color: color.krater }),
        padding: space[6],
        opacity,
        transform: `scale(${scale}) rotate(2deg)`,
        willChange: "transform, opacity",
        fontFamily: fonts.sans,
        color: color.ink,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: color.stone[500],
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: weight.bold,
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>CHUNK 47</span>
        <span style={{ color: color.krater }}>walrus-cost-model.md</span>
      </div>
      <div
        style={{
          fontSize: 18,
          fontFamily: fonts.mono,
          lineHeight: 1.55,
          color: color.ink,
        }}
      >
        {chunkText.slice(0, typed)}
        {typed < chunkText.length && (
          <span style={{ color: color.krater, fontWeight: weight.bold }}>▍</span>
        )}
      </div>
    </div>
  );
};
