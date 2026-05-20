import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { CodeBlock, CodeLine } from "../components/CodeBlock";
import { SpringBounce } from "../components/SpringBounce";
import { VerbHit } from "../components/VerbHit";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { Counter } from "../components/Counter";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BAR, BEAT } from "../motion/timing";

/**
 * S3 swap — 7 bars (~13.5 s). Per research: no zoom on code, strikethrough-fade
 * for the change moment, no full-app chrome, generous padding.
 *
 *   bar 1: code card pops in (camera holds still)
 *   bar 2: code types out
 *   bar 3 beat 1: cursor arrives at endpoint URL
 *   bar 3 beat 3: URL strikethrough-fade swap to orange — the wow
 *   bar 4: "ZERO REWRITES" chip + counter "1 line · 0 rewrites"
 *   bar 5: code shrinks + travels up-left, "Drop-in S3." verb hit lands
 *   bar 6: hold with beat pulse
 *   bar 7: prep transition to dashboard (code card morphs into dashboard pose)
 */
export const S02_S3Swap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 7);

  // 7-bar choreography — research says give the URL change more breathing room
  const swapBeat = Math.round(BEAT * 10);     // bar 3 beat 3
  const chipFrame = Math.round(BEAT * 12);    // bar 4 beat 1
  const counterFrame = Math.round(BEAT * 13); // bar 4 beat 2
  const verbBeat = Math.round(BEAT * 16);     // bar 5 beat 1

  // Code card exits up-left when verb lands
  const sExit = spring({
    frame: frame - verbBeat,
    fps,
    config: { damping: 18, stiffness: 150, mass: 1 },
  });
  const codeScale = interpolate(sExit, [0, 1], [1, 0.42]);
  const codeX = interpolate(sExit, [0, 1], [0, -480]);
  const codeY = interpolate(sExit, [0, 1], [0, -260]);
  const codeRotate = interpolate(sExit, [0, 1], [-1.5, -4]);

  const lines: CodeLine[] = [
    { text: "import boto3", startFrame: 4 },
    { text: "", startFrame: 14 },
    { text: "s3 = boto3.client(", startFrame: 18 },
    {
      text: "  endpoint_url=\"https://s3.amazonaws.com\",",
      startFrame: 28,
      highlight: {
        find: "s3.amazonaws.com",
        swapStartFrame: swapBeat,
        replaceWith: "api.kraterion.xyz",
        replaceColor: color.krater,
      },
    },
    { text: ")", startFrame: 72 },
  ];

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Code card */}
          <div
            style={{
              transform: `translate(${codeX}px, ${codeY}px) scale(${codeScale}) rotate(${codeRotate}deg)`,
              willChange: "transform",
            }}
          >
            <SpringBounce startFrame={0} fromScale={0.85} toScale={1} rotateDeg={-1.5}>
              <CodeBlock lines={lines} surface="ink" width={1240} />
            </SpringBounce>
          </div>
        </AbsoluteFill>

        {/* Cursor enters bar 3, clicks URL on bar 3 beat 3, exits bar 4 */}
        <AnimatedCursor
          waypoints={[
            { frame: Math.round(BEAT * 8), pos: { x: 1700, y: 950 } },
            { frame: swapBeat, pos: { x: 1180, y: 615 }, click: true },
            { frame: swapBeat + Math.round(BEAT * 2), pos: { x: 1900, y: 1000 } },
          ]}
        />

        {/* "ZERO CODE CHANGES" chip near where URL was */}
        {frame >= chipFrame && frame < verbBeat + 6 && (
          <div style={{ position: "absolute", top: 660, left: 1180 }}>
            <Chip
              startFrame={chipFrame}
              surface="ink"
              shadowColor={color.krater}
              dotColor={color.krater}
              mono
            >
              ZERO REWRITES
            </Chip>
          </div>
        )}

        {/* Verb hit lands center */}
        {frame >= verbBeat && (
          <AbsoluteFill style={{ pointerEvents: "none" }}>
            <VerbHit
              text="Drop-in"
              accent={{ word: "S3.", color: color.krater }}
              startFrame={verbBeat}
              fontSize={260}
              rotateDeg={-3}
            />
          </AbsoluteFill>
        )}

        {/* Counter row near bottom */}
        {frame >= counterFrame && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 80,
              display: "flex",
              justifyContent: "center",
              gap: 64,
              alignItems: "baseline",
            }}
          >
            <CounterCol
              startFrame={counterFrame}
              value={1}
              label="LINE CHANGED"
              fg={color.cream}
            />
            <CounterCol
              startFrame={counterFrame + 6}
              value={0}
              label="REWRITES"
              fg={color.krater}
            />
          </div>
        )}
      </ForwardZoom>
    </AbsoluteFill>
  );
};

const CounterCol: React.FC<{
  startFrame: number;
  value: number;
  label: string;
  fg: string;
}> = ({ startFrame, value, label, fg }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
    <Counter startFrame={startFrame} to={value} fontSize={80} fg={fg} />
    <span
      style={{
        fontSize: 16,
        color: color.stone[500],
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  </div>
);
