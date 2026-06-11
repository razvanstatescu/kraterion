# Deploying Kraterion to DigitalOcean App Platform

The backend (control-plane, gateway, worker) runs on **DigitalOcean App
Platform**; the **landing** and **dashboard** Next.js apps run on
**Vercel**. This doc is the deploy runbook. The declarative spec lives at
[`.do/app.yaml`](../.do/app.yaml); the env checklist at
[`.env.production.example`](../.env.production.example).

## Topology

| Component | DO type | Public | Port | Health |
|---|---|---|---|---|
| control-plane | service | yes (API + MCP) | 4001 | `GET /health` |
| gateway | service | yes (S3) | 4002 | `GET /health` |
| worker | worker | no | 4003 | — (auto-restart on crash) |
| migrate | pre-deploy job | — | — | runs `prisma migrate deploy` |
| Postgres 16 (+pgvector) | managed DB | — | — | — |
| Redis 7 | managed DB | — | — | — |

External (hardcoded in `packages/shared/src/constants.ts`, no env needed):
Sui testnet RPC/gRPC, Walrus testnet aggregator/relay, Seal testnet
committee.

## Build model

Each service has a **single-stage Dockerfile** (`apps/<svc>/Dockerfile`)
that builds from the **repo root** as context. It installs the whole pnpm
workspace, runs `prisma generate`, then `pnpm --filter "@kraterion/<svc>..."
run build` (the app + its workspace deps, in topological order). The Move
SDK bindings under `packages/kraterion-move-sdk/src/generated` are
committed, so **no Sui toolchain is needed at build time**.

The image is not pruned of devDependencies on purpose — pruning would
break pnpm's workspace symlink farm that ESM NodeNext resolution depends
on. Images are larger but reliable.

## One-time setup

1. **Install + auth doctl**
   ```bash
   brew install doctl
   doctl auth init
   ```

2. **Set the repo** in `.do/app.yaml`: replace every `REPLACE_ME/kraterion`
   with your `owner/repo`, and `branch` if not `main`. Or create the app
   in the DO UI by connecting the GitHub repo (it fills these in).

3. **Generate the two crypto secrets:**
   ```bash
   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' # KEY_WRAPPING_MASTER_KEY
   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' # JWT_SECRET
   ```
   `KEY_WRAPPING_MASTER_KEY` **must be the same value** on control-plane,
   gateway, and worker.

4. **Create the app:**
   ```bash
   doctl apps spec validate --spec .do/app.yaml
   doctl apps create --spec .do/app.yaml
   ```
   This provisions the managed Postgres + Redis and wires
   `${db.DATABASE_URL}` / `${redis.DATABASE_URL}` automatically.

5. **Fill the secrets** (everything marked `# SET` in the spec) via the DO
   dashboard → app → Settings → each component → Environment Variables, or
   `doctl apps update <APP_ID> --spec .do/app.yaml` after editing values.
   SECRET-typed vars are encrypted at rest once saved.

6. **Public hostnames / DNS.** The spec already declares the domains and
   hostname routing. `doctl apps get <APP_ID>` shows the `…ondigitalocean.app`
   target; add these CNAMEs at your DNS provider (DO issues TLS automatically):
   ```
   api.kraterion.com   CNAME   <app>.ondigitalocean.app   → control-plane
   mcp.kraterion.com   CNAME   <app>.ondigitalocean.app   → control-plane
   s3.kraterion.com    CNAME   <app>.ondigitalocean.app   → gateway
   ```
   `api` and `mcp` both target control-plane. The MCP endpoint is
   **`https://mcp.kraterion.com/mcp`**; its OAuth discovery resolves on that
   same host and points clients to the auth server at `api.kraterion.com`
   (= `OAUTH_ISSUER`), where the issuer matches — so the cross-host flow is
   self-consistent with no extra config. The apex `kraterion.com` and
   `app.kraterion.com` stay on Vercel (landing + dashboard).

## Database notes

- Engine **Postgres 16**. The `vector` extension is created by a migration
  (`CREATE EXTENSION IF NOT EXISTS vector`); DO Managed Postgres allows it,
  no manual step needed.
- The `migrate` PRE_DEPLOY job runs `prisma migrate deploy` before every
  rollout — schema changes ship atomically with code.
- Optional Prisma pool tuning: append
  `&connection_limit=40&pool_timeout=20` to `DATABASE_URL` (the gateway is
  a hot read/write path). DO also offers a built-in connection pool.

## Vercel side (landing + dashboard)

Deploy `apps/landing` and `apps/dashboard` as two Vercel projects (root
set to each app dir, monorepo build). Dashboard env:

- `NEXT_PUBLIC_CONTROL_PLANE_URL` → control-plane public URL
- `NEXT_PUBLIC_GATEWAY_URL` → gateway public URL
- `NEXT_PUBLIC_SUI_NETWORK=testnet`
- `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space`
- `NEXT_PUBLIC_ENOKI_PUBLIC_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Then add the Vercel dashboard origin to the backend's `CORS_ORIGINS` and
`DASHBOARD_ORIGIN`, and point the Stripe production webhook at
`https://<control-plane>/webhooks/stripe` (copy its signing secret into
`STRIPE_WEBHOOK_SECRET`).

## ⚠️ Large uploads through the gateway

The gateway sets a **multi-GiB request body limit** for Walrus blobs.
DigitalOcean App Platform's ingress caps request bodies and request
duration well below that, so **large S3 PUTs will fail** on App Platform.
Options:

1. **Direct-to-Walrus from the browser** (recommended for the demo): the
   dashboard uploads blobs straight to the Walrus upload-relay
   (`upload-relay.testnet.walrus.space`, already in constants) and only
   metadata/registration flows through the gateway.
2. **Run the gateway off App Platform** — a DO Droplet or DOKS (Kubernetes)
   behind a load balancer without the body cap — and keep control-plane +
   worker on App Platform.

Small objects work fine through App Platform as-is. Decide this before a
production cutover.

## Verifying a deploy

```bash
curl https://api.kraterion.com/health             # liveness  -> 200
curl https://api.kraterion.com/health/ready        # DB ping   -> 200
curl https://s3.kraterion.com/health/ready          # DB+Redis  -> 200
# MCP discovery resolves and advertises the api.kraterion.com auth server:
curl https://mcp.kraterion.com/.well-known/oauth-protected-resource
# Unauthenticated MCP POST -> 401 with a WWW-Authenticate resource_metadata link:
curl -i -X POST https://mcp.kraterion.com/mcp
doctl apps logs <APP_ID> worker --follow            # worker indexer + queue logs
```

## Build smoke test (local, optional)

Building the image runs `pnpm install`, which fetches packages — do this
only with an explicit go-ahead (see the supply-chain rules in CLAUDE.md):

```bash
docker build -f apps/gateway/Dockerfile -t kraterion-gateway .
```
