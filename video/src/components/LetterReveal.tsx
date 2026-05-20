import React from "react";
import { useCurrentFrame, interpolate, useVideoConfig } from "remotion";

type Props = {
  text: string;
  delay?: number;
  msPerChar?: number;
  fadeFrames?: number;
  highlightLastCharFrame?: number;
  highlightColor?: string;
  style?: React.CSSProperties;
};

export const LetterReveal: React.FC<Props> = ({
  text,
  delay = 0,
  msPerChar = 40,
  fadeFrames = 6,
  highlightLastCharFrame,
  highlightColor,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerChar = Math.max(1, Math.round((msPerChar / 1000) * fps));
  const letters = Array.from(text);

  return (
    <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>
      {letters.map((ch, i) => {
        const localFrame = frame - (delay + i * framesPerChar);
        const opacity = interpolate(localFrame, [0, fadeFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const isLast = i === letters.length - 1;
        const showHighlight =
          isLast &&
          highlightLastCharFrame !== undefined &&
          frame === highlightLastCharFrame;

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              color: showHighlight ? highlightColor : undefined,
              willChange: "opacity",
            }}
          >
            {ch === " " ? " " : ch}
          </span>
        );
      })}
    </span>
  );
};
