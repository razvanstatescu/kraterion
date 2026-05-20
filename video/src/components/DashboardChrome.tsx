import React from "react";
import { color } from "../tokens/color";
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
  width = 1620,
  height = 920,
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
        border: `1px solid ${color.hairlineLight}`,
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "56px 1fr",
        gridTemplateColumns: "260px 1fr",
        fontFamily: fonts.sans,
        color: color.ink,
      }}
    >
      {/* Title bar — spans both columns */}
      <div
        style={{
          gridColumn: "1 / span 2",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${space[6]}px`,
          borderBottom: `1px solid ${color.hairlineLight}`,
          background: color.cream,
        }}
      >
        <div
          style={{
            fontSize: fs.caption,
            fontWeight: weight.medium,
            letterSpacing: tracking.body,
            color: color.stone[500],
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[3],
            padding: `${space[1]}px ${space[3]}px`,
            border: `1px solid ${color.hairlineLight}`,
            borderRadius: 999,
            background: color.cream,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: color.stone[100],
              color: color.stone[500],
              fontSize: 11,
              fontWeight: weight.medium,
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
              fontSize: fs.caption,
              color: color.stone[500],
              fontWeight: weight.regular,
            }}
          >
            Signed in with Google
          </span>
        </div>
      </div>

      {/* Sidebar */}
      <div
        style={{
          borderRight: `1px solid ${color.hairlineLight}`,
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
