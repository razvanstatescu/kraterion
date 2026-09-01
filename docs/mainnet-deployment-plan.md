# Kraterion Mainnet Deployment, Testing Pipeline & Testnet Decommission

**Status:** DRAFT — awaiting decisions in §0 before execution.
**Scope:** stand up a fresh production stack on Sui + Walrus + Seal **mainnet**,
verify it, cut over, then decommission the live testnet deployment.
**Grounding:** every reference is `path:line` against the current tree; live infra
facts verified via `doctl`/`psql` on 2026-09-01. Values that must come from Mysten
(mainnet Walrus/Seal object IDs) are called out explicitly.

---

## Current state (what already changed this session)

- **Enoki is dropped.** Auth (zkLogin verify + salt + proving) and gas sponsorship
  are now **self-hosted**. `@mysten/enoki` is removed from `apps/control-plane` and
  `apps/dashboard` package.json. Implemented + tested on testnet (see
  `docs/self-host-zklogin-implementation.md`).
- **A zkLogin prover is already running** on a DO droplet (`kraterion-zklogin-prover-mainnet`,
  id `596855103`, `167.71.55.28`, fra1, `s-4vcpu-8gb`). It's network-agnostic (the
  `zkLogin-main.zkey` ceremony key proves for both testnet and mainnet), so it is
  reusable for mainnet as-is.
- **Sponsorship = our operator wallet** (`api_decryption` sub-wallet) via `GasCoinPool`;
  responses now report `sponsored_by: "kraterion"` (`prepare.service.ts:475`).
- **Still all-testnet on-chain:** `constants.ts`, the chain-client `network:"testnet"`
  literals, and the Walrus pricing constants are unchanged — §2 below is still fully to-do.

**Live testnet facts (2026-09-01):** DO app `48707638-…` (`kraterion`,
`kraterion-5glmp.ondigitalocean.app`); managed `kraterion-db` (pg, id
`989abc64-…`) holds **13 accounts / 9 buckets / 14 objects**; `kraterion-redis`.

---

## Strategy (recommended)

**Remove the live testnet DO deployment first, then build a fresh mainnet stack.** We
tear down the DO testnet app + its managed DBs up front (§ Preliminary) — it's no longer
needed. Mainnet is then a brand-new DO app + new managed DB/Redis + new Vercel env, on
mainnet config, verified end-to-end before the DNS cut.

**Rollback implication:** because testnet is gone before mainnet ships, there is **no
revert-to-testnet rollback** — a bad mainnet cutover is handled by fix-forward (repair /
redeploy the mainnet stack), not by pointing DNS back at an old backend. This is an
accepted trade for not running two stacks. Note the DO testnet app is *not* a functional
rollback for mainnet anyway (different chain, different data).

**Local testnet dev is unaffected.** The testing pipeline (§6) runs the app **locally**
against the Sui **testnet chain** (local docker DB + public testnet endpoints + the
zkLogin prover droplet) — it does not depend on the DO testnet app, so removing that app
does not remove our ability to test on testnet before cutover.

**The mainnet DB is fresh — no data migration.** Accounts are keyed by Google
`zklogin_sub`; the Sui address is derived deterministically from
`(iss,aud,sub) + ZKLOGIN_SALT_SEED` (`salt.service.ts:52-59`) and the code refuses to
change a stored `sui_address` for an existing sub (`zklogin.service.ts:73-81`).
Decision D-SALT (below) determines whether mainnet reuses the testnet salt seed
(same addresses) or a fresh one. Either way `KEY_WRAPPING_MASTER_KEY` is new for
mainnet, so all wrapped secrets (sub-wallet seeds, API-key secrets, BYOK provider
keys) are regenerated/re-entered. The 13 testnet users start fresh (§8 comms).

---

## Preliminary — Remove the live testnet DO deployment (DO THIS FIRST)

> **✅ EXECUTED 2026-09-01.** DO app `48707638-…`, `kraterion-db`, and `kraterion-redis`
> deleted; other projects' DBs and the prover droplet untouched. Backup (DB dump + app
> spec) at `~/kraterion-testnet-backup-2026-09-01/`. **Still owned by you:** notifying the
> 13 testnet users (no automated email here), removing any `*.kraterion.com` DNS records
> that pointed at the old app, and repointing/retiring the testnet Vercel frontend (§8).

We no longer need the testnet backend running on DigitalOcean. Tear it down **before**
the mainnet build. This is safe for our pre-cutover testing because §6 runs everything
**locally** against the testnet chain — it never touches the DO testnet app. Only the DO
app + its two managed databases are removed here (the Vercel frontend + Stripe test
webhook are residual cleanup in §8).

