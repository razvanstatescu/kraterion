import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { color, cardShadow } from "../tokens/color";
import { fonts, size as fs, weight } from "../tokens/type";
import { space, radius } from "../tokens/spacing";
import { BOUNCE } from "../motion/springs";

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
  width = 620,
  height = 560,
  toolStaggerStart = 8,
  toolStaggerStep = 5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        width,
        height,
        background: color.ink,
        border: `2px solid ${color.ink}`,
        borderRadius: radius.window,
        boxShadow: cardShadow({ offset: 12, color: color.cream }),
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
          height: 42,
          display: "flex",
          alignItems: "center",
          gap: space[2],
          padding: `0 ${space[4]}px`,
          borderBottom: `1.5px solid ${color.stone[700]}`,
        }}
      >
        {[color.krater, color.stone[500], color.stone[700]].map((c, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: c,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: space[3],
            fontSize: 14,
            color: color.stone[300],
            fontWeight: weight.medium,
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
              fontSize: 28,
              fontWeight: weight.bold,
              letterSpacing: "-0.02em",
              fontFamily: fonts.display,
              color: color.cream,
            }}
          >
            kraterion
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: space[2],
              fontSize: 14,
              color: color.stone[300],
              fontWeight: weight.medium,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#9BC265",
              }}
            />
            Connected
          </div>
        </div>

        <div
          style={{
            fontSize: 14,
            color: color.stone[500],
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: weight.semibold,
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
            fontSize: 20,
          }}
        >
          {TOOLS.map((tool, i) => {
            const local = frame - (toolStaggerStart + i * toolStaggerStep);
            const sProg = spring({
              frame: local,
              fps,
              config: BOUNCE,
            });
            const opacity = interpolate(sProg, [0, 0.6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const x = interpolate(sProg, [0, 1], [-12, 0]);
            const scale = interpolate(sProg, [0, 1], [0.92, 1]);
            return (
              <div
                key={tool}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: space[3],
                  opacity,
                  transform: `translateX(${x}px) scale(${scale})`,
                  transformOrigin: "left center",
                  color: color.cream,
                  willChange: "transform, opacity",
                }}
              >
                <span style={{ color: color.krater, fontWeight: weight.bold }}>·</span>
                <span>{tool}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
