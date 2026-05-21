import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { color } from "../tokens/color";
import { fonts, weight, size as fs } from "../tokens/type";
import { EASE_BRAND } from "../motion/easings";

/**
 * Brand pill — modeled on `.pill` / `.dot` in design-system/colors_and_type.css
 * and the landing's "v 0.1 · private beta" pill in Hero.tsx.
 *
 *   - Hairline border (stone-200 @ 60%), no shadow.
 *   - Sentence case by default (the brand allows ALL-CAPS only at 11 px
 *     with letter-spacing ≥ 0.16em — pass `micro` for that mode).
 *   - Optional krater dot (the "v0.1" pill in the landing uses one).
 *   - Soft fade-in via EASE_BRAND. No bouncy spring.
 */
type Props = {
  /** Composition-local frame at which the pill enters. */
  startFrame?: number;
  /** Sentence-case body (default) or 11 px uppercase eyebrow. */
  micro?: boolean;
  /** Optional krater dot at the leading edge. */
  dot?: boolean;
  /** Stone surface for muted variant, krater fill for primary CTA. */
  variant?: "cream" | "stone-50" | "krater" | "ink";
  children: React.ReactNode;

  // ── Legacy props kept for migration ──
  /** @deprecated — shadows banned. Ignored. */
  shadowColor?: string;
  /** @deprecated — was offset; ignored. */
  surface?: "cream" | "ink";
  /** @deprecated — color prop; if provided, sets `dot=true`. */
  dotColor?: string;
  /** @deprecated — bouncy entries banned. Ignored. */
  tiltDeg?: number;
  /** @deprecated — alias for `micro`. */
  mono?: boolean;
};

const SURFACES = {
  cream:      { bg: color.cream,     fg: color.ink,   border: color.border       },
  "stone-50": { bg: color.stone[50], fg: color.ink,   border: color.border       },
  krater:     { bg: color.krater,    fg: color.cream, border: color.krater       },
  ink:        { bg: color.ink,       fg: color.cream, border: color.stone[800]   },
} as const;

export const Chip: React.FC<Props> = ({
  startFrame = 0,
  micro = false,
  dot = false,
  variant,
  children,
  surface,
  dotColor,
  mono,
  shadowColor: _ignored1,
  tiltDeg: _ignored2,
}) => {
  const frame = useCurrentFrame();

  // Back-compat: legacy `surface` mapped to new `variant`.
  const v = variant ?? (surface === "ink" ? "ink" : "cream");
  const s = SURFACES[v];

  // Back-compat: if `mono` is set, treat as micro.
  const useMicro = micro || mono === true;
  const showDot = dot || dotColor !== undefined;

  const opacity = interpolate(frame - startFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_BRAND,
  });
  const y = interpolate(frame - startFrame, [0, 14], [4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_BRAND,
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: useMicro ? "4px 10px" : "5px 12px",
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        fontFamily: fonts.sans,
        fontSize: useMicro ? fs.micro : 13,
        fontWeight: weight.medium,
        letterSpacing: useMicro ? "0.16em" : "0",
        textTransform: useMicro ? "uppercase" : "none",
        whiteSpace: "nowrap",
        opacity,
        transform: `translateY(${y}px)`,
        willChange: "transform, opacity",
      }}
    >
      {showDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: color.krater,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </div>
  );
};
