# Kraterion — Marketing site UI kit

The marketing surface. A calm, technical landing page above the fold; specific feature sections below; pricing; how-it-works.

## Sections

1. **Header** — sticky, sentence-case nav, two CTAs.
2. **Hero** — `Object storage you actually own.` + a terminal card and floating bucket card.
3. **Logos** — placeholder logos as a quiet trust strip.
4. **Features** — 6-up grid: SDK compatibility, Seal encryption, ownership, pricing, onboarding, S3 semantics.
5. **How it works** — Ink section, three numbered layers.
6. **Pricing** — three tiers, middle one emphasized with an Ink border.
7. **Footer** — Ink, brand + three columns.

## Components

| File | What it is |
|---|---|
| `Header.jsx` | Sticky top nav + brand + CTAs |
| `Hero.jsx` | First above-the-fold panel with code card |
| `Sections.jsx` | LogoStrip + Features grid |
| `Bottom.jsx` | HowItWorks + Pricing + Footer |
| `marketing.css` | Marketing-only layout |

Everything else is borrowed from `colors_and_type.css` and `ui_kits/console/Mark.jsx`, `Icon.jsx`, `primitives.jsx`.
