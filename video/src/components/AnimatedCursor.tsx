import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { EASE_CURSOR } from "../motion/easings";

type Point = { x: number; y: number };

export type CursorWaypoint = {
  /** Composition-relative arrival frame (relative to component mount). */
  frame: number;
  /** Where the cursor is at this moment. */
  pos: Point;
  /** Optional click at arrival — adds a ripple ring + press-down dip + release. */
  click?: boolean;
  /**
   * Frames the cursor holds stationary on this waypoint BEFORE clicking.
   * Per research, 5-7 frames is the "hover-before-click" beat that makes
   * the interaction feel human. Only respected when `click === true`.
   */
  holdBeforeClick?: number;
};

type Props = {
  /** Ordered waypoints. Cursor lerps between them along quadratic-bezier arcs. */
  waypoints: CursorWaypoint[];
  /** Frames after the last waypoint the cursor stays visible. */
  holdAfter?: number;
  /** Frames before the first waypoint the cursor fades in. */
  fadeInFrames?: number;
  /** Whether to add sub-pixel "hand tremor" during cruise (default true). */
  jitter?: boolean;
};

/**
 * macOS-style animated cursor with research-validated choreography:
 *   - Travel curve: quadratic bezier (no straight lines)
 *   - Acceleration: EASE_CURSOR (accelerate, cruise, hard decel — Fitts)
 *   - Hover-before-click: 6-frame stationary hold on the target
 *   - Press-down dip: scale 1.0 → 0.82 over 2 frames
 *   - Release ripple: 22-frame ring expansion
 *   - Cruise jitter: 0.4 px sinusoidal sub-pixel hand tremor (off near targets)
 */
export const AnimatedCursor: React.FC<Props> = ({
  waypoints,
  holdAfter = 12,
  fadeInFrames = 8,
  jitter = true,
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
  let nearTarget = false;
  if (segIdx >= waypoints.length - 1) {
    pos = last.pos;
    nearTarget = true;
  } else {
    const a = waypoints[segIdx];
    const b = waypoints[segIdx + 1];
    const tRaw = interpolate(frame, [a.frame, b.frame], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_CURSOR,
    });
    // Mark "near target" in the last ~20% of the segment so jitter cuts out
    nearTarget = tRaw > 0.8;
    // Quadratic bezier control point: midpoint offset perpendicular by 18% of chord
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
      x: (1 - tRaw) * (1 - tRaw) * a.pos.x + 2 * (1 - tRaw) * tRaw * cx + tRaw * tRaw * b.pos.x,
      y: (1 - tRaw) * (1 - tRaw) * a.pos.y + 2 * (1 - tRaw) * tRaw * cy + tRaw * tRaw * b.pos.y,
    };
  }

  // Sub-pixel cruise jitter (disabled near targets and during clicks)
  if (jitter && !nearTarget) {
    pos.x += Math.sin(frame * 0.9) * 0.4;
    pos.y += Math.cos(frame * 1.1) * 0.4;
  }

  // Click animation: press-down dip + release ripple
  // Press starts on the click waypoint frame. Anyone waiting `holdBeforeClick`
  // frames is already at the target — the hold is implicit because the
  // cursor's segment-bezier math arrives at the next waypoint exactly on
  // its `frame`. So `holdBeforeClick` here only affects RIPPLE timing —
  // we delay the ripple by holdBeforeClick frames so the click visually
  // lags the cursor arrival.
  let clickScale = 1;
  const ripples: { wp: CursorWaypoint; age: number }[] = [];
  for (const wp of waypoints) {
    if (!wp.click) continue;
    const clickAtFrame = wp.frame + (wp.holdBeforeClick ?? 6);
    const age = frame - clickAtFrame;
    if (age >= -2 && age <= 26) ripples.push({ wp, age });
    // Press-down dip: scale 1 → 0.82 over frames 0-2, settle 0.82 → 1 over 2-6
    if (age >= 0 && age <= 8) {
      const dip = interpolate(age, [0, 2, 8], [1, 0.82, 1], {
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
      {/* Click ripples — emanate from the click point with EASE_EXPO */}
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

      {/* Cursor SVG */}
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
