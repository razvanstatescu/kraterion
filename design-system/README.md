# Kraterion — Design System

> **Object storage you actually own.**

Kraterion is S3‑compatible object storage built on top of [Walrus](https://walrus.site), Sui, and Seal. It feels like Supabase Storage or DigitalOcean Spaces (Google sign‑in, credit‑card billing, a familiar bucket UI, an AWS‑SDK‑compatible HTTP API), but the underlying bytes are owned by the user — not by us. The product surfaces are:

1. **Storage console** — a web app for browsing buckets, uploading files, managing access keys, watching usage, and configuring billing. Closest references: Supabase Storage, DigitalOcean Spaces, Cloudflare R2 dashboard.
2. **Marketing website** — a calm, premium landing surface that explains the value of true ownership without leaning on crypto language.
3. **API / SDK** — drop‑in replacement for AWS S3 endpoints. Any S3‑compatible client (boto3, AWS SDK for JS, `s3cmd`, `rclone`, `mc`) works.

The brand sits in the same family as Linear, Vercel, and Stripe — restrained, confident, technically literate. The name *Kraterion* is the Greek diminutive of *krater*, an ancient mixing vessel; the mark is a top‑down view into that vessel, three concentric rings.

---

## Sources

| Source | Where | Notes |
|---|---|---|
| Brand brief + tokens | Pasted into the original prompt (preserved verbatim in this README) | Single source of truth at the time this system was built. |
| Logo | `uploads/kraterion-icon-mono.svg` | Mono variant. Light, dark, and accent variants generated and stored in `assets/`. |
| Codebase | *Not provided.* | UI kits in `ui_kits/` are interpretations of the brief, not recreations of an existing app. Flag for the user — re‑attach the codebase if it exists. |
| Figma | *Not provided.* | Same as above. |

---

## Index

```
README.md                  ← you are here
SKILL.md                   ← skill manifest for Claude Code / Agent Skills
colors_and_type.css        ← all design tokens + element + component defaults
assets/                    ← logos (light, dark, mono, accent, wordmark)
fonts/                     ← (none — Inter is loaded from Google Fonts; see "Fonts")
preview/                   ← Design System tab cards
ui_kits/
  console/                 ← Storage console (web app) — 4 screens, click-thru
  marketing/               ← Marketing website — landing page above the fold
```

Each UI kit has its own `README.md` and `index.html`.

---

## Content fundamentals

### Voice

Premium, restrained, trustworthy. Quiet confidence — never hyped, never crypto‑coded. Same family as Linear, Vercel, Stripe. The reader is a developer or a technical founder; we don't talk down to them, we don't oversell to them.

### Casing

**Sentence case in all UI and marketing surfaces.** The only place ALL CAPS is allowed is inside tight micro‑labels (8–11px, letter‑spacing ≥ 0.16em) — table headers, eyebrows, status pills, kbd shortcuts.

- **Brand:** `Kraterion` — capital K, never KRATERION, never kraterion.
- **Product nouns:** `bucket`, `object`, `file`, `access key` — all lowercase, even at the start of a UI string when grammatically valid.
- **Headings:** `Object storage you actually own.` — not `Object Storage You Actually Own.`

### Voice & person

- **Active voice.** "Couldn't reach the bucket" — not "The bucket could not be reached."
- **You** when addressing the user. **We** sparingly, only when the company itself is acting ("we never see your keys").
- **One idea per sentence.** Run‑ons read as marketing copy. Short reads as software.

### Numerals

All numbers are numerals: `5 buckets`, `2.4 GB`, `13 access keys`. Never spelled out, even at the start of a sentence (re‑word the sentence).

### Banned phrases

revolutionary · next‑gen · game‑changer · powered by · cutting‑edge · AI‑powered (when AI isn't the feature) · seamless · effortless · best‑in‑class

### Approved flagship line

**"Object storage you actually own."**

### Error and empty‑state copy

Every error states the next action. Plain English first, technical detail second.

| ❌ Wrong | ✅ Right |
|---|---|
| An error occurred. | Couldn't reach the bucket. Check your connection and retry. |
| Operation failed (403). | We don't have permission to write to this bucket. Check the access key's policy. |
| No data. | This bucket is empty. Upload a file or drag one here. |
| Loading… | Listing 1,200 objects. |

### Vibe checklist

- ✅ Direct, calm, technically literate.
- ✅ Reads like Linear release notes or Stripe docs.
- ❌ No exclamation marks except in genuine error UI (rarely even there).
- ❌ No emoji in product surfaces. (Marketing may use a single em‑dash — never an emoji.)
- ❌ No metaphors that sound like ad copy ("unlock", "supercharge", "transform").

---

## Visual foundations

### Palette

Three brand colors, ten warm neutrals, four semantic tones. **Pure black (`#000`) and pure white (`#FFF`) are forbidden** — use Ink and Cream. **Cool greys are forbidden** — neutrals lean warm.

- **Ink** `#0F0E0C` — primary text, dark surfaces.
- **Cream** `#F8F4EC` — page background, light surfaces.
- **Krater** `#C45B36` — brand accent. **Used sparingly.** Primary CTAs, active/selected states, brand moments. **Never two Krater elements touching.**

Stone scale (`--stone-50` → `--stone-900`) is the workhorse for type, borders, and surfaces. See `colors_and_type.css`.

Semantic: Olive success, warm crimson error, amber warning, deep teal info — the only cool note in the palette.

### Type

Single family: a geometric sans (Inter / Söhne / Geist Sans). Weights **400 and 500 only — never 600 or heavier.** Heavy weights overpower the warm palette. Wordmark is the same sans at 500 with `letter-spacing: 0.06em`.

Scale: `11 / 14 / 16 / 18 / 24 / 32 / 48 / 72`. Line‑height `1.5` body, `1.2` headings.

### Spacing

4px base. Allowed values: **4, 8, 12, 16, 24, 32, 48, 64, 96, 128.** Anything off‑scale is wrong.

### Shape

Three radii — `4 / 8 / 12`. No more.

- `--radius-sm: 4px` — inputs, small buttons, badges, status pills, kbd.
- `--radius-md: 8px` — cards, dialogs, dropdown menus.
- `--radius-lg: 12px` — large surfaces, hero panels.

### Borders

**0.5–1px hairlines only.** Never 2px+. Borders are `--border` (stone‑200 light / stone‑700 dark) for default and `--border-strong` (stone‑300 / stone‑600) for emphasis. Borders do the work shadows would in another system.

### Shadows

**Forbidden.** All elevation is communicated through `border + bg contrast`. A "card" is a different background tone wrapped by a hairline border. A "popover" is a panel with a slightly stronger border. No `box-shadow`, no glow, no blur, no inner‑shadow. (`text-shadow` likewise.)

### Backgrounds & imagery

- Full‑bleed photography is allowed in marketing only, and must be warm (Cream or Ink tinted), grain‑free, never blue/cyan. Think kiln light, raked sun, wet stone — not lifestyle photography.
- No gradients. No noise textures. No glassmorphism. No background patterns.
- Hero panels are flat Cream or Ink — the mark and type carry the weight.

### Layout rules

- Generous whitespace. The smallest gutter on a marketing surface is 64px.
- Console UI runs at 1440 design width, 14px body, 240px sidebar.
- Marketing runs at 1280 design width with a 1080px content max‑width.

### Hover / press / focus

| State | Treatment |
|---|---|
| Hover (button) | Background steps **one Stone darker.** |
| Hover (link) | Color steps to `--text-primary` (from secondary) — never underline‑on‑hover; underline is always present on inline links. |
| Hover (row, e.g. table) | Background → `--stone-50` (light) / `--stone-800` (dark). |
| Press | No transform. No shrink. Background steps **one more Stone darker** for ~80ms. |
| Focus | **2px Krater outline with 1px offset.** Never a brand‑colored fill on focus — outline only. |
| Disabled | 40% opacity. No color change. Cursor `not-allowed`. |

### Motion

Default easing `cubic-bezier(0.4, 0, 0.2, 1)`, default duration **200ms**. No bouncy springs. The mark itself has five named motions:

- **Aperture pulse** — middle ring `scale(1 → 1.05 → 1)`, 2.5s loop. For "alive" states.
- **Iris open** — inner dot `scale(0 → 1)`, 400ms. App boot.
- **Concentric ripple** — outer → middle → inner stagger fade‑in on hover, 80ms stagger.
- **Spin upload** — outer ring rotates 4s linear while uploading; dot stays still.
- **Krater pop** — inner dot transitions stone‑400 → Krater on active/selected, 200ms.

### Transparency & blur

- Blur is **forbidden** as a primary effect. Use Ink @ 45% (`rgba(15,14,12,0.45)`) for modal scrims — that is the only sanctioned use of transparency.
- No frosted glass. No `backdrop-filter: blur()`.

### Cards

Cream/Stone‑50 background, **stone‑200 hairline**, **no shadow**, `radius-md`, padding 16–24px. That's it. Cards do not have headers with colored backgrounds, accent borders, ribbons, or stripes.

### Imagery vibe

If photography is used, it should feel:

- **Warm** (Cream/clay/raw‑earth tones — never blue or steel)
- **Quiet** (single subject, lots of negative space, no people doing anything)
- **Material** (real surfaces — fired clay, paper, raw stone — not screen photography)

Grain is acceptable if it's the natural film grain of the photograph. **No added grain filters.** **No color grading toward teal/orange.**

---

## Iconography

- **Set:** [Lucide](https://lucide.dev) — 1.5px stroke, rounded line caps, 24px viewBox. It matches Kraterion's hairline‑first treatment and is broad enough to cover storage UIs (folder, file, key, lock, upload, download, settings, copy, trash, eye, link, search). Loaded from CDN where used.
- **Color:** Icons render in `currentColor`, inheriting their parent's text color. No dual‑tone, no fills, no colored backgrounds behind icons.
- **Size:** 16px in dense UI (table rows, inline labels), 20px in primary nav and buttons, 24px in feature blocks.
- **Stroke:** 1.5px. Never thicken. Never thin.
- **Emoji:** **Never** in product surfaces. (Acceptable in transactional email subjects only — but only the warm ones: `📦` etc. Document if/when added.)
- **Unicode glyphs as icons:** No. Use Lucide.
- **Custom marks:** Only the Kraterion aperture, in its four sanctioned variants. Don't redraw it; copy from `assets/`. Canonical palettes:
  - **light** (default for Cream surfaces) — outer `#7C7158`, middle `#403930`, dot `#1A1610`. Three earth-tone rings, no krater accent. Used by landing header, favicon, OG card, apple-touch icon, dashboard splash + auth + sidebar.
  - **dark** (for Ink surfaces) — outer `#7C7158`, middle `#F8F4EC` (cream), dot `#C45B36` (krater).
  - **on-krater** (white-on-orange, for accent-fill heroes) — all rings `#F8F4EC`.
  - **mono** — `currentColor` throughout; use for ink-on-glass, favicons, embossing.

> ⚠️ **Substitution flag:** No icon set was supplied with the brand brief. Lucide is a substitution chosen to match the stroke‑weight aesthetic. If the brand has a custom set, replace the CDN reference in `ui_kits/*/index.html` and update this section.

---

## Fonts

> ⚠️ **Font substitution flag.** No font files were supplied with the brand brief. The brief recommends Inter, Söhne, or Geist Sans. We've loaded **Inter** from Google Fonts as a stand‑in.
>
> Söhne is a paid Klim Type Foundry license; Geist Sans is open from Vercel. If Kraterion has selected one, please drop the font files into `fonts/` and update the `@font-face` block at the top of `colors_and_type.css`.

The token file uses a stack `'Inter', 'Söhne', 'Geist Sans', system-ui, …` so swapping is a one‑line change.

---

## How to use this system

1. **Tokens first.** Every Kraterion surface should `<link rel="stylesheet" href="…/colors_and_type.css">` (or its CSS imported) before any layout CSS. Tokens cascade.
2. **Components are seeds, not constraints.** `colors_and_type.css` ships `.btn`, `.input`, `.card`, `.pill`, `.dot` — use them, restyle them via the tokens, but do not abandon the token vocabulary.
3. **UI kit lookups.** When prototyping a new screen, open the matching kit's `index.html` first. Reuse the JSX components, don't reinvent.
4. **Copy first, design second.** Run new copy through the **Content fundamentals** checklist before laying it out — it's faster to fix tone than typography.

---

## Caveats & ask

- **No codebase or Figma was provided.** UI kits are interpretations of the brief, drawn against the tokens. They will diverge from any real Kraterion build.
- **Inter is a substitution** for an unspecified geometric sans.
- **Lucide is a substitution** for an unspecified icon set.
- **No real product photography** has been provided; marketing surfaces use placeholder image slots.

To make this perfect, please share **(a)** the codebase or Figma file if one exists, **(b)** the chosen typeface, and **(c)** any real screenshots or photography of the storage console.
