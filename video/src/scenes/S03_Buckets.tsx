import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { BucketsTable, BucketRowData } from "../components/BucketsTable";
import { BucketDetailView } from "../components/BucketDetailView";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Buckets — 7 bars (~13.5 s). Premium Linear-style table → row expand → detail view
 * with Files tab active. Sets up the match-cut into S04 (Knowledge tab click).
 *
 *   bar 1: table pops in, header visible
 *   bar 2: rows stagger in (5 rows, 1-beat each)
 *   bar 3: cursor enters from upper-right
 *   bar 4: cursor anticipation-hovers research-notes row (5 frames early), then clicks
 *   bar 5: ROW MORPH — other rows peel away, clicked row expands to detail view
 *   bar 6: detail view fully shown with Files tab active; cursor moves toward Knowledge tab
 *   bar 7: cursor lands on Knowledge tab (anticipation hover, no click yet — that's S04)
 */

const BUCKETS: BucketRowData[] = [
  { name: "documents/",         visibility: "private", apiAccess: "granted", objects: 28,    storage: "312 MB", created: "12d ago" },
  { name: "research-notes/",    visibility: "private", apiAccess: "granted", objects: 142,   storage: "1.4 GB", created: "3d ago",  hasKnowledge: false },
  { name: "kraterion-handbook/",visibility: "public",  apiAccess: "granted", objects: 7,     storage: "84 KB",  created: "1d ago" },
  { name: "archive-2025/",      visibility: "private", apiAccess: "granted", objects: 1247,  storage: "14.2 GB",created: "8mo ago" },
  { name: "staging/",           visibility: "private", apiAccess: "revoked", objects: 0,     storage: "0 B",    created: "2h ago" },
];

export const S03_Buckets: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 7);

  // Beats / anchors (scene-local frames)
  const rowsStaggerStart = Math.round(BEAT * 4);   // bar 2 — rows stagger in
  const cursorEnter      = Math.round(BAR * 2);
  const hoverStart       = Math.round(BAR * 3 - BEAT);   // anticipation 4–6 frames early
  const clickAt          = Math.round(BAR * 3 + BEAT);
  const morphStart       = clickAt + 2;            // research: row stays 2–3 frames after click
  const morphEnd         = morphStart + 14;        // 14 frames total morph
  const detailFullyShown = morphEnd + 4;
  const cursorToKnowledge = Math.round(BAR * 6);   // bar 7 — cursor heads to Knowledge tab

  // Active row index (research-notes) and its absolute position in the table.
  // Table is centered in 1920×1080; height ≈ 360 (chrome 60 + filter 50 + thead 38 + 5 rows × 44).
  // Top of table ≈ (1080 − 360) / 2 = 360. First data row top ≈ 360 + 60 + 50 + 38 = 508.
  const activeRowIndex = 1;
  const tableLeftAbs = (1920 - 1320) / 2;            // 300
  const firstRowTopAbs = 508;
  const clickX = tableLeftAbs + 100;                 // hits name column
  const clickY = firstRowTopAbs + activeRowIndex * 44 + 22; // mid-row

  // Morph progress: clicked row expands into full detail view
  const morphProg = interpolate(frame, [morphStart, morphEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Table fades + detail fades in
  const tableOpacity = interpolate(frame, [morphStart + 4, morphEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const detailOpacity = interpolate(frame, [morphStart + 6, morphEnd + 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Knowledge tab inside the detail view. Detail card 1320×760 centered → top = 160.
  // Header 62 px, tabs strip 48 px → tab vertical centre ≈ 160 + 62 + 24 = 246.
  const knowledgeTabX = tableLeftAbs + 24 + 132 + 4 + 132 / 2;  // 526
  const knowledgeTabY = 246;

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames} from={1} to={1.02}>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Table — visible until the morph */}
          <div
            style={{
              position: "absolute",
              opacity: tableOpacity,
              willChange: "opacity",
            }}
          >
            <SpringBounce startFrame={0} fromScale={0.85} toScale={1} rotateDeg={-1}>
              <BucketsTable
                rows={BUCKETS}
                rowStagger={{ start: rowsStaggerStart, perRow: 6 }}
                hoveredIndex={activeRowIndex}
                hoverStartFrame={hoverStart}
                expandingIndex={frame >= morphStart ? activeRowIndex : undefined}
                morphStartFrame={morphStart}
              />
            </SpringBounce>
          </div>

          {/* Detail view — appears as the row expands. Match-cut handoff to S04. */}
          {frame >= morphStart && (
            <div
              style={{
                position: "absolute",
                opacity: detailOpacity,
                transform: `scale(${interpolate(morphProg, [0, 1], [0.96, 1])})`,
                willChange: "opacity, transform",
              }}
            >
              <BucketDetailView
                bucketName="research-notes/"
                activeTab="files"
                filesContent={<FilesTabContent appearAt={detailFullyShown - 4} />}
                knowledgeContent={null}
              />
            </div>
          )}
        </AbsoluteFill>

        {/* Cursor path: enter → anticipate row → click → drift to Knowledge tab */}
        <AnimatedCursor
          waypoints={[
            { frame: cursorEnter,            pos: { x: 1820, y: 200 } },
            { frame: hoverStart - 2,         pos: { x: clickX, y: clickY } },
            { frame: clickAt,                pos: { x: clickX, y: clickY }, click: true },
            { frame: cursorToKnowledge,      pos: { x: knowledgeTabX, y: knowledgeTabY } },
            { frame: durationInFrames - 2,   pos: { x: knowledgeTabX, y: knowledgeTabY } },
          ]}
        />
      </ForwardZoom>
    </AbsoluteFill>
  );
};

/**
 * Mini file list rendered inside the Files tab of the detail view.
 * Just enough to make the tab feel "lived in" before we switch to Knowledge.
 */
const FilesTabContent: React.FC<{ appearAt: number }> = ({ appearAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const files = [
    { name: "2026-overflow-thesis.md", size: "14.2 kB", modified: "3d ago" },
    { name: "walrus-cost-model.md",    size: "6.8 kB",  modified: "5d ago" },
    { name: "seal-envelope-flow.md",   size: "11.4 kB", modified: "1w ago" },
    { name: "dashboard-copy.md",       size: "3.1 kB",  modified: "2w ago" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Sub-header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${space[2]}px ${space[2]}px`,
          marginBottom: 8,
          fontSize: 11,
          color: color.stone[500],
          fontWeight: weight.medium,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          borderBottom: `1.5px solid ${color.hairlineLight}`,
          paddingBottom: 10,
        }}
      >
        <span>Name</span>
        <div style={{ display: "flex", gap: 120 }}>
          <span>Size</span>
          <span>Modified</span>
        </div>
      </div>

      {files.map((f, i) => {
        const local = frame - (appearAt + i * 2);
        const sProg = spring({ frame: local, fps, config: BOUNCE });
        const opacity = interpolate(sProg, [0, 0.5], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const y = interpolate(sProg, [0, 1], [6, 0]);
        return (
          <div
            key={f.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `10px ${space[2]}px`,
              borderBottom: i < files.length - 1 ? `1px solid ${color.hairlineLight}` : "none",
              opacity,
              transform: `translateY(${y}px)`,
              willChange: "transform, opacity",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: color.stone[500] }}>📄</span>
              <span style={{ fontSize: 14, color: color.ink, fontFamily: fonts.mono, fontWeight: weight.medium }}>
                {f.name}
              </span>
            </div>
            <div style={{ display: "flex", gap: 80, fontSize: 13, color: color.stone[500] }}>
              <span style={{ width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.size}</span>
              <span style={{ width: 100, textAlign: "right" }}>{f.modified}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
