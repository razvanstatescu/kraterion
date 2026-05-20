import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const inter = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const fonts = {
  sans: inter.fontFamily,
  mono: mono.fontFamily,
};

export const fontsReady = Promise.all([
  inter.waitUntilDone(),
  mono.waitUntilDone(),
]);

export const tracking = {
  title: "-0.02em",
  body: "-0.01em",
  code: "0",
} as const;

export const size = {
  display: 144,
  h1: 56,
  h2: 32,
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
} as const;
