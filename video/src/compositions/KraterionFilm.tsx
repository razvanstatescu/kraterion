import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { color } from "../tokens/color";
import { fonts } from "../tokens/type";
import { MusicBed } from "../audio/MusicBed";
import { scenes, TRANSITION_FRAMES } from "../motion/timing";

import { S00_Problem } from "../scenes/S00_Problem";
import { S01_Promise } from "../scenes/S01_Promise";
import { S02_S3Swap } from "../scenes/S02_S3Swap";
import { S03_Buckets } from "../scenes/S03_Buckets";
import { S04_Knowledge } from "../scenes/S04_Knowledge";
import { S05_Agents } from "../scenes/S05_Agents";
import { S06_RAG } from "../scenes/S06_RAG";
import { S07_MCP } from "../scenes/S07_MCP";
import { S08_Billing } from "../scenes/S08_Billing";

/**
 * KraterionFilm — v5. 9 sequential beats, ~74.5 s total.
 *
 *   S00 Problem       — "Your storage isn't yours."        (4 s)
 *   S01 Shift         — "Until now."                        (3 s)  ← FADE
 *   S02 Slam          — "Kraterion." + mark                 (5 s)
 *   S03 Identity      — Smart object storage / humans+agents (11 s)
 *   S04 Verifiable    — Lattice forms, on-chain proof        (9 s)
 *   S05 Agents        — OpenAI-compatible                     (8 s)
 *   S06 MCP           — Works in Claude. And Cursor.          (9 s)
 *   S07 WOW Orbit     — Walrus+Sui+Seal collapse → mark      (17 s)  ← FADE
 *   S08 Close         — "Object storage. Stays yours."        (9 s)
 *
 * Act-boundary fades: S00→S01 (problem→answer) and S07→S08 (wow→close).
 * Everything else is a hard cut, per research.
 */
const fadeTransition = (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
  />
);

export const KraterionFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: color.cream, fontFamily: fonts.sans }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={scenes.S00_Problem.duration}>
          <S00_Problem />
        </TransitionSeries.Sequence>

        {fadeTransition}
        <TransitionSeries.Sequence durationInFrames={scenes.S01_Promise.duration}>
          <S01_Promise />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S02_S3Swap.duration}>
          <S02_S3Swap />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S03_Buckets.duration}>
          <S03_Buckets />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S04_Knowledge.duration}>
          <S04_Knowledge />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S05_Agents.duration}>
          <S05_Agents />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S06_RAG.duration}>
          <S06_RAG />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={scenes.S07_MCP.duration}>
          <S07_MCP />
        </TransitionSeries.Sequence>

        {fadeTransition}
        <TransitionSeries.Sequence durationInFrames={scenes.S08_Billing.duration}>
          <S08_Billing />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <MusicBed />
    </AbsoluteFill>
  );
};