> **Destructive, irreversible.** Deletes the live testnet service and the DB holding the
> 13 testnet accounts. Do the backup + comms first.

- [ ] **Notify the 13 testnet users** (list from `kraterion-db`) that the testnet service
      is shutting down; offer a data export. Their on-chain testnet blobs persist; the
      hosted service goes away.
- [ ] **Back up first (recommended, cheap insurance):** final `pg_dump` of `kraterion-db`
      and a copy of the DO app spec, kept off-DO:
      `doctl databases connection 989abc64-7ef2-4ba5-929e-6fed95191b2b --format URI --no-header`
      → `pg_dump "<uri>" > testnet-kraterion-db-final.sql`;
      `doctl apps spec get 48707638-82d6-4a07-bd9c-c22b89a036bb > testnet-app-spec.final.yaml`.
- [ ] **Delete the DO app:** `doctl apps delete 48707638-82d6-4a07-bd9c-c22b89a036bb`
      (`kraterion`, `kraterion-5glmp.ondigitalocean.app`). This stops control-plane +
      gateway + worker + the migrate job.
- [ ] **Delete the managed databases** (separate resources — app deletion does not remove
      them): `doctl databases delete 989abc64-7ef2-4ba5-929e-6fed95191b2b` (`kraterion-db`,
      pg) and the `kraterion-redis` cluster (`doctl databases list` → its id).
- [ ] If any `*.kraterion.com` records point at the old app target, remove them so they
      don't resolve to a dead backend before the mainnet DNS is set.
- [ ] **Keep the zkLogin prover droplet** (`kraterion-zklogin-prover-mainnet`,
      `596855103`) — it is network-agnostic and reused for mainnet (§4e). Do **not** delete it.
- [ ] Confirm testnet billing stops: `doctl apps list` and `doctl databases list` no longer
      show the testnet app/DBs.

After this, the only Kraterion things live on DO are the prover droplet and (until §8) the
testnet Vercel frontend, which now points at a removed backend — expected.

---

## 0. Decisions required before we start

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Move package audit** | Ship unaudited / external audit ($15–25k) / internal review | At least an internal + scoped external review of `reserve.move` + `pool_vault.move` — it custodies real WAL and gates decryption. (`implementation-plan.md:509`) |
| D2 | **Gateway hosting for large uploads** | Keep on App Platform (multi-GiB PUTs fail at ingress cap) + browser direct-to-Walrus / move gateway to a Droplet/DOKS | Decide by real object sizes. (`deployment-digitalocean.md:113-129`) |
| D3 | **Dedicated RPC provider** | Public mainnet gRPC (100 req/30s, prunes checkpoints) / paid gRPC+GraphQL | Paid/dedicated — indexer backfill + hot paths exceed the public cap. (`runbook.md:1843`) |
| D4 | **App topology** | New parallel mainnet DO app / mutate existing | New app (keeps testnet as rollback). |
| D5 | **Reserve funding** | How much real WAL + gas SUI to seed | Size from projected storage (§5). Bootstrap defaults (100 WAL / 50 SUI / 10 SUI) are likely too low. |
| D6 | **Operator wallet role** | Keep `api_decryption` as operator / mint dedicated `pool_operator` + `pool_treasury` | Mint dedicated roles; secure the reserve-admin (`pool_treasury`) key in KMS/hardware. (`prisma/schema.prisma:272-303`) |
| D7 | **Domain** | Confirm apex (`kraterion.com`?) owned + DNS controllable | Required for `.do/app.yaml` `api`/`mcp`/`s3` routing + Vercel apex. |
| **D-SALT** | **zkLogin salt seed for mainnet** | Reuse testnet `ZKLOGIN_SALT_SEED` (same Sui address per user across nets) / fresh seed | Fresh seed for a clean prod secret (fresh DB anyway). **Permanent once users exist — never rotate after launch.** |
| **D-PROVER** | **Prover placement for mainnet** | Reuse the running droplet (repoint firewall) / new droplet in the mainnet VPC | New/relocated droplet **inside the App Platform VPC**, firewalled to the backend's private IP — not the current public dev-IP box. (§4e) |

---

## 1. Pre-flight & prerequisites (off-repo)

- [ ] **Acquire real assets.** No faucet on mainnet. Fund the deployer with real SUI
      (publish ~0.1–0.5 SUI + operator gas) and real **WAL** for the reserve (exchange /
      `topup-reserve.ts` SUI→WAL swap).
