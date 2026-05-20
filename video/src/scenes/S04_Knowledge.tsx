import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { BucketDetailView } from "../components/BucketDetailView";
import { KnowledgeToggle } from "../components/KnowledgeToggle";
import { IndexingProgress } from "../components/IndexingProgress";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { Counter } from "../components/Counter";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Knowledge — 10 bars. Opens match-cut from S03 (same detail view chrome) with
 * the cursor on the Knowledge tab. Within ~6 frames the tab click happens, the
 * indicator slides, Files content fades out, Knowledge content cross-fades in.
 *
 *   bar 1: cursor clicks Knowledge tab; indicator slides; content swaps
 *   bar 2: Knowledge tab content visible — toggle card prominent, cursor moves to it
 *   bar 3: cursor CLICKS toggle → flip
 *   bar 4: indexing progress steps appear on beat
 *   bar 5: "Ready." emphasizes; detail view zooms away
 *   bar 6: HERO counter "142 chunks." in big Bricolage
 *   bar 7: chunk grid visualization (142 dots filling in)
 *   bar 8: "EMBEDDINGS · 768 dim · 48s · < $0.40" stat
 *   bar 9: "ASK ANYTHING →" CTA chip
 *   bar 10: hold, transition prep
 */
export const S04_Knowledge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 10);

  // Phase 1 (bars 1–5): inside the detail view
  const tabSwitchAt = 6;                              // cursor click frame
  const toggleFlipFrame = Math.round(BAR * 2);
  const indexingStart = toggleFlipFrame + Math.round(BEAT * 2);
  const detailExitFrame = Math.round(BAR * 5);

  // Phase 2 (bars 6–10): hero counter takes over
  const heroCounterFrame = detailExitFrame + 8;
  const chunkGridFrame = Math.round(BAR * 6);
  const embedStatFrame = Math.round(BAR * 7);
  const ctaChipFrame = Math.round(BAR * 8);

  // Detail view exits with a scale-up + fade as the hero counter arrives
  const detailExit = interpolate(
    frame,
    [detailExitFrame, detailExitFrame + 16],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const detailScale = interpolate(
    frame,
    [detailExitFrame, detailExitFrame + 16],
    [1, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Knowledge tab geometry (matches S03's exit position for clean match-cut).
  const tableLeftAbs = (1920 - 1320) / 2;
  const knowledgeTabX = tableLeftAbs + 24 + 132 + 4 + 132 / 2;   // 526
  const knowledgeTabY = 246;
  // Toggle center inside the detail view content area
  const toggleX = 1920 / 2;
  const toggleY = 560;

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        {/* Phase 1: detail view with Knowledge tab content */}
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: detailExit,
            transform: `scale(${detailScale})`,
            willChange: "opacity, transform",
          }}
        >
          <BucketDetailView
            bucketName="research-notes/"
            activeTab="knowledge"
            tabSwitchFrame={tabSwitchAt}
            filesContent={<FilesPlaceholder />}
            knowledgeContent={
              <KnowledgeTabContent
                toggleFlipFrame={toggleFlipFrame}
                indexingStart={indexingStart}
              />
            }
          />
        </AbsoluteFill>

        {/* Phase 2: hero counter + chunk grid + embeddings stat */}
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

            {frame >= chunkGridFrame && (
              <ChunkGrid startFrame={chunkGridFrame} total={142} columns={24} />
            )}

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
                  EMBEDDINGS · 768 dim · 48s · &lt; $0.40
                </div>
              </SpringBounce>
            )}

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

        {/* Cursor: start at Knowledge tab (match-cut), click it, then drift to toggle, click it */}
        <AnimatedCursor
          waypoints={[
            { frame: 0,                       pos: { x: knowledgeTabX, y: knowledgeTabY } },
            { frame: tabSwitchAt,             pos: { x: knowledgeTabX, y: knowledgeTabY }, click: true },
            { frame: toggleFlipFrame - 8,     pos: { x: toggleX, y: toggleY } },
            { frame: toggleFlipFrame,         pos: { x: toggleX, y: toggleY }, click: true },
            { frame: detailExitFrame - 6,     pos: { x: 1900, y: 1000 } },
          ]}
        />
      </ForwardZoom>
    </AbsoluteFill>
  );
};

/**
 * Files tab — same content as S03's detail-view files list, just held briefly
 * before the Knowledge tab click cross-fades us away from it. Could pass props
 * to dedupe but inline is fine for the few frames it's visible.
 */
const FilesPlaceholder: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: color.stone[500],
      fontSize: 14,
      fontFamily: fonts.mono,
    }}
  >
    4 files
  </div>
);

/**
 * Knowledge tab content — sits inside the detail view.
 * Toggle card + indexing progress, centered.
 */
const KnowledgeTabContent: React.FC<{
  toggleFlipFrame: number;
  indexingStart: number;
}> = ({ toggleFlipFrame, indexingStart }) => {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[6],
        padding: `${space[6]}px 0`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 28,
          color: color.ink,
          fontWeight: weight.bold,
          letterSpacing: tracking.title,
        }}
      >
        Knowledge index
      </div>
      <KnowledgeToggle toggleFrame={toggleFlipFrame} />
      <div style={{ width: 620 }}>
        <IndexingProgress
          steps={[
            { label: "→ Indexing 142 chunks",   appearAt: indexingStart },
            { label: "→ Embedding · 0.34s/chunk", appearAt: indexingStart + Math.round(BEAT * 2) },
            { label: "→ Ready.",                  appearAt: indexingStart + Math.round(BEAT * 5), emphasis: true },
          ]}
        />
      </div>
    </div>
  );
};

/**
 * 142 dots filling in a grid, staggered to read as "chunks indexed" progress.
 */
const ChunkGrid: React.FC<{ startFrame: number; total: number; columns: number }> = ({
  startFrame,
  total,
  columns,
}) => {
  const frame = useCurrentFrame();
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
