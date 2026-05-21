import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, size as fs, tracking, weight } from "../tokens/type";
import { space } from "../tokens/spacing";
import { ApertureMark } from "../components/ApertureMark";
import { ScaleSettle, LetterStagger } from "../components/Entrances";
import { EASE_BRAND, EASE_EXPO, EASE_IRIS } from "../motion/easings";

/**
 * S07 — THE WOW (17 s). The Walrus / Sui / Seal composability.
 *
 * Three labelled satellites enter the frame from off-screen — Walrus
 * (top), Sui (lower-right), Seal (lower-left). They settle into a slow
 * orbit around a central empty point. After ~9 s the three satellites
 * collapse inward simultaneously and the Kraterion aperture mark
 * resolves at the centre.
 *
 * Per research: this is THE screenshot moment. Lasts ~17 s. The single
 * krater accent is the inner aperture dot at the resolution beat.
 */
export const S07_MCP: React.FC = () => {
  const frame = useCurrentFrame();

  // Phases (scene-local frames; total scene = 510)
  const SATELLITES_IN = 6;       // start arrival
  const SATELLITES_SETTLED = 60; // orbit begins
  const COLLAPSE_AT = 320;       // satellites collapse inward
  const MARK_RESOLVES = 360;     // aperture appears at centre
  const TAGLINE_IN = 420;

  // Center of the frame
  const CX = 1920 / 2;
  const CY = 1080 / 2;
  const ORBIT_R = 280;

  // Slow rotation of the orbit — 360° per ~14s
  const orbitRotDeg = ((frame - SATELLITES_SETTLED) / 420) * 360;

  // Collapse progress — satellites pull to centre at COLLAPSE_AT
  const collapseProg = interpolate(
    frame,
    [COLLAPSE_AT, COLLAPSE_AT + 30],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
  );
  const satOpacityCollapse = interpolate(
    frame,
    [COLLAPSE_AT + 16, COLLAPSE_AT + 30],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const SATELLITES: Array<{
    name: string;
    role: string;
    /** Initial orbit angle, in degrees (0 = right, -90 = top). */
    baseAngle: number;
    /** Arrival delay offset (in frames) so they stagger in. */
    delay: number;
    /** From-direction for the entry slide (off-screen). */
    fromX: number;
    fromY: number;
  }> = [
    { name: "Walrus", role: "Sharded storage",   baseAngle: -90, delay: 0,  fromX: 0,      fromY: -360 },
    { name: "Sui",    role: "On-chain ownership", baseAngle: 30,  delay: 8,  fromX: 360,    fromY: 260 },
    { name: "Seal",   role: "Client-side keys",   baseAngle: 150, delay: 16, fromX: -360,   fromY: 260 },
  ];

  // Title entry (small, top of frame)
  const titleOpacity = interpolate(frame, [4, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_BRAND,
  });

  // Mark appears at centre
  const markOpacity = interpolate(
    frame,
    [MARK_RESOLVES, MARK_RESOLVES + 14],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_BRAND },
  );
  const markScale = interpolate(
    frame,
    [MARK_RESOLVES, MARK_RESOLVES + 22],
    [1.12, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IRIS },
  );

  return (
    <AbsoluteFill style={{ background: color.cream, overflow: "hidden" }}>
      {/* Small eyebrow at top */}
      <div
        style={{
          position: "absolute",
          top: space[16],
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
          fontFamily: fonts.sans,
          fontSize: fs.micro,
          fontWeight: weight.medium,
          color: color.stone[500],
          letterSpacing: tracking.caps,
          textTransform: "uppercase",
        }}
      >
        How it works
      </div>

      {/* Headline — the lower line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: space[24],
          textAlign: "center",
          fontFamily: fonts.sans,
          fontSize: fs.h1,
          fontWeight: weight.regular,
          letterSpacing: tracking.heading,
          color: color.ink,
          lineHeight: 1,
          opacity: interpolate(frame, [TAGLINE_IN, TAGLINE_IN + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_BRAND,
          }),
        }}
      >
        <LetterStagger
          text="Three primitives. One layer."
          startFrame={TAGLINE_IN}
          stagger={2}
          fromY={24}
        />
      </div>

      {/* Aperture mark — appears after the collapse */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: CY,
          transform: `translate(-50%, -50%) scale(${markScale})`,
          opacity: markOpacity,
          willChange: "transform, opacity",
        }}
      >
        <ApertureMark
          size={140}
          variant="light"
          delay={MARK_RESOLVES}
          drawDurationFrames={22}
          staggerFrames={6}
          fillDurationFrames={12}
        />
      </div>

      {/* Satellites */}
      {SATELLITES.map((s, i) => {
        // Arrival: ScaleSettle-like motion from off-screen into orbit slot
        const arriveStart = SATELLITES_IN + s.delay;
        const arriveProg = interpolate(
          frame,
          [arriveStart, arriveStart + 36],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_EXPO },
        );

        // Current angle = baseAngle + rotation (during orbit phase)
        const rotPhase = Math.max(0, frame - SATELLITES_SETTLED);
        const angle = s.baseAngle + (rotPhase / 420) * 360;
        const rad = (angle * Math.PI) / 180;

        // Orbit position
        const orbitX = CX + Math.cos(rad) * ORBIT_R;
        const orbitY = CY + Math.sin(rad) * ORBIT_R;

        // Lerp from arrival start (off-screen) to orbit position
        const fromAbsX = CX + s.fromX;
        const fromAbsY = CY + s.fromY;
        const sx = fromAbsX + (orbitX - fromAbsX) * arriveProg;
        const sy = fromAbsY + (orbitY - fromAbsY) * arriveProg;

        // Collapse — pull toward centre on COLLAPSE_AT
        const cx = sx + (CX - sx) * collapseProg;
        const cy = sy + (CY - sy) * collapseProg;
        const finalOpacity = arriveProg * satOpacityCollapse;
        const collapseScale = 1 - collapseProg * 0.4;

        return (
          <div
            key={s.name}
            style={{
              position: "absolute",
              left: cx,
              top: cy,
              transform: `translate(-50%, -50%) scale(${collapseScale})`,
              opacity: finalOpacity,
              willChange: "transform, opacity",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Token shape — hairline circle on cream */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 999,
                border: `1.5px solid ${color.borderStrong}`,
                background: color.stone[50],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: fonts.sans,
                fontSize: fs.body,
                fontWeight: weight.medium,
                color: color.ink,
                letterSpacing: tracking.heading,
              }}
            >
              {s.name}
            </div>
            <span
              style={{
                fontFamily: fonts.sans,
                fontSize: fs.micro,
                fontWeight: weight.medium,
                color: color.stone[600],
                letterSpacing: tracking.caps,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {s.role}
            </span>
          </div>
        );
      })}

      {/* Faint hairline orbit ring (only visible after satellites settle) */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: CY,
          width: ORBIT_R * 2,
          height: ORBIT_R * 2,
          borderRadius: "50%",
          border: `1px dashed ${color.borderStrong}`,
          transform: "translate(-50%, -50%)",
          opacity: interpolate(
            frame,
            [SATELLITES_SETTLED, SATELLITES_SETTLED + 22, COLLAPSE_AT, COLLAPSE_AT + 20],
            [0, 0.35, 0.35, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      />
    </AbsoluteFill>
  );
};
