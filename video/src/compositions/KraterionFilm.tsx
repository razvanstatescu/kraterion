import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { color } from "../tokens/color";
import { fonts } from "../tokens/type";
import { MusicBed } from "../audio/MusicBed";
import { scenes } from "../motion/timing";

import { S01_ColdOpen } from "../scenes/S01_ColdOpen";
import { S02_MarkReveal } from "../scenes/S02_MarkReveal";
import { S03_StatusQuo } from "../scenes/S03_StatusQuo";
import { S04_Pivot } from "../scenes/S04_Pivot";
import { S05_S3Swap } from "../scenes/S05_S3Swap";
import { S06_SuiWalrusSeal } from "../scenes/S06_SuiWalrusSeal";
import { S07_Dashboard } from "../scenes/S07_Dashboard";
import { S08_ToggleKnowledge } from "../scenes/S08_ToggleKnowledge";
import { S09_HeroTitle } from "../scenes/S09_HeroTitle";
import { S10_AgentChat } from "../scenes/S10_AgentChat";
import { S11_MCP } from "../scenes/S11_MCP";
import { S12_Outro } from "../scenes/S12_Outro";
import { S13_FadeOut } from "../scenes/S13_FadeOut";

export const KraterionFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: color.cream, fontFamily: fonts.sans }}>
      <Series>
        <Series.Sequence durationInFrames={scenes.S01_ColdOpen.duration}>
          <S01_ColdOpen />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S02_MarkReveal.duration}>
          <S02_MarkReveal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S03_StatusQuo.duration}>
          <S03_StatusQuo />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S04_Pivot.duration}>
          <S04_Pivot />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S05_S3Swap.duration}>
          <S05_S3Swap />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S06_SuiWalrusSeal.duration}>
          <S06_SuiWalrusSeal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S07_Dashboard.duration}>
          <S07_Dashboard />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S08_ToggleKnowledge.duration}>
          <S08_ToggleKnowledge />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S09_HeroTitle.duration}>
          <S09_HeroTitle />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S10_AgentChat.duration}>
          <S10_AgentChat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S11_MCP.duration}>
          <S11_MCP />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S12_Outro.duration}>
          <S12_Outro />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S13_FadeOut.duration}>
          <S13_FadeOut />
        </Series.Sequence>
      </Series>

      <MusicBed />
    </AbsoluteFill>
  );
};
