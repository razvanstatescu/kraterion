/**
 * Bouncy springs are explicitly forbidden by the brand
 * (design-system/README.md §Motion):
 *
 *   "Default easing cubic-bezier(0.4, 0, 0.2, 1), default duration 200ms.
 *    No bouncy springs."
 *
 * These exports remain only as no-bounce fallbacks for code that still
 * imports them. All resolve to spring configs that move WITHOUT overshoot,
 * matching the brand's `ease-brand` curve in feel.
 *
 * Prefer using `interpolate(...)` with `EASE_BRAND` from `motion/easings.ts`.
 * Springs in Remotion are useful for *frame-relative* motion (where you
 * want a critically damped settle without computing duration manually), and
 * these configs give that — minus the overshoot.
 */

/** Critically damped — no overshoot, smooth settle. */
export const SETTLE = { damping: 200, stiffness: 100, mass: 1 } as const;

/** Slightly stiffer — for UI micro-interactions (toggle flips, button press). */
export const SNAP = { damping: 200, stiffness: 200, mass: 0.8 } as const;

/** @deprecated — BOUNCE is banned. Aliased to SETTLE for safety. */
export const BOUNCE = SETTLE;
/** @deprecated — GENTLE is fine, alias to SETTLE. */
export const GENTLE = SETTLE;
