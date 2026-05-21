import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ApertureMark } from "../components/ApertureMark";
import { ScaleSettle, LetterStagger } from "../components/Entrances";
import { EASE_BRAND } from "../motion/easings";

/**
 * S08 — CLOSE (9 s). "Object storage. Stays yours."
 *
 * The aperture mark from the WOW orbit carries through as the match-cut
 * anchor. It scales up slightly here and recentres. Tagline letter-
 * staggers in below; URL types into place last.
 */
export const S08_Billing: React.FC = () => {
  const frame = useCurrentFrame();

  const MARK_IN = 0;
  const TAGLINE_IN = 18;
  const TAGLINE_2_IN = 48;
  const URL_IN = 96;

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[8],
      }}
    >
      <ScaleSettle startFrame={MARK_IN} fromScale={1.06}>
        <ApertureMark
          size={140}
          variant="light"
          delay={MARK_IN + 2}
          drawDurationFrames={20}
          staggerFrames={6}
          fillDurationFrames={12}
        />
      </ScaleSettle>

      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontSize: fs.display,
            fontWeight: weight.regular,
            letterSpacing: tracking.display,
            color: color.ink,
            lineHeight: 0.95,
          }}
        >
          <LetterStagger text="Object storage." startFrame={TAGLINE_IN} stagger={2} fromY={28} />
        </h1>
        <h1
          style={{
            margin: 0,
            marginTop: space[2],
            fontFamily: fonts.sans,
            fontSize: fs.display,
            fontWeight: weight.regular,
            letterSpacing: tracking.display,
            color: color.stone[600],
            lineHeight: 0.95,
          }}
        >
          <LetterStagger text="Stays yours." startFrame={TAGLINE_2_IN} stagger={2} fromY={28} />
        </h1>
      </div>

      <div
        style={{
          opacity: interpolate(frame, [URL_IN, URL_IN + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          }),
          fontFamily: fonts.mono,
          fontSize: fs.h3,
          color: color.stone[600],
          marginTop: space[6],
        }}
      >
        kraterion.com
      </div>
    </AbsoluteFill>
  );
};
