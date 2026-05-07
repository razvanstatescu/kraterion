---
name: kraterion-design
description: Use this skill when designing or building UI for Kraterion — marketing site, storage console, app screens, or any visual artifact. Loads the brand voice, design tokens, component primitives, and reference UI kits from /design-system/. Triggers on prompts like "design", "build a screen", "style this", "marketing page", "hero", "console UI", "make this on-brand".
user-invocable: true
---

The canonical design system lives at the repo root in `design-system/`. Before producing any UI or copy:

1. Read `design-system/README.md` for the brand voice, casing rules, banned phrases, palette laws, type scale, spacing scale, radii, borders, shadow rules (none), motion specs, and iconography.
2. Import or mirror tokens from `design-system/colors_and_type.css` — never hardcode colors, font sizes, spacing, or radii. Use the CSS variables (`--ink`, `--cream`, `--krater`, `--stone-*`, `--space-*`, `--radius-*`, `--ease`, `--dur-*`).
3. Reuse logos from `design-system/assets/` — pick the variant that matches the surface (light, dark, on-krater, mono).
4. Check `design-system/ui_kits/marketing/` for landing-page patterns and `design-system/ui_kits/console/` for app patterns before inventing new ones.
5. When you need a visual reference, the static HTML in `design-system/preview/` shows each token, component, and brand element rendered.

## Hard rules — do not violate

- **No pure black or pure white.** Use `--ink` / `--cream`.
- **No cool greys.** Stone scale is warm.
- **No font weight ≥ 600.** Only 400 and 500.
- **No drop shadows, glows, blur, or backdrop-filter.** Elevation is hairline borders + background contrast.
- **No gradients, no noise, no glassmorphism.**
- **No emoji in product surfaces.** Lucide icons (1.5px stroke) only.
- **No ALL CAPS** outside 8–11px micro-labels.
- **Tagline is "Object storage you actually own."** — verbatim.
- **Sentence case** for every heading and UI string.

## When this skill is invoked with no extra guidance

Ask the user what they want to design or build, then act as an expert designer using the tokens and rules above. Output either static HTML (for throwaway prototypes) or production code (when wiring to `kraterion-website/` or future app code) — match the request.

## Improving the system

The design system is meant to grow with the project. When the user adds new components, refines tokens, or settles brand decisions, persist those changes in `design-system/` (not in app code) so both the website and future app stay aligned.
