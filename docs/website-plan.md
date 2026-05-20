# Kraterion Marketing Website — Implementation Plan

A complete, opinionated, build-ready plan for a senior frontend agent (Claude Code) to ship the Kraterion marketing site autonomously. This document is the contract — every decision is named, the file order is concrete, copy direction is given per section, and the bans are explicit.

---

## 0. Executive summary

Kraterion is an S3-compatible object storage product with a Knowledge/RAG layer, first-class agents, and an embeddable chat widget. The site must read as a premium developer-tool brand — peer to Stripe, Linear, Vercel, Supabase, Resend — with **heavy but earned motion**, and **zero crypto/web3 vocabulary** even though the platform is built on Walrus, Sui, and Seal.

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 (CSS-first) + TypeScript. **Lenis 1.3** for smooth-scroll, **GSAP 3.13 + ScrollTrigger** for cinematic scrub/pin sequences, **Motion** (formerly Framer Motion) for declarative component motion, **React Three Fiber** for one earned WebGL hero centerpiece, **`@next/mdx` + Shiki** for docs and code blocks, **`next/og`** for OG images.

**Flagship headline:** *"Object storage you actually own."*

---

## 1. Information architecture

### 1.1 Site map (8 surfaces)

```
kraterion.com/
├── /                            Landing
├── /s3                          S3 API & SDKs
├── /knowledge                   Knowledge & Agents (RAG)
├── /embed                       Embed widget
├── /pricing                     Pricing
├── /security                    Security & ownership
├── /docs                        Docs hub (shell only at launch)
│   └── /docs/[...slug]          MDX-rendered docs pages
└── /docs/quickstart             First real doc page — validates the shell
```

URL rules: lowercase, hyphenated, never trailing slashes. Reserve `/blog`, `/customers`, `/changelog` for the future — they are listed as `disabled` in `next-sitemap.config.js` so we never accidentally index empty routes.

### 1.2 Global navigation

**Header (sticky, 64 px, hairline bottom border once scrolled past 24 px):**

```
[Kraterion]   Product ▾   S3   Knowledge   Embed   Pricing   Docs        Sign in   Start free →
```

- "Product ▾" is a single-column mega-menu listing: Object storage, Knowledge layer, Agents, Embed widget, Security. Hover-intent open (160 ms delay), Escape closes, focus-trap inside.
- Header is **transparent over the hero**, then on scroll past hero-bottom it becomes `bg-cream/85` with a 12 px backdrop blur. This is the **only** use of blur on the site and is functional (sticky chrome legibility), not decorative. Under `prefers-reduced-motion`, the blur is replaced with a solid Cream fill.
- CTAs: secondary "Sign in" as a text link; primary "Start free →" as a filled Ink button on Cream surfaces and a filled Cream button on Ink surfaces. Per brand: never two Krater elements touching, so the header CTA is Ink-on-Cream, not Krater-on-Cream.

