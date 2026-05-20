import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { KnowledgeToggle } from "../components/KnowledgeToggle";
import { IndexingProgress } from "../components/IndexingProgress";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { Counter } from "../components/Counter";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { SpotlightZoom } from "../components/SpotlightZoom";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Knowledge — 10 bars (~19.4 s). The "wait, it does that?" beat gets full weight.
 *
 *   bar 1: title + toggle card pop in
 *   bar 2: cursor enters from upper-right
 *   bar 3 beat 1: cursor CLICKS toggle → flip + chime moment + spotlight push-in
 *   bar 4: pull back, indexing line 1 + 2 appear
 *   bar 5: indexing line 3 "Ready." emphasizes
 *   bar 6: hero counter "142 CHUNKS" ticks up (centered, big)
 *   bar 7: chunk grid visualization — 142 tiny dots fill in row-by-row
 *   bar 8: secondary stat "EMBEDDINGS · 768 dim" appears below
 *   bar 9: "ASK ANYTHING →" CTA chip lands
 *   bar 10: hold + transition prep (counter card pulses gently)
 */
export const S04_Knowledge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 10);

  // Timing anchors
  const titleFrame = 0;
  const toggleCardFrame = 6;
  const toggleFlipFrame = Math.round(BAR * 2);                          // bar 3 beat 1
  const zoomInFrame = toggleFlipFrame + Math.round(BEAT * 1);
  const zoomOutFrame = zoomInFrame + Math.round(BEAT * 2);
  const indexingStart = zoomOutFrame + Math.round(BEAT * 0.5);          // bar 4
  const everythingExits = Math.round(BAR * 5);                          // bar 6 — toggle/indexing fade
  const heroCounterFrame = everythingExits + 6;                          // bar 6
  const chunkGridFrame = Math.round(BAR * 6);                           // bar 7
  const embedStatFrame = Math.round(BAR * 7);                           // bar 8
  const ctaChipFrame = Math.round(BAR * 8);                             // bar 9

  // Toggle/indexing block fades when the hero counter takes over
  const groupExit = interpolate(
    frame,
    [everythingExits, everythingExits + 18],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        {/* Phase 1: toggle + indexing (bars 1–5) — fades out for hero counter */}
        <AbsoluteFill style={{ opacity: groupExit }}>
          <SpotlightZoom
            zoomInFrame={zoomInFrame}
            zoomOutFrame={zoomOutFrame}
            target={{ x: 0.5, y: 0.5 }}
            zoomScale={1.7}
            backgroundBlur={3}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: space[8],
              }}
            >
              <SpringBounce startFrame={titleFrame} fromScale={0.85}>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 56,
                    color: color.cream,
                    fontWeight: weight.medium,
                  }}
                >
                  research-notes/
                </div>
              </SpringBounce>

              <SpringBounce startFrame={toggleCardFrame} fromScale={0.8} rotateDeg={-1}>
                <KnowledgeToggle toggleFrame={toggleFlipFrame} />
              </SpringBounce>

              <div style={{ width: 620, paddingLeft: space[2] }}>
                <IndexingProgress
                  steps={[
                    { label: "→ Indexing 142 chunks", appearAt: indexingStart },
                    { label: "→ Embedding · 0.34s/chunk", appearAt: indexingStart + Math.round(BEAT * 2) },
                    { label: "→ Ready.", appearAt: indexingStart + Math.round(BEAT * 5), emphasis: true },
                  ]}
                />
              </div>
            </AbsoluteFill>
          </SpotlightZoom>
        </AbsoluteFill>

        {/* Phase 2: hero counter (bar 6) */}
        {frame >= heroCounterFrame && (
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: space[6],
            }}
          >
            <SpringBounce startFrame={heroCounterFrame} fromScale={0.4} rotateDeg={-2}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <Counter
                  startFrame={heroCounterFrame}
                  to={142}
                  fontSize={280}
                  fg={color.krater}
                />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 96,
                    color: color.cream,
                    fontWeight: weight.bold,
                  }}
                >
                  chunks.
                </span>
              </div>
            </SpringBounce>

            {/* Chunk grid */}
            {frame >= chunkGridFrame && (
              <ChunkGrid startFrame={chunkGridFrame} total={142} columns={24} />
            )}

            {/* Embedding stat */}
            {frame >= embedStatFrame && (
              <SpringBounce startFrame={embedStatFrame} fromScale={0.85}>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 22,
                    color: color.stone[500],
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: weight.bold,
                  }}
                >
                  EMBEDDINGS · 768 dim · 48 s · &lt; $0.40
                </div>
              </SpringBounce>
            )}

            {/* CTA chip */}
            {frame >= ctaChipFrame && (
              <div style={{ marginTop: space[4] }}>
                <Chip
                  startFrame={ctaChipFrame}
                  surface="cream"
                  shadowColor={color.krater}
                  dotColor={color.krater}
                  mono
                  tiltDeg={-1.5}
                >
                  ASK ANYTHING →
                </Chip>
              </div>
            )}
          </AbsoluteFill>
        )}

        {/* Cursor — only during phase 1 */}
        {frame < everythingExits + 6 && (
          <AnimatedCursor
            waypoints={[
              { frame: Math.round(BEAT * 4), pos: { x: 1820, y: 220 } },
              { frame: toggleFlipFrame, pos: { x: 1200, y: 540 }, click: true },
              { frame: toggleFlipFrame + Math.round(BEAT * 2), pos: { x: 1900, y: 1000 } },
            ]}
          />
        )}
      </ForwardZoom>
    </AbsoluteFill>
  );
};

/**
 * 142 dots filling in a grid, staggered to read as a "chunks indexed" progress.
 */
const ChunkGrid: React.FC<{ startFrame: number; total: number; columns: number }> = ({
  startFrame,
  total,
  columns,
}) => {
  const frame = useCurrentFrame();
  const rows = Math.ceil(total / columns);
  const dotSize = 10;
  const gap = 6;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${dotSize}px)`,
        gap,
        padding: 8,
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const dotFrame = startFrame + i * 0.4;
        const lit = frame - dotFrame;
        const opacity = interpolate(lit, [0, 4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = interpolate(lit, [0, 4, 12], [0.4, 1.4, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 2,
              background: color.krater,
              opacity,
              transform: `scale(${scale})`,
              willChange: "transform, opacity",
            }}
          />
        );
      })}
    </div>
  );
};
