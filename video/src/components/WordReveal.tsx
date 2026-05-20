import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { GENTLE } from "../motion/springs";

type Props = {
  text: string;
  delay?: number;
  staggerFrames?: number;
  fadeFrames?: number;
  style?: React.CSSProperties;
  as?: "span" | "div" | "p" | "h1" | "h2";
};

export const WordReveal: React.FC<Props> = ({
  text,
  delay = 0,
  staggerFrames = 2,
  fadeFrames = 8,
  style,
  as = "div",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const Tag = as as keyof JSX.IntrinsicElements;

  return (
    <Tag style={{ display: "inline-block", whiteSpace: "pre-wrap", ...style }}>
      {words.map((w, i) => {
        const localStart = delay + i * staggerFrames;
        const localFrame = frame - localStart;
        const opacity = interpolate(localFrame, [0, fadeFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const settle = spring({
          frame: Math.max(0, localFrame),
          fps,
          config: GENTLE,
          from: 2,
          to: 0,
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${settle}px)`,
              willChange: "transform, opacity",
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </Tag>
  );
};
