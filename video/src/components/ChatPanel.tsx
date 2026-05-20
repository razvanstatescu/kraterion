import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

export type AssistantBullet = {
  text: string;
  citation: string;
  /** Frame this bullet starts revealing, relative to ChatPanel mount. */
  startFrame: number;
};

type Props = {
  width?: number;
  height?: number;
  userMessage: string;
  userMessageStartFrame: number;
  assistantStartFrame: number;
  bullets: AssistantBullet[];
  caretOn?: boolean;
  shadowColor?: string;
};

const TYPE_CHARS_PER_FRAME = 1.6;

const TypedLine: React.FC<{
  text: string;
  startFrame: number;
  style?: React.CSSProperties;
}> = ({ text, startFrame, style }) => {
  const frame = useCurrentFrame();
  const typed = Math.max(
    0,
    Math.min(text.length, Math.floor((frame - startFrame) * TYPE_CHARS_PER_FRAME)),
  );
  return <span style={style}>{text.slice(0, typed)}</span>;
};

export const ChatPanel: React.FC<Props> = ({
  width = 880,
  height = 580,
  userMessage,
  userMessageStartFrame,
  assistantStartFrame,
  bullets,
  caretOn = true,
  shadowColor,
}) => {
  const frame = useCurrentFrame();

  const lastBullet = bullets[bullets.length - 1];
  const lastBulletEnd = lastBullet
    ? lastBullet.startFrame +
      Math.ceil(
        (lastBullet.text.length + lastBullet.citation.length + 3) /
          TYPE_CHARS_PER_FRAME,
      )
    : assistantStartFrame;
  const caretVisible =
    caretOn &&
    frame >= assistantStartFrame &&
    frame <= lastBulletEnd + 8 &&
    Math.floor(frame / 8) % 2 === 0;

  const userAppear = interpolate(
    frame - userMessageStartFrame,
    [0, 10],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width,
        height,
        background: color.cream,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.window,
        boxShadow: cardShadow({ offset: 12, color: shadowColor ?? color.krater }),
        padding: space[8],
        display: "flex",
        flexDirection: "column",
        gap: space[6],
        fontFamily: fonts.sans,
        color: color.ink,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: color.stone[500],
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: weight.bold,
        }}
      >
        Chat · research-assistant
      </div>

      {/* User bubble */}
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "75%",
          padding: `${space[3]}px ${space[4]}px`,
          background: color.ink,
          color: color.cream,
          border: `2px solid ${color.ink}`,
          borderRadius: radius.card,
          fontSize: 22,
          fontWeight: weight.medium,
          opacity: userAppear,
        }}
      >
        {userMessage}
      </div>

      {/* Assistant reply */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space[3],
          color: color.ink,
          fontSize: 22,
          lineHeight: 1.4,
          fontWeight: weight.medium,
        }}
      >
        {bullets.map((b, i) => {
          const isLast = i === bullets.length - 1;
          const bulletLineEnd =
            b.startFrame + Math.ceil(b.text.length / TYPE_CHARS_PER_FRAME);
          return (
            <div key={i} style={{ display: "flex", gap: space[3] }}>
              <span style={{ color: color.krater, fontWeight: weight.bold }}>—</span>
              <span>
                <TypedLine text={b.text} startFrame={b.startFrame} />
                <span style={{ color: color.stone[500], marginLeft: 6, fontFamily: fonts.mono, fontSize: 18 }}>
                  <TypedLine
                    text={` ${b.citation}`}
                    startFrame={bulletLineEnd}
                  />
                </span>
                {isLast && caretVisible && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 3,
                      height: 24,
                      background: color.krater,
                      marginLeft: 6,
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
