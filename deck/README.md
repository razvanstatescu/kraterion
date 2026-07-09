# Kraterion — Demo Day Deck

Everything for the Sui Overflow 2026 (Walrus track) demo-day pitch lives here.

## Event constraints (from Sui)
- **Presentation: 5 minutes, strictly enforced.** Q&A: up to 2 minutes.
- Live present to judges + demonstrate a working version + answer Q&A.
- Must clearly communicate:
  1. Problem, solution, value proposition
  2. Technical implementation
  3. Path to production + go-to-market
  4. Target users + product-market fit (why they'd adopt)
  5. Monetization / long-term sustainability + future roadmap
  6. Why we chose to build on Sui

## Files
- `00-research.md` — best-practices research (frameworks + pitch structure), with sources.
- `01-structure.md` — slide-by-slide structure (v2, agent-runtime) + per-slide time budget.
- `research-product.md` — product/business source material (grounded in repo docs).
- `research-technical.md` — technical/architecture source material (code-grounded) + demo script.
- `research-market.md` — market size, adoption stats, monetization (Vercel/Supabase model), with sources.
- `research-competition-regulatory.md` — competitive map (3 camps) + EU AI Act "why now", with sources.
- `research-deck-design.md` — premium pitch-deck design/UX principles (applied), with sources.
- `02-content.md` — the actual copy/data for each slide (filled once structure is approved).
- `assets/video/` — recorded demo clips embedded into the deck.

## Decisions (2026-07-09)
- **Positioning:** verifiable runtime for AI agents (storage-on-Walrus = foundation/wedge).
- **No team slide** — solo project; track record used as a one-line credibility close only.
- **Tooling:** Slidev (installed; pnpm bumped to 10.16.1 so the release-age guard is active).
- **Demo:** fully recorded video, embedded locally, narrated live.
- **Proof:** working product on testnet (capability-led, no usage metrics).

## Status
- [x] Research (product, technical, market, competition, regulatory)
- [x] Structure + tooling decided (v3, story-first)
- [x] Slide copy + demo shot list drafted (`02-content.md`)
- [x] Slidev deck built (`slides.md` + `style.css` + `components/`), styled from the landing page
- [ ] Demo videos recorded (placeholder on slide 4 → `public/video/demo.mp4`)
- [ ] Rehearsed to time

## Running the deck
- `pnpm --filter @kraterion/deck slides` — dev server (http://localhost:3030), presenter mode at `/presenter/` (has the 5:00 timer + speaker notes)
- `pnpm --filter @kraterion/deck slides:build` — static SPA to `deck/dist/`
- `pnpm --filter @kraterion/deck slides:export` — PDF/PNG (needs Playwright chromium)
- [ ] Content + data gathered
- [ ] Deck built
- [ ] Demo videos recorded
- [ ] Rehearsed to time
