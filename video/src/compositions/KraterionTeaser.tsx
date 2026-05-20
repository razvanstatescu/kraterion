import React from "react";
import { AbsoluteFill, Series, Sequence, staticFile, interpolate } from "remotion";
import { Audio } from "@remotion/media";
import { color } from "../tokens/color";
import { fonts } from "../tokens/type";

import { S01_ColdOpen } from "../scenes/S01_ColdOpen";
import { S04_Pivot } from "../scenes/S04_Pivot";
import { S09_HeroTitle } from "../scenes/S09_HeroTitle";
import { S10_AgentChat } from "../scenes/S10_AgentChat";
import { S12_Outro } from "../scenes/S12_Outro";

/**
 * 30-second teaser cut — total 900 frames @ 30fps.
 * Mix: S01 cold open + S04 pivot + S09 hero title + abridged S10 chat + S12 outro.
 */
export const KraterionTeaser: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: color.cream, fontFamily: fonts.sans }}>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <S01_ColdOpen />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <S04_Pivot />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <S09_HeroTitle />
        </Series.Sequence>
        <Series.Sequence durationInFrames={360}>
          <S10_AgentChat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <S12_Outro />
        </Series.Sequence>
      </Series>

      {/* Single track for the teaser: climax track (C). */}
      <Sequence from={30} durationInFrames={870} layout="none">
        <Audio
          src={staticFile("music/track-c-climax.mp3")}
          volume={(f) =>
            interpolate(
              f,
              [0, 45, 800, 870],
              [0, 0.65, 0.65, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      </Sequence>
    </AbsoluteFill>
  );
};
