import React from "react";
import { color } from "../tokens/color";
import { fonts, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";

type Props = {
  name: string;
  size?: string;
  objects?: number;
  active?: boolean;
};

export const BucketRow: React.FC<Props> = ({
  name,
  size,
  objects,
  active = false,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${space[2]}px ${space[3]}px`,
        borderRadius: radius.chip,
        background: active ? color.ink : "transparent",
        border: active ? `1.5px solid ${color.ink}` : "1.5px solid transparent",
        fontFamily: fonts.sans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: active ? color.krater : color.stone[300],
          }}
        />
        <span
          style={{
            fontSize: 18,
            fontWeight: active ? weight.semibold : weight.medium,
            color: active ? color.cream : color.ink,
            fontFamily: fonts.mono,
          }}
        >
          {name}
        </span>
      </div>
      {(size || objects !== undefined) && (
        <span
          style={{
            fontSize: 14,
            color: active ? color.stone[300] : color.stone[500],
            fontVariantNumeric: "tabular-nums",
            fontWeight: weight.medium,
          }}
        >
          {objects !== undefined ? `${objects}` : size}
        </span>
      )}
    </div>
  );
};