- [ ] **Secure the deployer / reserve-admin key** (reserve admin can `withdraw`,
      `authorize_caller`). Hardware/KMS, not a hot dev key. (`load-deployer.ts`)
- [ ] **Self-hosted auth setup:**
  - Create a **mainnet Google OAuth client** (Web application). Add redirect URI
    `https://app.<domain>/auth/callback` (the ceremony posts there —
    `apps/dashboard/src/lib/zklogin.ts:135-142`). Capture the client id for both
    `GOOGLE_CLIENT_ID` (control-plane, verifies `aud`) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
    (dashboard).
  - Generate `ZKLOGIN_SALT_SEED` (32-byte hex) per D-SALT:
    `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`.
  - Stand up the mainnet **prover** (D-PROVER) — `infra/zklogin-prover/` (§4e). Note its
    reachable URL for `ZKLOGIN_PROVER_URL`.
- [ ] **Rotate & purge committed secrets.** `.do/app.local.yaml` has real
      `KEY_WRAPPING_MASTER_KEY`, `JWT_SECRET`, `MEMWAL_DELEGATE_KEY`, Stripe keys (and a
      dead `ENOKI_PRIVATE_KEY`). Generate fresh mainnet values, scrub the file from history
      (`git filter-repo`/BFG + force-push), rotate anything that leaked, and add it to
      `.gitignore`.
- [ ] **Dedicated mainnet gRPC/GraphQL endpoint** (D3) → `SUI_GRPC_HOST` / `SUI_RPC_URL`.
- [ ] **Stripe live keys** (`sk_live_`/`pk_live_`); live webhook secret comes in §5.
- [ ] **DNS control** for apex + `api`/`mcp`/`s3` (D7).
- [ ] **Source mainnet chain IDs from Mysten:** `@mysten/walrus`
      `MAINNET_WALRUS_PACKAGE_CONFIG` (system object, staking pool, published-at + original-id,
      version that ships `storage_pool`), mainnet WAL package id, mainnet Walrus aggregator +
      upload-relay URLs, mainnet Seal committee/key-server object IDs + aggregator.

---

## 2. Code changes for mainnet

**Top risk: the server-side chain clients ignore `SUI_NETWORK`** and hardcode
`network:"testnet"` — flipping the env alone runs mainnet billing against testnet chain.
Either (preferred) make `getSuiClient()`/`getWalrusClient()`/`getSuiClientForSeal()`
env-driven, or swap `constants.ts` + the three literals in place (fine for a one-way cutover).
Add a boot assertion that the connected chain-id matches `SUI_NETWORK`.

### 2a. `packages/shared/src/constants.ts` → mainnet (current testnet values shown)
- [ ] `NETWORK = {sui:"testnet",walrus:"testnet"}` → `"mainnet"` (`:6-9`)
- [ ] `SUI_TESTNET_GRPC = "https://fullnode.testnet.sui.io:443"` → mainnet provider (`:19`)
- [ ] `SUI_TESTNET_GRAPHQL = "https://graphql.testnet.sui.io/graphql"` → mainnet (`:26`)
- [ ] `WALRUS_AGGREGATOR_URL = ".../aggregator.walrus-testnet..."` → mainnet aggregator (`:31`)
- [ ] `WALRUS_UPLOAD_RELAY_URL = ".../upload-relay.testnet..."` → mainnet relay (`:34`)
- [ ] `WALRUS_SYSTEM_OBJECT_ID = "0x6c2547cb…"` → mainnet system object (`:41`)
- [ ] `WALRUS_PACKAGE_PUBLISHED_AT_TESTNET = "0x849e95d2…"` → mainnet published-at (rename) (`:59`)
- [ ] `WALRUS_PACKAGE_VERSION_TESTNET = 3` → mainnet version shipping `storage_pool` (`:63`)
- [ ] `WALRUS_STAKING_POOL_ID = "0xbe461803…"` → mainnet staking pool (`:70`)
- [ ] `WAL_PACKAGE_ID = "0x8270feb7…"` → mainnet WAL (drives `WAL_COIN_TYPE`) (`:79`)
- [ ] `WALRUS_PUBLISHER_URL` legacy → mainnet or drop (`:90`)
- [ ] `SEAL_KEY_SERVERS` = `"0xb012378c…"` (1 server) → mainnet committee IDs (`:108-114`)
- [ ] `SEAL_THRESHOLD = 1` → re-check for mainnet committee (`:117`)
- [ ] `SEAL_AGGREGATOR_URL = "…seal-aggregator-testnet…"` → mainnet aggregator (`:120`)
- [ ] `KRATERION_PACKAGE_ID`/`UPGRADE_CAP`/`RESERVE_ID` (`:125,128,135`) — set by §3 publish

