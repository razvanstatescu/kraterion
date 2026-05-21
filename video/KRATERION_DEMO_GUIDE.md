# Kraterion Demo Video — Remotion Build Guide

A reference for building a Vercel/Linear-grade demo video in Remotion. Drop this into the repo and point Claude Code at it.

## How to use this doc

Read top to bottom on first pass. After that, jump to the section you need: **Setup** for the first scaffold, **Design Tokens** when styling a new scene, **Animation Foundations** when a motion feels off, **Scene Patterns** when starting a new sequence, **Storyboard** when sequencing the full piece.

Every section has working code you can paste. Constants live at the top of each snippet so you can change copy, timing, and color without rewriting the animation.

---

## 1. Philosophy (what makes Vercel/Linear demos feel premium)

The premium feel comes from four things, in order of importance:

1. **Restraint.** One thing happens per beat. No competing motion. White space and dark space do most of the work.
2. **Consistent easing.** Every motion in the piece uses the same 2-3 easing curves. The eye picks up that rhythm even if no one names it.
3. **Crossfade everything.** Hard cuts feel cheap unless the cut is the point. Use `TransitionSeries` between scenes; use opacity crossfades between states inside a scene.
4. **The UI is the hero.** Type, color, spacing all serve a screenshot or a piece of code. The motion design exists to direct attention to the product, never to upstage it.

Linear and Vercel both lean on the same toolkit: tight negative letter-spacing on display type, dark or near-white canvases, monospace for technical labels, single accent color per beat, and slow Ken Burns moves on UI screenshots. Nothing jitters, nothing pops, nothing spins. Things appear, hold, and leave.

---

## 2. Setup

### Scaffold

```bash
npx create-video@latest --yes --blank --no-tailwind kraterion-demo
cd kraterion-demo

# Core remotion packages
npx remotion add @remotion/transitions
npx remotion add @remotion/media

# Code rendering (recommended for the dev-focused scenes)
npm install prism-react-renderer

# Geist fonts (Vercel design system)
npm install @vercel/geist

# Optional but good for demos
npm install @geist-ui/icons          # icon set, never use emojis
npm install lucide-react             # broader icon fallback
```

### Install the official Remotion best-practices skill

```bash
# In Claude Code
npx skills add remotion-dev/skills
```

This installs 39 rule files. The ones that matter most for this build: `timing.md`, `transitions.md`, `text-animations.md`, `sequencing.md`, `compositions.md`, `images.md`, `fonts.md`, `calculate-metadata.md`.

### Composition settings

```ts
// src/Root.tsx
import { Composition } from "remotion";
import { KraterionDemo } from "./KraterionDemo";

export const Root = () => (
  <Composition
    id="KraterionDemo"
    component={KraterionDemo}
    durationInFrames={30 * 75}   // 75 seconds at 30fps, adjust as you finalize
    fps={30}
    width={1920}
    height={1080}
  />
);
```

Use **30fps** for web hero videos (lighter file, perfectly smooth at this length) and **1920x1080** for the master. Render a 1280x720 and a 1080x1350 (vertical for socials) later from the same composition with `calculate-metadata`.

### File layout

```
src/
  Root.tsx
  KraterionDemo.tsx          // top-level TransitionSeries that sequences scenes
  scenes/
    01-hero.tsx
    02-problem.tsx
    03-architecture.tsx
    04-upload-flow.tsx
    05-dashboard.tsx
    06-mcp-ai.tsx
    07-cta.tsx
  components/
    BrowserFrame.tsx
    TerminalFrame.tsx
    CodeBlock.tsx
    MeshGradient.tsx
    Cursor.tsx
    Pill.tsx
    KineticTitle.tsx
  lib/
    timing.ts                 // shared easings + spring configs
    tokens.ts                 // design system tokens
    fonts.ts                  // geist font loader
  assets/                     // screenshots, logos, exports
```

Keep scenes pure: each one is a component that takes no props and uses `useCurrentFrame()` relative to its own sequence. The top-level `KraterionDemo.tsx` is the only file that knows about absolute timing.

---

## 3. Design Tokens (Kraterion = Vercel Geist palette + Sui/Walrus accents)

These are pulled from the Vercel Geist design system, which is what gives Linear/Vercel demos their "engineered" look. Drop these into `lib/tokens.ts`.

### Colors

