import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Display font — Bricolage Grotesque. Chunky, geometric, with a variable
// "wonk" axis that gives the verb hits a hand-drawn personality. Used for
// every headline and verb-hit in the climax montage.
const bricolage = loadBricolage("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

// Body & UI font — Inter, because the actual Kraterion product UI uses it.
// Restricting it to UI mockups (dashboard chrome, chat) keeps brand fidelity
// without diluting the display voice.
const inter = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});

const mono = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});

export const fonts = {
  display: bricolage.fontFamily,
  sans: inter.fontFamily,
  mono: mono.fontFamily,
};

export const fontsReady = Promise.all([
  bricolage.waitUntilDone(),
  inter.waitUntilDone(),
  mono.waitUntilDone(),
]);

export const tracking = {
  display: "-0.04em",   // tight, chunky
  title: "-0.025em",
  body: "-0.01em",
  code: "0",
  caps: "0.06em",
} as const;

export const size = {
  hero: 220,        // verb-hit display
  display: 168,
  h1: 96,
  h2: 56,
  h3: 32,
  body: 28,
  small: 24,
  caption: 18,
  code: 32,
  codeSmall: 20,
} as const;

export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const;
