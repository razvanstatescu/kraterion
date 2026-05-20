export const color = {
  cream: "#F8F4EC",
  ink: "#0F0E0C",
  krater: "#C45B36",
  // Bright lime — used very sparingly as a secondary accent (twice in climax)
  lime: "#D4FF66",
  // Warm near-black for hard offset shadows on floating cards
  shadowInk: "#1A1812",
  stone: {
    100: "#E8E2D6",
    300: "#C9C0AE",
    500: "#7A7468",
    700: "#403930",
    800: "#2A2825",
  },
  hairlineLight: "#E8E2D6",
  hairlineDark: "#2A2825",
} as const;

// Recipe for the signature brutalist floating-card shadow.
// 8 px offset, hard (no blur), in krater orange — instantly recognizable.
export const cardShadow = (opts: {
  offset?: number;
  color?: string;
} = {}) => {
  const off = opts.offset ?? 8;
  const c = opts.color ?? color.krater;
  return `${off}px ${off}px 0 ${c}`;
};
