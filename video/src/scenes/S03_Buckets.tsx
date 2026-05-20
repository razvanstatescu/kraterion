import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { DashboardChrome } from "../components/DashboardChrome";
import { BucketRow } from "../components/BucketRow";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { Counter } from "../components/Counter";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Buckets — 7 bars (~13.5 s). Per research: animate state, not camera.
 * Crop tightly to the panel; one hero metric inside the dashboard, not floating.
 *
 *   bar 1: dashboard pops in
 *   bar 2: buckets stagger in (one per beat)
 *   bar 3: cursor enters and clicks research-notes/
 *   bar 4: file list cascades in, hero counter "142 · 1.4 GB" appears inside
 *   bar 5: cursor moves to a file row, "OWNED BY YOU" pill flashes
 *   bar 6: small "READY TO INDEX" chip appears at bottom
 *   bar 7: hold + transition prep
 */
export const S03_Buckets: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 7);

  const buckets = [
    { name: "documents/", objects: 28, appearFrame: BEAT * 2 },
    { name: "research-notes/", objects: 142, active: true, appearFrame: BEAT * 3 },
    { name: "kraterion-handbook/", objects: 7, appearFrame: BEAT * 4 },
  ];

  const files = [
    { name: "2026-overflow-thesis.md", size: "14.2 kB", appearFrame: BEAT * 8 },
    { name: "walrus-cost-model.md", size: "6.8 kB", appearFrame: BEAT * 8.5 },
    { name: "seal-envelope-flow.md", size: "11.4 kB", appearFrame: BEAT * 9 },
    { name: "dashboard-copy.md", size: "3.1 kB", appearFrame: BEAT * 9.5 },
  ];

  const counterFrame = Math.round(BEAT * 12);   // bar 4 — counter inside dashboard
  const ownershipFrame = Math.round(BEAT * 18); // bar 5-6 — owned-by-you pill
  const indexChipFrame = Math.round(BEAT * 22); // bar 6 end

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames} from={1} to={1.03}>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SpringBounce startFrame={0} fromScale={0.65} toScale={1} rotateDeg={-1}>
            <DashboardChrome
              width={1480}
              height={840}
              sidebar={
                <>
                  <div
                    style={{
                      fontSize: 13,
                      color: color.stone[500],
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      fontWeight: weight.bold,
                      marginBottom: space[2],
                      fontFamily: fonts.display,
                    }}
                  >
                    Buckets
                  </div>
                  {buckets.map((b) => {
                    const sProg = spring({
                      frame: frame - b.appearFrame,
                      fps,
                      config: BOUNCE,
                    });
                    const opacity = interpolate(sProg, [0, 0.6], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    });
                    const x = interpolate(sProg, [0, 1], [-30, 0]);
                    return (
                      <div
                        key={b.name}
                        style={{
                          opacity,
                          transform: `translateX(${x}px)`,
                          willChange: "transform, opacity",
                        }}
                      >
                        <BucketRow {...b} />
                      </div>
                    );
                  })}
                </>
              }
              content={
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: space[6],
                    fontFamily: fonts.sans,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: space[6],
                    }}
                  >
                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: weight.bold,
                        color: color.ink,
                        letterSpacing: tracking.title,
                        fontFamily: fonts.display,
                      }}
                    >
                      research-notes/
                    </div>
                    {frame >= counterFrame && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <Counter
                            startFrame={counterFrame}
                            to={142}
                            fontSize={48}
                            fg={color.ink}
                          />
                          <span
                            style={{
                              fontSize: 18,
                              color: color.stone[500],
                              fontWeight: 700,
                              letterSpacing: "0.12em",
                            }}
                          >
                            · 1.4 GB
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: color.stone[500],
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            marginTop: 2,
                          }}
                        >
                          OBJECTS
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                    {files.map((f) => {
                      const sProg = spring({
                        frame: frame - f.appearFrame,
                        fps,
                        config: BOUNCE,
                      });
                      const opacity = interpolate(sProg, [0, 0.6], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      });
                      const x = interpolate(sProg, [0, 1], [-30, 0]);
                      return (
                        <div
                          key={f.name}
                          style={{
                            opacity,
                            transform: `translateX(${x}px)`,
                            willChange: "transform, opacity",
                          }}
                        >
                          <BucketRow name={f.name} size={f.size} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              }
            />
          </SpringBounce>
        </AbsoluteFill>

        {/* OWNED-BY-YOU pill on top of the dashboard — the on-chain wink without crypto */}
        {frame >= ownershipFrame && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 200,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Chip
              startFrame={ownershipFrame}
              surface="ink"
              shadowColor={color.krater}
              dotColor={color.krater}
              mono
              tiltDeg={-1.5}
            >
              OWNED BY YOU · VERIFIED ON SUI
            </Chip>
          </div>
        )}

        {/* "INDEX READY" chip — bottom of frame */}
        {frame >= indexChipFrame && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 60,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Chip
              startFrame={indexChipFrame}
              surface="ink"
              shadowColor={color.krater}
              dotColor={color.krater}
              mono
              tiltDeg={-1}
            >
              READY TO INDEX →
            </Chip>
          </div>
        )}

        {/* Cursor across the 7-bar arc: enters → clicks research-notes → roams files → exits */}
        <AnimatedCursor
          waypoints={[
            { frame: Math.round(BEAT * 4),  pos: { x: 1850, y: 200 } },                    // bar 2 — enter
            { frame: Math.round(BEAT * 7),  pos: { x: 360, y: 408 }, click: true },        // bar 2-3 — click bucket
            { frame: Math.round(BEAT * 12), pos: { x: 760, y: 540 } },                     // bar 4 — drift to files
            { frame: Math.round(BEAT * 18), pos: { x: 1000, y: 600 }, click: true },       // bar 5 — click file
            { frame: Math.round(BEAT * 24), pos: { x: 1880, y: 1000 } },                   // bar 7 — exit
          ]}
        />
      </ForwardZoom>
    </AbsoluteFill>
  );
};
