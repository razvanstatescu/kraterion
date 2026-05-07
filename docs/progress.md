# Progress

Chronological build log. What shipped, when, in what state. **This is the
ground truth for "where are we"** — not the spec (`implementation-plan.md`),
not the GitHub repo, not memory.

**When to add an entry:** at the end of any session where something measurable
happened — a milestone landed, a workstream unblocked, a dependency picked up.
Don't log every commit; the conventional-commits log is for that.

**Format:** dated bullet list, grouped by week, prefixed with the workstream
tag (`[scaffold]`, `[move]`, `[gateway]`, `[dashboard]`, `[worker]`,
`[landing]`, `[infra]`, `[docs]`).

---

_Calendar weeks anchored in `docs/timeline.md`._

## Week 1 (May 7–13) — foundations

**Exit criteria** (per `docs/implementation-plan.md` §12 and `docs/timeline.md`):

- [x] `[move]` Kraterion Move package compiles, all positive-case tests pass
- [x] `[move]` First publish to Sui testnet, package ID written to
      `packages/shared/src/constants.ts`
- [ ] `[infra]` Walrus testnet publisher + aggregator deployed and reachable
- [ ] `[infra]` Seal testnet key server IDs filled into
      `packages/shared/src/constants.ts`
- [ ] `[infra]` Sub-wallets funded with testnet SUI + WAL
- [ ] `[infra]` KMS configured for per-account API decryption keys
- [ ] `[control-plane]` Prisma schema implements §5 of the plan, migrations
      apply cleanly
- [ ] `[dashboard]` zkLogin sign-in working end-to-end with Google
- [ ] `[gateway]` Healthcheck reachable, body limit verified at 13 GiB
- [x] `[scaffold]` monorepo with all apps + packages, builds clean
- [x] `[docs]` knowledge-base files set up (decisions / runbook / progress)

**Log:**

- `[scaffold]` 2026-05-07 — monorepo scaffolded end-to-end. 5 apps
  (landing, dashboard, control-plane, gateway, worker), 5 packages (shared,
  walrus-client, seal-client, kraterion-move-sdk, ui), `move/kraterion/`,
  `prisma/`, `infra/compose/` with postgres + valkey, `scripts/` with demo
  stubs. Turbo + pnpm workspace + base tsconfig wired. Old `kraterion-website`
  moved to `apps/landing` and renamed to `@kraterion/landing`. Plan moved
  to `docs/implementation-plan.md`.
- `[docs]` 2026-05-07 — set up `docs/decisions.md`, `docs/runbook.md`,
  `docs/progress.md`. Wired into root `CLAUDE.md` so future sessions read and
  append.
- `[move]` 2026-05-08 — Move package compiles clean and 24/24 unit tests
  pass on `sui move test`. Three modules:
  - `kraterion::kraterion` — `KraterionBucket` + entry functions
    (`create_and_share_bucket`, `create_grant_and_share_bucket`,
    `fund_bucket`, `grant_api_access`, `revoke_all_api_access`,
    `set_bucket_visibility`, `wrap_in_shared_blob`, `extend_shared_blob`)
  - `kraterion::access` — single `seal_approve` that branches on
    `bucket.encryption_mode` (public approves anyone, private approves
    owner OR api list)
  - `kraterion::events` — six events for the off-chain indexer
    (`KraterionBucketCreated`, `KraterionObjectCreated`,
    `KraterionObjectExtended`, `ApiAccessGranted`, `ApiAccessRevoked`,
    `BucketVisibilityChanged`)
  Test coverage: bucket lifecycle, funding, grant/revoke (positive +
  negative), visibility flip (positive + negative + idempotent),
  `seal_approve` in private and public mode (positive + negative + wrong
  bucket + short id), and the end-to-end `flip public→private revokes
  random callers` demo lever. Tests for `wrap_in_shared_blob` and
  `extend_shared_blob` are deferred to testnet integration because they
  require real Walrus `Blob` and `System` shared objects that the unit-test
  framework can't construct trivially. Six new entries appended to
  `docs/decisions.md` capturing the design choices that deviate from plan
  §4.
- `[move]` 2026-05-08 — Published Kraterion to Sui testnet.
  - **Package ID:** `0x853ceaa163da9b14ba7d7f11d6f7aa42a0f41bd441ca66e9fb8bff106dc818f5`
  - **UpgradeCap:** `0x68e76518d28d36165c28c91f964eebc608ba18f8aed05eec09a67316fdee596d`
  - **Tx:** `2pSKPVqQ4drqexqrKpZoiSgCvqH8FnNw4DFqMNxiLNE3`
  - **Cost:** 40,405,080 MIST (~0.04 SUI)
  - **Deployer:** `0xedbab07ff09790b85c17c694f0799998f12ce27a6000808864f36e08c27bf6c2`
  - Both IDs are stored in `packages/shared/src/constants.ts`. Full publish
    response archived in (gitignored) `deploy/2026-05-08T004348-…json`.
- `[scripts]` 2026-05-08 — `scripts/setup-testnet.sh` finalized: pre-flight
  CLI/jq checks, idempotency guard against accidental re-publish (refuses
  unless `--force`), faucet retry with backoff if the deployer is
  underfunded, `--dry-run` flag for gas estimation, and automatic write of
  package ID + upgrade cap to `packages/shared/src/constants.ts`. Run
  `scripts/setup-testnet.sh --help` for usage.

---
