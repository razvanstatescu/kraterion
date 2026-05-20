import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BOUNCE } from "../motion/springs";

/**
 * Premium dashboard table — modeled on the real apps/dashboard/BucketsList:
 *   Name | Visibility | API access | Objects | Storage | Created
 *
 * Conforms to the launch-video research:
 *   - 40 px row height
 *   - tabular-nums on numeric columns
 *   - dot + label status pills (Linear style)
 *   - single accent (Krater orange) appears only on active-row left bar
 *   - one Knowledge chip inline in the Name column
 *   - hover state can be DRIVEN by parent (cursor anticipation 4–6 frames before click)
 */

export type Visibility = "private" | "public";
export type ApiAccess = "granted" | "revoked";

export type BucketRowData = {
  name: string;
  visibility: Visibility;
  apiAccess: ApiAccess;
  objects: number;
  storage: string;
  created: string;
  hasKnowledge?: boolean;
};

type Props = {
  rows: BucketRowData[];
  /** Frame at which each row begins entering (relative to component mount). */
  rowStagger?: { start: number; perRow: number };
  /** Index of the row currently being hovered (cursor anticipation). */
  hoveredIndex?: number;
  /** Frame when hover state becomes visible (4–6 frames before cursor lands). */
  hoverStartFrame?: number;
  /** Index of the row to fade OUT (during row-expand morph) — all OTHER rows fade. */
  expandingIndex?: number;
  /** Frame when the morph (other rows fade + clicked row expands) begins. */
  morphStartFrame?: number;
  /** Width in px. */
  width?: number;
};

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 38;

const COL_WIDTHS = {
  name: 360,
  visibility: 140,
  api: 160,
  objects: 110,
  storage: 110,
  created: 130,
};

export const BucketsTable: React.FC<Props> = ({
  rows,
  rowStagger = { start: 12, perRow: 4 },
  hoveredIndex,
  hoverStartFrame = 0,
  expandingIndex,
  morphStartFrame,
  width = 1320,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width,
        background: color.cream,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.window,
        boxShadow: cardShadow({ offset: 14, color: color.krater }),
        overflow: "hidden",
        fontFamily: fonts.sans,
        color: color.ink,
      }}
    >
      {/* Page header inside the card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${space[4]}px ${space[6]}px`,
          borderBottom: `2px solid ${color.ink}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Tiny aperture */}
          <svg width={20} height={20} viewBox="0 0 20 20">
            <circle cx={10} cy={10} r={8} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={10} cy={10} r={5} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={10} cy={10} r={1.6} fill={color.krater} />
          </svg>
          <span style={{ fontFamily: fonts.display, fontWeight: weight.bold, fontSize: 20, letterSpacing: "-0.015em" }}>
            Kraterion
          </span>
          <span
            style={{
              marginLeft: 12,
              fontSize: 14,
              color: color.stone[500],
              fontFamily: fonts.mono,
            }}
          >
            / buckets
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

      {/* Filter / new-bucket row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${space[3]}px ${space[6]}px`,
          borderBottom: `1.5px solid ${color.hairlineLight}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: color.stone[100],
            borderRadius: 6,
            minWidth: 240,
          }}
        >
          <span style={{ fontSize: 14, color: color.stone[500] }}>⌕</span>
          <span style={{ fontSize: 13, color: color.stone[500], fontFamily: fonts.mono }}>filter buckets</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            background: color.ink,
            color: color.cream,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: weight.medium,
            fontFamily: fonts.display,
            letterSpacing: "-0.005em",
          }}
        >
          + New bucket
        </div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: HEADER_HEIGHT,
          padding: `0 ${space[6]}px`,
          fontSize: 11,
          color: color.stone[500],
          fontWeight: weight.medium,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          borderBottom: `1.5px solid ${color.hairlineLight}`,
        }}
      >
        <div style={{ width: COL_WIDTHS.name }}>Name</div>
        <div style={{ width: COL_WIDTHS.visibility }}>Visibility</div>
        <div style={{ width: COL_WIDTHS.api }}>API access</div>
        <div style={{ width: COL_WIDTHS.objects, textAlign: "right" }}>Objects</div>
        <div style={{ width: COL_WIDTHS.storage, textAlign: "right" }}>Storage</div>
        <div style={{ width: COL_WIDTHS.created, textAlign: "right" }}>Created</div>
      </div>

      {/* Body */}
      <div style={{ position: "relative" }}>
        {rows.map((r, i) => (
          <BucketTableRow
            key={r.name}
            row={r}
            index={i}
            appearAt={rowStagger.start + i * rowStagger.perRow}
            hovered={hoveredIndex === i && frame >= hoverStartFrame}
            otherIsExpanding={expandingIndex !== undefined && expandingIndex !== i}
            morphStartFrame={morphStartFrame ?? Infinity}
          />
        ))}
      </div>
    </div>
  );
};

