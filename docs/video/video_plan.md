# Kraterion — Remotion Video Plan for Sui Overflow 2026

A production-ready, end-to-end plan for a 3-minute (with a 4-minute extended cut) cinematic, typography-only marketing film built with Remotion 4 and the official Remotion Claude Code skill. Designed to win in the Walrus Specialized Track and to be linkable from Kraterion's homepage on day one.

---

## TL;DR

- **What you are building**: A 180-second (with a 240-second extended cut and a 30-second teaser), 1920×1080/30fps Remotion film in the Linear/Vercel/Arc school — Cream and Ink with a single rationed Krater-orange accent, Inter + JetBrains Mono, hairline borders, slow zooms, and zero voiceover. The film culminates in the "Build an agent in 60 seconds (RAG + MCP)" beat where toggling Knowledge on a bucket produces a chat agent that simultaneously appears as an MCP server with 7 tools in Claude Desktop.
- **Stack you will scaffold**: `npx create-video@latest` (Remotion 4.0.463 as of May 2026, per npmjs.com/package/remotion) + the official Remotion agent skill installed with `npx -y skills@latest add remotion-dev/skills -g -y` (the canonical install command from remotion.dev/docs/ai/skills). Music from Pixabay under the Pixabay Content License (commercial use, no attribution required); SFX from Freesound under CC0; submission rendered to H.264 mp4 at CRF 18 and normalized to −14 LUFS for YouTube.
- **How to submit**: One 3:00 cut goes to YouTube unlisted and is linked from the DeepSurge submission form for the **Walrus Specialized Track**. A 30-second teaser goes to Twitter the day community voting opens. A 2:00 fallback cut is pre-rendered in case the 2026 Participant Handbook (handbook is the binding source on length — open it before submission) caps the video shorter than 3 minutes.

---

## Key findings

- **Two skill systems are converging in 2026, and you should use the official Remotion one.** Remotion's own docs (remotion.dev/docs/ai/skills) document an agent-skill package installed with `npx -y skills@latest add remotion-dev/skills -g -y`. This is the canonical install — there is no skill named `remotion-best-practices`. The skill activates automatically when Claude sees Remotion code in context and loads relevant rule files on demand. Install once per project. (Per Remotion's own page: *"These skills are useful for AI agents like Claude Code, Codex or Cursor."*)
- **The cinematic dev-tool video formula in 2026 is now stable.** From Linear, Vercel, Arc, Resend, Mintlify and Vercel Ship 2025 references, seven patterns repeat: (1) typography revealed word-by-word with a tiny vertical settle, (2) hairline draws as section dividers, (3) hard cuts with a brief breath of background color instead of crossfades, (4) scale-blur entrances on UI mockups, (5) one rationed accent color that earns the eye each time it appears, (6) slow zooms of ~4% over multiple seconds as "breath" moments, and (7) color-mask reveals for the brand color. Vercel's own Web Interface Guidelines codify some of these (e.g., "Honor `prefers-reduced-motion`. Prefer CSS… Compositor-friendly… Never `transition: all`.") — this plan follows that grammar.
- **Sui Overflow 2026 submits via DeepSurge; Walrus is the right track.** Per overflow.sui.io: the Walrus Specialized Track is *"Leverage Walrus to build applications that handle large, off-chain, or verifiable data."* The site also commits to *"$500K+ in total prizes and rewards across core and specialized tracks"* and binds participants to a one-track rule (FAQ: *"You must select the one track that best represents your project."*). The 2025 edition (per blog.sui.io/2025-sui-overflow-hackathon-winners/) paid per-track prizes ranging from $30,000 to $7,500; the 2026 specialized-track per-pool figures are not publicly itemized and live inside the Participant Handbook. Open it before submitting.
- **Music is solved with four Pixabay tracks, license-clean.** The Pixabay Content License (Pixabay Terms of Service, verbatim) grants *"an irrevocable, worldwide, non-exclusive and royalty free right to use, download, copy, modify or adapt the Content for commercial or non-commercial purposes. Attribution… is not required but is always appreciated."* The four tracks selected below (slow piano cold-open, ambient build, hopeful main-title climax, short outro fragment) cover the entire 180-second arc.
- **The hero moment is built around real Kraterion features and 7 named MCP tools.** Scene 11 shows the verbatim tool list — `search`, `ask`, `list_buckets`, `list_objects`, `read_object`, `write_object`, `get_manifest` — connected to Claude Desktop. This is the line in the film a judge most likely screenshots.

---

## Details

### 1. Executive summary — the emotional arc in 5 sentences

We open in silence on a single hairline-thin word — *yours* — that frames the entire film's thesis: storage you actually own. A short, restrained pivot acknowledges the status quo (an S3 endpoint that quietly rents you your own data) and then earns the promise: **Object storage you actually own**, with Sui as the ledger, Walrus as the substrate, and Seal as the lock. The middle act shows the API surface a developer already knows (`boto3`, `aws s3`, `rclone`) pointed at a new endpoint, with a single Krater-orange swap of one URL — the only color event in the first 90 seconds. The film then breathes, slows, and delivers the hero beat — *Build an agent in 60 seconds* — where toggling **Knowledge** on a bucket creates a RAG-ready agent that also appears, untouched, as an MCP server inside Claude Desktop and Cursor. We close on the aperture mark, the tagline, and a quiet "Built for Sui Overflow 2026" — the only moment the camera (such as it is) holds still.

---

### 2. Music & sound spec