```ts
// lib/tokens.ts
export const COLORS = {
  // Surfaces (dark theme — recommended for Kraterion's developer audience)
  bg100: "#0a0a0a",        // primary background
  bg200: "#171717",        // elevated surfaces, code blocks
  bg300: "#1f1f1f",        // hover states
  
  // Text
  textPrimary: "#ededed",  // headings, body
  textMuted: "#a1a1a1",    // descriptions
  textSubtle: "#737373",   // captions, metadata
  
  // Lines
  border: "#2a2a2a",       // shadow-as-border replacement for dark theme
  borderStrong: "#404040",
  
  // Status (Geist semantic)
  green: "#46A758",
  red: "#E5484D",
  amber: "#FFB224",
  blue: "#0070F3",
  purple: "#7928CA",
  
  // Kraterion accents (Sui/Walrus inspired — tune to your brand)
  suiBlue: "#4DA2FF",      // sui brand teal-blue
  walrusGreen: "#0CCABB",  // walrus mint
  
  // For light-mode hero scenes (Vercel-style)
  white: "#ffffff",
  vercelBlack: "#171717",  // not pure black, micro-warmth matters
  gray100: "#ebebeb",
  gray400: "#808080",
  gray600: "#4d4d4d",
} as const;
```

### Typography

```ts
export const TYPE = {
  // Display sizes use AGGRESSIVE negative letter-spacing.
  // This is the Geist signature — text reads like minified code.
  display: {
    fontSize: 96,
    fontWeight: 600,
    lineHeight: 1.0,
    letterSpacing: -4.5,    // -4.7% of font size
    fontFeatureSettings: '"liga" 1',
  },
  hero: {
    fontSize: 72,
    fontWeight: 600,
    lineHeight: 1.05,
    letterSpacing: -3.5,
  },
  h1: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: -2.4,
  },
  h2: {
    fontSize: 32,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: -1.28,
  },
  body: {
    fontSize: 22,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 0,
    textTransform: "uppercase" as const,
    fontFamily: "Geist Mono, monospace",
  },
} as const;
```

Three weights only: **400 (read), 500 (interact), 600 (announce)**. No bold. Hierarchy comes from size and letter-spacing, not weight.

### Spacing & radii

```ts
export const SPACE = {
  s: 8, m: 16, l: 24, xl: 32, xxl: 64, xxxl: 128,
} as const;

export const RADIUS = {
  sm: 4, md: 6, lg: 8, xl: 12, pill: 9999,
} as const;
```

### The Vercel "shadow-as-border" technique

Vercel never uses `border: 1px solid`. They use a multi-layer `box-shadow` stack so the line lives in the shadow layer. This is what makes cards feel "built" instead of "framed".

```ts
export const SHADOWS = {
  // The signature: a 1px shadow instead of a border
  ring: "0 0 0 1px rgba(255, 255, 255, 0.08)",
  ringLight: "0 0 0 1px rgba(0, 0, 0, 0.08)",  // for light-mode scenes
  
  // Full card stack — border + lift + ambient + inner glow
  card: `
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 2px 2px rgba(0, 0, 0, 0.04),
    0 8px 8px -8px rgba(0, 0, 0, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.02)
  `.trim(),
} as const;
```

### Font loading

```ts
// lib/fonts.ts
import { loadFont as loadGeistSans } from "@vercel/geist/font/sans";
import { loadFont as loadGeistMono } from "@vercel/geist/font/mono";

export const { fontFamily: geistSans } = loadGeistSans();
export const { fontFamily: geistMono } = loadGeistMono();
```

If you'd rather pull from a CDN to keep the bundle small:

```ts
import { delayRender, continueRender } from "remotion";

const handle = delayRender("Loading Geist");
const font = new FontFace(
  "Geist",
  `url(https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/Geist-SemiBold.woff2) format("woff2")`
);
font.load().then((loaded) => {
  document.fonts.add(loaded);
  continueRender(handle);
});
```

---

## 4. Animation Foundations

### The interpolate + bezier pattern (use this 80% of the time)

```ts
// lib/timing.ts
import { Easing } from "remotion";

// These three curves cover most cases. Pick one per scene and stay with it.
export const EASING = {
  // Crisp UI entrance — strong ease-out, no overshoot
  // Equivalent to CSS "ease-out-expo". Best for elements arriving on screen.
  out: Easing.bezier(0.16, 1, 0.3, 1),
  
  // Editorial fade — balanced ease-in-out, feels considered
  // Best for opacity-only crossfades and slow camera moves.
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
  
  // Crisp exit — starts slow, accelerates away (gravity)
  in: Easing.bezier(0.5, 0, 0.75, 0),
  
  // Playful overshoot (use SPARINGLY, max once per video)
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;
```

### Spring configs (for stuff that needs to feel physical)

```ts
import { spring } from "remotion";

// Standard "Geist" spring — smooth, damped, no overshoot
export const springGeist = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 150, mass: 0.8 },
  });

// Springy entrance with a touch of overshoot — use for icons, badges
export const springPop = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });
```

### Helper: drive multiple properties from one progress value

This is the single most underused pattern. Instead of writing five `interpolate()` calls for one entrance, compute one `progress` value and derive everything from it.

