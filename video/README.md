# Kraterion — Remotion film

Cinematic, typography-only marketing film for Sui Overflow 2026 (Walrus track).
Built from `docs/video/video_plan.md`.

- 1920×1080 · 30 fps · H.264 mp4
- Main cut: **3:00** (5400 frames) — `KraterionFilm`
- Teaser: **0:30** (900 frames) — `KraterionTeaser`
- Fallback short cut: **2:00** (3600 frames) — `KraterionFilmShort`

## Stack

- Remotion 4.0.463
- React 19
- `@remotion/google-fonts/Inter`, `@remotion/google-fonts/JetBrainsMono`
- `@remotion/media` for audio

## Setup

This project is **not yet installed**. The root `CLAUDE.md` requires explicit
go-ahead before any `npm`/`pnpm`/`npx` install. From `video/`:

```bash
# install deps (requires user go-ahead per repo policy)
pnpm install   # or: npm install

# download the four Pixabay tracks + three Freesound SFX
# (see public/music/LICENSES.md and public/sfx/LICENSES.md)
```

## Develop

```bash
pnpm dev   # opens Remotion Studio at http://localhost:3000
```

## Render

```bash
# main 3-minute cut (~35–55 MB)
pnpm build

# 30-second teaser (~6–10 MB)
pnpm build:teaser

# 2-minute fallback cut
pnpm build:short
```

Output lands in `out/`. CRF 18, `yuv420p`, concurrency 4. Drop to `--concurrency 2`
if Chromium crashes on a low-RAM machine.

## Project layout

```
video/
├── package.json
├── remotion.config.ts
├── tsconfig.json
├── .agents/skills/remotion-best-practices/   # installed Remotion skill
├── .claude/skills/remotion-best-practices    # symlink for Claude Code
├── public/
│   ├── music/         # 4 Pixabay tracks (download per LICENSES.md)
│   └── sfx/           # 3 Freesound CC0 (download per LICENSES.md)
└── src/
    ├── Root.tsx                # font loading + composition registry
    ├── index.ts                # registerRoot entry point
    ├── compositions/
    │   ├── KraterionFilm.tsx       # 3:00 main cut
    │   ├── KraterionTeaser.tsx     # 0:30 Twitter teaser
    │   └── KraterionFilmShort.tsx  # 2:00 fallback
    ├── scenes/
    │   └── S01_ColdOpen.tsx … S13_FadeOut.tsx   # 13 self-contained scenes
    ├── components/
    │   ├── WordReveal.tsx          # motion primitive 1
    │   ├── LetterReveal.tsx        # motion primitive 2
    │   ├── HairlineDraw.tsx        # motion primitive 3
    │   ├── ApertureMark.tsx        # brand mark
    │   ├── CodeBlock.tsx           # S3 swap typing + per-char swap
    │   ├── DashboardChrome.tsx     # window chrome
    │   ├── BucketRow.tsx
    │   ├── KnowledgeToggle.tsx
    │   ├── IndexingProgress.tsx
    │   ├── AgentForm.tsx
    │   ├── ChatPanel.tsx           # typing caret in Krater orange
    │   └── MCPWindow.tsx           # 7 named tools, verbatim
    ├── motion/
    │   ├── easings.ts              # LINEAR_EASE = bezier(0.2,0.8,0.2,1)
    │   ├── springs.ts              # GENTLE / SETTLE / SNAP
    │   └── timing.ts               # scene start frames + duration
    ├── tokens/
    │   ├── color.ts                # Cream / Ink / Stone / Krater
    │   ├── type.ts                 # Inter + JetBrains Mono (loadFont at module top)
    │   └── spacing.ts              # 4/8/12/16/24/32/48/64/96/128
    └── audio/
        └── MusicBed.tsx            # 4 music tracks + 3 SFX cues
```

## Brand discipline (from `docs/video/video_plan.md`)

- **Krater orange `#C45B36` appears exactly 5 times.** If you see it anywhere
  else, you've broken the brand.
  1. Aperture mark on cold-open period flash (S01)
  2. The replaced URL host in the S3 swap (S05)
  3. The "Knowledge: On" pill (S08)
  4. The agent reply caret (S10)
  5. The aperture inner-ring fill on the final frame (S12)
- No shadows, no gradients (except the flat orange fill on the last frame),
  sentence case everywhere, hairlines instead of shadows.

## Audio target

Master ceiling −1 dBTP, integrated loudness **−14 LUFS** (YouTube target).
After `pnpm build`, sanity-check with:

```bash
ffmpeg -i out/kraterion-3min.mp4 -filter:a loudnorm=print_format=json -f null -
```

Aim for `input_i` between −15 and −13.

## Pre-flight before submission

Open the Sui Overflow 2026 Participant Handbook and verify max video length.
If ≤ 2 min, ship `KraterionFilmShort` instead of `KraterionFilm`.

## Why no `cd .. && pnpm install` from the monorepo root?

`video/` is intentionally a sibling project, not a workspace package. It has
its own dependencies (Remotion + react 19) that we do not want polluting the
Kraterion app graph. Install from inside `video/` only.
