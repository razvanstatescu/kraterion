import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
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
  width = 760,
  height = 520,
  userMessage,
  userMessageStartFrame,
  assistantStartFrame,
  bullets,
  caretOn = true,
}) => {
  const frame = useCurrentFrame();

  // Blinking caret — visible while assistant is typing the last bullet
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
    Math.floor(frame / 12) % 2 === 0;

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
        border: `1px solid ${color.hairlineLight}`,
        borderRadius: radius.window,
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
          fontSize: fs.caption,
          color: color.stone[500],
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontWeight: weight.medium,
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
          background: color.stone[100],
          border: `1px solid ${color.hairlineLight}`,
          borderRadius: radius.card,
          fontSize: fs.body,
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
          color: color.stone[500],
          fontSize: fs.small,
          lineHeight: 1.55,
        }}
      >
        {bullets.map((b, i) => {
          const isLast = i === bullets.length - 1;
          const bulletLineEnd =
            b.startFrame +
            Math.ceil(b.text.length / TYPE_CHARS_PER_FRAME);
          return (
            <div key={i} style={{ display: "flex", gap: space[3] }}>
              <span style={{ color: color.stone[300] }}>—</span>
              <span>
                <TypedLine text={b.text} startFrame={b.startFrame} />
                <span style={{ color: color.stone[300], marginLeft: 6 }}>
                  <TypedLine
                    text={` ${b.citation}`}
                    startFrame={bulletLineEnd}
                  />
                </span>
                {isLast && caretVisible && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 22,
                      background: color.krater,
                      marginLeft: 4,
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
