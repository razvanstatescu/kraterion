import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { DashboardChrome } from "../components/DashboardChrome";
import { BucketRow } from "../components/BucketRow";
import { LINEAR_EASE } from "../motion/easings";

export const S07_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  // Pattern 4: scale-blur breath entrance (36 frames)
  const entranceScale = interpolate(frame, [0, 36], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });
  const entranceBlur = interpolate(frame, [0, 36], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: LINEAR_EASE,
  });

  // Pattern 7: slow zoom 1.00 → 1.04 over scene duration (300 frames)
  const slowZoom = interpolate(frame, [36, 300], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${entranceScale * slowZoom})`,
          filter: `blur(${entranceBlur}px)`,
          willChange: "transform, opacity, filter",
        }}
      >
        <DashboardChrome
          sidebar={
            <>
              <div
                style={{
                  fontSize: fs.caption,
                  color: color.stone[500],
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: weight.medium,
                  marginBottom: space[2],
                }}
              >
                Buckets
              </div>
              <BucketRow name="documents/" objects={28} />
              <BucketRow name="research-notes/" objects={142} active />
              <BucketRow name="kraterion-handbook/" objects={7} />
            </>
          }
          content={
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: space[6],
                fontFamily: fonts.sans,
              }}
            >
              <div
                style={{
                  fontSize: fs.h2,
                  fontWeight: weight.medium,
                  color: color.ink,
                  letterSpacing: tracking.title,
                }}
              >
                research-notes/
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                <BucketRow name="2026-overflow-thesis.md" size="14.2 kB" />
                <BucketRow name="walrus-cost-model.md" size="6.8 kB" />
                <BucketRow name="seal-envelope-flow.md" size="11.4 kB" />
                <BucketRow name="dashboard-copy.md" size="3.1 kB" />
              </div>
            </div>
          }
        />
      </div>
    </AbsoluteFill>
  );
};
