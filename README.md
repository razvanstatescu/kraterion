# Kraterion

S3-compatible storage on Walrus where every file is a `PooledBlob` registered
into the user's on-chain pool (a `KraterionPoolVault` wrapping a Walrus
`StoragePool`), encrypted by default with Seal, and where the platform's
decryption and mutation access is delegated — never custodial, revocable with a
single on-chain `revoke_all`. Built for Sui Overflow 2026, Walrus track.

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
│   ├── object-bytes/           framework-agnostic object decrypt pipeline (seal_approve PTB + Walrus fetch + decrypt)
│   ├── embeddings-client/      OpenAI embedding client shared by worker ingestion + control-plane retrieval
│   ├── kraterion-move-sdk/     generated TS bindings for the Move package
│   └── ui/                     shadcn primitives shared by dashboard + landing
├── move/
│   └── kraterion/              Sui Move package (access, events, kraterion, pool_vault, reserve)
├── prisma/                     single Prisma schema, shared by all backend apps
├── infra/
│   ├── compose/                local-dev docker-compose (postgres + redis)
│   ├── docker/                 service Dockerfiles
│   └── terraform/              DigitalOcean droplet + DB provisioning
├── scripts/                    setup-testnet, fund sub-wallets, hard-reset, demo flows
├── deploy/                     on-chain publish receipts (one JSON per Move package publish)
├── design-system/              brand tokens and reference UI kits
├── docs/                       implementation plan, decisions, runbook, progress, timeline
├── knowledge-base/             long-form feature notes (embeddings, MCP, pricing, S3 buckets, …)
├── video/                      Remotion demo video project
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
- **`walrus-client` / `seal-client` / `object-bytes` / `embeddings-client`
  packages** — every service needs the Mysten SDKs (and OpenAI embeddings) with
  the same defaults; wrap once, import everywhere, so behavior can't drift
  between services.
- **Single Prisma schema** — three NestJS services share one Postgres; one
  schema prevents drift.
- **Turborepo** — caches builds across apps, runs only what changed in CI.

See `docs/implementation-plan.md` §3 for the longer rationale.

---

## Local development

Prereqs: Node ≥ 20.11, pnpm ≥ 10.16 (required for the `minimumReleaseAge`
supply-chain guard in `pnpm-workspace.yaml`), Docker, Sui CLI, Move CLI.

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