```ts
import { useCurrentFrame, interpolate } from "remotion";
import { EASING } from "../lib/timing";

const HeroLine = () => {
  const frame = useCurrentFrame();
  
  // One normalized progress value drives all properties
  const progress = interpolate(frame, [0, 30], [0, 1], {
    easing: EASING.out,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  // Derive everything from progress
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const y = interpolate(progress, [0, 1], [20, 0]);
  const blur = interpolate(progress, [0, 1], [12, 0]);
  
  return (
    <div style={{
      opacity,
      transform: `translateY(${y}px)`,
      filter: `blur(${blur}px)`,
    }}>
      Decentralized data infrastructure
    </div>
  );
};
```

This pattern keeps timing decoupled from mapping, which makes scenes easy to retime later.

### The "5 motion principles" cheat sheet

1. **Entrances use `Easing.out`** (start fast, decelerate into place — feels like arriving)
2. **Exits use `Easing.in`** (start slow, accelerate away — feels like leaving)
3. **Crossfades use `Easing.inOut`** (symmetric, no asymmetry between in and out)
4. **Camera moves (Ken Burns) use long linear or ease-in-out** at 8-15 seconds
5. **Never animate properties that don't compose well**: prefer `opacity`, `transform: translate/scale`, `filter: blur`. Avoid animating `width`, `height`, `top`, `left` directly.

---

## 5. Premium Transitions (the wow moments)

### TransitionSeries — the foundation

This is the spine of the whole video. Every scene-to-scene cut goes through `<TransitionSeries.Transition>`.

```tsx
// KraterionDemo.tsx
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

import { Hero } from "./scenes/01-hero";
import { Problem } from "./scenes/02-problem";
// ...

export const KraterionDemo = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={150}>
      <Hero />
    </TransitionSeries.Sequence>
    
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    
    <TransitionSeries.Sequence durationInFrames={180}>
      <Problem />
    </TransitionSeries.Sequence>
    
    {/* ... more scenes */}
  </TransitionSeries>
);
```

**Default transition duration: 18 frames (0.6s) at 30fps.** Too fast and it feels jarring. Too slow and the video drags. The fade should feel inevitable, not noticed.

### The seven transitions you actually need

| Transition | When to use | Code |
|---|---|---|
| `fade()` | 80% of scene cuts. The boring default is correct. | `presentation={fade()}` |
| `slide({ direction: "from-right" })` | Same context, next step (page-flip feel) | from `@remotion/transitions/slide` |
| `wipe({ direction: "from-left" })` | New section, "reveal" moment | from `@remotion/transitions/wipe` |
| `clockWipe()` | Reset/refresh feel — use ONCE in the video max | from `@remotion/transitions/clock-wipe` |
| `flip()` | Card-flip metaphor (front/back of same object) | from `@remotion/transitions/flip` |
| Custom blur transition | Premium "the camera refocuses" feel | see below |
| Overlay (light leak) | Punctuate without cutting | `<TransitionSeries.Overlay>` |

### The "blur dissolve" — the Vercel signature transition

This is the move you see in every Vercel launch. Two scenes blur into each other through a midpoint where everything is out of focus. Five seconds of work, looks expensive.

```tsx
import { useCurrentFrame, interpolate } from "remotion";
import { TransitionPresentation } from "@remotion/transitions";

const blurDissolve = (): TransitionPresentation<Record<string, unknown>> => ({
  component: ({ children, presentationProgress, presentationDirection }) => {
    // presentationProgress goes from 0 to 1 during the transition
    // For "entering" (from): goes 0->1 as scene appears
    // For "exiting" (to): goes 0->1 as scene disappears
    
    const blur = presentationDirection === "entering"
      ? interpolate(presentationProgress, [0, 1], [20, 0])
      : interpolate(presentationProgress, [0, 1], [0, 20]);
    
    const opacity = presentationDirection === "entering"
      ? presentationProgress
      : 1 - presentationProgress;
    
    return (
      <div style={{ filter: `blur(${blur}px)`, opacity, width: "100%", height: "100%" }}>
        {children}
      </div>
    );
  },
  props: {},
});

// Use:
<TransitionSeries.Transition
  presentation={blurDissolve()}
  timing={linearTiming({ durationInFrames: 24 })}
/>
```

### The "directional push" — Linear-style scene change

When you want it to feel like the camera is pushing forward into the next scene (new app, new feature reveal).

