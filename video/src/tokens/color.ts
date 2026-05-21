/**
 * Kraterion palette — mirrors design-system/colors_and_type.css verbatim.
 *
 * Brand rules:
 *   - Pure black/white forbidden. Ink and cream replace them.
 *   - Cool greys forbidden. Stone scale is warm throughout.
 *   - Krater is the brand accent. Used SPARINGLY (sentence: "Never two
 *     Krater elements touching"). Primary CTAs, active/selected dots,
 *     brand moments only.
 *   - SHADOWS ARE FORBIDDEN. All elevation is hairline + background
 *     contrast. The `hairline` helper below is the one sanctioned use
 *     of box-shadow (0.5 px stone-300 ring).
 */
export const color = {
  ink: "#0F0E0C",
  cream: "#F8F4EC",
  krater: "#C45B36",

  stone: {
    50:  "#FAF7EF",
    100: "#F1ECE0",
    200: "#E1D9C7",
    300: "#C9BFA8",
    400: "#A89C82",
    500: "#7C7158",
    600: "#5B5142",
    700: "#403930",
    800: "#2A251D",
    900: "#1A1610",
  },

  // Semantic — used only in functional UI (status pills, alerts)
  success: "#5C7A3F",
  error:   "#B53D2E",
  warning: "#C28A3C",
  info:    "#3B6F73",

  // Border tokens (semantic). Use these instead of stone[200] directly.
  border:       "rgba(225, 217, 199, 0.6)",   // stone-200 @ 60%
  borderStrong: "#C9BFA8",                     // stone-300
} as const;

/**
 * The ONE sanctioned use of `box-shadow` in the brand. Use this in lieu of
 * borders where you need a 0.5 px ring (e.g. when border would interfere
 * with rounded-corner math). Otherwise use `border: 0.5px solid var(--border)`.
 */
export const hairlineRing = `0 0 0 0.5px ${color.borderStrong}`;

/**
 * @deprecated — `box-shadow` is forbidden by the brand. Kept as a no-op
 * compatibility shim so old call sites compile while we migrate them.
 * Returns the sanctioned hairline ring instead of any offset shadow.
 */
export const cardShadow = (_opts?: { offset?: number; color?: string }) =>
  hairlineRing;
