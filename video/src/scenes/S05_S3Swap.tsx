import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { CodeBlock, CodeLine } from "../components/CodeBlock";
import { WordReveal } from "../components/WordReveal";

const lines: CodeLine[] = [
  {
    text: "import boto3",
    startFrame: 12,
  },
  {
    text: "",
    startFrame: 36,
  },
  {
    text: "s3 = boto3.client(",
    startFrame: 48,
  },
  {
    text: "  endpoint_url=\"https://s3.amazonaws.com\",",
    startFrame: 84,
    highlight: {
      find: "s3.amazonaws.com",
      swapStartFrame: 240, // ~ 00:40 inside scene
      replaceWith: "api.kraterion.xyz",
      replaceColor: color.krater,
    },
  },
  {
    text: ")",
    startFrame: 168,
  },
];

export const S05_S3Swap: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: color.ink,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
        padding: "0 200px",
        color: color.cream,
        fontFamily: fonts.sans,
      }}
    >
      <CodeBlock lines={lines} background="ink" width={1200} />
      <div
        style={{
          fontSize: fs.body,
          color: color.stone[300],
          fontWeight: weight.regular,
          letterSpacing: "-0.01em",
          textAlign: "center",
          maxWidth: 1100,
        }}
      >
        <WordReveal
          text="Point your existing code at Kraterion. The SDK doesn't change."
          delay={420}
        />
      </div>
    </AbsoluteFill>
  );
};
