import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

export type CodeLine = {
  text: string;
  /** Frame at which this line begins typing. */
  startFrame: number;
  /** Optional inline highlight: replace a substring with a colored span. */
  highlight?: {
    /** Substring to find in the line. */
    find: string;
    /** Frame at which the swap starts (per-character reveal). */
    swapStartFrame: number;
    /** Replacement text, same logical position. */
    replaceWith: string;
    /** Color for replaced text (Krater orange). */
    replaceColor: string;
  };
};

type Props = {
  lines: CodeLine[];
  msPerChar?: number;
  background?: "ink" | "cream";
  width?: number;
};

const TYPE_MS_PER_CHAR_DEFAULT = 35;
const MAX_TYPE_FRAMES_PER_LINE = 18; // ~600ms @ 30fps cap

export const CodeBlock: React.FC<Props> = ({
  lines,
  msPerChar = TYPE_MS_PER_CHAR_DEFAULT,
  background = "ink",
  width = 1100,
}) => {
  const frame = useCurrentFrame();
  const bg = background === "ink" ? color.ink : color.cream;
  const fg = background === "ink" ? color.cream : color.ink;
  const border =
    background === "ink" ? color.hairlineDark : color.hairlineLight;

  const framesPerChar = Math.max(1, Math.round((msPerChar / 1000) * 30));

  return (
    <div
      style={{
        width,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: radius.card,
        padding: `${space[8]}px ${space[8]}px`,
        fontFamily: fonts.mono,
        fontSize: fs.code,
        lineHeight: 1.55,
        letterSpacing: tracking.code,
        fontVariantLigatures: "none",
      }}
    >
      {lines.map((line, lineIdx) => {
        // Blank lines act as vertical spacers — no interpolate, just a sized gap.
        if (line.text.length === 0) {
          return (
            <div
              key={lineIdx}
              style={{ height: "1.55em" }}
              aria-hidden
            />
          );
        }

        const localFrame = frame - line.startFrame;
        const totalChars = line.text.length;
        const capForLine = Math.min(
          totalChars * framesPerChar,
          MAX_TYPE_FRAMES_PER_LINE,
        );
        const typed = Math.max(
          0,
          Math.min(
            totalChars,
            Math.round(
              interpolate(localFrame, [0, capForLine], [0, totalChars], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            ),
          ),
        );
        const visible = line.text.slice(0, typed);

        if (line.highlight) {
          const findIdx = line.text.indexOf(line.highlight.find);
          const swapLocalFrame = frame - line.highlight.swapStartFrame;
          const findLen = line.highlight.find.length;
          const replaceLen = line.highlight.replaceWith.length;

          if (findIdx >= 0 && typed >= findIdx + findLen) {
            const beforeSwap = line.text.slice(0, findIdx);
            const afterSwap = line.text.slice(findIdx + findLen);

            const replaceChars = Math.max(
              0,
              Math.min(
                Math.max(findLen, replaceLen),
                Math.round(
                  interpolate(
                    swapLocalFrame,
                    [0, Math.max(findLen, replaceLen) * framesPerChar],
                    [0, Math.max(findLen, replaceLen)],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                ),
              ),
            );

            // Mixed display: replaced prefix in orange, leftover original (light) trails
            const replacedPart = line.highlight.replaceWith.slice(
              0,
              replaceChars,
            );
            const remainingOriginal =
              replaceChars < findLen
                ? line.highlight.find.slice(replaceChars)
                : "";

            return (
              <div key={lineIdx} style={{ whiteSpace: "pre" }}>
                <span>{beforeSwap}</span>
                <span style={{ color: line.highlight.replaceColor }}>
                  {replacedPart}
                </span>
                <span style={{ opacity: 0.55 }}>{remainingOriginal}</span>
                <span>{afterSwap}</span>
              </div>
            );
          }
        }

        return (
          <div key={lineIdx} style={{ whiteSpace: "pre" }}>
            {visible}
          </div>
        );
      })}
    </div>
  );
};