```tsx
const spatialPush = (direction: "horizontal" | "vertical" = "horizontal") => ({
  component: ({ children, presentationProgress, presentationDirection }) => {
    const axis = direction === "horizontal" ? "X" : "Y";
    const out = presentationDirection === "exiting";
    
    const translate = out
      ? interpolate(presentationProgress, [0, 1], [0, -30])
      : interpolate(presentationProgress, [0, 1], [30, 0]);
    
    const scale = out
      ? interpolate(presentationProgress, [0, 1], [1, 0.95])
      : interpolate(presentationProgress, [0, 1], [1.05, 1]);
    
    const opacity = out
      ? interpolate(presentationProgress, [0.5, 1], [1, 0])
      : interpolate(presentationProgress, [0, 0.5], [0, 1]);
    
    return (
      <div style={{
        transform: `translate${axis}(${translate}%) scale(${scale})`,
        opacity,
        width: "100%",
        height: "100%",
      }}>
        {children}
      </div>
    );
  },
  props: {},
});
```

### Light leak overlay (punctuate without cutting)

Use `@remotion/light-leaks` to overlay a brief flash between two scenes without shortening either one. Good for a "feature unlock" moment where you don't want to lose any of either scene.

```tsx
import { TransitionSeries } from "@remotion/transitions";
import { LightLeak } from "@remotion/light-leaks";

<TransitionSeries.Sequence durationInFrames={120}>
  <SceneA />
</TransitionSeries.Sequence>

<TransitionSeries.Overlay durationInFrames={20}>
  <LightLeak />
</TransitionSeries.Overlay>

<TransitionSeries.Sequence durationInFrames={120}>
  <SceneB />
</TransitionSeries.Sequence>
```

### Rules for transitions

- **Pick 2-3 transitions for the whole video.** Default fade + one signature move (blur dissolve recommended) + one accent (light leak or directional push). No more.
- **Match transition energy to content.** A subtle fade between two static title cards. A push when moving from architecture diagram to dashboard. A wipe when introducing a brand-new section.
- **Same transition family within a section.** If scenes 3, 4, 5 are all about the upload flow, they use the same transition between them. The transition signals "still inside this story."

---

## 6. Text & Title Card Patterns

These are the "wow" moments. Each one earns its scene.

### Blur reveal (the Vercel/Linear opening shot)

```tsx
import { useCurrentFrame, interpolate, AbsoluteFill } from "remotion";
import { EASING } from "../lib/timing";
import { COLORS, TYPE } from "../lib/tokens";

export const BlurReveal = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  
  const progress = interpolate(frame, [0, 35], [0, 1], {
    easing: EASING.out,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  const blur = interpolate(progress, [0, 1], [40, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [1.05, 1]);
  
  return (
    <AbsoluteFill style={{
      background: COLORS.bg100,
      alignItems: "center",
      justifyContent: "center",
    }}>
      <h1 style={{
        ...TYPE.display,
        color: COLORS.textPrimary,
        opacity,
        filter: `blur(${blur}px)`,
        transform: `scale(${scale})`,
      }}>
        {text}
      </h1>
    </AbsoluteFill>
  );
};
```

### Word-by-word reveal (for tagline + subtitle)

Each word fades and slides up independently with a stagger. Feels deliberate, like the line is being thought into existence.

```tsx
import { useCurrentFrame, interpolate } from "remotion";
import { EASING } from "../lib/timing";

const WORD_STAGGER = 4; // frames between each word's start
const WORD_DURATION = 25;

export const StaggeredWords = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3em" }}>
      {words.map((word, i) => {
        const start = i * WORD_STAGGER;
        const progress = interpolate(
          frame,
          [start, start + WORD_DURATION],
          [0, 1],
          { easing: EASING.out, extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        
        return (
          <span key={i} style={{
            display: "inline-block",
            opacity: progress,
            transform: `translateY(${interpolate(progress, [0, 1], [16, 0])}px)`,
          }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};
```

### Typewriter (for code or terminal text)

The official Remotion best-practice is **string slicing, never per-character opacity**. Per-character opacity causes layout shift because the empty characters still occupy space.

```tsx
import { useCurrentFrame } from "remotion";

const CHARS_PER_FRAME = 0.8;  // ~24 chars/second at 30fps

export const Typewriter = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const frame = useCurrentFrame();
  const adjusted = Math.max(0, frame - delay);
  const charsToShow = Math.floor(adjusted * CHARS_PER_FRAME);
  const visible = text.slice(0, charsToShow);
  
  // Blinking cursor (1Hz)
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;
  const typingDone = charsToShow >= text.length;
  
  return (
    <span style={{ fontFamily: "Geist Mono, monospace" }}>
      {visible}
      <span style={{ opacity: typingDone && !cursorVisible ? 0 : 1 }}>▍</span>
    </span>
  );
};
```

### Counter (animated number)

```tsx
import { useCurrentFrame, interpolate } from "remotion";
import { EASING } from "../lib/timing";

export const AnimatedCounter = ({
  from = 0,
  to,
  durationInFrames = 60,
  suffix = "",
}: {
  from?: number;
  to: number;
  durationInFrames?: number;
  suffix?: string;
}) => {
  const frame = useCurrentFrame();
  const value = interpolate(frame, [0, durationInFrames], [from, to], {
    easing: EASING.out,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {Math.round(value).toLocaleString()}{suffix}
    </span>
  );
};
```

