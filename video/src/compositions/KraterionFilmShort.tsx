import React from "react";
import { AbsoluteFill, Series, Sequence, staticFile, interpolate } from "remotion";
import { Audio } from "@remotion/media";
import { color } from "../tokens/color";
import { fonts } from "../tokens/type";

import { S01_ColdOpen } from "../scenes/S01_ColdOpen";
import { S02_MarkReveal } from "../scenes/S02_MarkReveal";
import { S04_Pivot } from "../scenes/S04_Pivot";
import { S05_S3Swap } from "../scenes/S05_S3Swap";
import { S06_SuiWalrusSeal } from "../scenes/S06_SuiWalrusSeal";
import { S07_Dashboard } from "../scenes/S07_Dashboard";
import { S08_ToggleKnowledge } from "../scenes/S08_ToggleKnowledge";
import { S09_HeroTitle } from "../scenes/S09_HeroTitle";
import { S10_AgentChat } from "../scenes/S10_AgentChat";
import { S11_MCP } from "../scenes/S11_MCP";
import { S12_Outro } from "../scenes/S12_Outro";

/**
 * 2-minute fallback cut (3600 frames) — matches Appendix B of the plan.
 */
export const KraterionFilmShort: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: color.cream, fontFamily: fonts.sans }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <S01_ColdOpen />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <S02_MarkReveal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <S04_Pivot />
        </Series.Sequence>
        <Series.Sequence durationInFrames={600}>
          <S05_S3Swap />
        </Series.Sequence>
        <Series.Sequence durationInFrames={360}>
          <S06_SuiWalrusSeal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <S07_Dashboard />
        </Series.Sequence>
        <Series.Sequence durationInFrames={480}>
          <S08_ToggleKnowledge />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <S09_HeroTitle />
        </Series.Sequence>
        <Series.Sequence durationInFrames={720}>
          <S10_AgentChat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={360}>
          <S11_MCP />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <S12_Outro />
        </Series.Sequence>
      </Series>

      {/* Two-track simplified bed for the short cut */}
      <Sequence from={60} durationInFrames={1140} layout="none">
        <Audio
          src={staticFile("music/track-b-build.mp3")}
          volume={(f) =>
            interpolate(f, [0, 60, 1080, 1140], [0, 0.55, 0.55, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      </Sequence>
      <Sequence from={1200} durationInFrames={2400} layout="none">
        <Audio
          src={staticFile("music/track-c-climax.mp3")}
          volume={(f) =>
            interpolate(f, [0, 60, 2100, 2400], [0, 0.65, 0.65, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      </Sequence>
    </AbsoluteFill>
  );
};
