# Deck research — best practices + tooling

Compiled 2026-07-09.

## A. Web-based deck tooling — build vs. framework

| Option | What it is | Fit for us | Verdict |
|---|---|---|---|
| **Slidev** | Markdown-first, Vue/Vite dev deck. Presenter mode + notes + timer, HMR, `<video>`/`<SlidevVideo>` embeds, PDF/PPTX/PNG export, deploys as static SPA. | Built for devs; strong code slides; presenter timer is great for the *strictly enforced* 5 min. Con: Vue (not our React), and pulls a **large** dependency tree — conflicts with our supply-chain caution. | Strong if we accept the deps |
| **reveal.js** | The 15-yr-old vanilla-JS standard. Plugins for md, notes, highlighting. | Mature, framework-free. More manual layout work; still a dependency install. | Fallback |
| **From-scratch HTML/CSS/JS** | A single `deck/` static site: one HTML file, our `design-system/colors_and_type.css`, keyboard nav + a tiny presenter/timer script. Native `<video>` for demo clips. | **Zero new dependencies** (honours CLAUDE.md supply-chain rules), 100% brand fidelity via our own tokens, videos sit next to the file so no CDN/network dependency during the demo. Con: we hand-build nav/timer (small). | **Recommended** |
| **Next.js/React app in the monorepo** | Reuse shadcn + design system as a real app route. | Max control but heaviest; reinventing deck plumbing as app code. | Overkill |

**Recommendation: build from scratch as a self-contained static deck under `deck/`.** It's the only option that adds no dependencies (our CLAUDE.md forbids casual installs and enforces `minimumReleaseAge`), gives pixel-perfect brand alignment by importing our existing design tokens, and keeps embedded demo videos fully offline/local — the safest possible setup for a strictly-timed live demo on flaky testnet infra. Slidev is the runner-up if we'd rather not hand-roll navigation.

## B. Pitch best practices (synthesised)

**Structure & timing**
- 6–10 slides for a 5-minute slot; one idea per slide. The 10/20/30 heuristic (≤10 slides, ≥30pt font) still holds.
- Problem-first: judges want to hear a *real* problem in the first 30 seconds. Frame the pain before the solution.
- Order that reads as investor logic: Problem → Solution → (Demo) → How/Tech → Market/Users → Traction → Business model → Roadmap → Team/Ask.
- Traction gets 3× more judge attention than any other slide (DocSend); 76% of "no"s cite weak traction. Put our proof (working product, on-chain artifacts) up front where we can.

**Delivery**
- Bold visuals, minimal text; judges read from the back row. One main point per slide.
- Don't turn slides into documentation — no walls of code or dense diagrams; it makes judges read instead of listen.
- No jargon. Explain the mechanism in plain terms.
- Rehearse out loud to the clock; get outside feedback a day early ("does the problem make sense?").

**Web3-specific**
- The single most-asked judge question: **"why does this need to be on a blockchain / why this chain?"** Decks that answer it explicitly score better. For us this doubles as the mandatory "Why Sui" slide — Walrus + Seal + Move ownership genuinely only compose on Sui.
- Judges weigh: real problem/PMF, a functioning MVP, technical diligence, business model/sustainability, team.

**Demo video (we're leaning recorded for reliability)**
- Keep demo ≤2 min (simple flow) — for a 5-min pitch, closer to 60–90s.
- Embedding a *local* video file is the most reliable method — no internet/testnet dependency, no external path. This is exactly why we record rather than live-demo given testnet + gRPC-migration risk.
- Always have a backup even for recorded playback. Record clean, narrate over it live.

## Sources
- https://xergioalex.com/blog/best-slides-as-code-presentation-tools/
- https://deckary.com/blog/reveal-js-alternatives
- https://sli.dev/guide/why
- https://dasroot.net/posts/2026/04/markdown-presentation-tools-marp-slidev-reveal-js/
- https://medium.com/circleslife/creating-a-5-minute-kickass-hackathon-pitch-17cdcb42c3bc
- https://taikai.network/en/blog/how-to-create-a-hackathon-pitch
- https://www.inknarrates.com/post/hackathon-pitch-deck
- https://ogscapital.com/article/best-pitch-deck-structure/
- https://waveup.com/blog/traction-slide-pitch-deck/
- https://qubit.capital/blog/pitch-deck-structure-guide
- https://algorand.co/blog/how-to-win-web3-hackathon-survival-guide
- https://www.cvlabs.com/blog-posts/guide-pitch-deck-tips-for-seed-stage-web3-startups
- https://alejandrocremades.com/how-to-embed-a-video-in-a-pitch-deck/
- https://www.loom.com/blog/remote-pitch-deck-best-practices
- https://deckary.com/blog/embed-video-powerpoint