#### Licensing posture
All music is sourced from Pixabay under the Pixabay Content License. Per Pixabay's Terms of Service, the binding language is verbatim: *"Under the Pixabay License you are granted an irrevocable, worldwide, non-exclusive and royalty free right to use, download, copy, modify or adapt the Content for commercial or non-commercial purposes. Attribution of the photographer, videographer, musician or Pixabay is not required but is always appreciated."* For a hackathon submission this is the cleanest available posture — keep the download receipts in `/legal/music-licenses/` inside the repo. Caveat: some Pixabay tracks have Content ID registered, which can cause a YouTube claim that you resolve by presenting the license; the four contributors below do not appear to enroll in aggressive Content ID, but a fallback is provided in §10.

#### Track list (final picks)

| # | Role in film | Track | Contributor | Duration | URL | License |
|---|---|---|---|---|---|---|
| A | Cold open + status quo (00:00–00:32) | *Cinematic Ambient Feeling – Ambient Piano Music For Videos* | music_for_video | 1:34 | https://pixabay.com/music/ambient-cinematic-ambient-feeling-ambient-piano-music-for-videos-7767/ | Pixabay Content License — commercial use OK, no attribution required |
| B | How it works + S3 swap (00:32–01:30) | *Emotional Depth* | Grand_Project | 2:52 | https://pixabay.com/music/ambient-emotional-depth-323009/ | Pixabay Content License |
| C | Hero / "Build an agent in 60 seconds" climax (01:30–02:40) | *Hero's End — Cinematic Soundscape* | NaturesEye | 2:31 | https://pixabay.com/music/ambient-hero39s-end-cinematic-soundscape-13978/ | Pixabay Content License |
| D | Outro / closing card (02:40–03:00) | *Emotional Depth_Intro* (companion fragment to Track B) | Grand_Project | 0:29 | Sibling track on Grand_Project's Pixabay profile (search "Grand_Project Emotional Depth") | Pixabay Content License |

#### Why these four
Track A is a slow solo piano with a hopeful undertone — Linear-cold-open energy without becoming maudlin. Track B is tagged "Slow Build / Film Score / Underscore" — the architectural-reveal mood. Track C is tagged "Hopeful / Main Title / Floating / Slow" — the right energy for the agent-creation climax without sliding into action-trailer cliché. Track D shares Track B's harmonic DNA, so the film resolves on a familiar key — a move a sound designer would actually make.

#### Music cue map (3-minute submission cut)

| Frame range (30 fps) | Time | Music | Action |
|---|---|---|---|
| 0–60 | 00:00–00:02 | Silence | Single-frame fade-in from black; 2-frame hold of black |
| 60–960 | 00:02–00:32 | **Track A** in at −6 dB, ramp to −3 dB by 00:08 | Cold open + status quo |
| 960–990 | 00:32–00:33 | A duck → out over 30 frames | Crossfade to Track B |
| 990–2700 | 00:33–01:30 | **Track B**, −4 dB; first swell at 00:54 (sync to Sui/Walrus/Seal reveal) | How it works, S3 swap |
| 2700–4800 | 01:30–02:40 | **Track C**, −3 dB; main motif lands at 01:34 (sync to "Build an agent in 60 seconds" title); release the air around 02:25 | Hero / RAG / MCP |
| 4800–5400 | 02:40–03:00 | **Track D**, −6 dB into −9 dB tail | Outro |
| 5400 | 03:00 | Hard cut to silence on final mark hold (1 frame of room tone) | End |