### 2b. Chain-client network literals
- [ ] `packages/walrus-client/src/index.ts:43` `network:"testnet"` → mainnet
- [ ] `packages/walrus-client/src/index.ts:58` `network:"testnet"` (+ revisit relay tip/timeout)
- [ ] `packages/seal-client/src/index.ts:45` `network:"testnet"` → mainnet
- [ ] `packages/seal-client/src/index.ts:64` `verifyKeyServers:false` → **`true`**

### 2c. Pricing re-baseline (mainnet Walrus ~30× testnet) — keep the two copies in lockstep
Mainnet ≈ `storage 100,000 FROST/MiB/epoch`, `write 20,000 FROST/MiB`, epoch 14 days,
`max_epochs_ahead 53` (`monetization-and-billing.md:991-997`). Current code = 3000 / 5000:
- [ ] `packages/walrus-client/src/index.ts:170` `STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST=3000n`
- [ ] `packages/walrus-client/src/index.ts:177` `WRITE_PRICE_PER_MIB_FROST=5_000n` (`SAFETY_MULTIPLIER=2n` `:189`)
- [ ] **Duplicate, independently hardcoded:** `apps/control-plane/src/billing/cost-floor.processor.ts:117,127`
      `walrus_storage_price_frost:3000n` and `:118,128` `walrus_write_price_frost:5_000n`
- [ ] Re-confirm against live mainnet `system_state_inner` via `apps/gateway/scripts/walrus-pool-baseline.ts`
- [ ] Verify pool-lifetime math: epoch flips 1→14 days via `epochDaysForCurrentNetwork()`
      **only if `SUI_NETWORK=mainnet`** (`billing-constants.ts:208`); check
      `initialPoolEpochsAhead()`/`renewalEpochsPerCycle()` + `pool-renewal.processor.ts`.

### 2d. Hardcoded testnet references outside constants
- [ ] `apps/dashboard/src/lib/format.ts:128` hardcoded testnet aggregator → read `env.ts`
- [ ] `apps/dashboard/src/lib/env.ts:39,42` default aggregator + `network` fallback → mainnet
- [ ] `apps/worker/src/indexer/sui-grpc.client.provider.ts:41` `SUI_GRPC_HOST` default (testnet)
- [ ] `apps/worker/src/indexer/cli/fast-forward.ts:39`, `probe-readmask.ts:122` default hosts
- [ ] `apps/gateway/scripts/topup-reserve.ts` hardcoded testnet WAL coin type → import `WAL_COIN_TYPE`

### 2e. `move/kraterion/Move.toml` — Walrus dependency
- [ ] `[dependencies].Walrus` subdir `testnet-contracts/walrus` → mainnet contracts @ mainnet commit (`:15`)
- [ ] `[addresses].walrus` → mainnet Walrus **original-id** (`:33`); `[addresses].wal` → mainnet WAL (`:34`)
- [ ] `sui move build` → new `Move.lock`; regenerate bindings
      (`pnpm --filter @kraterion/kraterion-move-sdk generate`); full E2E

### 2f. Enoki leftovers — DONE this session (kept for the record)
- [x] Removed dead `ENOKI_PRIVATE_KEY` from `.do/app.yaml` + `.do/app.local.yaml`.
- [x] Removed the dead `getEnokiPublicKey()` accessor + `NEXT_PUBLIC_ENOKI_PUBLIC_KEY`
      from `dashboard/src/lib/env.ts` and `.env.local`.
- [x] Fixed the two stale tests (`test/zklogin.spec.ts` rewritten for `google-jwt`/`salt`;
      `test/prepare-tx.spec.ts` now asserts `sponsored_by==="kraterion"`) — both green.
- [x] **Functional fix (was a latent bug):** browser-side Seal decryption (`Inspector.tsx`)
      still used the removed dApp Kit wallet (`useCurrentAccount`/`useSignPersonalMessage`).
      Rewired to the zkLogin identity via a new `signPersonalMessageWithZkLogin`
      (`dashboard/src/lib/zklogin.ts`). Private-file preview now works without a wallet.
- [x] Updated Enoki-worded comments across `prepare.service.ts`, `wire.ts`, `sponsor.ts`,
      `login/page.tsx`, `zklogin.controller.ts`, `dto.ts`, agent dialogs, `seal.ts`.
