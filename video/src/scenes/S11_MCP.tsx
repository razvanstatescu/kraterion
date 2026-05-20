import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ChatPanel } from "../components/ChatPanel";
import { MCPWindow } from "../components/MCPWindow";
import { LINEAR_EASE } from "../motion/easings";

export const S11_MCP: React.FC = () => {
  const frame = useCurrentFrame();

  // Chat panel: scaled down to top-left third
  const chatOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // MCP window: scale-blur in
  const mcpLocal = frame - 12;
  const mcpScale = interpolate(mcpLocal, [0, 36], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const mcpBlur = interpolate(mcpLocal, [0, 36], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const mcpOpacity = interpolate(mcpLocal, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pattern 7: slow zoom of the whole composition
  const slowZoom = interpolate(frame, [60, 600], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tagline appears once both windows are settled
  const taglineOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.ink,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[8],
      }}
    >
      <div
        style={{
          transform: `scale(${slowZoom})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: space[8],
          willChange: "transform",
        }}
      >
        <div style={{ display: "flex", gap: space[12], alignItems: "stretch" }}>
          <div style={{ opacity: chatOpacity, transform: "scale(0.78)", transformOrigin: "top left" }}>
            {/* Re-show the same chat panel state — frozen */}
            <ChatPanel
              width={760}
              height={520}
              userMessage="Summarize the 3 main findings."
              userMessageStartFrame={-9999}
              assistantStartFrame={-9999}
              bullets={[
                {
                  text: "Walrus shards cut storage cost by ~40% vs S3 at equivalent durability.",
                  citation: "[chunk 47]",
                  startFrame: -9999,
                },
                {
                  text: "Seal envelope encryption keeps key material client-side; the platform never sees plaintext.",
                  citation: "[chunk 89]",
                  startFrame: -9999,
                },
                {
                  text: "Knowledge index updates as new objects arrive — no manual reindex.",
                  citation: "[chunk 112]",
                  startFrame: -9999,
                },
              ]}
              caretOn={false}
            />
          </div>

          <div
            style={{
              opacity: mcpOpacity,
              transform: `scale(${mcpScale})`,
              filter: `blur(${mcpBlur}px)`,
              willChange: "transform, opacity, filter",
            }}
          >
            <MCPWindow toolStaggerStart={24} toolStaggerStep={6} />
          </div>
        </div>

        <div
          style={{
            opacity: taglineOpacity,
            fontFamily: fonts.sans,
            fontSize: fs.h2,
            fontWeight: weight.regular,
            color: color.cream,
            letterSpacing: tracking.body,
            textAlign: "center",
            maxWidth: 1400,
          }}
        >
          One agent. Your chat, Claude Desktop, Cursor. Same tools, same files.
        </div>
      </div>
    </AbsoluteFill>
  );
};
