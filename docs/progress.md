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
- [x] `[control-plane]` Prisma schema implements §5 of the plan, migrations
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
- `[move-sdk]` 2026-05-08 — TS bindings generated and wired up.
  - `@mysten/codegen` 0.10.4 + `@mysten/sui` 2.16 + `@mysten/bcs` 2.0
    added to `packages/kraterion-move-sdk`.
  - `sui-codegen.config.ts` points at `move/kraterion`; running
    `pnpm --filter @kraterion/kraterion-move-sdk generate` runs
    `sui move summary` and emits typed PTB builders + BCS schemas under
    `src/generated/`. Output is committed.
  - `src/index.ts` re-exports the generated `kraterion`, `access`,
    `events` namespaces, and adds:
    - `KRATERION_PACKAGE_ID` (re-exported from `@kraterion/shared`)
    - `EVENT_TYPE` map of fully-qualified type strings ready for
      `client.queryEvents({ MoveEventType: ... })`
    - `parseEvent({ type, bcs, bcsEncoding })` — typed event decoder that
      dispatches across all six event schemas
  - 7 vitest tests pass: 5 unit + 2 live testnet integration. The live
    pair (`KRATERION_LIVE=1`) confirms the deployed package's three
    modules (`access`, `events`, `kraterion`) match what we expect via
    `getNormalizedMoveModulesByPackage`.
  - Two new runbook entries logged: SDK 2.x rename
    (`SuiClient`→`SuiJsonRpcClient`) and the `Uint8Array` vs `number[]`
    typing footgun for `vector<u8>` PTB args.
- `[move]` 2026-05-08 — Reserve spawned by Move's `init` at publish, not
  via a follow-up tx. Re-published; reserve ID auto-captured into
  `constants.ts`. New deploy:
  - Package `0x5dfc84a40e295ba2472e9d2ebd728ff58d133431976f8123c9466f09a3a464db`
  - UpgradeCap `0x09b6cbd14416224bdc9694bf4b66219d630611f0b284ab029d8e05e0981be958`
  - PlatformReserve `0x9d939ddb91d7379afaebd5c86c4470a6285638eb92e3e8f7a1a2df267cef5a5c`
    (admin = deployer, empty whitelist, 0 WAL)
  - `setup-testnet.sh` updated to extract reserve ID from the publish's
    `objectChanges` filtered by type and write `KRATERION_RESERVE_ID` to
    constants. Falls back to a warning if the package's `init` is ever
    removed without updating the script.
  - Tests use `reserve::init_for_testing(ctx)` to spawn a reserve in
    test-scenario (Move's test framework doesn't auto-run package init).
  - One ADR + one runbook entry added (init-spawned reserve, orphan
    handling on re-publish).
- `[move]` 2026-05-08 — Big refactor: dropped per-bucket funding pools,
  added single platform reserve, moved register/extend behind contract
  guards. Re-published to testnet (new package ID).
  - **New module:** `kraterion::reserve` — `PlatformReserve` shared
    object with `admin`, `authorized_callers` whitelist, and
    `wal_balance`. Admin-only: `authorize_caller`, `deauthorize_caller`,
    `withdraw`. Anyone-can-fund: `fund`. `public(package)` helpers
    `pull_wal` / `deposit_wal` / `assert_caller_authorized` for adjacent
    modules.
  - **New entry functions:**
    - `register_blob_for_bucket(reserve, bucket, system, payment_amount,
      storage_amount, epochs_ahead, blob_id, root_hash, size, encoding_type)`
      — wraps Walrus's `reserve_space + register_blob`. Two-check auth:
      reserve whitelist AND bucket access. Returns leftover WAL to reserve.
    - `extend_blob_from_reserve(reserve, shared, system, payment_amount,
      epochs)` — wraps Walrus's `shared_blob::fund + extend`. One-check
      auth: reserve whitelist only. Used by the renewal worker.
  - **Removed:** `Bucket.funding_pool` field, `fund_bucket` function,
    `funding_pool_value` accessor, `EInsufficientFunds` error.
  - **Modified:** `wrap_in_shared_blob` no longer takes
    `initial_fund_amount` and uses `shared_blob::new` (empty jar) instead
    of `new_funded`. `KraterionObjectCreated.funded_amount` event field
    dropped.
  - **Tests:** 33 unit tests pass (was 24). New coverage on reserve
    lifecycle, whitelist mutations, fund/withdraw, plus all prior bucket
    + Seal + visibility tests intact. Wrap and register paths require a
    real Walrus `System` to test; deferred to testnet integration.
  - **Re-publish:** new package `0x4faff92a05804264270caff7e2b6eb512eacec11120671bc6e3acf1bb7823b07`,
    upgrade cap `0x6acd7b668dcc75030825207b7c1cdbaa120520c182277ce1aea4c2279311ff83`,
    cost 60,826,280 MIST, tx `8ijJsP9TWhQdgrVkGihGBBAxdUVjFK2ybcyocU75i24D`.
    Old package (0x853c…818f5) is orphaned. `Published.toml`,
    `packages/shared/src/constants.ts`, and Move.lock all sync'd. SDK
    bindings auto-regenerated by Turbo (now includes 4 modules:
    `kraterion`, `access`, `events`, `reserve`).
  - **SDK additions:** `EVENT_TYPE` and `parseEvent` extended with the
    five new reserve events. `reserve` namespace re-exported from
    `@kraterion/kraterion-move-sdk`.
  - Decisions doc gained two ADRs: Walrus architecture choice (D) and
    the reserve model.
- `[control-plane]` 2026-05-08 — Prisma schema landed, initial migration
  applied to local Postgres.
  - 7 models: `Account`, `Project`, `ApiKey`, `Bucket`, `S3Object`,
    `UsageEvent`, `SubWallet` — covers identity, on-chain bucket bindings,
    object metadata with Seal envelope storage, sub-wallet inventory, and
    usage logs.
  - Two corrections vs plan §5, both flowing from the Move design:
    `encryption_mode` lives only on `Bucket` (not `S3Object`) since access
    policy is per-bucket; `seal_identity` comment updated to reflect the
    48-byte format `[bucket_uid (32) || object_uuid (16)]`.
  - Migration `20260508070133_init` applied. All 7 tables verified via
    `psql \\dt` plus a tsx smoke test that counted rows on every model.
  - Root `pnpm db:*` scripts: `generate`, `migrate`, `deploy`, `studio`,
    `format`, `reset`. Run from repo root; `.env` carries
    `DATABASE_URL` (postgresql://kraterion:kraterion@localhost:5432).
  - Workflow: `docker compose -f infra/compose/docker-compose.yml up -d`
    → `pnpm db:migrate` (interactive, names migrations) →
    `pnpm db:generate` (regenerates client).
- `[move-sdk]` 2026-05-08 — Bindings auto-sync wired in.
  - `turbo.json` declares `@kraterion/kraterion-move-sdk#generate` with
    Move source as inputs; `build`/`typecheck`/`test` all depend on it.
    Verified: cached run ~20 ms, cache invalidates on Move source content
    change.
  - `scripts/setup-testnet.sh` now runs `sui move test`, then bindings
    regen, then SDK typecheck *before* any publish. Refuses to publish
    if any of these fail.
  - New runbook entry on `Published.toml` blocking re-publish.
  - New decision recorded explaining why this is on Move source change
    (not on deploy).

---
