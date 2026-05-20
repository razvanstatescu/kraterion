import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ApertureMark } from "../components/ApertureMark";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { SpringBounce } from "../components/SpringBounce";
import { ForwardZoom } from "../components/ForwardZoom";
import { Chip } from "../components/Chip";
import { BAR, BEAT } from "../motion/timing";
import { BOUNCE } from "../motion/springs";

/**
 * Close — 9 bars (~17.5 s). Callback to the Problem scene's indictment,
 * inverted to land the brand. Per research: end on a URL, not on a logo.
 *
 *   bar 1: "Your storage." appears, krater-orange word "isn't" briefly
 *          appears struck through, then dissolves — inversion of the opener
 *   bar 2: line resolves to "Your storage."
 *   bar 3: "Yours." in big Bricolage krater orange lands beneath
 *   bar 4: aperture mark draws in beside the lines
 *   bar 5: URL "kraterion.xyz" types out
 *   bar 6: small "FOR SUI OVERFLOW 2026" + "BUILT ON SUI" marks appear
 *   bar 7-8: hold + subtle beat pulse
 *   bar 9: fade-to-ink
 */
export const S09_Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(BAR * 9);

  const callbackFrame = 0;
  const resolveFrame = Math.round(BAR * 1);
  const yoursFrame = Math.round(BAR * 2);
  const apertureFrame = Math.round(BAR * 3);
  const urlFrame = Math.round(BAR * 4);
  const marksFrame = Math.round(BAR * 5);
  const fadeStart = Math.round(BAR * 8);

  // Callback line: "Your storage [isn't yours]." → "Your storage."
  const callbackOpacity = interpolate(frame, [callbackFrame, callbackFrame + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Strikethrough on "isn't yours" fades in then out
  const strikeOpacity = interpolate(
    frame,
    [callbackFrame + 16, resolveFrame - 4, resolveFrame + 6],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Width of the strike span — collapses to 0 so the period sits flush after "storage."
  const strikeWidth = interpolate(
    frame,
    [callbackFrame + 16, resolveFrame - 4, resolveFrame + 12],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // URL typing
  const urlText = "kraterion.xyz";
  const typed = Math.max(
    0,
    Math.min(urlText.length, Math.floor((frame - urlFrame) * 1.6)),
  );

  const fadeOpacity = interpolate(frame, [fadeStart, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: color.ink, overflow: "hidden" }}>
      <BackgroundGrid opacity={0.08} flashOnBeat />
      <ForwardZoom durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: space[6],
          }}
        >
          {/* Aperture mark on top */}
          {frame >= apertureFrame && (
            <SpringBounce startFrame={apertureFrame} fromScale={0.35} rotateDeg={4}>
              <ApertureMark
                size={180}
                stroke={color.cream}
                drawDurationFrames={1}
                staggerFrames={0}
                fillInner
                fillStartFrame={apertureFrame}
                fillColor={color.krater}
              />
            </SpringBounce>
          )}

          {/* Callback line */}
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 116,
              fontWeight: weight.bold,
              letterSpacing: tracking.display,
              color: color.cream,
              textAlign: "center",
              lineHeight: 0.95,
              fontVariationSettings: "'wonk' 1",
              opacity: callbackOpacity,
            }}
          >
            Your storage
            <span
              style={{
                display: "inline-block",
                verticalAlign: "baseline",
                overflow: "hidden",
                whiteSpace: "nowrap",
                opacity: strikeOpacity,
                color: color.stone[500],
                textDecoration: "line-through",
                maxWidth: `${strikeWidth * 11}em`,
                willChange: "max-width, opacity",
              }}
            >
              &nbsp;isn't&nbsp;yours
            </span>
            <span>.</span>
          </div>

          {/* "Yours." in krater orange */}
          {frame >= yoursFrame && (
            <SpringBounce startFrame={yoursFrame} fromScale={0.65} rotateDeg={-2}>
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: 200,
                  fontWeight: weight.bold,
                  letterSpacing: tracking.display,
                  color: color.krater,
                  lineHeight: 0.92,
                  fontVariationSettings: "'wonk' 1",
                }}
              >
                Yours.
              </div>
            </SpringBounce>
          )}

          {/* URL */}
          {frame >= urlFrame && (
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 56,
                color: color.cream,
                fontWeight: weight.bold,
                marginTop: space[4],
              }}
            >
              {urlText.slice(0, typed)}
              {typed < urlText.length && (
                <span style={{ color: color.krater }}>▍</span>
              )}
            </div>
          )}

          {/* Small marks: built on Sui + Overflow */}
          {frame >= marksFrame && (
            <div
              style={{
                display: "flex",
                gap: space[3],
                marginTop: space[4],
              }}
            >
              <Chip
                startFrame={marksFrame}
                surface="ink"
                shadowColor={color.cream}
                mono
              >
                BUILT ON SUI
              </Chip>
              <Chip
                startFrame={marksFrame + 6}
                surface="ink"
                shadowColor={color.krater}
                dotColor={color.krater}
                mono
              >
                SUI OVERFLOW 2026
              </Chip>
            </div>
          )}
        </AbsoluteFill>

        {/* Fade-to-ink overlay */}
        <AbsoluteFill style={{ background: color.ink, opacity: fadeOpacity }} />
      </ForwardZoom>
    </AbsoluteFill>
  );
};
