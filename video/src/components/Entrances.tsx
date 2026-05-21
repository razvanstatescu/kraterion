import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { EASE_EXPO, EASE_IRIS, EASE_BRAND } from "../motion/easings";
import { color } from "../tokens/color";

/**
 * Five entrance primitives — premium video vocabulary, restricted to the
 * brand's motion rules (brand easings, no overshoot springs).
 *
 *   1. MaskReveal       — clip-path wipe with an orange razor edge
 *   2. LetterStagger    — per-letter 2-frame stagger from below
 *   3. SubtractiveReveal — cream overlay slides off to expose content
 *   4. ScaleSettle      — content enters at 1.08, settles to 1.0 (Apple)
 *   5. TrackingExpand   — letter-spacing exhales from -0.08em → -0.045em
 *
 * Per research: NEVER use the same entrance twice in a row. Mix them.
 */

// ─── 1. MaskReveal ──────────────────────────────────────────────────────────

type MaskRevealProps = {
  startFrame?: number;
  durationInFrames?: number;
  /** Show the krater-orange razor edge during the wipe. */
  razor?: boolean;
  direction?: "ltr" | "rtl";
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const MaskReveal: React.FC<MaskRevealProps> = ({
  startFrame = 0,
  durationInFrames = 14,
  razor = false,
  direction = "ltr",
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(
    frame - startFrame,
    [0, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
  );
  const remaining = (1 - t) * 100;
  const clip = direction === "ltr"
    ? `inset(0 ${remaining}% 0 0)`
    : `inset(0 0 0 ${remaining}%)`;

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <div style={{ clipPath: clip, WebkitClipPath: clip, willChange: "clip-path" }}>
        {children}
      </div>
      {razor && t > 0 && t < 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: direction === "ltr" ? `${t * 100}%` : undefined,
            right: direction === "rtl" ? `${t * 100}%` : undefined,
            width: 2,
            background: color.krater,
            transform: "translateX(-1px)",
          }}
        />
      )}
    </div>
  );
};

// ─── 2. LetterStagger ──────────────────────────────────────────────────────

type LetterStaggerProps = {
  text: string;
  startFrame?: number;
  /** Frames between each letter. Research says 2 is the sweet spot. */
  stagger?: number;
  /** Distance to translate up from, in px. */
  fromY?: number;
  style?: React.CSSProperties;
  /** Inline-block so the parent's text-align centers correctly. */
  as?: "h1" | "h2" | "div" | "span";
};

export const LetterStagger: React.FC<LetterStaggerProps> = ({
  text,
  startFrame = 0,
  stagger = 2,
  fromY = 40,
  style,
  as = "div",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const Tag = as as keyof JSX.IntrinsicElements;
  const letters = Array.from(text);

  return (
    <Tag style={{ display: "inline-block", margin: 0, ...style }}>
      {letters.map((ch, i) => {
        if (ch === " ") return <span key={i}>&nbsp;</span>;
        const prog = spring({
          frame: frame - (startFrame + i * stagger),
          fps,
          config: { damping: 20, stiffness: 140, mass: 1 },
        });
        const y = interpolate(prog, [0, 1], [fromY, 0]);
        const opacity = interpolate(prog, [0, 0.4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${y}px)`,
              willChange: "transform, opacity",
            }}
          >
            {ch}
          </span>
        );
      })}
    </Tag>
  );
};

// ─── 3. SubtractiveReveal ──────────────────────────────────────────────────

type SubtractiveRevealProps = {
  startFrame?: number;
  durationInFrames?: number;
  /** Color of the overlay that slides off. Defaults to cream. */
  overlay?: string;
  /** Direction the overlay slides. */
  direction?: "left" | "right" | "up" | "down";
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const SubtractiveReveal: React.FC<SubtractiveRevealProps> = ({
  startFrame = 0,
  durationInFrames = 16,
  overlay = color.cream,
  direction = "left",
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(
    frame - startFrame,
    [0, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
  );

  const axisTransform = {
    left:  `translateX(${-t * 100}%)`,
    right: `translateX(${t * 100}%)`,
    up:    `translateY(${-t * 100}%)`,
    down:  `translateY(${t * 100}%)`,
  }[direction];

  return (
    <div style={{ position: "relative", display: "inline-block", overflow: "hidden", ...style }}>
      {children}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: overlay,
          transform: axisTransform,
          willChange: "transform",
        }}
      />
    </div>
  );
};

// ─── 4. ScaleSettle ────────────────────────────────────────────────────────

type ScaleSettleProps = {
  startFrame?: number;
  /** Enter at this scale (research: 1.08-1.15 is the sweet spot). */
  fromScale?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const ScaleSettle: React.FC<ScaleSettleProps> = ({
  startFrame = 0,
  fromScale = 1.08,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.6 },
  });
  const scale = interpolate(prog, [0, 1], [fromScale, 1]);
  const opacity = interpolate(prog, [0, 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        willChange: "transform, opacity",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ─── 5. TrackingExpand ─────────────────────────────────────────────────────

type TrackingExpandProps = {
  text: string;
  startFrame?: number;
  durationInFrames?: number;
  /** Starting letter-spacing (negative, tighter). */
  fromTracking?: number;
  /** Final letter-spacing. */
  toTracking?: number;
  style?: React.CSSProperties;
};

export const TrackingExpand: React.FC<TrackingExpandProps> = ({
  text,
  startFrame = 0,
  durationInFrames = 18,
  fromTracking = -0.08,
  toTracking = -0.035,
  style,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(
    frame - startFrame,
    [0, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IRIS },
  );
  const opacity = interpolate(t, [0, 0.4], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ls = interpolate(t, [0, 1], [fromTracking, toTracking]);
  return (
    <span
      style={{
        display: "inline-block",
        opacity,
        letterSpacing: `${ls}em`,
        willChange: "opacity, letter-spacing",
        ...style,
      }}
    >
      {text}
    </span>
  );
};

// ─── 6. PunchZoom ──────────────────────────────────────────────────────────
// Bonus: subtle 1.0 → 1.04 → 1.0 punch zoom for emphasis (use ONCE).

type PunchZoomProps = {
  punchFrame: number;
  children: React.ReactNode;
};

export const PunchZoom: React.FC<PunchZoomProps> = ({ punchFrame, children }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    [punchFrame, punchFrame + 2, punchFrame + 3, punchFrame + 9],
    [1, 1.04, 1.04, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
};