- [ ] **Optional (deferred):** rename the `apps/control-plane/src/enoki/` directory (e.g. to
      `zklogin/`) — purely cosmetic; touches ~10 import sites.

> **Build gate:** `pnpm typecheck` at the root regenerates bindings when Move changes.
> Run `sui move test` + full typecheck before publishing.

---

## 3. On-chain deployment (Move package → mainnet)

`scripts/setup-testnet.sh` is testnet-hardwired (faucet, `--env testnet`, suiscan/testnet).
Parametrize into `setup-mainnet.sh` (network arg, no faucet, funded deployer) or publish manually:

1. [ ] `sui client switch --env mainnet`; deployer funded (real SUI).
2. [ ] `sui move build` + `sui move test` green in `move/kraterion`.
3. [ ] `sui client publish --gas-budget 200000000 --json` → capture `packageId`, `UpgradeCap`,
       and the `init`-spawned `PlatformReserve` id.
4. [ ] Write the 3 IDs into `constants.ts` (§2a); archive publish JSON under `deploy/`.
5. [ ] Capture the **publish checkpoint** (`sui client tx-block <digest> --json .checkpoint`)
       → `INDEXER_INITIAL_CHECKPOINT` (§4).
6. [ ] Rebuild `@kraterion/shared` + move-sdk so apps pick up the new IDs.

### 3a. Bootstrap wallets + reserve (real assets)
`pnpm -F @kraterion/gateway bootstrap` (`apps/gateway/scripts/bootstrap-gateway.ts`):
- [ ] Generates `api_decryption` + `knowledge_indexer` sub-wallets (seeds AES-wrapped with the
      **mainnet** `KEY_WRAPPING_MASTER_KEY`) — these are the sponsor/operator + indexer wallets;
      the operator secret lives in Postgres (`SubWallet.mnemonic_wrapped`,
      `operator-keypair.service.ts:78-88`), **not** an env var.
- [ ] Funds gateway (~50 SUI) + knowledge-indexer (~10 SUI) + reserve (~100 WAL) — **override for
      real load (D5)**; `fund-sub-wallets.sh` is a non-functional stub, do not use it.
- [ ] `reserve.authorizeCaller(...)` gateway + knowledge-indexer, then `reserve.fund(...)`.
- [ ] (D6) Optionally mint dedicated `pool_operator`/`pool_treasury`; secure treasury key.

### 3b. On-chain verification
- [ ] `PlatformReserve`: `wal_balance > 0`, `authorized_callers` includes operator + indexer, admin = treasury key.
- [ ] `apps/gateway/scripts/walrus-pool-baseline.ts` (mainnet) — `storage_pool` live + pricing matches §2c.
- [ ] `apps/gateway/scripts/smoke-pool-roundtrip.ts` — bare Walrus pool round-trip.

---

## 4. Infra provisioning (DO App Platform + Vercel + prover)

### 4a. Managed data stores (create BEFORE the app)
- [ ] `doctl databases create kraterion-db-mainnet --engine pg --version 16 …`
- [ ] `doctl databases create kraterion-redis-mainnet --engine valkey --version 8 …`
- [ ] pgvector via the `CREATE EXTENSION IF NOT EXISTS vector` migration.

### 4b. DO app (new mainnet app — D4)
- [ ] Copy `.do/app.yaml` → `.do/app.mainnet.yaml`; point at the new DB/Redis, flip the env block:
  - control-plane: `SUI_NETWORK: mainnet`, `SUI_RPC_URL`/`SUI_GRPC_HOST` → mainnet (D3) (`:139,140`);
    `STRIPE_MODE: live` (`:151`); `ADMIN_EMAILS` (was **empty** → 403s all `/admin/*`);
    `OAUTH_ISSUER`/`DASHBOARD_ORIGIN`/`CORS_ORIGINS` → prod URLs.
  - **ADD the self-hosted-auth vars (absent today — zkLogin 500s without them):**
    `ZKLOGIN_SALT_SEED` (SECRET), `GOOGLE_CLIENT_ID`, `ZKLOGIN_PROVER_URL` (→ §4e private URL).
  - **REMOVE** `ENOKI_PRIVATE_KEY` (`:156`).
  - worker: `SUI_NETWORK: mainnet`, `SUI_GRPC_HOST` mainnet (`:204,205`),
    `INDEXER_INITIAL_CHECKPOINT` → mainnet publish checkpoint (`:210`, currently `347115000`).
  - gateway: `SUI_NETWORK: mainnet` (`:178`).
