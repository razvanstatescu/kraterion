import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { LINEAR_EASE, EASE_OUT } from "../motion/easings";

type Point = { x: number; y: number };

export type CursorWaypoint = {
  /** Composition-relative arrival frame (relative to component mount). */
  frame: number;
  /** Where the cursor is at this moment. */
  pos: Point;
  /** Optional click at arrival — adds a ripple ring + tiny scale dip. */
  click?: boolean;
};

type Props = {
  /** Ordered waypoints. Cursor lerps between them on a quadratic bezier. */
  waypoints: CursorWaypoint[];
  /** Frames after the last waypoint the cursor stays visible. */
  holdAfter?: number;
  /** Frames before the first waypoint the cursor fades in. */
  fadeInFrames?: number;
};

/**
 * macOS-style cursor that travels between waypoints along quadratic-bezier
 * arcs (never straight lines) with an overshoot-on-arrival, click ripples,
 * and a graceful enter/exit fade. Designed to drive UI storytelling.
 */
export const AnimatedCursor: React.FC<Props> = ({
  waypoints,
  holdAfter = 12,
  fadeInFrames = 8,
}) => {
  const frame = useCurrentFrame();

  if (waypoints.length === 0) return null;
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];

  // Visibility window
  if (frame < first.frame - fadeInFrames || frame > last.frame + holdAfter + 12) {
    return null;
  }

  const fadeIn = interpolate(frame, [first.frame - fadeInFrames, first.frame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [last.frame + holdAfter, last.frame + holdAfter + 12],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Find current segment
  let segIdx = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (frame >= waypoints[i].frame && frame < waypoints[i + 1].frame) {
      segIdx = i;
      break;
    }
    if (frame >= waypoints[waypoints.length - 1].frame) segIdx = waypoints.length - 1;
  }

  let pos: Point;
  if (segIdx >= waypoints.length - 1) {
    pos = last.pos;
  } else {
    const a = waypoints[segIdx];
    const b = waypoints[segIdx + 1];
    const t = interpolate(frame, [a.frame, b.frame], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    });
    // Quadratic bezier control point: midpoint offset perpendicular by 80px
    const mx = (a.pos.x + b.pos.x) / 2;
    const my = (a.pos.y + b.pos.y) / 2;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const offset = Math.min(120, len * 0.18);
    const cx = mx + nx * offset;
    const cy = my + ny * offset;
    pos = {
      x: (1 - t) * (1 - t) * a.pos.x + 2 * (1 - t) * t * cx + t * t * b.pos.x,
      y: (1 - t) * (1 - t) * a.pos.y + 2 * (1 - t) * t * cy + t * t * b.pos.y,
    };
  }

  // Click animation: scale dip + ripple, for each click waypoint
  let clickScale = 1;
  const ripples: { wp: CursorWaypoint; age: number }[] = [];
  for (const wp of waypoints) {
    if (!wp.click) continue;
    const age = frame - wp.frame;
    if (age >= -2 && age <= 24) ripples.push({ wp, age });
    if (age >= 0 && age <= 8) {
      const dip = interpolate(age, [0, 3, 8], [1, 0.78, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      clickScale = Math.min(clickScale, dip);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        opacity,
      }}
    >
      {/* Click ripples */}
      {ripples.map(({ wp, age }, i) => {
        const ringSize = interpolate(age, [0, 22], [0, 96], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const ringOpacity = interpolate(age, [0, 22], [0.7, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={`r${i}`}
            style={{
              position: "absolute",
              left: wp.pos.x - ringSize / 2,
              top: wp.pos.y - ringSize / 2,
              width: ringSize,
              height: ringSize,
              borderRadius: 999,
              border: `2px solid ${color.krater}`,
              opacity: ringOpacity,
              willChange: "transform, opacity",
            }}
          />
        );
      })}

      {/* Cursor SVG — macOS-style pointer */}
      <svg
        width={28}
        height={28}
        viewBox="0 0 28 28"
        style={{
          position: "absolute",
          left: pos.x,
          top: pos.y,
          transform: `scale(${clickScale})`,
          transformOrigin: "0 0",
          willChange: "transform, top, left",
          filter: `drop-shadow(0 2px 0 ${color.ink})`,
        }}
      >
        <path
          d="M2 2 L2 22 L8 17 L11 25 L14 24 L11 16 L20 16 Z"
          fill={color.cream}
          stroke={color.ink}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
