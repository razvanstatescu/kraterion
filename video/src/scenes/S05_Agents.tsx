import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * Agents — 10 bars (~19.4 s). The "build moment" — premium reels weight this.
 *
 *   bar 1: agent form card spring-bounces in
 *   bar 2: NAME field auto-fills ("research-assistant")
 *   bar 3: MODEL dropdown — cursor clicks, "gpt-4o-mini" highlights
 *   bar 4: SYSTEM PROMPT auto-types 2-line summary
 *   bar 5: BUCKETS chip "research-notes/" attaches
 *   bar 6: "Create agent" button glows
 *   bar 7: cursor clicks Create — ripple expands, button morphs
 *   bar 8: form fields fade, success chip "AGENT READY" pops
 *   bar 9-10: hold, prep transition to chat (RAG)
 */
export const S05_Agents: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 10);

  // Beat anchors
  const nameAt   = Math.round(BAR * 1);     // beat 5
  const modelAt  = Math.round(BAR * 2);
  const promptAt = Math.round(BAR * 3);
  const bucketAt = Math.round(BAR * 4);
  const buttonGlowAt = Math.round(BAR * 5);
  const createClickAt = Math.round(BAR * 6);
  const readyAt = Math.round(BAR * 7);

  // Cursor waypoints follow the form fields
  const cursorPath = [
    { frame: Math.round(BEAT * 2), pos: { x: 1820, y: 200 } },     // off-screen entry
    { frame: nameAt + 6,           pos: { x: 1000, y: 320 } },     // name
    { frame: modelAt + 6,          pos: { x: 1000, y: 460 }, click: true }, // model dropdown
    { frame: promptAt + 6,         pos: { x: 1000, y: 600 } },     // prompt
    { frame: bucketAt + 6,         pos: { x: 1000, y: 740 } },     // bucket
    { frame: createClickAt,        pos: { x: 1260, y: 880 }, click: true }, // create button
    { frame: createClickAt + 24,   pos: { x: 1900, y: 1000 } },    // off-screen exit
  ];

  // Form scale dwindles after the create click
  const sCollapse = spring({
    frame: frame - createClickAt - 6,
    fps,
    config: { damping: 16, stiffness: 140, mass: 1 },
  });
  const formScale = interpolate(sCollapse, [0, 1], [1, 0.86]);
  const formOpacity = interpolate(sCollapse, [0, 1], [1, 0]);

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
          {/* Form card */}
          <div
            style={{
              transform: `scale(${formScale})`,
              opacity: formOpacity,
              willChange: "transform, opacity",
            }}
          >
            <SpringBounce startFrame={0} fromScale={0.7} toScale={1} rotateDeg={-1}>
              <AgentFormCard
                nameAt={nameAt}
                modelAt={modelAt}
                promptAt={promptAt}
                bucketAt={bucketAt}
                buttonGlowAt={buttonGlowAt}
                createClickAt={createClickAt}
              />
            </SpringBounce>
          </div>

          {/* AGENT READY chip — appears after form collapses */}
          {frame >= readyAt && (
            <div style={{ position: "absolute" }}>
              <SpringBounce startFrame={readyAt} fromScale={0.4} toScale={1} rotateDeg={-2}>
                <Chip
                  startFrame={readyAt}
                  surface="cream"
                  shadowColor={color.krater}
                  dotColor={color.krater}
                  mono
                >
                  AGENT READY · 0.8 s
                </Chip>
              </SpringBounce>
            </div>
          )}
        </AbsoluteFill>

        <AnimatedCursor waypoints={cursorPath} />
      </ForwardZoom>
    </AbsoluteFill>
  );
};

const AgentFormCard: React.FC<{
  nameAt: number;
  modelAt: number;
  promptAt: number;
  bucketAt: number;
  buttonGlowAt: number;
  createClickAt: number;
}> = ({ nameAt, modelAt, promptAt, bucketAt, buttonGlowAt, createClickAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typed = (start: number, txt: string) => {
    const cps = 1.6;
    const n = Math.max(0, Math.min(txt.length, Math.floor((frame - start) * cps)));
    return txt.slice(0, n);
  };

  // Create button glow pulses on every beat once it's "available"
  const sGlow = spring({
    frame: frame - buttonGlowAt,
    fps,
    config: BOUNCE,
  });
  const glow = interpolate(sGlow, [0, 1], [0, 1]);
  const sClick = spring({
    frame: frame - createClickAt,
    fps,
    config: { damping: 12, stiffness: 280, mass: 0.6 },
  });
  const btnPress = interpolate(sClick, [0, 0.5, 1], [1, 0.94, 1]);

  return (
    <div
      style={{
        width: 880,
        background: color.cream,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.window,
        boxShadow: cardShadow({ offset: 14, color: color.krater }),
        padding: space[8],
        fontFamily: fonts.sans,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        gap: space[6],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: weight.bold,
            fontFamily: fonts.display,
            letterSpacing: tracking.title,
          }}
        >
          New agent
        </div>
        <div
          style={{
            fontSize: 13,
            color: color.stone[500],
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: weight.bold,
          }}
        >
          1 of 1
        </div>
      </div>

      <FormField label="NAME">
        <span style={{ fontFamily: fonts.mono, fontSize: 22 }}>
          {typed(nameAt, "research-assistant")}
          {frame >= nameAt && frame < modelAt && (
            <span style={{ color: color.krater, fontWeight: 700 }}>▍</span>
          )}
        </span>
      </FormField>

      <FormField label="MODEL">
        {frame >= modelAt ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: fonts.mono,
              fontSize: 22,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: color.krater,
              }}
            />
            <span>gpt-4o-mini</span>
            <span style={{ color: color.stone[500], marginLeft: 8, fontSize: 14 }}>
              · 128k context
            </span>
          </div>
        ) : (
          <span style={{ color: color.stone[300], fontSize: 22, fontFamily: fonts.mono }}>
            Choose a model…
          </span>
        )}
      </FormField>

      <FormField label="SYSTEM PROMPT">
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 18,
            color: color.ink,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {typed(promptAt,
            "You are a research assistant.\n" +
            "Cite chunks from the connected bucket.\n" +
            "Be precise; one sentence per bullet.",
          )}
        </div>
      </FormField>

      <FormField label="BUCKETS">
        {frame >= bucketAt && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: color.ink,
              color: color.cream,
              border: `2px solid ${color.ink}`,
              borderRadius: 999,
              fontFamily: fonts.mono,
              fontSize: 18,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: color.krater,
              }}
            />
            research-notes/
          </div>
        )}
      </FormField>

      {/* Create button */}
      <div
        style={{
          marginTop: space[2],
          alignSelf: "flex-end",
          padding: "14px 28px",
          background: glow > 0.3 ? color.krater : color.stone[100],
          color: glow > 0.3 ? color.cream : color.stone[500],
          border: `2px solid ${color.ink}`,
          borderRadius: 10,
          fontFamily: fonts.display,
          fontWeight: weight.bold,
          fontSize: 24,
          letterSpacing: "-0.01em",
          boxShadow: glow > 0.3 ? `6px 6px 0 ${color.ink}` : "none",
          transform: `scale(${btnPress})`,
          willChange: "transform",
          transition: "none",
        }}
      >
        Create agent →
      </div>
    </div>
  );
};

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <div
      style={{
        fontSize: 13,
        color: color.stone[500],
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: weight.bold,
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        padding: "10px 16px",
        border: `1.5px solid ${color.hairlineLight}`,
        borderRadius: 8,
        background: color.cream,
        minHeight: 44,
      }}
    >
      {children}
    </div>
  </div>
);
