# Premium pitch-deck design principles (applied brief)

Web research, 2026-07-09. Distilled to what we apply in this deck. Sources at bottom.

## Principles → how we apply them
1. **One idea per slide, stated as a claim.** Every headline is a sentence, not a topic. ✓ (two-tone headlines are claims). Keep.
2. **Whitespace is structure.** Fixed outer margin (`.slide` padding 52/72), nothing touches it; one dominant element per slide. ✓
3. **Reuse a few layout archetypes.** We use: full-bleed statement (hook/close), headline + grid-of-3 (problem/why/roadmap), split 55/45 (solution/business), headline + hero chart (market). ✓
4. **Big number when the number IS the story; chart only when the shape/trend matters.** Gap stat "8%", ARR numbers = big type. Market = chart because the *collision shape* is the point. ✓
5. **Charts read from the back:** thick strokes, few gridlines, **direct-label series at the line end (no legend hunting)**, one accent (Krater = the point), grey = context. → APPLIED: market chart now direct-labels the two lines at their ends.
6. **Motion clarifies, never entertains.** Ease-out, 200–400ms entrances; ambient loops slow + low-contrast; nothing behind text you must read. → APPLIED: tightened entrance to ~0.42s ease-out; ambient packets/pulses are slow and faint.
7. **Progressive reveal for a live talk.** `v-click` builds so the room reads with you, `[click]` markers in speaker notes. → APPLIED on the content-heavy list slides (problem cards, solution guarantees); charts animate on slide-enter.
8. **Type: one modular scale, few sizes; design contrast for projection (~AAA).** Squint-test at 3m. ✓ (Inter 400/500, fixed scale). Watch mid-grey on cream for key text.
9. **Monochrome base + a single accent doing all the work.** Krater on exactly one "notice-first" element per slide. ✓
10. **Subtle gradient/wash allowed as a rare accent, not everywhere.** One faint radial wash per key slide (matches the landing's bridge). ✓
11. **Amateur tells to avoid:** inconsistent margins/fonts between slides, overloaded problem slide, low-contrast, tables. **Expensive moves:** ruthless one-message slides, deliberate whitespace, direct-labeled minimal charts, single accent, PDF export leave-behind.
12. **Slidev specifics:** global `transition: fade`; `view-transition` to morph a persistent element across slides; presenter mode + `[click]` notes for timing; export static PDF as the reliable leave-behind.

## Pass 2 — "why minimal reads cheap" (applied)
Cheap = *undesigned* sparseness (default spacing/sizes, no structural device, accent doing nothing). Premium = few elements on a strict system + one focal move.
- **Indexed hairline ledger rows** replace plain bullets (number column + hairline dividers = spec-sheet look). → APPLIED on slide 3.
- **Tabular + lining figures** for every stat/number so columns align. → APPLIED globally (`tnum`/`lnum` on `.slide`).
- **Page furniture:** a fixed quiet footer (mono page number) on every slide = strong "designed system" signal. → APPLIED (`global-bottom.vue`).
- **Accent discipline: one accent, one job per slide.** Number indices go *muted*, Krater reserved for the single focal word. → APPLIED (ledger indices → stone; Krater on "can't").
- **Chart strokes ~2.5–3px non-scaling** (1.75 was too thin for projection). → APPLIED (market → 2.25px non-scaling).
- **Display tracking −0.01…−0.03em, tight leading; all-caps micro-labels +0.05–0.1em.** ✓ already in tokens.
- Data lines 3px ceiling; gridlines 1px behind data; one axis; direct-label endpoints; round hard ($1.2M). ✓ market chart follows this.

## Backlog (not yet applied — candidates for next pass)
- `view-transition` deck-wide + `view-transition-name` on the aperture/a hero number for morph continuity.
- Reusable Slidev **layouts** (`IndexRows`, `SpecTable`, `BigNumber`, `ChartSplit`) to enforce the grid once.
- Extend `v-click` pacing to market (draw → gap stat) and business (bars → Vercel line).
- `view-transition` morph of the aperture/wordmark across hook → close (through-line).
- Extend `v-click` builds to market (draw chart, then reveal gap stat) and business (bars, then Vercel line) if we want full click-pacing.
- Export a PDF leave-behind (`slides:export`, needs Playwright chromium).
- Squint-test contrast pass on all muted-grey body text.

## Sources
- Pixeldarts — Four design principles behind Stripe, Linear, and Vercel
- Qubit Capital — Pitch Deck Design Principles; Market Size Slide (TAM/SAM/SOM)
- Waveup — Market Opportunity Slide patterns 2026
- Displayr — 12 Visualizations to Show a Single Number
- Datawrapper — Text in data visualizations
- Motion.dev — Easing functions · NN/g — Animation Duration
- SlideBazaar — When animation looks gimmicky
- Design with Jack — 20 rules for slides that don't look AI-made
- Slidev docs — Animations; Presenter Mode
- LandingPageFlow — Gradient vs flat design