Use `tabular-nums` so digits don't shift width as they change. Critical for any counter.

---

## 7. UI Showcase Components

### Browser frame (for dashboard screenshots)

Vercel-style minimal chrome. No fake URL bar text unless it's part of the story.

```tsx
import { COLORS, SHADOWS, RADIUS } from "../lib/tokens";

export const BrowserFrame = ({
  url = "kraterion.dev/dashboard",
  children,
}: {
  url?: string;
  children: React.ReactNode;
}) => (
  <div style={{
    background: COLORS.bg200,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOWS.card,
    overflow: "hidden",
    width: "100%",
  }}>
    {/* Top bar */}
    <div style={{
      height: 44,
      background: COLORS.bg300,
      display: "flex",
      alignItems: "center",
      paddingLeft: 16,
      gap: 8,
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      {/* Traffic lights */}
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
      
      {/* URL pill */}
      <div style={{
        marginLeft: 24,
        padding: "4px 12px",
        background: COLORS.bg100,
        borderRadius: RADIUS.md,
        color: COLORS.textMuted,
        fontSize: 13,
        fontFamily: "Geist Mono, monospace",
        flex: 1,
        maxWidth: 400,
      }}>
        {url}
      </div>
    </div>
    
    {/* Content area */}
    <div style={{ background: COLORS.bg100 }}>
      {children}
    </div>
  </div>
);
```

### Terminal frame (for CLI scenes)

```tsx
export const TerminalFrame = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    background: "#0d0d0d",
    borderRadius: RADIUS.lg,
    boxShadow: SHADOWS.card,
    overflow: "hidden",
    fontFamily: "Geist Mono, monospace",
    fontSize: 16,
    lineHeight: 1.6,
    color: "#e1e1e1",
  }}>
    <div style={{
      height: 32,
      background: "#1a1a1a",
      display: "flex",
      alignItems: "center",
      paddingLeft: 12,
      gap: 8,
    }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
    </div>
    <div style={{ padding: 24 }}>
      {children}
    </div>
  </div>
);
```

### Code block with syntax highlighting

Use `prism-react-renderer`, **not regex**. The Vercel skill is explicit about this — regex highlighting breaks on edge cases and looks amateur.

```tsx
import { Highlight, themes } from "prism-react-renderer";

export const CodeBlock = ({
  code,
  language = "typescript",
}: {
  code: string;
  language?: string;
}) => (
  <Highlight theme={themes.vsDark} code={code.trim()} language={language}>
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre style={{
        ...style,
        background: "transparent",
        padding: 24,
        fontSize: 18,
        fontFamily: "Geist Mono, monospace",
        margin: 0,
      }}>
        {tokens.map((line, i) => (
          <div key={i} {...getLineProps({ line })}>
            <span style={{ opacity: 0.3, paddingRight: 16, userSelect: "none" }}>
              {String(i + 1).padStart(2, " ")}
            </span>
            {line.map((token, j) => (
              <span key={j} {...getTokenProps({ token })} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </Highlight>
);
```

For animated code (Shiki Magic Move equivalent in Remotion), use `prism-react-renderer` with two snippets and crossfade with a translated overlay — or render each line as its own animated element with a stagger.

### Ken Burns on a screenshot (the cheap-but-effective premium move)

Take a static dashboard screenshot, slowly zoom and pan over it for 4-6 seconds while text overlays appear. This is half of what makes Linear demos feel cinematic.

```tsx
import { Img, useCurrentFrame, interpolate, AbsoluteFill, staticFile } from "remotion";
import { EASING } from "../lib/timing";

export const KenBurnsScreenshot = ({
  src,
  durationInFrames,
  fromScale = 1.0,
  toScale = 1.12,
  fromX = 0,
  toX = -3,
  fromY = 0,
  toY = -2,
}: {
  src: string;
  durationInFrames: number;
  fromScale?: number;
  toScale?: number;
  fromX?: number;
  toX?: number;
  fromY?: number;
  toY?: number;
}) => {
  const frame = useCurrentFrame();
  
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing: EASING.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  const scale = interpolate(progress, [0, 1], [fromScale, toScale]);
  const x = interpolate(progress, [0, 1], [fromX, toX]);
  const y = interpolate(progress, [0, 1], [fromY, toY]);
  
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${x}%, ${y}%)`,
        }}
      />
    </AbsoluteFill>
  );
};
```

### Cursor that moves and clicks

```tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Cursor = ({
  from,
  to,
  startFrame,
  durationFrames,
  clickAt,  // frame number where the click happens
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  startFrame: number;
  durationFrames: number;
  clickAt?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    { easing: EASING.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const x = interpolate(progress, [0, 1], [from.x, to.x]);
  const y = interpolate(progress, [0, 1], [from.y, to.y]);
  
  // Click ripple
  const clickProgress = clickAt
    ? spring({ frame: frame - clickAt, fps, config: { damping: 12 } })
    : 0;
  
  return (
    <>
      <svg
        width="32" height="32" viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x, top: y,
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
          zIndex: 100,
        }}
      >
        <path d="M3 2 L21 12 L12 14 L9 21 Z" fill="white" stroke="black" strokeWidth="1.5" />
      </svg>
      {clickAt && clickProgress > 0 && (
        <div style={{
          position: "absolute",
          left: x - 20, top: y - 20,
          width: 40, height: 40,
          borderRadius: "50%",
          border: "2px solid white",
          opacity: 1 - clickProgress,
          transform: `scale(${1 + clickProgress * 2})`,
          zIndex: 99,
        }} />
      )}
    </>
  );
};
```

### Mesh gradient background (the "AI product" signature)

Linear's dashboard, Vercel's hero, OpenAI's homepage all use animated mesh gradients. The trick is to use 3-4 radial gradients on the same surface and slowly drift their positions.

```tsx
import { useCurrentFrame, interpolate } from "remotion";

