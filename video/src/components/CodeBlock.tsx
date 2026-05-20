import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, size as fs, tracking } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

export type CodeLine = {
  text: string;
  startFrame: number;
  highlight?: {
    find: string;
    swapStartFrame: number;
    replaceWith: string;
    replaceColor: string;
  };
};

type Props = {
  lines: CodeLine[];
  msPerChar?: number;
  surface?: "ink" | "cream";
  width?: number;
  showShadow?: boolean;
};

const TYPE_MS_PER_CHAR_DEFAULT = 30;
const MAX_TYPE_FRAMES_PER_LINE = 16;

export const CodeBlock: React.FC<Props> = ({
  lines,
  msPerChar = TYPE_MS_PER_CHAR_DEFAULT,
  surface = "ink",
  width = 1080,
  showShadow = true,
}) => {
  const frame = useCurrentFrame();
  const bg = surface === "ink" ? color.ink : color.cream;
  const fg = surface === "ink" ? color.cream : color.ink;
  const border = surface === "ink" ? color.cream : color.ink;

  const framesPerChar = Math.max(1, Math.round((msPerChar / 1000) * 30));

  return (
    <div
      style={{
        width,
        background: bg,
        color: fg,
        border: `2px solid ${border}`,
        borderRadius: radius.card,
        boxShadow: showShadow
          ? cardShadow({ offset: 12, color: color.krater })
          : undefined,
        padding: `${space[6]}px ${space[8]}px`,
        fontFamily: fonts.mono,
        fontSize: fs.code,
        lineHeight: 1.55,
        letterSpacing: tracking.code,
        fontVariantLigatures: "none",
      }}
    >
      {lines.map((line, lineIdx) => {
        if (line.text.length === 0) {
          return (
            <div key={lineIdx} style={{ height: "1.55em" }} aria-hidden />
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
          const swapSpan = Math.max(findLen, replaceLen);

          if (findIdx >= 0 && swapSpan > 0 && typed >= findIdx + findLen) {
            const beforeSwap = line.text.slice(0, findIdx);
            const afterSwap = line.text.slice(findIdx + findLen);

            const replaceChars = Math.max(
              0,
              Math.min(
                swapSpan,
                Math.round(
                  interpolate(
                    swapLocalFrame,
                    [0, swapSpan * framesPerChar],
                    [0, swapSpan],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                ),
              ),
            );

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
                <span style={{ color: line.highlight.replaceColor, fontWeight: 700 }}>
                  {replacedPart}
                </span>
                <span style={{ opacity: 0.45 }}>{remainingOriginal}</span>
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
