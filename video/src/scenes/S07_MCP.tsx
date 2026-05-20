import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { ChatPanel } from "../components/ChatPanel";
import { MCPWindow } from "../components/MCPWindow";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { BOUNCE } from "../motion/springs";
import { BAR, BEAT } from "../motion/timing";

/**
 * MCP — 9 bars (~17.4 s). The strategic surprise.
 *
 *   bar 1: chat re-poses to the left
 *   bar 2: MCP window slides in from the right
 *   bar 3: 7 tools stagger in (one per 8th)
 *   bar 4: "Connected · 0.2 s" pulse appears on MCP window
 *   bar 5: cursor moves to one tool ("list_buckets"), hovers
 *   bar 6: cursor clicks tool — output log line appears in mono below tools
 *   bar 7: tagline card "Same files. Anywhere." lands on bottom
 *   bar 8: "REVOKE ACCESS" pill appears next to Connected
 *   bar 9: cursor clicks REVOKE — connection dot turns grey, "POLICY ON SUI" small chip
 */
export const S07_MCP: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 9);

  const connectedFrame = Math.round(BAR * 3);
  const toolHoverFrame = Math.round(BAR * 4);
  const toolClickFrame = Math.round(BAR * 4 + BEAT * 2);
  const logLineFrame = toolClickFrame + Math.round(BEAT * 1);
  const taglineFrame = Math.round(BAR * 6);
  const revokeChipFrame = Math.round(BAR * 7);
  const revokeClickFrame = revokeChipFrame + Math.round(BEAT * 2);
  const policyChipFrame = revokeClickFrame + Math.round(BEAT * 1);

  const sTagline = spring({ frame: frame - taglineFrame, fps, config: BOUNCE });
  const taglineScale = interpolate(sTagline, [0, 1], [1.2, 1]);
  const taglineOpacity = interpolate(sTagline, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(sTagline, [0, 1], [60, 0]);

  // "Connected" dot turns grey after revoke
  const revoked = frame >= revokeClickFrame;

  // Log line: "→ kraterion.list_buckets() → [\"documents/\", \"research-notes/\", \"kraterion-handbook/\"]"
  const logText = '→ ["documents/", "research-notes/", "kraterion-handbook/"]';
  const logTyped = Math.max(
    0,
    Math.min(logText.length, Math.floor((frame - logLineFrame) * 1.8)),
  );

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.07} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 64,
            paddingTop: 40,
            paddingBottom: 220,
            paddingLeft: 100,
            paddingRight: 100,
          }}
        >
          {/* Chat panel — smaller, tilted left */}
          <div style={{ flex: "0 0 auto" }}>
            <SpringBounce startFrame={0} fromScale={0.7} toScale={0.86} rotateDeg={-1.5}>
              <ChatPanel
                width={720}
                height={500}
                userMessage="Summarize the 3 main findings."
                userMessageStartFrame={-9999}
                assistantStartFrame={-9999}
                bullets={[
                  { text: "Walrus shards cut storage cost ~40% vs S3.", citation: "[chunk 47]", startFrame: -9999 },
                  { text: "Seal encrypts before upload — platform never sees plaintext.", citation: "[chunk 89]", startFrame: -9999 },
                  { text: "Knowledge index auto-updates as new objects land.", citation: "[chunk 112]", startFrame: -9999 },
                ]}
                caretOn={false}
                shadowColor={color.cream}
              />
            </SpringBounce>
          </div>

          {/* MCP window with extended footer for tool-call log */}
          <div style={{ flex: "0 0 auto", position: "relative" }}>
            <SpringBounce startFrame={6} fromScale={0.4} toScale={1} rotateDeg={2}>
              <MCPWindow
                width={620}
                height={frame >= logLineFrame ? 620 : 520}
                toolStaggerStart={Math.round(BEAT * 2)}
                toolStaggerStep={4}
              />
            </SpringBounce>

            {/* Connected status pill — overlay on top-right of MCP window header */}
            {frame >= connectedFrame && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: revoked ? color.stone[500] : "#9BC265",
                    transition: "none",
                  }}
                />
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    color: color.stone[300],
                    fontWeight: weight.medium,
                  }}
                >
                  {revoked ? "revoked · 0.1 s" : "connected · 0.2 s"}
                </span>
              </div>
            )}

            {/* Tool-call log line — appears below the tool list */}
            {frame >= logLineFrame && (
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  right: 24,
                  bottom: 24,
                  padding: "12px 16px",
                  background: color.stone[800],
                  border: `1.5px solid ${color.stone[700]}`,
                  borderRadius: 8,
                  fontFamily: fonts.mono,
                  fontSize: 16,
                  color: color.cream,
                  pointerEvents: "none",
                }}
              >
                <div style={{ color: color.krater, marginBottom: 4 }}>
                  $ kraterion.list_buckets()
                </div>
                <div style={{ color: color.stone[300] }}>
                  {logText.slice(0, logTyped)}
                  {logTyped < logText.length && (
                    <span style={{ color: color.krater }}>▍</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </AbsoluteFill>

        {/* "Same files. Anywhere." tagline — anchored to bottom-center */}
        {frame >= taglineFrame && (
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingBottom: 100,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                opacity: taglineOpacity,
                transform: `translateY(${taglineY}px) scale(${taglineScale})`,
                fontFamily: fonts.display,
                fontSize: 76,
                fontWeight: weight.bold,
                letterSpacing: tracking.display,
                color: color.cream,
                background: color.ink,
                border: `2px solid ${color.cream}`,
                padding: "16px 40px",
                borderRadius: 14,
                boxShadow: `10px 10px 0 ${color.krater}`,
                whiteSpace: "nowrap",
                fontVariationSettings: "'wonk' 1",
              }}
            >
              Same files. <span style={{ color: color.krater }}>Anywhere.</span>
            </div>
          </AbsoluteFill>
        )}

        {/* REVOKE ACCESS pill — the on-chain wink */}
        {frame >= revokeChipFrame && !revoked && (
          <div
            style={{
              position: "absolute",
              top: 80,
              right: 80,
            }}
          >
            <Chip
              startFrame={revokeChipFrame}
              surface="cream"
              shadowColor={color.krater}
              dotColor={color.krater}
              mono
              tiltDeg={-2}
            >
              REVOKE ACCESS
            </Chip>
          </div>
        )}

        {/* POLICY ON SUI chip — appears after revoke */}
        {frame >= policyChipFrame && (
          <div
            style={{
              position: "absolute",
              top: 80,
              right: 80,
            }}
          >
            <Chip
              startFrame={policyChipFrame}
              surface="ink"
              shadowColor={color.stone[500]}
              mono
            >
              POLICY · ENFORCED ON SUI
            </Chip>
          </div>
        )}

        {/* Cursor: hover tool → click → drift → click REVOKE */}
        <AnimatedCursor
          waypoints={[
            { frame: Math.round(BAR * 3 + BEAT * 1), pos: { x: 1820, y: 200 } },
            { frame: toolHoverFrame, pos: { x: 1320, y: 580 } },
            { frame: toolClickFrame, pos: { x: 1320, y: 580 }, click: true },
            { frame: revokeChipFrame + Math.round(BEAT * 1), pos: { x: 1700, y: 200 } },
            { frame: revokeClickFrame, pos: { x: 1640, y: 130 }, click: true },
            { frame: revokeClickFrame + Math.round(BEAT * 2), pos: { x: 1900, y: 1000 } },
          ]}
        />
      </ForwardZoom>
    </AbsoluteFill>
  );
};
