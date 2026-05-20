import React from "react";
import { color, cardShadow } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

type Props = {
  width?: number;
  height?: number;
  sidebar: React.ReactNode;
  content: React.ReactNode;
  account?: string;
  title?: string;
};

export const DashboardChrome: React.FC<Props> = ({
  width = 1500,
  height = 860,
  sidebar,
  content,
  account = "rs",
  title = "Kraterion",
}) => {
  return (
    <div
      style={{
        width,
        height,
        background: color.cream,
        borderRadius: radius.window,
        border: `2px solid ${color.ink}`,
        boxShadow: cardShadow({ offset: 14, color: color.krater }),
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "60px 1fr",
        gridTemplateColumns: "280px 1fr",
        fontFamily: fonts.sans,
        color: color.ink,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          gridColumn: "1 / span 2",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${space[6]}px`,
          borderBottom: `2px solid ${color.ink}`,
          background: color.cream,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[3],
          }}
        >
          {/* Tiny aperture mark */}
          <svg width={22} height={22} viewBox="0 0 22 22">
            <circle cx={11} cy={11} r={9} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={11} cy={11} r={5.5} fill="none" stroke={color.ink} strokeWidth={1.5} />
            <circle cx={11} cy={11} r={2.5} fill={color.krater} />
          </svg>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 20,
              fontWeight: weight.bold,
              letterSpacing: tracking.title,
              color: color.ink,
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[3],
            padding: `6px ${space[3]}px`,
            border: `1.5px solid ${color.ink}`,
            borderRadius: 999,
            background: color.cream,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: color.ink,
              color: color.cream,
              fontSize: 11,
              fontWeight: weight.semibold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0,
            }}
          >
            {account.toUpperCase()}
          </div>
          <span
            style={{
              fontSize: 14,
              color: color.ink,
              fontWeight: weight.medium,
            }}
          >
            Signed in with Google
          </span>
        </div>
      </div>

      {/* Sidebar */}
      <div
        style={{
          borderRight: `2px solid ${color.ink}`,
          padding: space[6],
          display: "flex",
          flexDirection: "column",
          gap: space[2],
        }}
      >
        {sidebar}
      </div>

      {/* Content */}
      <div style={{ padding: space[8], overflow: "hidden" }}>{content}</div>
    </div>
  );
};
