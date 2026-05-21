/**
 * Kraterion typography — Inter only, weights 400 & 500, mirrors landing.
 *
 * Brand rules from design-system/README.md:
 *   - "Single family: a geometric sans (Inter / Söhne / Geist Sans)"
 *   - "Weights 400 and 500 only — never 600 or heavier."
 *   - "Heavy weights overpower the warm palette."
 *   - Letter-spacing: -0.01em on headings (NOT -0.04em — that's too tight).
 *   - Line-height: 1.5 body, 1.2 headings.
 *   - Scale: 11 / 14 / 16 / 18 / 24 / 32 / 48 / 72.
 *
 * Bricolage Grotesque is GONE — it doesn't belong on a Kraterion surface.
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const inter = loadInter("normal", {
  weights: ["400", "500"],
  subsets: ["latin", "latin-ext"],
});

const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const fonts = {
  /** Inter — body and display. */
  sans: inter.fontFamily,
  /** JetBrains Mono — code, filenames, tabular numbers. */
  mono: mono.fontFamily,
  /** @deprecated — alias for `sans`. Bricolage is gone. */
  display: inter.fontFamily,
};

export const fontsReady = Promise.all([
  inter.waitUntilDone(),
  mono.waitUntilDone(),
]);

/**
 * Letter-spacing.
 *
 * Brand specifies -0.01em on web headings, but video uses MUCH bigger type
 * (200+px) where the brand's natural perception of tightness scales — so we
 * tighten further for hero/display per research-validated motion design:
 *   - hero (200-240px) → -0.045em
 *   - display (120-160px) → -0.035em
 *   - heading (60-80px) → -0.02em
 *   - body → near 0
 *   - eyebrow uppercase → +0.16em
 */
export const tracking = {
  hero: "-0.045em",
  display: "-0.035em",
  heading: "-0.02em",
  body: "-0.005em",
  code: "0",
  caps: "0.16em",
  /** @deprecated alias kept for older scenes */
  title: "-0.02em",
} as const;

/**
 * Type scale — calibrated for VIDEO viewing (not website).
 *
 * Per research, h1 at 48 px on a 1920×1080 video reads as website-thumbnail
 * small. Video viewers don't read, they REACT — so the scale jumps up.
 *
 *   Role             | px       | usage
 *   -----------------|----------|--------------------------------------------
 *   hero             | 200-240  | "Kraterion." slam, problem indictment
 *   display          | 128-140  | scene-headline hero text
 *   h1               | 80-96    | secondary scene title
 *   h2               | 56-64    | sub-headline
 *   h3               | 40-48    | tertiary
 *   lead             | 36-40    | body text, video floor
 *   body             | 28-32    | dense body
 *   small            | 22-24    | mono code, table cells, captions
 *   micro            | 18-20    | eyebrow uppercase label
 */
export const size = {
  hero: 220,
  display: 132,
  h1: 88,
  h2: 60,
  h3: 44,
  lead: 36,
  body: 28,
  small: 22,
  micro: 18,
  // Code-specific
  code: 32,
  codeSmall: 24,
  caption: 18,
} as const;

/** Weights — 400 and 500 only. */
export const weight = {
  regular: 400,
  medium: 500,
  /** @deprecated — banned. Aliased to medium for safety. */
  semibold: 500,
  /** @deprecated — banned. */
  bold: 500,
  /** @deprecated — banned. */
  black: 500,
} as const;