#### Sound design (SFX) — Freesound CC0
Use sparingly — three SFX max for the whole film. All sourced from Freesound, all CC0 (no attribution required for CC0 per Freesound's own FAQ):

- **Soft key tick** for the code-typing beat in Scene 5 (boto3 endpoint swap). Pitched down 4 semitones, −18 dB, low-pass 6 kHz.
- **Single soft chime** at the moment "Knowledge: On" toggles in Scene 7 (mid-bell, −20 dB, 800 ms tail).
- **Subtle paper-flip / vinyl-pop** as the MCP panel reveals in Scene 9 (−24 dB, 120 ms).

Do not add UI clicks, swooshes, or whoosh transitions — those are the precise tells of a generic explainer.

#### Audio mix bus
- Master ceiling −1 dBTP, integrated loudness target **−14 LUFS** — YouTube's actual normalization target. Content louder than approximately −14 LUFS is turned down by YouTube; content quieter is left at its original level. (Targeting −16 LUFS would leave the film noticeably quieter than peer launch videos when played on YouTube.)
- Music bus: −6 dB headroom; SFX bus: −12 dB headroom.

---

### 3. Visual language guide

#### Color
Cream `#F8F4EC` and Ink `#0F0E0C` are the only two colors that ever cover more than 20 % of the frame. Warm Stone neutrals (`#E8E2D6`, `#C9C0AE`, `#7A7468`) only ever appear on hairlines, secondary type, and inactive UI states. **Krater orange `#C45B36` is rationed**: it appears in exactly five moments across the entire film:
1. The aperture-mark stroke when the logo first resolves (Scene 2)
2. The replaced URL in the S3-swap beat (Scene 5) — one character at a time
3. The "Knowledge: On" pill (Scene 7)
4. The agent reply caret / cursor (Scene 8)
5. The aperture-mark fill at the very last frame (Scene 11)

If orange appears anywhere else, you've broken the brand.

#### Typography
- **Inter** loaded via `@remotion/google-fonts/Inter` — weights `[400, 500, 600, 700]`, subsets `["latin", "latin-ext"]` (latin-ext keeps Romanian diacritics safe if you ever localize).
- **JetBrains Mono** for code blocks, loaded via `@remotion/google-fonts/JetBrainsMono` — weights `[400, 500]`.
- All marketing copy is **sentence case** (Vercel's marketing-page rule from vercel.com/design/guidelines: *"On marketing pages, use sentence case."*). Headings/buttons that look like UI use title case only inside the mocked dashboard.
- Tracking: titles `−0.02em`, body `−0.01em`, code `0`.
- Optical sizes: Title 144 px, sub-headline 56 px, body 28 px, caption 18 px, code 32 px in the dashboard mockup. (Nominal at 1920×1080; scenes scale with `useVideoConfig`.)
- Non-breaking spaces for glued terms: `Sui\u00a0Overflow\u00a02026`, `Object\u00a0storage\u00a0you\u00a0actually\u00a0own.` Prevents an awkward orphan on the last word.

#### Motion grammar — the seven reusable patterns

Every motion in the film is one of these seven primitives. No exceptions.

1. **Word-by-word reveal.** Each word fades in over 8 frames at 80 ms stagger, with a 2 px upward translate dampened by `spring({ damping: 200, stiffness: 120 })`. Used for all headline sentences.
2. **Letter-by-letter sweep (rare).** Used twice only: the cold-open word and the final tagline. Stagger 40 ms, opacity 0→1 over 6 frames per letter, no movement.
3. **Hairline draw.** A 1-px ink line draws across the frame in 24 frames via `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, easing `Easing.bezier(0.2, 0.8, 0.2, 1)`. Used as section delimiters.
4. **Scale-blur breath.** Element starts at `scale(0.96)` with `filter: blur(8px)` and resolves to `scale(1) blur(0)` over 36 frames. Used for UI mockup entrances and the climax title.
5. **Color reveal.** A masked rectangle slides left-to-right (or top-to-bottom) revealing a Krater-orange element from underneath an Ink mask. Used only for the five orange moments.
6. **Static cut + 4-frame breath.** A clean cut with 4 frames of empty Cream between scenes. Used between Act I and Act II, Act II and Act III. Never crossfade — Linear and Arc cut.
7. **Slow zoom hold.** A 6-second scale from `1.00` to `1.04` with no other motion. Used on the dashboard hero shot (Scene 6) and on the MCP reveal (Scene 9). The film "breathes" on these.

#### Negative space, radii, spacing
At least one third of every frame is empty Cream or empty Ink. If a layout is more than 70 % covered, cut something. Hairline borders (`1px solid #E8E2D6` on Cream, `1px solid #2A2825` on Ink) replace shadows everywhere. Border radii: 4 px for chips, 8 px for cards, 12 px for the dashboard window chrome. Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 — nothing in between.

---

### 4. Scene-by-scene shot list

**Format:** 1920×1080, 30 fps, **5400 total frames = 180 s** (3:00) for the submission cut. The 4-minute "extended" cut adds 1800 frames distributed between Scenes 7 and 9 — see §10.

| # | Scene | Frames | Time | BG | Notes |
|---|---|---|---|---|---|
| 1 | **Cold open** | 0–120 (4.0 s) | 00:00–00:04 | Ink | Single word `yours.` Cream. 144 px. Letter-by-letter sweep (pattern 2). No music. The period is a single-frame Krater-orange flash on the last letter, then back to Cream. |
| 2 | **Mark reveal** | 120–270 (5.0 s) | 00:04–00:09 | Ink | The three-ring aperture logo draws as three concentric `<circle>` strokes (pattern 3 generalized to a circle). Track A enters. Hairline draw. |
| 3 | **Status quo** | 270–540 (9.0 s) | 00:09–00:18 | Cream | Three short lines, each on its own beat, word-by-word reveal (pattern 1), 90 frames apart: "You pay for storage." / "You don't own it." / "Cancel the subscription. It's gone." Inter 56 px, ink, −0.02em. |
| 4 | **The pivot** | 540–960 (14.0 s) | 00:18–00:32 | Cream | Single line, dead center: **Object storage you actually own.** (the tagline). Pattern 1 reveal. Hold 8 seconds. Hairline draw underneath (pattern 3) just before the line vanishes. Crossfade music A→B. |
| 5 | **The S3 swap** | 960–1620 (22.0 s) | 00:32–00:54 | Ink | A code block (JetBrains Mono 32 px) renders four lines via type-on (pattern 1 applied per character at 35 ms/char, capped at 600 ms per line). The crucial moment: the endpoint URL `https://s3.amazonaws.com` resolves once, then each character of the host is replaced left-to-right by `https://api.kraterion.xyz` in Krater orange (pattern 5). Soft key tick SFX on the swap only. Caption underneath: *Point your existing code at Kraterion. The SDK doesn't change.* |
| 6 | **Sui · Walrus · Seal** | 1620–2400 (26.0 s) | 00:54–01:20 | Cream | Three stacked rows, each with: 8 px Krater-orange dot only at the bullet, name in Ink 56 px Inter 600, one-line gloss in Stone 28 px. **Sui** — *The ledger. Your files are objects you own.* **Walrus** — *The substrate. Files live across a decentralized network, sharded and resilient.* **Seal** — *The lock. Files are encrypted before they leave your browser.* Each row enters with pattern 1, 240 frames apart. Music B swells on row 3. Hairline draws (pattern 3) under each row. |
| 7 | **The dashboard** | 2400–2700 (10.0 s) | 01:20–01:30 | Cream | The Kraterion dashboard mockup enters with pattern 4 (scale-blur breath). Sidebar (Inter 18 px, Stone), bucket list with `documents/`, `research-notes/`, `kraterion-handbook/`. Top right: a Cream pill showing the signed-in Google account avatar circle (just initials, no real face) + label "Signed in with Google" 18 px. Beneath the title bar, hairline. The active bucket `research-notes/` is highlighted. Pattern 7 slow zoom begins here and runs to the end of the scene. |
| 8 | **Toggle Knowledge** | 2700–3300 (20.0 s) | 01:30–01:50 | Cream | Camera (figuratively) tightens on the bucket panel. Right side reveals a toggle row: **Knowledge** with a pill state changing from `Off` (Stone) to `On` (Krater orange) — pattern 5. Soft chime SFX. Beneath the toggle, three progress lines appear in Stone: `Indexing 142 chunks` → `Embedding · 0.34s/chunk` → `Ready`. The "Ready" state appears in 600 ms with pattern 4 (scale-blur breath). Music C enters; main motif lands on "Ready". |
| 9 | **Build an agent in 60 seconds** | 3300–3450 (5.0 s) | 01:50–01:55 | Ink | Full-frame title card. Inter 144 px, Cream. Pattern 4. **RAG + MCP** in 56 px Stone underneath, 24 px below the title. The "60" is the only place a number appears in the film — set in Inter 144 px tabular numerals. Hold 90 frames. |
| 10 | **Agent creator + chat** | 3450–4500 (35.0 s) | 01:55–02:30 | Cream | A two-pane mockup: left, the "New agent" form (Name: `research-assistant`, Model: `gpt-4o-mini`, System prompt: a 3-line truncation in JetBrains Mono 20 px, Buckets: a chip `research-notes/`). Right, an empty chat panel. The form fields fill via pattern 1 (word-by-word). Then the form collapses with pattern 4 reversed, the chat panel slides into focus. A user message appears: "Summarize the 3 main findings." An assistant reply renders character-by-character with a blinking Krater-orange caret (the third orange moment). The reply is three short bullet lines in Stone 24 px, each citing `[chunk 47]`, `[chunk 89]`, `[chunk 112]`. Beat held 4 seconds after the last line resolves. |
| 11 | **MCP — same agent, everywhere** | 4500–5100 (20.0 s) | 02:30–02:50 | Ink | The chat panel scales down to occupy the top-left third (pattern 4 reversed gently). Beside it, a Claude Desktop window mockup fades in (pattern 4) showing the MCP server `kraterion` connected with **7 tools** listed in 20 px JetBrains Mono: `search`, `ask`, `list_buckets`, `list_objects`, `read_object`, `write_object`, `get_manifest`. Beneath the two windows, single line in Inter 32 px Cream: *One agent. Your chat, Claude Desktop, Cursor. Same tools, same files.* Subtle vinyl-pop SFX on MCP window appearance. Pattern 7 slow zoom holds the composition. |
| 12 | **Outro** | 5100–5340 (8.0 s) | 02:50–02:58 | Cream | Aperture mark resolves in the center (pattern 3 reapplied). Tagline beneath in 32 px Inter 500: *Object storage you actually own.* On frame 5280 (00:02:56), a small line in 18 px Stone 400 appears: *Built for Sui Overflow 2026.* Pattern 5 fills the aperture's inner ring with Krater orange (the fifth and final orange moment) on the very last beat. |
| 13 | **Hold to black** | 5340–5400 (2.0 s) | 02:58–03:00 | Cream → Ink (12-frame ease) | The entire frame fades to Ink. Music D tail. Silence on frame 5400. |

---

### 5. Asset checklist

#### Fonts (loaded via Remotion's google-fonts package — no local files needed)
- `@remotion/google-fonts/Inter` with weights `["400","500","600","700"]`, subsets `["latin","latin-ext"]`.
- `@remotion/google-fonts/JetBrainsMono` with weights `["400","500"]`, subsets `["latin"]`.

Both must be loaded at the top of `src/Root.tsx` (not inside a component) so Remotion's `delayRender()` wrapper fires correctly. Per Remotion's docs, font loading inside a render function can race the headless Chromium frame capture and silently fall back to Arial — the most common Remotion bug.

#### Music files (downloaded as `.mp3`, placed in `public/music/`)
- `public/music/track-a-cold-open.mp3` — *Cinematic Ambient Feeling* (1:34)
- `public/music/track-b-build.mp3` — *Emotional Depth* (2:52)
- `public/music/track-c-climax.mp3` — *Hero's End — Cinematic Soundscape* (2:31)
- `public/music/track-d-outro.mp3` — *Emotional Depth_Intro* (0:29)
- `public/music/LICENSES.md` — paste the Pixabay license text verbatim, with track URLs and the date downloaded.

#### SFX (placed in `public/sfx/`)
- `public/sfx/key-tick.wav` (Freesound CC0)
- `public/sfx/soft-chime.wav` (Freesound CC0)
- `public/sfx/vinyl-pop.wav` (Freesound CC0)
- `public/sfx/LICENSES.md` — list each file's Freesound URL and confirm CC0.

#### UI mockups (built as Remotion components, no PNGs)
- `<DashboardChrome />` — sidebar, top bar, content area, hairline borders.
- `<BucketRow name avatar size active />`
- `<KnowledgeToggle state />` with the orange "On" pill.
- `<IndexingProgress steps />` — three text rows revealed in sequence.
- `<AgentForm name model prompt buckets />`
- `<ChatPanel messages caretFrame />` with the typing-caret animation.
- `<MCPWindow tools />` — Claude Desktop chrome (just enough to read as it).
- `<CodeBlock lines language />` — JetBrains Mono, ink-on-cream OR cream-on-ink, with a hairline-bordered card.
- `<ApertureMark progress stroke fill />` — three SVG circles, animated via `interpolate`.

#### Icons
None. The only graphic mark is the aperture. Resist all temptation.

---

### 6. Remotion project structure

Use the official Remotion 4 scaffold + the official Remotion skill for Claude Code (`remotion-dev/skills` per remotion.dev/docs/ai/skills). Remotion is at 4.0.463 as of May 20 2026 (npmjs.com/package/remotion).

```
kraterion-video/
├── package.json
├── remotion.config.ts
├── tsconfig.json
├── .claude/
│   └── skills/                     # Remotion skill installed here
├── public/
│   ├── music/
│   │   ├── track-a-cold-open.mp3
│   │   ├── track-b-build.mp3
│   │   ├── track-c-climax.mp3
│   │   ├── track-d-outro.mp3
│   │   └── LICENSES.md
│   └── sfx/
│       ├── key-tick.wav
│       ├── soft-chime.wav
│       ├── vinyl-pop.wav
│       └── LICENSES.md
├── src/
│   ├── Root.tsx                    # Loads fonts, registers compositions
│   ├── compositions/
│   │   ├── KraterionFilm.tsx       # The 180-second main film
│   │   └── KraterionTeaser.tsx     # 30-second cut (see §9)
│   ├── scenes/
│   │   ├── S01_ColdOpen.tsx
│   │   ├── S02_MarkReveal.tsx
│   │   ├── S03_StatusQuo.tsx
│   │   ├── S04_Pivot.tsx
│   │   ├── S05_S3Swap.tsx
│   │   ├── S06_SuiWalrusSeal.tsx
│   │   ├── S07_Dashboard.tsx
│   │   ├── S08_ToggleKnowledge.tsx
│   │   ├── S09_HeroTitle.tsx
│   │   ├── S10_AgentChat.tsx
│   │   ├── S11_MCP.tsx
│   │   ├── S12_Outro.tsx
│   │   └── S13_FadeOut.tsx
│   ├── components/
│   │   ├── DashboardChrome.tsx
│   │   ├── BucketRow.tsx
│   │   ├── KnowledgeToggle.tsx
│   │   ├── IndexingProgress.tsx
│   │   ├── AgentForm.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── MCPWindow.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── ApertureMark.tsx
│   │   ├── WordReveal.tsx
│   │   ├── LetterReveal.tsx
│   │   └── HairlineDraw.tsx
│   ├── motion/
│   │   ├── springs.ts              # Centralized spring configs
│   │   ├── easings.ts              # Bezier curves
│   │   └── timing.ts               # Frame ranges per scene
│   ├── tokens/
│   │   ├── color.ts                # Cream, Ink, Stone scale, Krater
│   │   ├── type.ts                 # Inter, JetBrainsMono helpers
│   │   └── spacing.ts              # 4/8/12/16/24/... scale
│   └── audio/
│       └── MusicBed.tsx            # All four music tracks + ducking
└── README.md
```

#### Composition setup

`Root.tsx` registers two compositions:

```tsx
import { Composition } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { KraterionFilm } from './compositions/KraterionFilm';
import { KraterionTeaser } from './compositions/KraterionTeaser';

loadInter('normal', { weights: ['400','500','600','700'], subsets: ['latin','latin-ext'] });
loadMono('normal',  { weights: ['400','500'],             subsets: ['latin'] });

export const RemotionRoot = () => (
  <>
    <Composition id="KraterionFilm"   component={KraterionFilm}
      durationInFrames={5400} fps={30} width={1920} height={1080} />
    <Composition id="KraterionTeaser" component={KraterionTeaser}
      durationInFrames={900}  fps={30} width={1920} height={1080} />
  </>
);
```

#### Patterns to use
- **`<Series>` (not `<TransitionSeries>`)** for the main film — we want hard cuts, not crossfades. Per Remotion's docs, `<TransitionSeries>` is for crossfades and overlays; `<Series>` lays scenes back-to-back with zero overlap.
- **`<Audio>`** with `startFrom`, `endAt`, and `volume` as a function of frame for fades. Stack four `<Audio>` tracks (one per music cue) inside the main composition, each wrapped in a `<Sequence from=... durationInFrames=...>` for its time window.
- **`useCurrentFrame()` + `interpolate()`** as the only animation primitive for opacity/translate/scale. Use `spring()` only where overshoot matters (the aperture stroke landing, the toggle pill snap).
- **`Easing.bezier(0.2, 0.8, 0.2, 1)`** as the default ease (a fast-out, slow-stop curve that reads as "Linear/Vercel").
- **`<AbsoluteFill>`** as the root of every scene — never `position: relative` on the outer wrapper.
- Avoid `transition: all` and avoid CSS animations entirely — per Remotion's docs, frame-driven values are the only safe path; CSS transitions cause flicker during rendering.

#### Audio integration

```tsx
// MusicBed.tsx — sketch
<Sequence from={60} durationInFrames={900}>
  <Audio src={staticFile('music/track-a-cold-open.mp3')}
         volume={(f) => interpolate(f, [0, 60, 840, 900], [0, 0.5, 0.5, 0])} />
</Sequence>
<Sequence from={960} durationInFrames={1740}>
  <Audio src={staticFile('music/track-b-build.mp3')}
         volume={(f) => interpolate(f, [0, 60, 1680, 1740], [0, 0.6, 0.6, 0])} />
</Sequence>
// ... and so on for C and D
```

The `volume` prop accepts a function of frame, which is the Remotion-idiomatic way to fade.

---

### 7. Build sequence for Claude Code (paste each step in order)

#### Step 0 — Scaffold
```
npx create-video@latest kraterion-video --template blank
cd kraterion-video
npx remotion add @remotion/google-fonts
```
Install the Remotion Claude Code skill (per remotion.dev/docs/ai/skills, *"Remotion maintains a list of Agent Skills… You can install them by running: npx skills add remotion-dev/skills"*):
```
npx -y skills@latest add remotion-dev/skills -g -y
```
The skill auto-activates whenever Claude sees Remotion code in context.

#### Step 1 — Tokens, motion, fonts
Prompt: *"Create `src/tokens/color.ts`, `type.ts`, `spacing.ts` exporting the Kraterion design tokens (Cream #F8F4EC, Ink #0F0E0C, Stone scale, Krater #C45B36; Inter and JetBrains Mono helpers via @remotion/google-fonts; 4/8/12/16/24/32/48/64/96/128 spacing scale). Create `src/motion/easings.ts` exporting a `LINEAR_EASE` Bezier (0.2, 0.8, 0.2, 1) and `src/motion/springs.ts` exporting `GENTLE`, `SETTLE`, and `SNAP` spring configs. Update `src/Root.tsx` to load both Google Fonts at module top level and register two compositions: `KraterionFilm` (5400 frames) and `KraterionTeaser` (900 frames), both 1920×1080 at 30fps."*

#### Step 2 — Music bed
Prompt: *"Create `src/audio/MusicBed.tsx`. Place four music files in `public/music/`. Mount four `<Audio>` elements in four `<Sequence>` wrappers matching the cue map in the spec (start frames 60, 960, 2700, 4800). Use `volume={(f) => interpolate(f, [...], [...])}` for the fades described in the cue map. Mount the bed once inside `KraterionFilm` so it spans the whole film."*

#### Step 3 — Reusable motion components
Prompt: *"Build `src/components/WordReveal.tsx`, `LetterReveal.tsx`, and `HairlineDraw.tsx` matching the motion grammar in the spec. `WordReveal` takes `text: string`, `delay: number` (in frames), and renders each word with a 2-frame stagger, 8-frame opacity fade, and a 2-px upward translate damped by `spring({damping:200, stiffness:120})`. `LetterReveal` is letter-by-letter at 40 ms per char. `HairlineDraw` is a 1-px div with `clipPath` interpolated from `inset(0 100% 0 0)` to `inset(0 0 0 0)` over 24 frames."*

#### Step 4 — Aperture mark
Prompt: *"Build `src/components/ApertureMark.tsx`: three concentric SVG circles (radii 60, 100, 140), strokes 2 px, drawn via `pathLength` and `strokeDashoffset` interpolated to draw in over 30 frames each, staggered by 8 frames. Accept a `fillInner: boolean` prop that triggers a Krater-orange fill on the inner circle starting at frame 0 of when it's mounted."*

#### Step 5 — Scenes 1 → 4 (Act I)
Build scenes in order. Each scene is a standalone component that assumes frame 0 = its own start.

#### Step 6 — Scenes 5 → 6 (Act II — code swap + stack)
Pay particular attention to the per-character S3 endpoint swap in Scene 5 — that's the visual moment Overflow judges are most likely to screenshot.

#### Step 7 — Dashboard components
Build `<DashboardChrome>`, `<BucketRow>`, `<KnowledgeToggle>`, `<IndexingProgress>` before assembling Scenes 7 and 8.

#### Step 8 — Scenes 7 → 9 (the hinge)
Including the slow-zoom pattern 7.

#### Step 9 — Scenes 10 → 11 (agent + MCP)
Build `<AgentForm>`, `<ChatPanel>` (with caret animation), `<MCPWindow>`. The MCP window's 7 tools must be listed verbatim and in order: `search`, `ask`, `list_buckets`, `list_objects`, `read_object`, `write_object`, `get_manifest`.

#### Step 10 — Scenes 12 → 13 (outro)
The five-orange-moments discipline ends here.

#### Step 11 — Teaser composition
Prompt: *"Build `src/compositions/KraterionTeaser.tsx`, a 30-second cut for Twitter/X. Use scenes S01, S04, S09 (hero title), S10 abridged to 8 s, S12. Reuse the existing scene components; just shorten by passing different durations or wrapping them in `<Sequence from durationInFrames>`."*

#### Step 12 — Render
See §8.

---

### 8. Render & export settings

#### Studio preview
```
npx remotion studio
```

#### Final render (submission cut)
```
npx remotion render KraterionFilm out/kraterion-3min.mp4 \
  --codec h264 \
  --crf 18 \
  --pixel-format yuv420p \
  --jpeg-quality 100 \
  --concurrency 4
```

Defaults to explain:
- `--codec h264` produces a `.mp4` (H.264) that plays in every browser and Devfolio embed. AV1 would render smaller but is risky for judges' players.
- `--crf 18` is visually lossless for 1080p. (CRF 23 is Remotion's default; 18 is the recommended for archive-quality.)
- `--pixel-format yuv420p` is the YouTube/Twitter-safe colorspace — without this you risk a green tint on iOS Safari.
- `--concurrency 4` on a modern laptop (M-series Mac or 8-core Intel) keeps memory under 16 GB. Drop to `--concurrency 2` if Chromium tabs crash.

Expected file size at 1920×1080, 30 fps, 180 s, CRF 18: **35–55 MB**. Twitter's upload cap is 512 MB, YouTube has no practical limit, Devfolio accepts the size easily.

#### Teaser render
```
npx remotion render KraterionTeaser out/kraterion-teaser-30s.mp4 \
  --codec h264 --crf 18 --pixel-format yuv420p
```
Expected file size: **6–10 MB**.

#### Audio sanity check
Verify integrated loudness with ffmpeg:
```
ffmpeg -i out/kraterion-3min.mp4 -filter:a loudnorm=print_format=json -f null -
```
Aim for `input_i` between −15 and −13 LUFS (centered on YouTube's −14 LUFS normalization target). Adjust music bus gain in `MusicBed.tsx` if you drift.

---

### 9. Submission packaging

#### Primary submission
- **File:** `kraterion-3min.mp4` (1920×1080, H.264, 30 fps, ~180 s)
- **Upload to:** YouTube (unlisted) — embed the YouTube link in the DeepSurge submission form. YouTube has the best chance of judges loading it on the first click and on mobile. (Keep a Loom mirror as a backup link in your README.)
- **Title:** "Kraterion — Object storage you actually own. Built for Sui Overflow 2026."
- **Description (first 3 lines, the bit that appears in the embed preview):**
  - "S3-compatible object storage on Sui, Walrus, and Seal."
  - "Sign in with Google. Files encrypted before they leave the browser."
  - "Build a RAG + MCP agent in 60 seconds."
- **YouTube chapters** (added in the description):
  - 0:00 The promise
  - 0:18 The pivot
  - 0:32 Drop-in S3 SDK
  - 0:54 Sui, Walrus, Seal
  - 1:20 The dashboard
  - 1:30 Toggle Knowledge
  - 1:50 Build an agent in 60 seconds
  - 2:30 MCP — same agent, everywhere
- **Closed captions:** Auto-generate, then manually correct. Every word on screen should appear in the CC track — this is what makes the film accessible to a non-native English judge who has the sound off in a conference Slack.
- **Pinned comment:** Link to GitHub repo + the live Kraterion endpoint.

#### Backup formats
- `kraterion-3min-720p.mp4` — re-render at `--width 1280 --height 720` for ~15 MB. Keep on hand for any judge form that limits file size to 25 MB.
- `kraterion-teaser-30s.mp4` — for Twitter/X promotion the day Overflow's voting opens. Twitter's auto-loop will start it on the cold-open title card, which is the strongest 1-frame thumbnail in the film.

#### Overflow 2026 specific notes
- The 2026 Participant Handbook (linked from overflow.sui.io and DeepSurge) is the binding source for the official maximum video length. Open the handbook before submission and confirm the cap; if it requires ≤3 minutes (the most likely value based on 2025 patterns and Devpost norms), the submission cut is already compliant. If it requires ≤2 minutes, use the pre-rendered fallback cut from Appendix B.
- **Track selection:** Submit to the **Walrus Specialized Track** — that's the strongest narrative fit and the headline sponsor. The Walrus track description on overflow.sui.io reads verbatim: *"Leverage Walrus to build applications that handle large, off-chain, or verifiable data."* Kraterion is that, exactly. The "agent in 60 seconds" angle is positioned as the demo's use case rather than the track. (overflow.sui.io commits to *"$500K+ in total prizes and rewards"* across all tracks; per-track pool figures live in the handbook.)
- **One-track rule:** Overflow's 2026 FAQ states verbatim: *"You must select the one track that best represents your project."* You can only pick one.
- Demo Day is a separate session held mid-June (the 2025 Demo Day ran June 13–14; the 2026 site shows the same June 13–14 demo days). If you're invited, prepare a live 5-min screen-share — not this film. This film is the *project page* video and the Twitter video.

---

### 10. Risk list & fallbacks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Remotion render crashes on a long composition | Low-Med | Render each scene to a `.mp4` separately, then `ffmpeg -f concat -i list.txt -c copy out.mp4`. The build sequence in §7 makes this trivial because every scene is a standalone composition. |
| Font fallback to Arial in the final render | Medium (the #1 Remotion gotcha) | Always load via `@remotion/google-fonts/Inter` at the top of `Root.tsx`, never inside a component. Verify by rendering one frame at `--frames 0` and inspecting the typography before the full render. |
| YouTube Content ID claim on Pixabay music | Low (selected contributors don't aggressively enroll, but it can still happen — Pixabay's own FAQ acknowledges this) | Keep download timestamps + the Pixabay license URL in `public/music/LICENSES.md`. If a claim hits, file a YouTube dispute citing the Pixabay license — Pixabay's IP blog explicitly documents this resolution path. **Worst-case fallback music:** Bensound's *"Endo \| Reflective Ambient"* by Sam Bergamini and Fatjon Zefi — *"Featuring piano, synth, woodwinds and brass. Perfect for wellness related content, films and documentaries."* (bensound.com/royalty-free-music/track/endo-reflective-ambient) — royalty-free with attribution required on the Free license. Pixabay is preferred because Bensound's free tier requires an attribution line on screen. |
| The Overflow 2026 handbook reveals a video cap shorter than 3 min | Medium | Pre-build the 2-min cut alongside the 3-min cut. Scenes to drop in priority order: S03 (status quo), S11 second half (the closing line under MCP), S06 row 3 (Seal collapsed into Walrus's gloss). |
| The dashboard mockup doesn't read on mobile | Low | Test the render on iPhone Safari (the worst-case for Remotion text antialiasing). Ensure all dashboard text is ≥24 px at 1080p source. |
| Music tracks change/get removed from Pixabay | Very Low (the contributors are established) | Download mp3s on day 1, keep them in the repo. Pixabay's TOS allows continued use of content downloaded while it was available. |
| The 60-frame cold-open silence reads as "broken video" to a judge skimming on 2x speed | Medium | Open with a 24-frame Cream-on-Ink fade-in instead of a hard black, then 36 frames of held Ink before Track A enters. (This is what Linear does.) |
| Letter-by-letter reveals look slow at 2x playback speed | Medium | Optimize the cold-open word `yours.` to land in 18 frames total at 1x — it'll still read at 2x. |
| Render machine runs out of memory | Low-Med | Set `--concurrency 2` and close all browser tabs. A 16 GB MacBook handles 1080p/30fps at concurrency 4; 8 GB machines should use concurrency 1. |
| Time pressure: can't finish all 13 scenes | Plan-able | Build in the published order in §7. If you must ship at hour zero with only Acts I and III, the film still tells a complete story — the hero beat is Scenes 7–11. Cut Scenes 5–6 last. |

---

## Recommendations

**Stage 1 — In the first 4 hours (today).** Run the scaffold and skill install from §7 Step 0. Drop the four Pixabay tracks into `public/music/` and verify each plays back at its expected duration. Build the tokens, motion primitives, and aperture mark (§7 Steps 1–4) before touching a scene. **Benchmark to advance to Stage 2:** Steps 0–4 done, one preview render of a placeholder 5-second composition succeeds with Inter rendered correctly (not Arial).

**Stage 2 — Day 1 (next 12 hours).** Build Scenes 1, 2, 4, 9, 12 — the five scenes that carry the entire emotional arc on their own. Skip 3, 5, 6, 7, 8, 10, 11, 13 until Stage 2 is verified. Render the 5-scene assembly at 1080p/CRF 23 just to confirm timing. **Benchmark to advance to Stage 3:** the 5-scene cut feels emotionally complete to you when watched silent — if it doesn't, the bigger film won't either, and the problem is in the typography / pacing, not in the scenes you haven't built yet.

**Stage 3 — Day 2.** Build the dashboard component family (`<DashboardChrome>`, `<BucketRow>`, `<KnowledgeToggle>`, `<IndexingProgress>`, `<AgentForm>`, `<ChatPanel>`, `<MCPWindow>`). Then plug them into Scenes 7, 8, 10, 11. These are the scenes that prove Kraterion is real software, not a pitch deck. **Benchmark to advance to Stage 4:** a still frame from Scene 11 (the MCP window with 7 tools beside the chat panel) looks indistinguishable from a real Claude Desktop screenshot — that's the screenshot the judges will share.

**Stage 4 — Day 3.** Build Scenes 3, 5, 6, 13. Finalize the music bed with the cue map from §2. Render the full 3:00 cut at CRF 18. Run the loudness check. Build the 30-second teaser composition from existing scene components. **Benchmark to ship:** loudness measured between −15 and −13 LUFS, render hash matches between two consecutive renders (proves frame-determinism), file size between 35 and 55 MB, plays back without judder on iPhone Safari.

**Pre-flight before submission.** Open the Overflow 2026 Participant Handbook on the day of submission. If max video length is ≤2:00, render and submit the fallback cut from Appendix B instead. Submit to the Walrus Specialized Track. Upload the unlisted YouTube; paste the link into DeepSurge; add the chapters; pin the comment with the GitHub link.

**Change the plan if**: (a) the Overflow 2026 Participant Handbook explicitly requires a screen-recording demo rather than a marketing film — in that case, keep this film as the homepage/Twitter asset and produce a separate 90-second screen-share with voiceover for the submission; (b) the Walrus track's bounty page (typically published 2–4 weeks before submission deadline) requires specific on-chain primitives in the demo — in that case, add a brief 6-second insert before Scene 11 showing a Sui transaction confirming a `BlobUpload` event; (c) Demo Day invitations come back and your slot is 5 minutes — keep the live screen-share separate from this film, don't try to play this film inside the slot.

---

## Caveats

- The exact maximum video length for Sui Overflow 2026 submissions lives inside the gated Participant Handbook (linked from overflow.sui.io / DeepSurge). This plan assumes 3:00 is safe based on 2025 patterns and provides a 2:00 fallback (Appendix B) in case it isn't. **Verify before final upload.**
- The Walrus Specialized Track per-pool prize figure is not publicly itemized on overflow.sui.io as of writing; the site states only that the cumulative total is "$500K+." The 2025 edition paid $30,000–$7,500 per track winner. Treat any pre-published per-track number not from the handbook as unverified.
- Pixabay tracks can theoretically be removed by the contributor or hit by aggressive Content ID claims on YouTube; both are low-probability for the four contributors selected, but the Bensound *Endo \| Reflective Ambient* track is held as a documented fallback (attribution required on the free license).
- Remotion 4.0.463 (May 20 2026, per npmjs.com/package/remotion) is the latest version at time of writing; the API surface used in this plan (`<Series>`, `<Audio volume={fn}>`, `@remotion/google-fonts`, `interpolate`, `spring`) has been stable since 4.0 and the plan does not depend on any 4.0.x patch-version feature.
- The "seven motion patterns" inventory is synthesized from publicly visible behavior across Linear, Vercel, Arc, Resend, and Vercel's own Web Interface Guidelines (vercel.com/design/guidelines), not from a single canonical source. Treat it as a working grammar, not a citation.
- The film assumes Kraterion's product matches the description in the brief (S3-compatible endpoint, zkLogin via Enoki, Seal client-side encryption, the seven MCP tools by name, embeddable chat widget). If any of those names change before submission, update the on-screen text in Scenes 5, 7, 10, 11 — the visual treatment is the same.

---

## Appendix A — Brand-voice quick reference (so Claude Code doesn't drift)

**Use:**
- "Object storage you actually own."
- "Built for Sui Overflow 2026." (sentence case, period at the end)
- "Sign in with Google."
- "Build an agent in 60 seconds."
- "Same tools, same files."
- Sentence case for everything on marketing surfaces.
- Tabular numerals (`font-variant-numeric: tabular-nums`) wherever a number appears next to another number.

**Do not use:**
- "Revolutionary", "game-changing", "next-gen", "the future of"
- Exclamation marks
- Emoji
- "Web3" as the subject of a sentence (it's an adjective at most)
- Crypto-coded language: "moon", "WAGMI", "frens", "ape"
- Shadows (use 1-px hairlines)
- Gradients (except for the krater-orange logo fill on the final frame, which is a flat color)
- Any color other than Cream, Ink, Stone, and Krater orange

---

## Appendix B — Two-minute fallback cut (if Overflow caps at 2:00)

| Scene | Action |
|---|---|
| 1 | Cold open `yours.` (0:00–0:04) |
| 2 | Mark reveal (0:04–0:09) |
| 4 | Pivot tagline (0:09–0:18) — skip Scene 3 |
| 5 | S3 swap (0:18–0:38) |
| 6 | Sui/Walrus/Seal — collapse to one row, 12 s (0:38–0:50) |
| 7 | Dashboard (0:50–0:58) |
| 8 | Toggle Knowledge (0:58–1:14) |
| 9 | Hero title (1:14–1:19) |
| 10 | Agent + chat — abridged, 24 s (1:19–1:43) |
| 11 | MCP — abridged, 12 s (1:43–1:55) |
| 12 | Outro (1:55–2:00) |

Total: 120 s (3600 frames). Re-render with `--props '{"durationInFrames":3600}'` if you parameterize the composition, or build a separate `KraterionFilmShort.tsx` that wraps the same scene components in a shorter `<Series>`.