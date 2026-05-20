/**
 * Spring configs tuned for the playful-brutalist synth-pop aesthetic.
 * Use BOUNCE for all primary entrances (overshoots ~5–8%).
 * Use SETTLE for secondary elements that should arrive quietly.
 * Use SNAP for toggle / button / micro-interactions.
 */
export const BOUNCE  = { damping: 12, stiffness: 180, mass: 0.7 } as const;
export const SETTLE  = { damping: 22, stiffness: 140, mass: 1.0 } as const;
export const SNAP    = { damping: 16, stiffness: 260, mass: 0.6 } as const;
export const GENTLE  = { damping: 200, stiffness: 120, mass: 1.0 } as const;
