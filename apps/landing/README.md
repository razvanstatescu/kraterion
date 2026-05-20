# @kraterion/landing

Marketing site for Kraterion. Next.js 16 (App Router + Turbopack), React 19, Tailwind v4 (CSS-first), TypeScript strict.

## Run

```bash
# from repo root
pnpm dev --filter @kraterion/landing
# or from this directory
pnpm dev
```

Defaults to <http://localhost:3000>. Pass `--port 3010` if it's taken.

## Build

```bash
pnpm build --filter @kraterion/landing
```

Every page renders as static HTML at build time, except `/api/og` (edge function).

## Architecture

- `app/(marketing)/` — `/`, `/s3`, `/knowledge`, `/embed`, `/pricing`, `/security` share the marketing layout (Header + Footer).
- `app/(docs)/docs/` — docs shell with sidebar + on-this-page rail.
- `app/api/og/route.tsx` — dynamic OG generator for subpages. Root `/` uses `app/opengraph-image.tsx`.
- `components/ui/` — primitives (Button, KraterionMark, CodeBlock, Pill, Hairline, CopyButton).
- `components/marketing/` — composites (Hero, ApertureHero, BucketFlowRibbon, S3ScrubBeat, PillarGrid, TerminalSim, KraterionChatWidget, etc.).
- `components/motion/` — motion primitives (FadeUp, Reveal).
- `components/providers/` — SmoothScroll (Lenis + GSAP RAF sync), MotionProvider (reduced-motion config).
- `lib/shiki.ts` — singleton highlighter with the warm-stone recolor.
- `lib/mock/` — pricing tiers, S3 endpoints + compatibility matrix.

## Motion stack

- **Lenis 1.3** for smooth-scroll, RAF-synced with GSAP via the ticker pattern. Disabled under `prefers-reduced-motion`.
- **GSAP 3.13 + ScrollTrigger** owns pinned/scrubbed sequences: `<BucketFlowRibbon>` (~120 vh pin) and `<S3ScrubBeat>` (scrub-driven SDK tab autoplay).
- **Motion** (formerly Framer Motion) owns declarative motion: `<FadeUp>`, `<Reveal>`, `<KraterionChatWidget>` AnimatePresence, code-tab underline `layoutId`.
- **R3F (lazy)** — `<ApertureHero>`. SSR off, loaded only above 768 px and when motion is allowed; falls back to a CSS-animated SVG otherwise.

Rule: GSAP owns scroll-pinned timelines; Motion owns everything else. They never animate the same property on the same element.

## Tokens

Mirrored verbatim from `/design-system/colors_and_type.css` into `app/globals.css` via Tailwind v4 `@theme`. Use the named utilities (`bg-ink`, `text-cream`, `text-stone-700`, `bg-krater`, `text-32`, etc.).

Hard rules — enforced by `globals.css`:

- No shadows. `box-shadow: none` on every element. Elevation is a hairline + bg contrast (`@utility hairline`).
- No font weight ≥ 600.
- Sentence case everywhere except 8–11px micro-labels (`@utility micro`).
- Focus ring is `2px solid var(--color-krater)` with 2px offset, applied via `:focus-visible`.
- A reduced-motion blanket nukes all transitions to 0.001 ms.

## Performance & SEO

- Every marketing page exports `dynamic = "force-static"`.
- `sitemap.xml` covers all 8 surfaces with priority weighting.
- `robots.txt` allows everything.
- `Organization` + `WebSite` JSON-LD is injected from `app/layout.tsx`.
- Per-page OG: subpages set `metadata.openGraph.images` to `/api/og?surface=...&title=...`. Root uses the more elaborate `app/opengraph-image.tsx`.

## Voice & content rules

Defer to `/design-system/README.md` for voice, casing, banned phrases. The site never uses crypto/web3 vocabulary even though the platform sits on Walrus/Sui/Seal — paraphrase per the table in `docs/website-plan.md` §11.4.

## Verify

```bash
# typecheck
node_modules/.bin/tsc --noEmit

# build
node_modules/.bin/next build

# smoke test routes (server must be running)
for p in / /s3 /knowledge /embed /pricing /security /docs /docs/quickstart; do
  curl -s -o /dev/null -w "%{http_code} $p\n" http://localhost:3000$p
done
```
