export const ease = {
  brand: [0.4, 0, 0.2, 1] as const,
  aperture: [0.2, 0.7, 0.2, 1] as const,
  iris: [0.16, 1, 0.3, 1] as const,
  kraterPop: [0.34, 1.4, 0.64, 1] as const,
} as const;

export const duration = {
  fast: 0.16,
  base: 0.2,
  slow: 0.32,
} as const;