**Footer (Ink #0F0E0C surface, 96 px top padding, 64 px bottom):** five columns — Product / Developers / Resources / Company / Legal — over a bottom row with wordmark left, "© 2026 Kraterion" center, and an info-dot status indicator right ("All systems normal" — `#3B6F73` dot, sentence case). No social icons larger than 20 px Lucide.

### 1.3 Mobile nav pattern

- Header collapses to `[Mark]   [Start free →]   [☰]`.
- The hamburger opens a **full-viewport sheet** (not a side drawer): Ink background, single column, 24–32 px Inter 500 links with 16 px row gaps, animated open via the named `iris-open` brand motion (200 ms scale 0.96 → 1, opacity 0 → 1; instant under reduced motion).
- Sub-nav (Product items) inline-expands rather than nesting a second sheet.
- Sheet root carries `data-lenis-prevent` so background scroll is locked.

---

## 2. Tech stack & libraries — final picks

### 2.1 Framework

- **Next.js 16, App Router only.** Per the official Next.js 16 release post (nextjs.org/blog/next-16, released October 21, 2025): *"Turbopack (stable): Default bundler for all apps with up to 5-10x faster Fast Refresh, and 2-5x faster builds."* Use Turbopack for dev and prod builds.
- Static generation by default — every marketing page sets `export const dynamic = 'force-static'`. The only dynamic route is `app/api/og/[…]`.
- Route groups: `app/(marketing)/...` for the public site, `app/(docs)/docs/...` for the docs shell. Both share `app/layout.tsx` (fonts, providers, analytics).
- React 19 Server Components for all page-level layouts and prose. `'use client'` is opt-in per leaf component that needs Motion, GSAP, Lenis, R3F, or local state.
- **No Server Actions** on the marketing site. Forms (waitlist, contact-sales) POST to dedicated `app/api/<form>/route.ts` Route Handlers so the integration boundary is explicit.
- Note: in Next.js 15/16, `params` and `searchParams` are **Promises**. Every dynamic page must `await params`.

### 2.2 Tailwind v4 — CSS-first tokens

Per Tailwind v4 docs (tailwindcss.com/blog/tailwindcss-v4): *"CSS theme variables — all of your design tokens exposed as native CSS variables so you can access them anywhere."* Configuration lives entirely in CSS, not a JS config file.

One file: `app/globals.css`. The brand tokens from the dashboard's existing design system are mirrored verbatim:

```css
@import "tailwindcss";

@theme inline {
  /* Surfaces */
  --color-ink:        #0F0E0C;
  --color-cream:      #F8F4EC;
  --color-krater:     #C45B36;

  /* Warm-Stone neutrals — 10 steps, NO cool greys, NO pure black/white */
  --color-stone-50:   #F8F4EC;
  --color-stone-100:  #EFE9DC;
  --color-stone-200:  #E1D8C3;
  --color-stone-300:  #CFC3A6;
  --color-stone-400:  #B4A582;
  --color-stone-500:  #948468;
  --color-stone-600:  #7C7158;
  --color-stone-700:  #5C5340;
  --color-stone-800:  #403930;
  --color-stone-900:  #1A1610;

  /* Semantic */
  --color-success:    #5C7A3F;
  --color-error:      #B53D2E;
  --color-warning:    #C28A3C;
  --color-info:       #3B6F73;

  /* Type scale — 11 / 14 / 16 / 18 / 24 / 32 / 48 / 72 */
  --text-11: 0.6875rem; --text-14: 0.875rem; --text-16: 1rem;
  --text-18: 1.125rem; --text-24: 1.5rem;   --text-32: 2rem;
  --text-48: 3rem;     --text-72: 4.5rem;

  /* Spacing base — 4 px; allowed values 4/8/12/16/24/32/48/64/96/128 */
  --spacing: 4px;

  /* Radii — 4 / 8 / 12 only */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;

  /* Motion */
  --ease-brand:    cubic-bezier(0.4, 0, 0.2, 1);
  --ease-aperture: cubic-bezier(0.2, 0.7, 0.2, 1);
  --ease-iris:     cubic-bezier(0.16, 1, 0.3, 1);
  --ease-krater-pop: cubic-bezier(0.34, 1.4, 0.64, 1);
  --duration-fast: 160ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;

  /* Fonts — Inter only, 400 and 500, never 600+ */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

/* Brand rule: no shadows. A hairline + bg contrast is our elevation. */
*, *::before, *::after { box-shadow: none !important; }

/* Reduced-motion blanket — catches anything we missed */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

A single custom utility replaces all elevation: `@utility hairline { box-shadow: 0 0 0 0.5px var(--color-stone-300); }` (the one place we intentionally use `box-shadow` and override the blanket rule via cascade order). Borders default to `border-stone-200/60`.

Container queries (`@container`) are used in the pricing cards, the docs sidebar collapse, and the embed widget preview.

### 2.3 Animation libraries — split by job

| Job | Library | Why |
|---|---|---|
| Page-load entrance, micro-interactions, hover/press, `AnimatePresence` on the chat widget | **Motion** (`motion`) | Tree-shakable, React-native API. Per motion.dev/docs/gsap-vs-motion: *"In benchmarks, Motion is 2.5x faster than GSAP at animating from unknown values, and 6x faster at animating between different value types."* |
| Scroll-pinned timelines, scrubbed code-reveal, the hero aperture, the bucket→knowledge→agent ribbon | **GSAP 3.13 + ScrollTrigger** with `useGSAP` from `@gsap/react` | Pixel-perfect scroll choreography; no other library matches it for scrubbing + pinning |
| Smooth-scroll backbone | **Lenis 1.3** via `lenis/react`, `autoRaf: false` | Matches the Linear/Vercel scroll feel |
| 3D hero centerpiece (one place only) | **React Three Fiber + drei**, lazy via `next/dynamic({ ssr: false })` | The Kraterion mark is begging for it; SVG fallback below 768 px and under reduced motion |

The two imperative+declarative systems are kept clean by rule: GSAP owns scroll-pinned timelines, Motion owns everything else, and the two **never** animate the same property on the same element.

The Lenis + GSAP integration uses the RAF-sync pattern that the Lenis docs explicitly require: feed Lenis's `raf` into `gsap.ticker` so both systems run on a single requestAnimationFrame loop, otherwise ScrollTrigger positions jitter by 1–2 frames.

### 2.4 Content & code

- **MDX** via `@next/mdx`. (Contentlayer is effectively unmaintained since Stackbit's Netlify acquisition; we don't need Velite yet.) The official Next.js docs confirm that *"The `mdx-components.js|tsx` file is required to use `@next/mdx` with App Router and will not work without it."* That file lives at the project root.
- **Shiki** for syntax highlighting, build-time, server-rendered. Per the PkgPulse 2026 syntax-highlighter comparison (pkgpulse.com/guides/shiki-vs-prismjs-vs-highlightjs-syntax-highlighting-2026): *"approximately 5 million weekly downloads, driven almost entirely by its inclusion in major documentation frameworks"* — and crucially, Shiki *"renders to HTML at build time, no client-side JavaScript needed."* That is exactly the trade-off this marketing site needs: zero highlight JS shipped to the client, no flash-of-unstyled-code.
- A custom `kraterion-warm` Shiki theme (and a dark variant) ships in `theme/`. Krater accent appears **inside** code blocks (for keywords) — code blocks are self-contained surfaces, so this doesn't violate the single-accent rule on the surrounding page.

### 2.5 Other libraries

- **shadcn/ui** copy-in primitives only: `Button`, `Dialog`, `Tabs`, `Tooltip`, `Sheet`, `Sidebar`, `DropdownMenu`. Each is restyled to brand tokens (no default radius, no default shadow). Do not pull in `Card`, `Alert`, or other "pre-decorated" components.
- **Lucide** icons — 1.5 px stroke, sizes 16/20/24, color `currentColor`.
- **`next/font/google`** for Inter, Latin subset, weights 400 + 500 only, `display: 'swap'`, preloaded.
- **`next/og`** (bundled with App Router) for OG images. The official Vercel docs note: *"App router includes `@vercel/og`. No need to install it."*
- **`next-sitemap`** for `sitemap.xml` + `robots.txt`.
- **`@vercel/analytics`** + **`@vercel/speed-insights`** — the only third-party scripts on the site.

### 2.6 Image strategy

- `next/image` for every product screenshot. Sources are 2× WebP/AVIF in `public/img/<surface>/`. The dashboard already exists — pull at 1440 × 900 native, then crop per section.
- Marketing illustrations are SVG only, warm-stone palette, 1 px strokes. No raster illustrations.
- The Kraterion mark ships as a single optimized SVG, referenced everywhere by `<KraterionMark />`.

---

## 3. Page-by-page design spec

Wireframe convention: `┌─┐` frames, `▓` filled, `░` subdued hairlines.

### 3.1 Landing (`/`)

**Scroll order:** Hero → Social proof → 4 pillars → S3 deep beat → Knowledge ribbon → Agents beat → Embed widget beat → Ownership beat → Developer quickstart → Pricing teaser → Final CTA.

**Above-the-fold copy:**
- Headline: **Object storage you actually own.**
- Lede: One bucket. S3-compatible. Searchable. Agent-ready. Embeddable. Bring the tools you already use; leave whenever you want.
- CTAs: `Start free →` (primary) and `Read the docs` (secondary text link).
- Quiet micro-rail right of the headline: three 11 px uppercase labels — `S3 API`, `KNOWLEDGE LAYER`, `AGENTS` — with 0.16em tracking and 24 px gaps separated by 0.5 px hairlines.

**Hero wireframe (desktop, 1440 × 900):**

```
┌─────────────────────────────────────────────────────────────────┐
│ [Kraterion]  Product ▾  S3  Knowledge  Embed  Pricing  Docs     │
│                                                       Sign in   │
│                                                       Start →   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ┌───────────────┐                            │
│                    │   ◯           │                            │
│                    │  ◯ ◯          │  ← aperture: three rings   │
│                    │ ◯  •  ◯       │     opening, single Krater │
│                    │  ◯ ◯          │     dot at center          │
│                    │   ◯           │                            │
│                    └───────────────┘                            │
│                                                                 │
│      Object storage you actually own.                           │
│                                                                 │
│      One bucket. S3-compatible. Searchable. Agent-ready.        │
│      Embeddable. Bring the tools you already use; leave         │
│      whenever you want.                                         │
│                                                                 │
│      [ Start free → ]   Read the docs                           │
│                                                                 │
│  ░░ S3 API  ░░ KNOWLEDGE LAYER  ░░ AGENTS                       │
└─────────────────────────────────────────────────────────────────┘
```

**Section 2 — Social proof strip:** "Trusted by builders at" + 6 placeholder wordmarks rendered as stone-600 SVG, 80 ms-staggered cross-fade on `whileInView`. Below: "From weekend projects to teams that ship every day." Container queries collapse to a 2-up scrolling marquee under 640 px.

**Section 3 — Four pillars** (2×2 on desktop, stacked on mobile):

```
┌──────────────────────┬──────────────────────┐
│ ▓ S3-compatible      │ ▓ Knowledge layer    │
│   object storage     │                      │
│   boto3, aws-cli,    │   Flip a switch on   │
│   rclone, JS SDK.    │   a bucket. Every    │
│                      │   file becomes       │
│                      │   searchable.        │
├──────────────────────┼──────────────────────┤
│ ▓ Agents             │ ▓ Embed widget       │
│   OpenAI-compatible. │   One <script> tag.  │
│   Tools, citations,  │   Origin-locked      │
│   answers.           │   share tokens.      │
└──────────────────────┴──────────────────────┘
```

Each pillar: 24 px Lucide icon, 24 px headline (Inter 500), 16 px lede (stone-700), 3-item spec list. The only hover affordance is the icon's inner shape rotating 8° over 200 ms via `--ease-aperture`.

**Section 4 — S3 compatibility deep beat (the "code that speaks the brand"):**

Left rail: headline *"It speaks S3 — really."* + three bullets ("Point your boto3 client at us.", "rclone, aws-cli, MinIO Client work today.", "Multipart, presigned URLs, lifecycle rules, server-side encryption.").

Right rail: tabbed `<CodeBlock>` (boto3 / aws-cli / rclone / JS SDK). Pinned ScrollTrigger advances the active tab as the user scrolls through the section (pin for ~120 vh). The tab underline animates between options via Motion `layoutId`. This is the Vercel-grade "code that morphs as you scroll" moment.

**Section 5 — Knowledge ribbon** (full-bleed Ink surface, Cream type, pinned scrubbed timeline):

```
       ░ bucket             ░ indexed knowledge         ░ answer + citation
       ▓ file rows ━━━━━━▶  ▓ chunked + embedded ━━━▶  ▓ chat panel
                                                          ↳ src/file-12.pdf p.4
```

Pinned ~120 vh, scrubbed:
- 0–33 %: file rows fill top-down.
- 33–66 %: each row emits a 4 px square outward into a 3×4 chunk grid (`stagger: { from: 'start', amount: 0.4 }`).
- 66–100 %: chunk grid collapses right and reveals a chat answer card with a citation chip — the citation chip is the only Krater element on this surface.

**Section 6 — Agents beat:** Endpoint card showing `POST /v1/agents/:id/chat/completions` side-by-side with a small "drop-in OpenAI client" snippet (`baseURL: "https://api.kraterion.com/v1/agents/<id>"`). Below: a 5-up grid of built-in tools — `search`, `list`, `read`, `write`, `manifest` — each a 20 px Lucide icon + verb.

**Section 7 — Embed widget beat:** The page itself embeds a working `<KraterionChatWidget mode="live" />` on the right. The left rail shows:

```html
<script src="https://embed.kraterion.com/v1.js"
        data-token="pk_share_..."
        defer></script>
```

A `<CopyButton />` flashes from stone-200 → success-green on click.

**Section 8 — Ownership beat (Ink full-bleed):** Four short claims in a 2×2 grid, each a 32 px headline + 14 px stone-300 lede:

- **You actually own your data.** Pull your raw bytes over plain HTTPS from any region. No proprietary export.
- **Sealed before it leaves you.** Encryption is the default, not a setting. The platform stores only ciphertext.
- **Revocable access — enforced, not promised.** When you remove access, decryption stops. Not a policy. A property.
- **Predictable pricing.** No egress traps. No retrieval fees. No surprise bill on a busy weekend.

(These tile into the deeper Security page — §3.7.)

**Section 9 — Developer quickstart (simulated terminal):**

```
$ pip install boto3
$ export AWS_ENDPOINT_URL=https://s3.kraterion.com
$ aws s3 mb s3://my-bucket
$ aws s3 cp ./photo.jpg s3://my-bucket/
upload: ./photo.jpg to s3://my-bucket/photo.jpg
$ kraterion index s3://my-bucket --enable-rag
✓ indexed 1 file • ready to query
```

Users can type commands. `aws s3 ls`, `kraterion agents list`, `help` return canned realistic responses (see §7.3). Anything else: `kraterion: try 'help' or 'aws s3 ls'`.

**Section 10 — Pricing teaser:** Free / Pro / Scale columns, one line each, prominent "no egress fees" callout, CTA → `/pricing`.

**Section 11 — Final CTA:** Centered. *"Start a bucket in 30 seconds."* `Start free →`. Below: "No card. 5 GB free forever."

**Mobile adaptations:**
- R3F hero → static animated SVG with CSS-only `iris-open` keyframe.
- Multi-tab code blocks → single dropdown.
- Pinned scrubbed ribbon → 3 stacked cards on `whileInView`.
- Live embed widget → full-width, fixed 480 px height.

### 3.2 S3 API & SDKs (`/s3`)

**Order:** Hero → Drop-in story → Endpoints & regions → Full-screen tabbed code → Compatibility matrix → Migration story → CTA.

- Hero H1: *"Speak S3 from day one."* Lede: *"Point any S3 client at our endpoint. We do the rest."*
- Subtle background: a slowly rotating concentric-ring SVG at 4 % opacity, tucked behind the hero card.
- Endpoints table: region, S3 endpoint, status. Hairline rows. Status dot uses `info` or `success`.
- Compatibility matrix: 2-column table — feature / support (Supported / Partial / Roadmap), each with a Lucide check/dash/clock. Partial rows expand on click via `<Disclosure>`.
- Migration story: 3-step flow (`Point your client at us → We pull from your origin on first read → We serve from our edge`) with inline `rclone` and `aws s3 sync` examples.

**Motion:** minimal. Compatibility rows fade up with 30 ms stagger on view. No pinning here — restraint over choreography on a reference page.

### 3.3 Knowledge & Agents (`/knowledge`)

**Order:** Hero → Bucket→Indexed→Agent flow (canonical, slowed-down version of landing §5 with labels: "BM25 + dense vector retrieval", "top-k = 8", "rerank to 4") → Hybrid search beat → OpenAI-compatible endpoint beat → Citations & verifiability → 5 agent-tool tiles → Quickstart → CTA.

- Hero H1: *"Your bucket, now answerable."*
- Citations centerpiece: a chat answer card on the left, expanded citation tray on the right. Clicking a citation chip animates the file row to highlight. Copy: *"Every answer is bound to a tamper-evident, append-only record. Anyone can independently verify a citation came from your bucket."*
- Agent tools spec: 5-up grid — `search(query)`, `list(prefix)`, `read(key)`, `write(key, content)`, `manifest(answerId)`. Each tile expands on hover (200 ms) to show its JSON schema.

### 3.4 Embed widget (`/embed`)

**Order:** Hero → One-line snippet → Live widget pinned bottom-right of the viewport → Configuration → Share-token model → Origin allowlist & caps → Security beat → CTA.

- Hero H1: *"Drop a chat on any site. One line."*
- The live widget is `position: fixed` bottom-right for the whole page. A ScrollTrigger sends current-control state (theme, position, greeting) to the widget via `postMessage` as the user scrolls through the Configuration section — controls respond in real time.
- Share-token model section: a diagram showing token issuance → embed → request → rate-limited response, with the daily-cap counter ticking down as the user moves a slider.

### 3.5 Pricing (`/pricing`)

**Order:** Headline → 3 tier cards → Detailed comparison table → Egress/retrieval honesty section → FAQ → CTA.

- Headline: *"Predictable pricing. No egress traps."*
- Three tier cards (Free / Pro / Scale). **No Enterprise card** — a quiet "Talk to sales" text link sits below the row. The Pro card carries a single 0.5 px Krater hairline (the only Krater touch on this page).
- Detailed comparison table: 14 rows × 4 columns (Free / Pro / Scale / Talk to us), sticky header, row hover highlight.
- Egress honesty section: a small table benchmarking Kraterion's egress against named alternatives. Per Cloudflare's official R2 pricing documentation (developers.cloudflare.com/r2/pricing/), R2 charges **$0.015 per GB-month for Standard storage, with a 10 GB/month free tier (plus 1 million free Class A operations)** — and zero egress. This is the bar Kraterion's pricing language is benchmarking against. Cite the source URL in a footnote.
- FAQ: 6 questions in an accordion. Plain language, no marketing puff.

### 3.6 Docs hub (`/docs`) — the Stripe/Vercel/Resend shell

```
┌──────────────────────────────────────────────────────────────────┐
│  [Kraterion]  Product ▾  S3  Knowledge  Embed  Pricing  Docs    │
├────────────┬──────────────────────────────────────────┬──────────┤
│ Sidebar    │   # Quickstart                           │  On this │
│            │                                          │  page    │
│ Getting    │   Get from zero to a queryable bucket    │          │
│   started  │   in under five minutes.                 │  Install │
│ Quickstart │                                          │  Bucket  │
│ Concepts   │   ## Install                             │  Upload  │
│            │   ```bash                                │  Query   │
│ S3 API     │   pip install boto3                      │          │
│ Knowledge  │   ```                                    │          │
│ Agents     │   ...                                    │          │
│ Embed      │                                          │          │
└────────────┴──────────────────────────────────────────┴──────────┘
```

- Sidebar (shadcn `Sidebar`, restyled): collapsible groups, persisted via the `sidebar_state` cookie (shadcn pattern). Active item gets a 2 px Krater left border (the only Krater touch on the docs surface). `⌘K` opens a placeholder `<CommandDialog>`.
- Middle pane: MDX content, 720 px max-width, 18 px body, 1.7 line-height; headings auto-link on hover via `rehype-slug` + `rehype-autolink-headings`.
- Right rail: "On this page" built from the page's heading tree, active heading highlighted via Intersection Observer.
- One stub MDX page (`/docs/quickstart`) ships now to validate the shell.

### 3.7 Security & ownership (`/security`)

**Order:** Hero → Four ownership claims (expanded from landing §8) → How sealing works → How revocable access works → Verifiable audit log → Compliance & operational practice → CTA.

**Hero:** H1 *"Your data. Your keys. Your exit."* Lede: *"Most storage products promise ownership in a marketing line. We make it a property of the system."*

**The four claims, factually grounded** (paraphrased without crypto vocabulary):

1. **You can leave anytime — your bytes don't vanish.** *"Files are stored as plain bytes addressed by a stable ID. Any S3-compatible client can pull them. You don't need our tools to leave us."* The factual basis: Walrus is content-addressed and exposes raw blobs over plain HTTPS via standard aggregators — per docs.sui.io/sui-stack/walrus, *"An aggregator is an HTTP server that serves blobs over a standard REST API. Aggregators are the most direct way to read Walrus data."*

2. **Sealed before it leaves you.** *"Files are encrypted on your device before they ever reach the platform. The platform sees only encrypted bytes."* Per Seal's documentation (seal-docs.wal.app): *"To maximize privacy, Seal uses client-side encryption where the application or user is responsible to encrypt and decrypt the data."* And: *"Different parties can operate their own independent key servers, allowing users to realize t-out-of-n threshold encryption across n total key servers, where t is the minimum number required for decryption."*

3. **Revocable access — enforced, not promised.** *"When you remove access, the decryption keys stop being issued. The ciphertext sitting on disk becomes unreadable to the revoked party."* Per Seal docs: *"Seal leverages Sui for controlling access to the decryption keys... The application-specific logic in the Move package controls when to allow or disallow access to a key."* Per Mysten Labs' Seal mainnet launch post: *"When a user requests access, Seal's key servers verify the onchain policy and, if approved, return just-in-time decryption key shares to meet the configured threshold."*

4. **A verifiable audit log.** *"Every artifact — upload, indexing run, agent answer, citation — is bound to a uniquely-IDed, version-tracked record. Anyone can independently verify the history."* Per docs.sui.io/concepts/object-model: each object has *"a globally unique ID... a version number that increments every time a change is made to the object... metadata, such as the digest of the last transaction that used the object,"* forming *"a complete and cryptographically auditable view of the system's state and history."*

**How sealing works (without the c-word):** A four-step diagram. *Encrypt locally → upload ciphertext → store ciphertext → decrypt locally on read.* No "blockchain", "wallet", "token", "node" — use "key servers" and "policy" only.

**How revocable access works:** Four steps. *Define a policy → key servers enforce it → request access → policy denies → no keys issued.* Quiet caveat: "Existing ciphertext doesn't have to be deleted to be unreadable to a revoked party."

**Verifiable audit log:** A three-row visual: `[manifest id]  [version]  [last digest]`. Looks like a Git log, framed as "Every artifact has a tamper-evident history."

**Compliance & operational practice:** Plain English — "Encrypted in transit (TLS 1.3)", "Server-side access logs retained 90 days", "SOC 2 in progress — roadmap". **Do not claim HIPAA/PHI suitability** — Seal's docs explicitly warn against using it for *"highly sensitive data... or regulated personal data like PHI."*

**Critical non-claims** (the agent must not introduce them):
- Do NOT say "Walrus encrypts data at rest." Walrus docs explicitly state: *"Walrus does not provide native encryption for data."* The "sealed at rest" property comes from Seal applied **before** upload.
- Do NOT promise "immutable forever." Sui finality + object versioning supports "tamper-evident append-only history" — not "data cannot ever change."
- Do NOT claim HIPAA/PHI suitability.

**Motion on this page is deliberately quieter than the landing.** Trust is built by stillness. Fade-up on scroll, no scrubbed pinning.

---

## 4. Components inventory

### 4.1 Primitives (`components/ui/`)

| Component | Props | Motion | Used on |
|---|---|---|---|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost'; size: 'sm' \| 'md' \| 'lg'; asChild?: boolean` | 160 ms press scale 0.98, hover bg darken | All |
| `Link` | `href; external?: boolean` | 160 ms underline draw via `background-size` | All |
| `KraterionMark` | `variant: 'light' \| 'dark'; size: number` | exposes imperative `play()` for aperture-pulse | Header, footer, hero, OG |
| `KraterionWordmark` | `as?: 'h1' \| 'span'` | — | Header, footer |
| `CopyButton` | `value: string; label?: string` | tap → success-green 800 ms flash | Code blocks, embed snippet |
| `Tabs` | `tabs[]; value; onChange` | Motion `layoutId` underline | Code blocks, S3 page |
| `Disclosure` | `open; onOpenChange; summary; children` | height-auto via `useMeasure` | Compatibility matrix, FAQ |
| `Tooltip` | `content; delay?` | 120 ms fade | Icons, tool tiles |
| `Sheet` | wraps shadcn Sheet | iris-open | Mobile nav, docs ToC |
| `Sidebar` | shadcn Sidebar, restyled | — | Docs |
| `IconButton` | `icon: LucideIcon; label: string` | 200 ms rotate on hover | Header, code blocks |
| `Pill` | `tone: 'stone' \| 'success' \| 'krater'` | — | Status, citation chips |
| `Hairline` | `orientation: 'h' \| 'v'` | — | Layout glue |

### 4.2 Composites (`components/marketing/`)

| Component | Props | Motion | Used on |
|---|---|---|---|
| `Hero` | `eyebrow?, headline, lede, primaryCta, secondaryCta?` | Owns the GSAP intro timeline | Every page hero |
| `SectionFrame` | `eyebrow?, headline?, lede?, children, tone: 'cream' \| 'ink'` | header fades up on first view | All |
| `PillarGrid` | `pillars: Pillar[]` | icon rotate on hover | Landing §3 |
| `CodeBlock` | `tabs[]; activeTab; onTabChange?; scrollScrubbed?: boolean; copy?: boolean` | tab change via Motion `layoutId`; scrub mode exposes `setTabFromProgress` | Landing §4, S3 page, Knowledge page |
| `TerminalSim` | `lines: TerminalLine[]; interactive?: boolean; resolver?: (input) => string` | typewriter on view, blinking cursor (`step-end` 1s) | Landing §9 |
| `BucketFlowRibbon` | `stages: 3; pinHeight: '120vh'` | the pinned scrubbed GSAP timeline | Landing §5, Knowledge page |
| `KraterionChatWidget` | `mode: 'live' \| 'demo'; theme?; greeting?; token?` | typing indicators via Motion `AnimatePresence` | Embed page, Landing §7 |
| `CompatibilityRow` | `feature; support: 'full' \| 'partial' \| 'roadmap'` | row reveal on view | S3 page |
| `PricingCard` | `tier; highlight?: boolean` | hover lift via 0.5 px hairline shift | Pricing |
| `CitationChip` | `source; page?` | click pulses related list row | Knowledge page, Landing §5 |
| `OwnershipClaim` | `headline; lede; illustration?` | fade up | Landing §8, Security |
| `ApertureHero` | none (singleton) | the R3F three-ring aperture | Landing only |

### 4.3 Page-level layouts

- `app/(marketing)/layout.tsx` — header + footer; each section paints its own background.
- `app/(docs)/docs/layout.tsx` — sidebar + content + right rail.
- `app/layout.tsx` — root: `<html>`, Inter via `next/font`, `<SmoothScroll>`, `<MotionConfig reducedMotion="user">`, `<Analytics>`, `<SpeedInsights>`.

---

## 5. Motion & interaction system

### 5.1 Global scroll setup (Lenis + GSAP RAF-sync)

`components/providers/SmoothScroll.tsx`:

```tsx
'use client';
import { ReactLenis, useLenis } from 'lenis/react';
import 'lenis/dist/lenis.css';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // skip smooth-scroll entirely

    const update = (time: number) => ref.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis
      root ref={ref}
      options={{ lerp: 0.1, duration: 1.2, syncTouch: false, autoRaf: false }}
    >
      {children}
    </ReactLenis>
  );
}
```

Why these numbers: `lerp: 0.1` matches the Linear feel; `duration: 1.2` is the sweet spot between control and smoothness; `syncTouch: false` because forcing smooth scroll on touch fights the OS and hurts accessibility scores.

### 5.2 Reduced-motion strategy — three layers

1. **CSS blanket** in `globals.css` — nukes all transitions/animations to 0.001 ms (catches anything missed).
2. **`<MotionConfig reducedMotion="user">`** — every Motion component automatically honors the OS preference.
3. **GSAP `matchMedia`** — every ScrollTrigger is wrapped:

```ts
const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => { /* full motion */ });
mm.add('(prefers-reduced-motion: reduce)', () => { /* end-state only */ });
```

Lenis short-circuits entirely under reduced motion → users get native browser scrolling.

### 5.3 Animation primitives (`components/motion/`)

| Primitive | API | Behavior |
|---|---|---|
| `<FadeUp delay?; distance=16>` | Motion `whileInView` wrapper | 320 ms ease-brand; respects reduced motion |
| `<Reveal mode='lines' \| 'words'>` | text split with `<span>`s, staggered | 24 ms stagger; headlines only |
| `<ScrollPin trigger; end; children>` | GSAP-pinned wrapper | reduced-motion: drops the pin |
| `<ScrubTimeline build; deps?>` | callback receives timeline + ScrollTrigger config | ribbon, code-tab autoplay |
| `<Counter from; to; durationMs>` | Motion `useMotionValue` tween | embed rate-limit slider |

### 5.4 WebGL / Canvas moments — exactly two

1. **Landing hero `<ApertureHero>`** — R3F. The three concentric rings + Krater center dot.
2. **Optional Stripe-style warm-gradient wash on `/security` hero only** — using the public MiniGL WebGL gradient implementation (~10 KB), warm-stone palette. This is the **only** place the site uses a gradient. The brand rule "no gradients except sanctioned modal washes" is amended here for one sanctioned "Security hero wash" — and only here.

**Fallback strategy for both:**
- R3F hero: `next/dynamic(() => import('./ApertureHero'), { ssr: false, loading: () => <ApertureFallbackSVG /> })`. The fallback SVG runs a CSS-only `iris-open` keyframe. Below 768 px or under `prefers-reduced-motion`, R3F is never loaded.
- Gradient: a `<canvas>` with a `data-reduced-motion-skip` attribute; under reduced motion it's replaced by a static stone-100 fill.

### 5.5 Performance budget

| Metric | Target |
|---|---|
| LCP (mobile, Slow 4G) | ≤ 2.0 s |
| CLS | < 0.02 |
| INP | < 150 ms |
| JS shipped to client (landing route) | ≤ 110 KB gzipped, excluding R3F chunk |
| R3F chunk (lazy) | ≤ 90 KB gzipped, loaded after `requestIdleCallback` |
| Lighthouse mobile Performance | ≥ 92 |
| Total transferred bytes (landing) | ≤ 700 KB |

How we hit it: server-render every non-interactive section; isolate Motion to leaves; `next/dynamic` the hero canvas and the chat widget; subset Inter to Latin only; preload only the first hero image; preconnect to `api.kraterion.com` and the OG image domain.

---

## 6. Hero strategies — three fully-specified concepts

All three concepts use the Kraterion mark — three concentric rings + a central Krater dot — as the focal point. We are not bolting motion onto an unrelated logo; we are animating the mark itself.

### Concept A — "Aperture open" — **RECOMMENDED**

**What's visible at 100 vh on desktop:**

A centered, oversized rendering of the Kraterion mark (~480 px diameter): three concentric stone rings + a single Krater dot at the center. Headline below, CTA pair below that. A subtle slow drift on the rings (≤ 0.4° / s rotation, opposite directions for inner vs outer).

**Opening motion (first 0–3 s after load):**

- t = 0–0.6 s: all three rings start collapsed at the center (scale 0.02), invisible; Krater dot invisible.
- t = 0.2 s: outer ring scales up to 1.0, ease-out via `--ease-iris`.
- t = 0.5 s: middle ring scales up to 1.0.
- t = 0.8 s: inner ring scales up to 1.0.
- t = 1.0 s: Krater dot fades + scales to 1.0 via the named `krater-pop` motion (200 ms, slight overshoot via `--ease-krater-pop`).
- t = 1.2 s: headline `<Reveal mode="words">` begins, 24 ms stagger.
- t = 1.8 s: CTAs fade up.

This is the named brand motions `aperture-pulse` + `iris-open` + `krater-pop` composed into one timeline.

**Scroll-driven follow-through (0 → 100 % over 80 vh):**

- The three rings spread radially: outer ring grows to 600 px and fades to 30 % opacity, inner ring shrinks to 80 px; the Krater dot stays put.
- Headline + CTAs translate up at 0.6× scroll speed (subtle parallax).
- At 60 % scroll progress, six tiny 4×4 px stone-600 "data motes" materialize on the outer ring and orbit inward toward the dot — a literal visual metaphor for *"data converges into a single owned center."* They land on the dot and dissolve.

**Why this fits Kraterion:** The mark *is* an aperture. Every motion beat reinforces the product story. Single Krater touch, no gradients, no blur, no shadow, no glow — all transforms only. Fully brand-faithful.

**Build:** R3F + drei. Three `<RingGeometry>` meshes with `MeshBasicMaterial` in warm-stone colors; one small `<mesh>` for the Krater dot; six instanced meshes for the motes driven by `useFrame`. On idle, `frameloop="demand"` and `invalidate()` only on scroll change. Tree-shake drei imports to the minimum.

### Concept B — "Orbiting data ring"

**At 100 vh:** Same rings, smaller (~280 px), offset to the right two-thirds of the hero. Left holds the headline. Around the outer ring, ~12 small text labels orbit slowly clockwise: `bucket/photos/`, `agent.search(...)`, `manifest #4f2`, `s3://my-app`, etc. — sampled from real product surface.

**Opening motion:** Labels start clustered at the bottom of the ring and disperse around the perimeter over 1.2 s, staggered 70 ms each.

**Scroll-driven:** Labels rotate faster as scroll velocity increases, then peel off one by one and fly leftward — each one snaps into place as a section eyebrow further down the page.

**Why it fits:** Communicates "your bucket is the center of a small universe of tools" without saying "ecosystem" or "platform". Peel-off makes section transitions feel earned.

**Build cost:** Higher than A — labels need DOM (accessibility) but must coordinate with the rotating ring. Use a single rotating `<div>` and counter-rotate each label's child. Pure DOM + GSAP, no R3F.

### Concept C — "Iris-on-grid"

**At 100 vh:** A faint stone-200 dot grid (4 px dots, 32 px spacing) covers the viewport. The Kraterion mark sits centered. Headline below.

**Opening motion:** SVG-only iris reveal — rings draw on via `stroke-dashoffset` from `length` → 0 over 600 ms each, staggered 200 ms. Dot grid fades to 40 % opacity during the same 600 ms.

**Scroll-driven:** Dot grid scrolls slightly slower than the content (parallax factor 0.6); dots in a radial band around the (scrolled-out) mark are nudged outward ~6 px — a barely-perceptible "the aperture is still affecting space" cue.

**Why it fits:** The most restrained option. Closest to Vercel's grid-and-letter-spacing aesthetic. Lowest performance cost. No WebGL at all.

**Recommendation: Ship Concept A.** Hold B and C as branches we can A/B-test post-launch.

---

## 7. Code / dev moments

### 7.1 Syntax highlighting choice

**Shiki, build-time, server-rendered.** Per the PkgPulse 2026 syntax-highlighter comparison: *"renders to HTML at build time, no client-side JavaScript needed."* That means zero highlight JS shipped, no flash-of-unstyled-code, and pixel-perfect parity with VS Code's grammars. Shiki's adoption (~5M weekly npm downloads, including default in VitePress, Astro, and Nuxt Content) confirms it's the modern default for developer documentation.

**Theme:** A custom `kraterion-warm` theme built from VS Code's `light-plus` base, recolored against the warm-stone palette:

```json
// theme/kraterion-warm.json (abbreviated)
{
  "name": "kraterion-warm",
  "type": "light",
  "colors": {
    "editor.background": "#F8F4EC",
    "editor.foreground": "#1A1610"
  },
  "tokenColors": [
    { "scope": ["string", "string.quoted"], "settings": { "foreground": "#5C7A3F" } },
    { "scope": ["keyword", "storage.type"], "settings": { "foreground": "#C45B36" } },
    { "scope": ["comment"], "settings": { "foreground": "#7C7158" } },
    { "scope": ["constant.numeric"], "settings": { "foreground": "#3B6F73" } },
    { "scope": ["variable", "support.function"], "settings": { "foreground": "#403930" } }
  ]
}
```

A dark variant `kraterion-warm-dark` (Ink bg, Cream foreground, brighter accents) is used inside the docs hub and on Ink-surface sections.

### 7.2 `<CodeBlock>` component

Server component takes `tabs: { lang, filename, code }[]` and renders pre-highlighted markup. A small client sub-component handles tab switching and the optional scroll-scrub mode.

```
┌─────────────────────────────────────────────────────┐
│ ░ boto3   aws-cli   rclone   JS SDK    [⎘ Copy]    │
├─────────────────────────────────────────────────────┤
│ import boto3                                        │
│                                                     │
│ s3 = boto3.client(                                  │
│     "s3",                                           │
│     endpoint_url="https://s3.kraterion.com",        │
│     aws_access_key_id="...",                        │
│     aws_secret_access_key="...",                    │
│ )                                                   │
│ s3.upload_file("photo.jpg", "my-bucket", "photo")   │
└─────────────────────────────────────────────────────┘
   filename.py  ░ 8 lines                          ▓
```

Tabs animate with Motion `layoutId="codeblock-underline"`. In scrubbed mode, ScrollTrigger drives `setTab(progress < 0.25 ? 0 : ...)` and the section pins for ~120 vh.

### 7.3 `<TerminalSim>` — "try in browser"

Two modes:
- **Read-only autoplay**: 60 ms-per-character typewriter, blinking `▍` cursor.
- **Interactive**: input pinned at the bottom; `resolver(input)` returns a string. Unknown commands return `kraterion: command not found — try 'help'`.

Canned responses for the landing terminal:

| Input | Response |
|---|---|
| `aws s3 ls` | `2026-05-18 14:02:11 my-bucket` |
| `aws s3 ls s3://my-bucket` | `2026-05-18 14:02:14    482991 photo.jpg` |
| `kraterion agents list` | `support-agent     ready    1 bucket    0 calls today` |
| `help` | 6-line summary |
| anything else | the fallback |

Implementation: pure DOM. No PTY. `role="log" aria-live="polite"` so screen readers announce new lines.

---

## 8. Visual content needs

### 8.1 To commission / generate

- **Customer logos** (placeholders): 6–7 single-color SVG wordmarks at 24 px height. Use 4 placeholder strings ("Quanta Labs", "Northhaven", "Atelier OS", "Loomstack") until real names land.
- **Section illustrations**: 5 SVGs — one per "How X works" diagram (sealing, revocable access, bucket flow, agent flow, share-token). Stone-line drawings, no fills, 1 px stroke. Export as React components via SVGR.
- **Product screenshots** (pulled from the existing dashboard): 8 frames at 1440 × 900 native, exported at 2× WebP + AVIF. Targets: bucket list, file detail, knowledge toggle, agent settings, citations panel, embed token config, billing/usage page, audit log.

### 8.2 Mock data (`lib/mock/`)

- `buckets.ts` — 4 buckets (`product-docs`, `marketing-assets`, `support-tickets`, `model-eval-runs`).
- `files.ts` — 18 files distributed across the buckets, mostly PDFs and Markdown.
- `agents.ts` — 3 agents (`support-agent`, `sales-agent`, `internal-search`).
- `chats.ts` — 4 example transcripts with realistic citations.
- `pricing.ts` — three tiers and the comparison-table rows.

All exported `as const` for tight TS inference.

---

## 9. SEO, performance, accessibility

### 9.1 Metadata

Each page exports a `metadata` object via the App Router metadata API. Title pattern: `"<Page> — Kraterion"` (sentence case). Description 150–160 chars, single sentence, active voice. Canonical: `https://kraterion.com/<path>`. `openGraph` + `twitter` images point to `/api/og?surface=<id>`.

The OG generator (`app/api/og/route.tsx`) renders a 1200 × 630 image: Cream background, Kraterion mark top-left, headline center (Inter 500, 64 px), micro-label bottom-left in stone-600. One OG image per top-level surface. Uses `next/og`'s `ImageResponse` — per the official Vercel docs, *"App router includes `@vercel/og`. No need to install it."*

### 9.2 Sitemap, robots, schema

- `next-sitemap.config.js` generates `sitemap.xml` + `robots.txt` post-build.
- `robots.txt`: allow everything; explicit `Allow: /api/og` so social platforms can fetch OG images.
- Schema.org JSON-LD: `Organization` in root layout; `SoftwareApplication` on `/` and `/pricing`; `BreadcrumbList` on docs pages.

### 9.3 WCAG AA

- Contrast: every body-text combination tested at 14 px. Stone-700 (#5C5340) on Cream is the floor at ~5.6:1 — passes AA.
- Keyboard: every interactive element reachable in DOM order. Skip-to-content link at the top of every page (visually-hidden until focused, then 2 px Krater outline).
- Focus rings: `outline: 2px solid var(--color-krater); outline-offset: 2px` everywhere.
- `aria-current="page"` on active nav. Docs sidebar groups have correct `aria-expanded`.
- The simulated terminal is `role="log" aria-live="polite"`.
- The R3F hero has a visually-hidden `<h1>` and the `<canvas>` carries `role="img" aria-label="Kraterion logo aperture animation"`.

### 9.4 Performance & third-party script policy

- **No third-party scripts** beyond Vercel Analytics + Speed Insights. No Intercom, no marketing pixels at launch.
- Self-host fonts via `next/font/google` (Inter, Latin subset, two weights).
- Motion / GSAP / R3F modules are dynamically imported in leaf client components, never in the root layout.
- Lighthouse mobile budget: Performance ≥ 92, Accessibility = 100, Best Practices ≥ 95, SEO = 100.

---

## 10. Build phases & timeline

Each phase ends with a deployable preview branch on Vercel. Order matters — Phase 1 yields a demoable shell on day one.

**Phase 1 — Foundations (M)**
- `create-next-app` with TS, App Router, Turbopack.
- Tailwind v4 setup with the full `@theme` block (§2.2).
- Root layout, font loading, `<SmoothScroll>`, `<MotionConfig>`.
- Header + footer + mobile nav sheet.
- Brand primitives: `KraterionMark`, `KraterionWordmark`, `Button`, `Link`, `Hairline`.
- Stub all 8 routes with `<H1>` + lede so deploy works.

*Deliverable: deployed shell with working nav and brand chrome.*

**Phase 2 — Landing without heavy motion (M)**
- All landing sections built statically with `<FadeUp>` only.
- Static `<CodeBlock>` (no scrub yet).
- Static `<TerminalSim>` (autoplay only).
- Pricing teaser, final CTA.

*Deliverable: deployable landing that reads correctly and carries no heavy motion debt.*

**Phase 3 — Heavy motion (L)**
- `<ApertureHero>` R3F build (Concept A) with SVG fallback.
- ScrollTrigger-pinned bucket-flow ribbon.
- Scrub-driven code-tab autoplay.
- Interactive `<TerminalSim>` with resolver.
- Lenis tuning pass.

*Deliverable: demo-quality landing.*

**Phase 4 — Subpages (L)**
- `/s3`, `/knowledge`, `/embed`, `/pricing` end-to-end.
- `<KraterionChatWidget>` mocked locally (no real backend yet).
- Compatibility matrix + comparison table.

*Deliverable: marketing product set complete.*

**Phase 5 — Docs shell + Security (M)**
- `@next/mdx` integration, `mdx-components.tsx`, Shiki theme.
- Docs layout (sidebar + on-this-page rail).
- `/docs/quickstart` stub.
- `/security` with the four ownership claims and diagrams.

*Deliverable: docs shell ready for future content; full security story.*

**Phase 6 — Polish, OG, SEO, a11y (S/M)**
- `/api/og/[…]` for every surface.
- `next-sitemap` + JSON-LD + canonicals.
- Accessibility audit: screen-reader walkthrough on every page, contrast spot-checks, focus-trap tests on the mobile sheet.
- Performance pass: Lighthouse against the budget; trim Motion/GSAP/R3F imports.

*Deliverable: launchable.*

**Phase 7 — Tests, smoke, hand-off (S)**
- Playwright smoke tests: each page renders, primary CTA is clickable, embed widget loads.
- Visual regression via Vercel preview screenshots.
- README with run/build/deploy steps.

**Total estimate: ~4–6 weeks for a single senior agent.**

---

## 11. Pre-build checklist for Claude Code

### 11.1 Initial repo setup

```bash
pnpm create next-app@latest kraterion-site \
  --typescript --app --tailwind --turbopack --no-src-dir

cd kraterion-site

pnpm add motion lenis gsap @gsap/react three @react-three/fiber @react-three/drei
pnpm add shiki @shikijs/transformers
pnpm add @next/mdx @mdx-js/loader @mdx-js/react remark-gfm rehype-slug rehype-autolink-headings
pnpm add lucide-react clsx class-variance-authority
pnpm add @vercel/analytics @vercel/speed-insights
pnpm add -D @next/bundle-analyzer next-sitemap @types/three
```

Pin versions in `package.json`:

```json
{
  "dependencies": {
    "next": "16.x",
    "react": "19.x",
    "react-dom": "19.x",
    "tailwindcss": "^4.x",
    "motion": "^12.x",
    "lenis": "^1.3.x",
    "gsap": "^3.13.x",
    "@gsap/react": "^2.x",
    "three": "^0.170.x",
    "@react-three/fiber": "^9.x",
    "@react-three/drei": "^10.x",
    "shiki": "^1.x"
  }
}
```

### 11.2 Directory tree

```
kraterion-site/
├── app/
│   ├── layout.tsx                    # Root: <html>, fonts, providers, Analytics
│   ├── globals.css                   # Tailwind v4 + @theme tokens (§2.2)
│   ├── (marketing)/
│   │   ├── layout.tsx                # Header + footer
│   │   ├── page.tsx                  # Landing /
│   │   ├── s3/page.tsx
│   │   ├── knowledge/page.tsx
│   │   ├── embed/page.tsx
│   │   ├── pricing/page.tsx
│   │   └── security/page.tsx
│   ├── (docs)/
│   │   └── docs/
│   │       ├── layout.tsx            # Sidebar + on-this-page rail
│   │       ├── page.tsx              # Docs landing
│   │       └── quickstart/page.mdx
│   └── api/
│       └── og/
│           └── route.tsx
├── components/
│   ├── ui/                           # Primitives (§4.1)
│   ├── marketing/                    # Composites (§4.2)
│   ├── motion/                       # FadeUp, Reveal, ScrollPin, ScrubTimeline
│   └── providers/
│       ├── SmoothScroll.tsx
│       └── MotionProvider.tsx
├── lib/
│   ├── shiki.ts                      # Singleton highlighter
│   ├── mock/                         # buckets, files, agents, chats, pricing
│   ├── cn.ts                         # clsx helper
│   └── motion.ts                     # named easings, durations
├── theme/
│   ├── kraterion-warm.json
│   └── kraterion-warm-dark.json
├── public/
│   ├── img/                          # screenshots
│   └── illustrations/                # SVG diagrams
├── mdx-components.tsx                # Required at project root by @next/mdx
├── next.config.ts                    # MDX, image domains
├── next-sitemap.config.js
├── tsconfig.json
└── package.json
```

### 11.3 File creation order

1. `app/globals.css` — the brand-token contract.
2. `app/layout.tsx` — root with fonts and providers.
3. `components/providers/SmoothScroll.tsx` and `MotionProvider.tsx`.
4. `components/ui/KraterionMark.tsx`, `KraterionWordmark.tsx`, `Button.tsx`.
5. `components/marketing/Header.tsx`, `Footer.tsx`, `MobileNav.tsx`.
6. `app/(marketing)/layout.tsx` + stub `page.tsx`s for all 8 routes.
7. `lib/mock/*` — stable shapes for downstream components.
8. `lib/shiki.ts` + `components/ui/CodeBlock.tsx`.
9. `components/marketing/Hero.tsx`, `SectionFrame.tsx`, `PillarGrid.tsx`.
10. `components/marketing/TerminalSim.tsx` (read-only first).
11. Landing sections in scroll order.
12. `components/marketing/ApertureHero.tsx` + R3F fallback SVG.
13. `components/marketing/BucketFlowRibbon.tsx`.
14. Subpages (`/s3`, `/knowledge`, `/embed`, `/pricing`).
15. `app/(docs)/docs/layout.tsx`, `mdx-components.tsx`, `quickstart/page.mdx`.
16. `app/(marketing)/security/page.tsx`.
17. `app/api/og/route.tsx`.
18. `next-sitemap.config.js`, JSON-LD blobs, full accessibility pass.

### 11.4 Voice guardrails

**Hard bans (never produce):** "revolutionary", "next-gen", "seamless", "effortless", "powered by", "AI-powered" (unless AI is the actual feature being named), "blockchain", "crypto", "web3", "decentralized", "on-chain", "wallet", "node" (in the network sense), "token" (in the crypto sense — `share token` is fine).

**Hard requires:** sentence case everywhere except 8–11 px micro labels (uppercase, 0.16 em tracking). Active voice. Headlines under 8 words where possible. CTAs are verbs.

**Approved alt phrasings:**

| Avoid | Use |
|---|---|
| "AI-powered chat" | "Chat over your bucket" |
| "Powered by [X]" | (delete) |
| "Seamless integration" | "Drop it in" |
| "Cutting-edge encryption" | "Sealed before it leaves you" |
| "Cryptographic deletion" | "Revocable access" |
| "On-chain manifest" | "Tamper-evident audit log" / "Verifiable record" |

---

## 12. References

**Inspiration sites** (deconstruct each for hero technique, typography rhythm, code-block style, pricing pattern, docs shell):
- vercel.com — scroll-driven product reveals, terminal-style code blocks, restrained typography
- linear.com — cinematic scroll, the issue-list scrubber (FrontEnd FYI's open-source rebuild at github.com/frontendfyi/rebuilding-linear.app is a useful reference for the Next.js + Tailwind + Framer Motion implementation)
- stripe.com — WebGL gradient meshes via the public MiniGL implementation, scroll-synced API panel
- supabase.com — dev-tool aesthetic, animated SQL, dashboard mockup hero, the shadcn `Sidebar` pattern in their UI library
- railway.app — canvas-driven hero, infinite-canvas dragging demo
- planetscale.com (pre-acquisition) — database visuals, branching diagrams
- liveblocks.io — multiplayer cursors demo with spring animation
- resend.com — clean dev-focused brand, Spline-rendered 3D cube hero, animated email send demo

**Key library docs:**
- Next.js App Router — nextjs.org/docs/app and nextjs.org/blog/next-16
- Tailwind CSS v4 / `@theme` — tailwindcss.com/blog/tailwindcss-v4, tailwindcss.com/docs/theme
- Motion — motion.dev/docs
- GSAP ScrollTrigger — gsap.com/docs/v3/Plugins/ScrollTrigger
- Lenis — github.com/darkroomengineering/lenis
- React Three Fiber — r3f.docs.pmnd.rs
- Shiki — shiki.style
- `@next/mdx` — nextjs.org/docs/app/guides/mdx
- `next/og` / Satori — vercel.com/docs/og-image-generation
- shadcn/ui Sidebar — ui.shadcn.com/docs/components/sidebar

**Pricing benchmark:**
- Cloudflare R2 pricing — developers.cloudflare.com/r2/pricing/ ($0.015/GB-month Standard, 10 GB free tier, zero egress).

**Factual sourcing for `/security`** (paraphrased into non-crypto language; never use these terms in published copy):
- Walrus content-addressed blobs + raw HTTPS export — docs.wal.app, docs.sui.io/sui-stack/walrus
- Seal client-side threshold encryption — seal-docs.wal.app, github.com/MystenLabs/seal: *"To maximize privacy, Seal uses client-side encryption where the application or user is responsible to encrypt and decrypt the data."*
- Sui object model as a verifiable audit substrate — docs.sui.io/concepts/object-model: *"a complete and cryptographically auditable view of the system's state and history."*

**Critical non-claims** (the agent must not introduce these into copy):
- Walrus does NOT natively encrypt data at rest — its docs explicitly state so. The "sealed at rest" property comes from Seal applied **before** upload. Marketing copy must reflect that the application stack (Seal + Walrus) means the platform stores only encrypted bytes.
- Seal is not suitable for HIPAA / PHI / regulated personal data — Seal docs explicitly warn against this. Do not claim HIPAA suitability.
- Sui provides "tamper-evident append-only history," not "immutable forever." Objects can be mutated by authorized parties; what is guaranteed is finality + cryptographic auditability of the transaction-object history.