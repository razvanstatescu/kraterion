import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { KnowledgeToggle } from "../components/KnowledgeToggle";
import { IndexingProgress } from "../components/IndexingProgress";

const TOGGLE_FRAME = 90;

export const S08_ToggleKnowledge: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[12],
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: fs.h2,
          color: color.ink,
          letterSpacing: tracking.title,
          fontWeight: weight.medium,
        }}
      >
        research-notes/
      </div>

      <KnowledgeToggle toggleFrame={TOGGLE_FRAME} />

      <div style={{ width: 520 }}>
        <IndexingProgress
          steps={[
            {
              label: "Indexing 142 chunks",
              appearAt: TOGGLE_FRAME + 30,
            },
            {
              label: "Embedding · 0.34s/chunk",
              appearAt: TOGGLE_FRAME + 130,
            },
            {
              label: "Ready",
              appearAt: TOGGLE_FRAME + 250,
              emphasis: true,
            },
          ]}
        />
      </div>
    </AbsoluteFill>
  );
};
