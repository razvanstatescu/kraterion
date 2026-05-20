import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { LINEAR_EASE } from "../motion/easings";

type Props = {
  width?: number;
  height?: number;
  /** Frame each tool entry appears, relative to component mount. */
  toolStaggerStart?: number;
  toolStaggerStep?: number;
};

const TOOLS = [
  "search",
  "ask",
  "list_buckets",
  "list_objects",
  "read_object",
  "write_object",
  "get_manifest",
] as const;

export const MCPWindow: React.FC<Props> = ({
  width = 640,
  height = 520,
  toolStaggerStart = 8,
  toolStaggerStep = 6,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width,
        height,
        background: color.ink,
        border: `1px solid ${color.hairlineDark}`,
        borderRadius: radius.window,
        overflow: "hidden",
        fontFamily: fonts.sans,
        color: color.cream,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          height: 38,
          display: "flex",
          alignItems: "center",
          gap: space[2],
          padding: `0 ${space[4]}px`,
          borderBottom: `1px solid ${color.hairlineDark}`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: color.stone[700],
            }}
          />
        ))}
        <span
          style={{
            marginLeft: space[3],
            fontSize: 13,
            color: color.stone[300],
          }}
        >
          Claude Desktop · MCP servers
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: space[6],
          display: "flex",
          flexDirection: "column",
          gap: space[3],
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: fs.body,
              fontWeight: weight.medium,
              letterSpacing: "-0.01em",
              fontFamily: fonts.mono,
            }}
          >
            kraterion
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: space[2],
              fontSize: fs.caption,
              color: color.stone[300],
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#5C7A3F",
              }}
            />
            Connected
          </div>
        </div>

        <div
          style={{
            fontSize: fs.caption,
            color: color.stone[500],
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginTop: space[3],
          }}
        >
          7 tools
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: space[2],
            marginTop: space[2],
            fontFamily: fonts.mono,
            fontSize: fs.codeSmall,
          }}
        >
          {TOOLS.map((tool, i) => {
            const localFrame =
              frame - (toolStaggerStart + i * toolStaggerStep);
            const opacity = interpolate(localFrame, [0, 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: LINEAR_EASE,
            });
            const translate = interpolate(localFrame, [0, 8], [4, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: LINEAR_EASE,
            });
            return (
              <div
                key={tool}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: space[3],
                  opacity,
                  transform: `translateY(${translate}px)`,
                  color: color.cream,
                  willChange: "transform, opacity",
                }}
              >
                <span style={{ color: color.stone[500] }}>·</span>
                <span>{tool}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
