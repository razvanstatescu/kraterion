import { Easing } from "remotion";

/**
 * Brand-named easings from design-system/colors_and_type.css.
 *
 *   --ease-brand:      cubic-bezier(0.4, 0, 0.2, 1)    default 200ms
 *   --ease-aperture:   cubic-bezier(0.2, 0.7, 0.2, 1)
 *   --ease-iris:       cubic-bezier(0.16, 1, 0.3, 1)
 *   --ease-krater-pop: cubic-bezier(0.34, 1.4, 0.64, 1)  use SPARINGLY
 *
 *   --duration-fast: 160ms
 *   --duration-base: 200ms
 *   --duration-slow: 320ms
 *
 * Reach for `EASE_BRAND` 80% of the time. Reserve EASE_IRIS for the
 * aperture mark's iris-open moment. Reserve KRATER_POP for the inner
 * dot's state change (≤ once per scene).
 */
export const EASE_BRAND    = Easing.bezier(0.4,  0,    0.2,  1);
export const EASE_APERTURE = Easing.bezier(0.2,  0.7,  0.2,  1);
export const EASE_IRIS     = Easing.bezier(0.16, 1,    0.3,  1);
export const KRATER_POP    = Easing.bezier(0.34, 1.4,  0.64, 1);
/** Ease-out-expo — the "premium wipe" curve, used for mask reveals & wipes. */
export const EASE_EXPO     = Easing.bezier(0.22, 1,    0.36, 1);

/** @deprecated — kept for compatibility while scenes migrate. */
export const LINEAR_EASE = EASE_BRAND;
/** @deprecated */
export const EASE_OUT = EASE_IRIS;
/** @deprecated */
export const EASE_IN_OUT = EASE_BRAND;

/** Standard durations in seconds (multiply by fps at the call site). */
export const DURATION = {
  fast: 160 / 1000,   // 0.16 s
  base: 200 / 1000,   // 0.2 s
  slow: 320 / 1000,   // 0.32 s
  aperture: 400 / 1000, // iris-open default
} as const;
