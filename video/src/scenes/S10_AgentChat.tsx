import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from "remotion";
import { color } from "../tokens/color";
import { space } from "../tokens/spacing";
import { AgentForm } from "../components/AgentForm";
import { ChatPanel } from "../components/ChatPanel";
import { LINEAR_EASE } from "../motion/easings";

/**
 * Two-pane: AgentForm (left) then collapses; ChatPanel (right) slides into focus.
 * Scene length: 1050 frames.
 *
 * 0–360:  form fills (word-by-word reveals)
 * 360–420: form collapses (scale-blur reversed), chat slides into focus
 * 420–end: chat is hero. User message lands ~430; assistant reply at ~480.
 */
const FORM_OUT_START = 360;
const FORM_OUT_END = 420;

export const S10_AgentChat: React.FC = () => {
  const frame = useCurrentFrame();

  // Form transform: stays at 1 then scales/blurs out
  const formScale = interpolate(frame, [FORM_OUT_START, FORM_OUT_END], [1, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const formBlur = interpolate(frame, [FORM_OUT_START, FORM_OUT_END], [0, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const formOpacity = interpolate(
    frame,
    [FORM_OUT_START, FORM_OUT_END],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Chat panel: scale-blur breath as it enters
  const chatLocal = frame - (FORM_OUT_END - 12);
  const chatScale = interpolate(chatLocal, [0, 36], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const chatBlur = interpolate(chatLocal, [0, 36], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const chatOpacity = interpolate(chatLocal, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Agent form (left/center, exits) */}
      {frame < FORM_OUT_END + 4 && (
        <div
          style={{
            position: "absolute",
            opacity: formOpacity,
            transform: `scale(${formScale})`,
            filter: `blur(${formBlur}px)`,
            willChange: "transform, opacity, filter",
            display: "flex",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <AgentForm
            fieldDelays={{ name: 18, model: 96, prompt: 174, buckets: 282 }}
          />
        </div>
      )}

      {/* Chat panel — appears after form clears */}
      <Sequence from={FORM_OUT_END - 12} layout="none">
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              opacity: chatOpacity,
              transform: `scale(${chatScale})`,
              filter: `blur(${chatBlur}px)`,
              willChange: "transform, opacity, filter",
            }}
          >
            <ChatPanel
              width={1100}
              height={620}
              userMessage="Summarize the 3 main findings."
              userMessageStartFrame={28}
              assistantStartFrame={80}
              bullets={[
                {
                  text: "Walrus shards cut storage cost by ~40% vs S3 at equivalent durability.",
                  citation: "[chunk 47]",
                  startFrame: 80,
                },
                {
                  text: "Seal envelope encryption keeps key material client-side; the platform never sees plaintext.",
                  citation: "[chunk 89]",
                  startFrame: 200,
                },
                {
                  text: "Knowledge index updates as new objects arrive — no manual reindex.",
                  citation: "[chunk 112]",
                  startFrame: 320,
                },
              ]}
            />
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
