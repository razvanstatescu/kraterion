import React from "react";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
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
        background: active ? color.stone[100] : "transparent",
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space[3],
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: active ? color.krater : color.stone[300],
          }}
        />
        <span
          style={{
            fontSize: fs.caption,
            fontWeight: active ? weight.medium : weight.regular,
            color: color.ink,
            letterSpacing: 0,
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
            color: color.stone[500],
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {objects !== undefined ? `${objects}` : size}
        </span>
      )}
    </div>
  );
};