export const MeshGradient = () => {
  const frame = useCurrentFrame();
  
  // Slowly drift each blob
  const t = frame / 30;
  const x1 = 50 + Math.sin(t * 0.3) * 20;
  const y1 = 40 + Math.cos(t * 0.4) * 15;
  const x2 = 70 + Math.sin(t * 0.5 + 1) * 25;
  const y2 = 60 + Math.cos(t * 0.3 + 1) * 20;
  
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: `
        radial-gradient(circle at ${x1}% ${y1}%, rgba(77, 162, 255, 0.4), transparent 50%),
        radial-gradient(circle at ${x2}% ${y2}%, rgba(12, 202, 187, 0.3), transparent 50%),
        radial-gradient(circle at 20% 80%, rgba(121, 40, 202, 0.25), transparent 50%),
        #0a0a0a
      `,
      filter: "blur(40px) saturate(1.2)",
    }} />
  );
};
```

---

## 8. Scene Patterns (composable scene archetypes)

These are the seven scene types you'll likely need. Each is a recipe — fill in the slots.

### Pattern A: Hero title card

```tsx
export const HeroScene = () => (
  <AbsoluteFill style={{ background: COLORS.bg100, alignItems: "center", justifyContent: "center" }}>
    <MeshGradient />
    <div style={{ position: "relative", textAlign: "center" }}>
      <BlurReveal text="Kraterion" />
      <FadeIn delay={20}>
        <p style={{ ...TYPE.body, color: COLORS.textMuted, marginTop: 24 }}>
          Decentralized storage with the developer experience of S3
        </p>
      </FadeIn>
    </div>
  </AbsoluteFill>
);
```

### Pattern B: Problem statement (one-liner with emphasis)

```tsx
export const ProblemScene = () => (
  <AbsoluteFill style={{
    background: COLORS.bg100,
    alignItems: "center",
    justifyContent: "center",
    padding: 120,
  }}>
    <StaggeredWords text="Storing data on chain is expensive, slow, and fragmented." />
    <FadeIn delay={60}>
      <p style={{ ...TYPE.body, color: COLORS.textMuted, marginTop: 32 }}>
        Every team rebuilds the same infrastructure from scratch.
      </p>
    </FadeIn>
  </AbsoluteFill>
);
```

### Pattern C: Architecture diagram (animated nodes)

Use a static SVG and animate stroke-dasharray for the connecting lines, plus `spring()` for each node's pop-in.

```tsx
export const ArchitectureScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const nodes = [
    { id: "client", x: 200, y: 400, label: "Your App", delay: 0 },
    { id: "gateway", x: 700, y: 400, label: "S3 Gateway", delay: 15 },
    { id: "walrus", x: 1200, y: 250, label: "Walrus", delay: 30 },
    { id: "sui", x: 1200, y: 550, label: "Sui", delay: 30 },
  ];
  
  return (
    <AbsoluteFill style={{ background: COLORS.bg100 }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080">
        {/* Lines first, so they sit behind nodes */}
        {/* ...animated lines with stroke-dashoffset */}
        
        {nodes.map((n) => {
          const scale = spring({ frame: frame - n.delay, fps, config: { damping: 200 }});
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y}) scale(${scale})`}>
              <rect width="180" height="80" x="-90" y="-40" rx="8" fill={COLORS.bg200} stroke={COLORS.border} />
              <text textAnchor="middle" fill={COLORS.textPrimary} fontFamily="Geist" fontSize="20">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
```

### Pattern D: Code → output split screen

Two panels: code on left, terminal/browser on right. As the code types in, the output appears on the right.

```tsx
export const CodeDemoScene = () => (
  <AbsoluteFill style={{
    background: COLORS.bg100,
    padding: 80,
    display: "flex",
    gap: 32,
    alignItems: "center",
  }}>
    <div style={{ flex: 1 }}>
      <CodeBlock
        code={`import { Kraterion } from "@kraterion/sdk";

const kr = new Kraterion({ apiKey });

await kr.upload("data.json", payload);`}
      />
    </div>
    <div style={{ flex: 1 }}>
      <FadeIn delay={90}>
        <TerminalFrame>
          <Typewriter text="✓ Uploaded to walrus://0x4ac...e2f1 (314KB, 280ms)" delay={90} />
        </TerminalFrame>
      </FadeIn>
    </div>
  </AbsoluteFill>
);
```

### Pattern E: Dashboard reveal with Ken Burns + callouts

```tsx
export const DashboardScene = () => {
  const frame = useCurrentFrame();
  
  return (
    <AbsoluteFill style={{ background: COLORS.bg100, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1600, position: "relative" }}>
        <BrowserFrame url="kraterion.dev/dashboard">
          <KenBurnsScreenshot src="/dashboard.png" durationInFrames={150} toScale={1.08} />
        </BrowserFrame>
        
        {/* Callout pills that appear at intervals to direct attention */}
        <Callout x={300} y={200} delay={45} label="Real-time storage stats" />
        <Callout x={900} y={350} delay={75} label="One-click S3 migration" />
        <Callout x={500} y={600} delay={105} label="Built-in MCP server" />
      </div>
    </AbsoluteFill>
  );
};
```

### Pattern F: Metric/proof card

```tsx
export const MetricScene = () => (
  <AbsoluteFill style={{ background: COLORS.bg100, alignItems: "center", justifyContent: "center" }}>
    <div style={{ display: "flex", gap: 64 }}>
      <Metric value={99.99} suffix="%" label="Availability" delay={0} />
      <Metric value={50} suffix="ms" label="P50 latency" delay={20} />
      <Metric value={10} suffix="x" label="Cheaper than S3" delay={40} />
    </div>
  </AbsoluteFill>
);

const Metric = ({ value, suffix, label, delay }) => (
  <FadeIn delay={delay}>
    <div style={{ textAlign: "center" }}>
      <div style={{ ...TYPE.hero, color: COLORS.suiBlue }}>
        <AnimatedCounter to={value} suffix={suffix} />
      </div>
      <div style={{ ...TYPE.caption, color: COLORS.textMuted, marginTop: 16 }}>
        {label}
      </div>
    </div>
  </FadeIn>
);
```

### Pattern G: CTA / outro

```tsx
export const CTAScene = () => (
  <AbsoluteFill style={{ background: COLORS.bg100, alignItems: "center", justifyContent: "center" }}>
    <BlurReveal text="kraterion.dev" />
    <FadeIn delay={30}>
      <Pill>Try the live demo</Pill>
    </FadeIn>
  </AbsoluteFill>
);
```

---

## 9. Storyboard (Kraterion-specific, 75 seconds)

A 75-second cut, 7 scenes. Tune the numbers as you build, but these durations work as a starting point.

```
SCENE 1 — Hero               [0:00–0:08]   240 frames
  Background: mesh gradient (blue → mint → purple)
  Beat 1 (0–25f):   "Kraterion" blurs in (display size, -4.5 letter-spacing)
  Beat 2 (40–80f):  Subtitle word-by-word: "Decentralized storage. Familiar API."
  Beat 3 (160–240f): Hold, slight parallax on gradient
  Transition: blur dissolve, 24 frames

SCENE 2 — Problem            [0:08–0:18]   300 frames
  Background: solid bg100
  Beat 1 (0–80f):   Staggered text "Web3 storage is fragmented, slow, and hard to ship with."
  Beat 2 (100–160f): Subtitle: "Every team builds the same infrastructure from scratch."
  Beat 3 (200–300f): Hold
  Transition: fade, 18 frames

SCENE 3 — Architecture       [0:18–0:30]   360 frames
  Background: bg100 with subtle grid
  Beat 1 (0–60f):   Architecture diagram nodes spring in (Your App → Gateway → Walrus + Sui)
  Beat 2 (60–120f): Connecting lines draw in (stroke-dashoffset)
  Beat 3 (120–360f): Camera pans slowly across, labels fade in
  Transition: spatial push, 20 frames

SCENE 4 — Upload flow (code) [0:30–0:42]   360 frames
  Background: bg100
  Layout: split screen, code left + terminal right
  Beat 1 (0–120f):  Typewriter on code block: `await kr.upload(...)`
  Beat 2 (120–180f): Terminal output appears: "✓ Uploaded to walrus://..."
  Beat 3 (180–360f): Cursor moves to "Open in Explorer" button, clicks
  Transition: clockWipe or blur dissolve (this is the "magic moment")

SCENE 5 — Dashboard reveal   [0:42–0:55]   390 frames
  Background: mesh gradient (subtle, behind frame)
  Beat 1 (0–30f):   Browser frame springs in from 95% scale
  Beat 2 (30–390f): Ken Burns over dashboard screenshot, slow zoom 1.0 → 1.08
  Beat 3 (60f, 120f, 180f): Three callout pills appear at key UI elements:
                            "Real-time storage stats"
                            "One-click S3 migration"
                            "Built-in MCP server"
  Transition: fade, 18 frames

SCENE 6 — MCP / AI layer     [0:55–1:07]   360 frames
  Background: bg100
  Beat 1 (0–60f):   Title: "Talk to your data."
  Beat 2 (60–180f): Mock chat interface: user asks "What's our storage usage by bucket?"
  Beat 3 (180–300f): Response streams in via typewriter, with chart appearing inline
  Beat 4 (300–360f): Caption: "MCP server included. Works with Claude, Cursor, any LLM."
  Transition: fade, 18 frames

SCENE 7 — CTA                [1:07–1:15]   240 frames
  Background: solid bg100, mesh gradient slowly fading in
  Beat 1 (0–35f):   "kraterion.dev" blurs in
  Beat 2 (50–120f): Pill: "Try the live demo"
  Beat 3 (120–240f): Hold, subtle pulse on pill
  End.
```

### Pacing notes

- Average scene = ~10 seconds. Anything under 6 feels rushed. Anything over 15 starts to drag unless the camera is moving.
- Each scene has 3 beats: **establish (entrance), state (hold + reveal), close (settle for the cut)**.
- Last 30 frames of every scene should be static or near-static so the transition has a clean handoff.
- First 15 frames of every scene are entrances only — no new info, just letting the previous transition complete.

---

## 10. Production checklist

Before shipping:

- [ ] Render at 1920x1080, 30fps, h264, CRF 18-23 for hero. CRF 28 for socials.
- [ ] Test playback on mobile Safari (the worst case). Fix any janky frames.
- [ ] All fonts loaded via `@vercel/geist` or `delayRender`/`continueRender` — never via CSS @import (will fail in render).
- [ ] No `localStorage`, no `window.matchMedia`, no `setTimeout` driving animation. Everything from `useCurrentFrame()`.
- [ ] Run `npx remotion lint` — Remotion catches non-deterministic patterns.
- [ ] Check the safe zone for vertical/social cuts: 150px top, 170px bottom.
- [ ] Export a 6-second teaser cut (just scene 1 + scene 5) for X/LinkedIn.

---

## 11. Resources

**Required reading (skim these once):**
- Official Remotion skills (39 rule files): https://github.com/remotion-dev/skills
- Geist design system reference: https://github.com/kapishdima/remocn/blob/main/DESIGN.md
- Vercel's `create-remotion-geist` skill: https://github.com/vercel-labs/skill-remotion-geist

**Component libraries you can pull from:**
- **remocn** (64+ shadcn-style components for Remotion): https://github.com/kapishdima/remocn
  - Install: `npx shadcn@latest add @remocn/<component-name>`
  - Browse: blur-reveal, typewriter, shimmer-sweep, glass-code-block, terminal-simulator, browser-flow, device-mockup-zoom, simulated-cursor, mesh-gradient-background, progress-steps
- **Remotion Animated**: https://www.remotion-animated.dev
- **Remotion Bits**: ready-made blocks for agent use
- **SwiftClip**: 30 production-ready Remotion templates

**For the official Remotion API:**
- Transitions: https://www.remotion.dev/docs/transitioning
- Interpolate: https://www.remotion.dev/docs/interpolate
- Spring: https://www.remotion.dev/docs/spring
- Sequencing: https://www.remotion.dev/docs/sequence

**Reference videos to study frame-by-frame:**
- Vercel Ship opening keynotes (any year) — watch for transition cadence
- Linear's "What's new" videos on their changelog page — watch for scene composition
- Cursor's announcement videos — watch for code/terminal patterns

---

## 12. The one-line prompt for Claude Code

When you're ready to start building, paste this into Claude Code:

> Read KRATERION_DEMO_GUIDE.md and the installed Remotion skills. Scaffold the project per section 2. Build all 7 scenes per the storyboard in section 9, using the components in sections 6-8 and the tokens in section 3. Default to `interpolate + Easing.bezier(0.16, 1, 0.3, 1)` for entrances. Use `TransitionSeries` with `fade()` between all scenes except scene 4 → 5 which uses the custom `blurDissolve`. Place all screenshots in `public/`. Don't add scenes I didn't ask for. Don't use emojis. Ask before deviating from the storyboard durations.
