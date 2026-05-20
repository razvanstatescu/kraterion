import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

type Tab = "files" | "knowledge";

type Props = {
  bucketName: string;
  /** Which tab content is currently visible. Triggers cross-fade + indicator slide. */
  activeTab: Tab;
  /** Frame when the tab transition starts (relative to scene mount). */
  tabSwitchFrame?: number;
  /** Files-tab content. */
  filesContent: React.ReactNode;
  /** Knowledge-tab content. */
  knowledgeContent: React.ReactNode;
  /** Outer card size overrides. */
  width?: number;
  height?: number;
};

/**
 * The bucket detail view: tabs (Files | Knowledge) over a content area.
 * Used in BOTH S03 (end) and S04 (start) so the scene cut is a match cut —
 * the chrome stays in the same position; only the active tab changes.
 *
 * Per research: indicator slides 1–2 frames BEFORE content swap (premium tell),
 * cross-fade 6–8 frames with 2–3 frame overlap.
 */
export const BucketDetailView: React.FC<Props> = ({
  bucketName,
  activeTab,
  tabSwitchFrame,
  filesContent,
  knowledgeContent,
  width = 1320,
  height = 760,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Tab geometry
  const tabWidth = 132;
  const filesX = 0;
  const knowledgeX = tabWidth + 4;

  // If tabSwitchFrame is provided, the indicator starts moving 2 frames early
  let indicatorX = activeTab === "files" ? filesX : knowledgeX;
  let filesOpacity = activeTab === "files" ? 1 : 0;
  let knowledgeOpacity = activeTab === "knowledge" ? 1 : 0;

  if (tabSwitchFrame !== undefined && activeTab === "knowledge") {
    // We're switching FROM files TO knowledge
    const sIndicator = spring({
      frame: frame - (tabSwitchFrame - 2),  // indicator leads by 2 frames
      fps,
      config: { damping: 22, stiffness: 220, mass: 1 },
    });
    indicatorX = interpolate(sIndicator, [0, 1], [filesX, knowledgeX]);

    filesOpacity = interpolate(
      frame,
      [tabSwitchFrame, tabSwitchFrame + 6],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    knowledgeOpacity = interpolate(
      frame,
      [tabSwitchFrame + 3, tabSwitchFrame + 9],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  return (
    <div
      style={{
        width,
        height,
        background: color.cream,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.window,
        boxShadow: cardShadow({ offset: 14, color: color.krater }),
        overflow: "hidden",
        fontFamily: fonts.sans,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${space[4]}px ${space[6]}px`,
          borderBottom: `2px solid ${color.ink}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width={20} height={20} viewBox="0 0 20 20">
            <circle cx={10} cy={10} r={8} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={10} cy={10} r={5} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={10} cy={10} r={1.6} fill={color.krater} />
          </svg>
          <span style={{ fontFamily: fonts.display, fontWeight: weight.bold, fontSize: 20, letterSpacing: "-0.015em" }}>
            Kraterion
          </span>
          <span style={{ marginLeft: 10, fontSize: 14, color: color.stone[500], fontFamily: fonts.mono }}>
            / buckets / <span style={{ color: color.ink }}>{bucketName}</span>
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 12px",
            border: `1.5px solid ${color.ink}`,
            borderRadius: 999,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: color.ink,
              color: color.cream,
              fontSize: 10,
              fontWeight: weight.medium,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            RS
          </span>
          <span style={{ fontSize: 13, color: color.ink, fontWeight: weight.medium }}>razvan@nano-soft.ro</span>
        </div>
      </div>

      {/* Tabs strip */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          padding: `0 ${space[6]}px`,
          borderBottom: `1.5px solid ${color.hairlineLight}`,
          position: "relative",
          height: 48,
        }}
      >
        <Tab label="Files" icon="📁" width={tabWidth} active={activeTab === "files"} />
        <div style={{ width: 4 }} />
        <Tab label="Knowledge" icon="⌕" width={tabWidth} active={activeTab === "knowledge"} />

        {/* Active indicator — slides between tabs */}
        <div
          style={{
            position: "absolute",
            left: space[6] + indicatorX,
            bottom: -1,
            width: tabWidth,
            height: 2,
            background: color.krater,
            willChange: "left",
          }}
        />
      </div>

      {/* Content area — Files and Knowledge cross-fade */}
      <div
        style={{
          flex: 1,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: filesOpacity,
            padding: space[6],
            willChange: "opacity",
          }}
        >
          {filesContent}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: knowledgeOpacity,
            padding: space[6],
            willChange: "opacity",
          }}
        >
          {knowledgeContent}
        </div>
      </div>
    </div>
  );
};

const Tab: React.FC<{ label: string; icon: string; width: number; active: boolean }> = ({
  label,
  icon,
  width,
  active,
}) => (
  <div
    style={{
      width,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      fontSize: 14,
      fontWeight: active ? weight.medium : weight.regular,
      color: active ? color.ink : color.stone[500],
      fontFamily: fonts.sans,
    }}
  >
    <span style={{ fontSize: 14 }}>{icon}</span>
    {label}
  </div>
);
