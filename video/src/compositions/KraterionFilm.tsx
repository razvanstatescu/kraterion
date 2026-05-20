import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { color } from "../tokens/color";
import { fonts } from "../tokens/type";
import { MusicBed } from "../audio/MusicBed";
import { scenes } from "../motion/timing";

import { S00_Problem } from "../scenes/S00_Problem";
import { S01_Promise } from "../scenes/S01_Promise";
import { S02_S3Swap } from "../scenes/S02_S3Swap";
import { S03_Buckets } from "../scenes/S03_Buckets";
import { S04_Knowledge } from "../scenes/S04_Knowledge";
import { S05_Agents } from "../scenes/S05_Agents";
import { S06_RAG } from "../scenes/S06_RAG";
import { S07_MCP } from "../scenes/S07_MCP";
import { S08_Billing } from "../scenes/S08_Billing";
import { S09_Close } from "../scenes/S09_Close";

export const KraterionFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: color.ink, fontFamily: fonts.sans }}>
      <Series>
        <Series.Sequence durationInFrames={scenes.S00_Problem.duration}>
          <S00_Problem />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S01_Promise.duration}>
          <S01_Promise />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S02_S3Swap.duration}>
          <S02_S3Swap />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S03_Buckets.duration}>
          <S03_Buckets />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S04_Knowledge.duration}>
          <S04_Knowledge />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S05_Agents.duration}>
          <S05_Agents />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S06_RAG.duration}>
          <S06_RAG />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S07_MCP.duration}>
          <S07_MCP />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S08_Billing.duration}>
          <S08_Billing />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scenes.S09_Close.duration}>
          <S09_Close />
        </Series.Sequence>
      </Series>

      <MusicBed />
    </AbsoluteFill>
  );
};