- [ ] All SECRETs fresh; `KEY_WRAPPING_MASTER_KEY` **identical** across control-plane/gateway/worker
      (`:149,185,208`).
- [ ] `doctl apps spec validate` → `doctl apps create`. `migrate` PRE_DEPLOY runs `prisma migrate deploy`.
- [ ] Consider `deploy_on_push: false` during cutover.
- [ ] If D2: move gateway off App Platform.

### 4c. Vercel (landing + dashboard)
- [ ] New Vercel env for `apps/dashboard` (config exists) + `apps/landing` (**no `vercel.json` in
      repo — codify build/install**).
- [ ] Dashboard env: `NEXT_PUBLIC_SUI_NETWORK=mainnet`, mainnet `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL`,
      `NEXT_PUBLIC_CONTROL_PLANE_URL`, `NEXT_PUBLIC_GATEWAY_URL`, **`NEXT_PUBLIC_GOOGLE_CLIENT_ID`**
      (mainnet client), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live). **Drop `NEXT_PUBLIC_ENOKI_PUBLIC_KEY`.**

### 4d. DNS / TLS
- [ ] CNAMEs: `api`+`mcp` → control-plane, `s3` → gateway; apex+`app` → Vercel
      (`deployment-digitalocean.md:70-83`). Add `app.<domain>/auth/callback` to the Google client.
- [ ] MCP self-consistency: `OAUTH_ISSUER=https://api.<domain>`; LB strips client `x-forwarded-host`
      (`oauth.controller.ts`).

### 4e. zkLogin prover (NEW infra component)
The prover is **network-agnostic** (same `zkLogin-main.zkey` for testnet+mainnet), so no key
swap at cutover. Runbook in `infra/zklogin-prover/` (docker-compose + `download-zkey.sh` — git-LFS,
588 MB, sha256 `6a78c7d4…`). Sizing: **8 GB is comfortable** (idle ~1.3 GB; proof once per login).
- [ ] Provision a droplet **inside the mainnet App Platform VPC** (D-PROVER), or reuse `596855103`.
- [ ] `./download-zkey.sh` (git-lfs required) → `docker compose up -d` (prover-fe :5001).
- [ ] Firewall :5001 to the **backend's private IP only** (not a public/dev IP as testnet does).
- [ ] Set control-plane `ZKLOGIN_PROVER_URL=http://<prover-private-ip>:5001/v1`.
- [ ] Low-balance/health alert: if the prover is unreachable, sign-and-submit fails (login still works;
      only tx signing needs the proof).

---

## 5. Billing — Stripe live mode
- [ ] `STRIPE_MODE=live` + live keys (service refuses boot on prefix/mode mismatch,
      `stripe.service.ts:126-137`).
- [ ] `pnpm stripe:sync` recreates Products/Prices/Meters in **live** mode (mode-scoped; lookup keys
      in `catalog.ts`: `storage_v2`, `gateway_class_a/b`, `gateway_egress`, `share_token_egress`,
      `kb_index`, `agent_messages`).
- [ ] Live webhook → `https://api.<domain>/webhooks/stripe`; secret → `STRIPE_WEBHOOK_SECRET`.
- [ ] Re-baseline USD prices against mainnet WAL cost (§2c) + oracle before charging.
- [ ] Bearer gating: on `SUI_NETWORK=mainnet` only `kr_live_*` tokens work; `kr_test_*` rejected
      (`bearer-resolver.ts`). New keys mint `kr_live_`.

---

## 6. Testing pipeline

Grounded in the scripts + stack we built and verified on testnet this session. Run these gates
top-to-bottom; each is a hard gate before the next.

### 6a. Static gates (CI / pre-publish)
- [ ] `pnpm typecheck` at repo root (19 tasks; regenerates move-sdk bindings). Must be green.
- [ ] `cd move/kraterion && sui move test`.
- [ ] `pnpm -F @kraterion/control-plane test` (needs local pg up). The two previously-stale
      Enoki tests are fixed (§2f); `test/zklogin.spec.ts` + `test/prepare-tx.spec.ts` pass.

### 6b. Offline crypto probe (no chain, no Google, no prover)
- [ ] `pnpm -F @kraterion/control-plane zklogin:probe`
      (`scripts/zklogin-selfhost-probe.ts`) — proves RS256 JWT verify (valid / tampered / wrong-aud /
      expired), salt determinism + `<2^128`, `jwtToAddress` determinism, and server↔client address
      parity. Fast, deterministic; run in CI.

