# Kraterion — Claude Code Context

## Project
Kraterion is an S3-compatible storage SaaS where every file is a Walrus SharedBlob
owned on-chain by the user, encrypted with Seal envelope encryption by default,
and the platform's decryption access is delegated via on-chain Move policy that
the user can revoke. Building for Sui Overflow 2026, Walrus track.

Read /docs/implementation-plan.md for the full spec. Always defer to that doc
when in doubt.

## Project knowledge base — read and update these every session

Three living docs in `/docs/`. Read the relevant ones at the start of any
non-trivial task; **append to them as part of finishing the work**, not as a
separate step.

- `/docs/decisions.md` — architectural and product decisions, why each was made.
  **Append a new entry** whenever a non-obvious choice is made (tooling,
  shape, picking between two valid options). Use the existing format: date,
  title, status, context, decision, consequences.
- `/docs/runbook.md` — solved bugs and gotchas, indexed by symptom. **Grep
  here first** when something breaks. **Append a new entry** after solving any
  problem that took more than ~10 minutes to diagnose. Use the template at
  the top of the file. Make symptoms greppable (paste the actual error string).
- `/docs/progress.md` — chronological build log. The single source of truth for
  "where are we." **Append an entry** at the end of any session where something
  measurable shipped, prefixed with the workstream tag (`[move]`, `[gateway]`,
  etc).
- `/docs/timeline.md` — calendar view (which week we're in, exit criteria,
  submission deadline). Read at the start of any planning conversation. Update
  the Status block weekly and after any milestone slip.

These files complement (not duplicate) the auto-memory system: memory captures
user preferences and Claude-specific context per machine; these docs capture
project facts in version control where every session and every contributor
can see them.

## Move package ↔ TS bindings sync

The bindings in `packages/kraterion-move-sdk/src/generated/` are a function
of Move source, not of the deployed package. They auto-regenerate via Turbo
whenever Move source changes:

- `pnpm typecheck`, `pnpm build`, `pnpm test` at the repo root → if anything
  under `move/kraterion/sources/` or `move/kraterion/Move.toml` changed,
  Turbo runs `@kraterion/kraterion-move-sdk#generate` first; otherwise
  cached. See the per-task overrides in `turbo.json`.
- The generated output is committed to git so consumers don't need the Sui
  CLI to build the SDK.
- `scripts/setup-testnet.sh` regenerates and typechecks before every publish
  as a safety net. **Never publish a contract version whose bindings haven't
  been regenerated** — the script enforces this.

If you add a new Move module / function / event, the typical loop is:
1. Edit `move/kraterion/sources/*.move`
2. `cd move/kraterion && sui move test`
3. `pnpm typecheck` at the repo root (Turbo regens bindings, typechecks
   apps that import them)
4. `scripts/setup-testnet.sh --force` (only when ready to publish a new
   on-chain version; see runbook for the `Published.toml` step)

## Repo layout
Turborepo + pnpm workspaces. See README.md for the full map. Top level:
- `apps/landing` — public marketing site (Next.js 16, port 3000)
- `apps/dashboard` — signed-in console (Next.js 16, port 3001)
- `apps/control-plane` — CRUD API (NestJS+Fastify, port 4001)
- `apps/gateway` — S3-compatible API (NestJS+Fastify, port 4002)
- `apps/worker` — renewal worker (NestJS+BullMQ, port 4003)
- `packages/shared` — types, Zod schemas, network constants
- `packages/walrus-client`, `packages/seal-client` — wrappers over Mysten SDKs
- `packages/kraterion-move-sdk` — generated TS bindings for the Move package
- `packages/ui` — shadcn primitives shared by dashboard + landing
- `move/kraterion` — Sui Move package
- `prisma/` — single Prisma schema shared by all NestJS apps
- `infra/` — docker, compose, terraform
- `design-system/` — brand tokens and reference UI kits

## Stack conventions
- TypeScript strict mode everywhere
- NestJS with Fastify adapter (not Express) for back-end services
- Next.js 16 App Router (APIs differ from older Next.js — consult `node_modules/next/dist/docs/` before writing app code)
- Prisma for DB; never write raw SQL except in migrations
- shadcn/ui for components; never install other UI libs
- Zod for runtime validation at API boundaries
- BullMQ for background jobs
- Vitest for tests (not Jest), tests co-located with source files
- Conventional commits

## Crypto / Sui / Walrus / Seal
- All crypto primitives via @mysten/seal and @mysten/walrus
- Never roll our own crypto
- AES key material must be in Buffer/Uint8Array only, never strings
- Zero key material from memory after use
- KMS-wrap any persistent secret keys; never store plaintext mnemonics
- SessionKeys cached in Redis with TTL matching the SessionKey TTL

## Style
- Prefer composition over inheritance
- Prefer explicit imports over barrel exports
- Pure functions where possible; side effects pushed to edges
- Comments only when intent is non-obvious; no doc-block bloat
- Error messages are user-facing; write them like product copy

## Design system
Single source of truth for brand, tokens, and UI patterns lives at `/design-system/`.
Both the marketing website and any future app pull from it — do not hardcode colors,
font sizes, spacing, or radii anywhere else. Import tokens from
`design-system/colors_and_type.css` and use the CSS variables.

Before designing or building any UI:
- Read `design-system/README.md` for voice, palette laws, type scale, motion, iconography
- Check `design-system/ui_kits/marketing/` and `design-system/ui_kits/console/` for
  reference implementations
- The Claude skill `kraterion-design` (in `.claude/skills/`) auto-loads when designing UI

Hard rules: no pure black/white, no cool greys, no font weight ≥ 600, no shadows or
blur, no gradients, sentence case, banned phrases listed in design-system README.

Improvements to the design system go in `/design-system/` — not in app code.

## What not to do
- Don't add features not in /docs/implementation-plan.md without asking
- Don't introduce new dependencies without confirming
- Don't make commits with mixed concerns; split them
- Don't write defensive code that catches errors only to re-throw
- Don't add unit tests for trivial getters/setters
- Don't implement gated mode (custom Move policies) — that's post-hackathon

## Network
- Walrus testnet only for now
- Sui testnet only for now
- Seal testnet key servers (Mysten public, 2-of-3)
- Network constants in packages/shared/src/constants.ts
