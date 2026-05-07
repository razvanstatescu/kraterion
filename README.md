# Kraterion

S3-compatible storage on Walrus where every file is a SharedBlob owned on-chain
by the user, encrypted by default with Seal, and where the platform's
decryption access is delegated — never custodial. Built for Sui Overflow 2026,
Walrus track.

The full product and engineering spec lives in
[`docs/implementation-plan.md`](docs/implementation-plan.md). That document is
the source of truth — when this README and the plan disagree, the plan wins.

---

## Repo layout

```
kraterion/
├── apps/
│   ├── landing/          Next.js 16 — public marketing site (port 3000)
│   ├── dashboard/        Next.js 16 — signed-in console     (port 3001)
│   ├── control-plane/    NestJS + Fastify — CRUD API        (port 4001)
│   ├── gateway/          NestJS + Fastify — S3 API          (port 4002)
│   └── worker/           NestJS + BullMQ  — renewal worker  (port 4003)
├── packages/
│   ├── shared/                 types, Zod schemas, network constants
│   ├── walrus-client/          wrapper over @mysten/walrus
│   ├── seal-client/            wrapper over @mysten/seal
│   ├── kraterion-move-sdk/     generated TS bindings for the Move package
│   └── ui/                     shadcn primitives shared by dashboard + landing
├── move/
│   └── kraterion/              Sui Move package (KraterionBucket, seal_approve_*)
├── prisma/                     single Prisma schema, shared by all backend apps
├── infra/
│   ├── compose/                local-dev docker-compose (postgres + redis)
│   ├── docker/                 service Dockerfiles
│   └── terraform/              DigitalOcean droplet + DB provisioning
├── scripts/                    setup-testnet, fund sub-wallets, demo flows
├── design-system/              brand tokens and reference UI kits
├── docs/                       implementation plan and other long-form docs
├── assets/                     brand assets (avatar, etc)
├── tsconfig.base.json
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Why this shape

- **Control plane vs gateway are split** — different scaling profile (cold vs
  hot), different auth (cookies vs SigV4), different deploy cadence.
- **Worker is its own process** — renewal is long-running and network-heavy;
  must never affect API latency.
- **Landing separate from dashboard** — different release rhythm, can deploy
  static.
- **`walrus-client` / `seal-client` packages** — every service needs the Mysten
  SDKs with the same defaults; wrap once, import everywhere.
- **Single Prisma schema** — three NestJS services share one Postgres; one
  schema prevents drift.
- **Turborepo** — caches builds across apps, runs only what changed in CI.

See `docs/implementation-plan.md` §3 for the longer rationale.

---

## Local development

Prereqs: Node ≥ 20.11, pnpm ≥ 9, Docker, Sui CLI, Move CLI.

```bash
pnpm install                              # install workspace deps
docker compose -f infra/compose/docker-compose.yml up -d   # postgres + redis
pnpm dev                                  # run all apps in parallel via Turbo
```

Per-service:

```bash
pnpm --filter @kraterion/landing dev
pnpm --filter @kraterion/dashboard dev
pnpm --filter @kraterion/control-plane dev
pnpm --filter @kraterion/gateway dev
pnpm --filter @kraterion/worker dev
```

---

## Working with Claude Code

Each service folder has its own `CLAUDE.md` with local context. The root
`CLAUDE.md` covers project-wide conventions — read both before delegating.
Use `git worktree` to fan out work across the four parallel workstreams
(gateway / dashboard / worker / move) once the foundation is in place. See
`docs/implementation-plan.md` §15 for the full playbook.