### 6c. Local full-stack against the target network
Bring-up order (each waits for the prior to be healthy):
1. [ ] `docker compose -f infra/compose/docker-compose.yml up -d` (pg + redis); `pnpm db:deploy`.
2. [ ] control-plane `:4001`, gateway `:4002` (`pnpm -F @kraterion/<svc> dev`) — confirm
       `OperatorKeypair loaded` + `gas pool … free=N coins` in logs.
3. [ ] Indexer: `pnpm -F @kraterion/worker indexer:fast-forward` (seeds cursor near live tip — the
       public node prunes old checkpoints, so a stale cursor 404s), then start worker `:4003`.
4. [ ] dashboard `:3001`.
5. [ ] Prover reachable at `ZKLOGIN_PROVER_URL`.

Health snapshot (all 200/expected):
```
control-plane :4001/health · gateway :4002/health · worker :4003/health · dashboard :3001/login
prover POST :5001/v1 → 400 (alive) · /v1/auth/zklogin/salt|prove → 401/400 on bad input
```

### 6d. Self-sponsorship smoke (live, on-chain)
- [ ] `pnpm -F @kraterion/control-plane sponsor:smoke` (`scripts/self-sponsor-smoke.ts`) —
      dev-signup → prepare-create → sign (Ed25519 stand-in for the zkLogin sender) → `/v1/sponsor/execute`
      → asserts on-chain success + `KraterionBucketCreated` + `sponsored_by=kraterion`. Run 2–3× to
      exercise the gas-coin lease/release (the sponsor path had a version-mismatch race, fixed via
      effects-based release). **This is the money path** — gas paid by the operator wallet, no Enoki.

### 6e. Browser end-to-end (needs a real Google login)
The prover verifies Google's RSA signature in-circuit, so a genuine proof requires a real OAuth
login — this is the only step that can't be scripted headlessly.
- [ ] Google client has `<origin>/auth/callback` in Authorized redirect URIs.
- [ ] `http://localhost:3001/login` → **Continue with Google** → `/auth/callback` runs the ceremony
      (salt → address → CP account) → dashboard.
- [ ] **Create a bucket** — dashboard signs with the ephemeral key + fetches the proof from the prover
      (first tx of the session; later txs reuse the cached proof), CP submits operator-sponsored, the
      indexer writes the row and the bucket appears.
- [ ] **Upload an object** (Seal encrypt → Walrus register/certify → retrievable via aggregator).
- [ ] **Revoke API access** → gateway loses read/write; **cancel** → files persist on-chain.

### 6f. Mainnet staged verification (pre-DNS-cut, against the DO app target)
- [ ] `curl https://<do-app-target>/health` + `/health/ready` (CP DB ping; gateway DB+Redis) → 200.
- [ ] MCP discovery resolves; unauth `POST /mcp` → 401.
- [ ] Repeat 6e against the mainnet dashboard (real WAL spent — do one full create+upload).
- [ ] Indexer resumes at the **mainnet publish checkpoint** (not 0) and writes rows.
- [ ] Seal round-trip with `verifyKeyServers:true`.
- [ ] Agent (BYOK OpenAI key) completes; missing-key path shows a useful message (§9).
- [ ] Stripe: a metered event lands as a live `MeterEvent`; webhook signature verifies.

---

## 7. Cutover
- [ ] Point DNS (apex/app → Vercel mainnet; api/mcp/s3 → mainnet DO app).
- [ ] Watch logs/health for an epoch-ish window.
- [ ] **Rollback = fix-forward.** Testnet was removed in the Preliminary step, so there is
      no old backend to point back to; recover by repairing/redeploying the mainnet stack.
      Mitigate by fully passing §6f (staged mainnet verification) *before* the DNS cut, so
      the cut only flips traffic to an already-verified stack.

---

## 8. Residual testnet cleanup (after mainnet is live)

The DO app + managed DBs + backup + user comms were already handled in the **Preliminary**
step. What remains after mainnet is live:

- [ ] **Retire the testnet Vercel frontend** (it points at the removed backend): repoint the
      Vercel project to mainnet (§4c) or delete the testnet env/deployment.
- [ ] Revoke external hooks: delete the Stripe **test** webhook; revoke testnet API keys.
      (**No Enoki app to disable** — self-hosted.)
- [ ] Rotate any secret that lived in `.do/app.local.yaml` (if not already done in §1).
- [ ] Testnet WAL is worthless — no reserve withdrawal needed (optional treasury `withdraw` for hygiene).
- [ ] Testnet Move package stays on-chain (immutable) — mark deprecated in docs.
- [ ] **Prover:** keep it — network-agnostic, already relabeled `…-mainnet`; only repoint its
      firewall to the mainnet VPC (§4e). Nothing to tear down.