const BucketTableRow: React.FC<{
  row: BucketRowData;
  index: number;
  appearAt: number;
  hovered: boolean;
  otherIsExpanding: boolean;
  morphStartFrame: number;
}> = ({ row, index, appearAt, hovered, otherIsExpanding, morphStartFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sIn = spring({ frame: frame - appearAt, fps, config: BOUNCE });
  const entryOpacity = interpolate(sIn, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const entryY = interpolate(sIn, [0, 1], [8, 0]);

  // Morph fade-out (research: per-row stagger of 1 frame for peel-away)
  const peelStart = morphStartFrame + index * 1;
  const peelFade = otherIsExpanding
    ? interpolate(frame, [peelStart, peelStart + 5], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const peelY = otherIsExpanding
    ? interpolate(frame, [peelStart, peelStart + 8], [0, index < 1 ? -12 : 12], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const visibility = row.visibility;
  const apiAccess = row.apiAccess;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        padding: `0 ${space[6]}px`,
        position: "relative",
        background: hovered ? color.stone[100] : "transparent",
        opacity: entryOpacity * peelFade,
        transform: `translateY(${entryY + peelY}px)`,
        willChange: "transform, opacity, background",
        borderBottom: index < 4 ? `1px solid ${color.hairlineLight}` : "none",
      }}
    >
      {/* Active/hover left indicator */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 3,
            background: color.krater,
            borderRadius: 2,
          }}
        />
      )}

      {/* Name */}
      <div
        style={{
          width: COL_WIDTHS.name,
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 14, color: color.stone[500], flexShrink: 0 }}>📁</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: weight.medium,
            color: color.ink,
            fontFamily: fonts.mono,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.name}
        </span>
        {row.hasKnowledge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: weight.bold,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: color.krater,
              border: `1.5px solid ${color.krater}`,
              borderRadius: 999,
              padding: "1px 8px",
              background: "transparent",
              fontFamily: fonts.display,
              flexShrink: 0,
            }}
          >
            KNOWLEDGE
          </span>
        )}
      </div>

      {/* Visibility */}
      <div style={{ width: COL_WIDTHS.visibility }}>
        <StatusPill
          dot={visibility === "private" ? color.stone[500] : "#3B6F73"}
          label={visibility === "private" ? "Private" : "Public"}
        />
      </div>

      {/* API access */}
      <div style={{ width: COL_WIDTHS.api }}>
        <StatusPill
          dot={apiAccess === "granted" ? "#9BC265" : "#B53D2E"}
          label={apiAccess === "granted" ? "Granted" : "Revoked"}
        />
      </div>

      {/* Objects */}
      <div
        style={{
          width: COL_WIDTHS.objects,
          textAlign: "right",
          fontSize: 14,
          color: color.stone[500],
          fontVariantNumeric: "tabular-nums",
          fontWeight: weight.medium,
        }}
      >
        {row.objects.toLocaleString()}
      </div>

      {/* Storage */}
      <div
        style={{
          width: COL_WIDTHS.storage,
          textAlign: "right",
          fontSize: 14,
          color: color.stone[500],
          fontVariantNumeric: "tabular-nums",
          fontWeight: weight.medium,
        }}
      >
        {row.storage}
      </div>

      {/* Created */}
      <div
        style={{
          width: COL_WIDTHS.created,
          textAlign: "right",
          fontSize: 14,
          color: color.stone[500],
          fontWeight: weight.regular,
        }}
      >
        {row.created}
      </div>
    </div>
  );
};

const StatusPill: React.FC<{ dot: string; label: string }> = ({ dot, label }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 13,
      color: color.ink,
      fontWeight: weight.medium,
    }}
  >
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: dot,
      }}
    />
    {label}
  </span>
);