---

## 9. Post-cutover — known issues to fix before scaling
- [ ] **Agent error surfacing.** Missing-OpenAI-key throws a helpful `userMessage`, but the
      invocation catch persists `err.message` (opaque `"Control Plane Error"`)
      (`agents.controller.ts:892`; `control-plane-error.ts:33-41`). One-line fix: persist
      `userMessage`/`details` for `ControlPlaneError`.
- [ ] **Onboarding gate for OpenAI key** (BYOK only; no platform key). Prompt before first agent use;
      optionally validate live quota at add-time.
- [ ] **Pool renewal economics.** Renewal skips non-paying projects (`pool-renewal.processor.ts`) —
      intended on mainnet, but ensure paying pools renew (14-day epochs) and expiry surfaces clearly.
- [ ] **`ADMIN_EMAILS`** must be set (was empty → all `/admin/*` 403).
- [ ] **Monitoring/alerting:** missing pool-renewal tick, reserve WAL low, gas pool low, indexer lag,
      Seal failures, **prover unreachable** → page. Reserve dry = uploads fail platform-wide.
- [ ] **Version skew:** root `pnpm@10.16.1` vs Dockerfiles `pnpm@9.12.0` — verify the CI image build.

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Chain clients ignore `SUI_NETWORK` (§2b) | Mainnet billing vs testnet chain — silent | Edit constants + literals; boot-assert chain-id == `SUI_NETWORK` |
| Unaudited Move package (D1) | Funds/decryption bug | Audit/review before real value |
| Reserve underfunded (D5) | Platform-wide upload failure | Size funding; low-balance alert; auto top-up |
| Public RPC limits (D3) | Indexer stalls / throttling | Dedicated provider |
| Committed secrets in git (§1) | Key compromise | Rotate + purge history |
| Gateway body cap (D2) | Large uploads fail | Direct-to-Walrus or off-platform gateway |
| Wrong mainnet Walrus/Seal IDs | Everything on-chain fails | Source from Mysten; verify with baseline |
| Pricing left at testnet (§2c) | Underpricing ~30× | Re-baseline BOTH copies |
| `ZKLOGIN_*` vars missing in `.do/app.yaml` (§4b) | zkLogin auth 500s | Add all three before create |
| Prover public-exposed / down (§4e) | Abuse / no tx signing | VPC + private-IP firewall; health alert |
| Salt seed changed post-launch (D-SALT) | Every address changes | Pick once; never rotate |

---

## Appendix A — file-change checklist (one-way to mainnet)
`constants.ts` (§2a) · `walrus-client/src/index.ts` L43,58,170,177 · `seal-client/src/index.ts`
L45,64 · `cost-floor.processor.ts` L117-118,127-128 · `Move.toml` L15,33,34 ·
`dashboard/src/lib/format.ts` L128 · `dashboard/src/lib/env.ts` L39,42 (+remove L47 Enoki) ·
`worker/.../sui-grpc.client.provider.ts` L41 · `topup-reserve.ts` · `.do/app.mainnet.yaml` env
block (add ZKLOGIN_*, remove ENOKI_PRIVATE_KEY) · stale tests `test/zklogin.spec.ts`,
`test/prepare-tx.spec.ts` · `.env.production.example`.

## Appendix B — secrets to set fresh for mainnet (SECRET-typed in DO)
`DATABASE_URL` · `REDIS_URL` · `KEY_WRAPPING_MASTER_KEY` (identical across all 3 services) ·
`JWT_SECRET` · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `MEMWAL_DELEGATE_KEY` ·
**`ZKLOGIN_SALT_SEED`** (32-byte hex, permanent). Landing: `KRATERION_KEY`.
**Non-secret but network-specific:** `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
`ZKLOGIN_PROVER_URL`. **No platform `OPENAI_API_KEY`** (BYOK only). **No Enoki keys anymore.**

## Appendix C — the operator/sponsor wallet is not an env var
Gas sponsorship uses the `api_decryption` sub-wallet, whose seed is stored **in Postgres**
(`SubWallet.mnemonic_wrapped`) and unwrapped with `KEY_WRAPPING_MASTER_KEY` at boot
(`operator-keypair.service.ts:78-88`). So a fresh mainnet DB + fresh master key means the
operator wallet is (re)generated by `bootstrap-gateway.ts` (§3a) and must be funded with real
SUI and authorized on the reserve. Losing the master key = losing the ability to sign.
