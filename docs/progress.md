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
- `[gateway]` 2026-05-08 — **Phase 3 done — gateway speaks S3 to boto3.**
  Three rounds:
  - **Phase 3a (Nest plumbing).** `PrismaModule` (extends PrismaClient,
    `OnModuleInit/Destroy`, `app.enableShutdownHooks()` in main.ts;
    Prisma 5 dropped its own `enableShutdownHooks`), `RedisModule` (custom
    `useFactory` provider with eager connect, `quit()` on destroy),
    `AuthModule` (NestJS-wrapped `KeyWrappingService` over the existing
    `EnvKeyWrapper` class — bootstrap script keeps using the plain class).
    DATABASE_URL tuned to `connection_limit=40&pool_timeout=20` for hot
    gateway traffic. `/health` is now liveness; new `/health/ready`
    runs `SELECT 1` + Redis `PING` and returns 503 on degradation.
    First run: `db=18ms, redis=5ms`.
  - **Phase 3b (auth + errors).** SigV4 verifier ported from MinIO's Go
    reference. Files:
      - `auth/sigv4/parser.ts` — Authorization header parser
      - `auth/sigv4/canonical.ts` — pure canonical-request builder
        (S3 single-encode path, header normalization, signing-key
        derivation, constant-time compare via `crypto.timingSafeEqual`).
      - `auth/sigv4/sigv4.service.ts` — orchestrator: parses → checks
        skew (±5min) → unwraps secret via `KeyWrappingService` → builds
        canonical → compares.
      - `auth/sigv4/sigv4.guard.ts` — Nest Guard (not Middleware: in
        Fastify mode middleware gets Node's raw req; Guard gets the
        FastifyRequest). Sets `req.kraterion.identity`, `bucket`, `key`.
      - `s3/s3-error.ts` + `s3-error.filter.ts` — closed `S3ErrorCode`
        union mapping to canonical AWS codes; global filter renders
        the canonical XML response.
      - `s3/url-style.ts` — path-style + virtual-hosted parsing.
        Path-style only in Phase 3 (boto3 default for non-AWS endpoints).
  - **Phase 3c (bucket controller).** `BucketsController`:
      - `GET /` ListBuckets → owner-filtered XML list
      - `HEAD /:bucket` HeadBucket → 200 / 404
      - `PUT /:bucket` CreateBucket → 501 (deferred to dashboard +
        zkLogin; `KraterionBucket.owner` needs the user's signature)
      - `DELETE /:bucket` DeleteBucket → 204 (soft delete, rejects
        non-empty buckets with `BucketNotEmpty`)
  - **boto3 verification (`/tmp/boto-test.py`):** all five cases pass —
    ListBuckets, HeadBucket(exists), HeadBucket(404),
    CreateBucket(501), bad-secret SignatureDoesNotMatch.
  - 15/15 workspace typecheck still green.
- `[gateway]` 2026-05-08 — Audit pass against Walrus/Seal/Sui SDK
  surfaces; refactored wrappers to drop redundancy. Changes:
  - Removed 4 pass-throughs from `walrus-client` (`encodeBlob`,
    `computeBlobMetadata`, `writeBlobToUploadRelay`, `certifyBlobFragment`)
    and 2 from `seal-client` (`encrypt`, `decrypt`). Callers now use the
    memoized SDK client directly.
  - `blobIdStringToU256` is now a re-export of the SDK's public
    `blobIdToInt` (it IS exported from the main `@mysten/walrus` entry,
    just not from any subpath). Hand-rolled implementation deleted.
  - `bootstrap-gateway.ts`: replaced `getAllCoins` + filter loop with
    `suiClient.getBalance({ owner, coinType: WAL_COIN_TYPE })` for
    server-side filtering. Replaced manual `tx.splitCoins(...)` ceremony
    in `fundReserveWithWal` with `coinWithBalance({ type, balance })`
    from `@mysten/sui/transactions` — handles arbitrary coin types,
    auto-merges/splits owned coins, no conditional logic.
  - Added a wrapper-boundary policy ADR: `decisions.md` codifies
    "wrappers must add value, never duplicate the SDK." Anything that's
    a 1:1 pass-through is forbidden going forward.
  - 15/15 workspace typecheck still green; smoke test still round-trips
    end-to-end (tx digests `5qzjKChSTW2xxVLKsaEYbfFPVHZJUp6MNxnppxW9NtaS`,
    `8B3iFugKCkNt8YjmYWyGWEkzW8NeSt6opu7fBLriA4et`).
- `[gateway]` 2026-05-08 — **Phase 2 smoke-test green end-to-end.** Full
  Architecture-D pipeline validated against testnet:
  - Seal-encrypt 55-byte plaintext → 354-byte encrypted blob
  - PTB 1: relay tip + `register_blob_for_bucket` (composes `sendUploadRelayTip`
    as input slot #0 + our reserve-paying register call) →
    `blobObjectId 0xe090…1fb0`, tx `BTpTwurc…2w2b`
  - Upload encoded payload to Mysten testnet relay, receive certificate
  - PTB 2: `walrus.certifyBlob` + `kraterion.wrapInSharedBlob` (atomic) →
    `SharedBlob 0xc4ae…fda0e`, tx `8GKoFu5L…RrG`
  - Read back via public aggregator HTTP — 354 bytes match
  - Build `seal_approve` PTB (158 txBytes, sender = gateway)
  - Get/create SessionKey (Redis-cached, TTL 25 min)
  - Decrypt → 55 bytes recovered, plaintext matches
  Final smoke run on tx digests
  `2UVJRXfURmn8okd2Wk8zfmReGAX8yCj64JKNGab3D7yY` (register) and
  `8GKoFu5LQyCVpRj3zmshSCqMjcXhq1Hwf67f3G248RrG` (certify+wrap).
  Six runbook entries logged covering footguns we hit:
  - `EResourceSize` from raw vs encoded blob size (RS2 expansion)
  - `400` from upload-relay needing tip query params
  - `401` from auth-payload not being PTB input #0
  - SessionKey TTL cap dropped from 60 → 30 min in Seal SDK 1.1
  - `SessionKey.export()` blocks `JSON.stringify` (toJSON throws)
  - blobId base64 → u256 conversion (SDK helper not exported)
  Walrus-client wrapper now exposes `getEncodedBlobLength`,
  `getCommitteeShardCount`, `blobIdStringToU256`, `rootHashBytesToU256`,
  `computeBlobMetadata`, plus the WalrusClient configured with
  `sendTip: { max: 10M MIST }` for the public relay. Seal-client manually
  serializes SessionKey fields to bypass the SDK's `toJSON` block.
- `[gateway]` 2026-05-08 — Phase 2 bootstrap complete. The platform is
  fully operational on testnet:
  - **Gateway sub-wallet** (api_decryption role, account_id NULL):
    `0x634fbf24b7ad8ffb72a7c5ec96bd128e58db913db9751fcd11497bf062d2213d`.
    Seed AES-wrapped via `KEY_WRAPPING_MASTER_KEY`; round-trip verified
    in script.
  - **Gateway funded** with 5 SUI from deployer
    (tx `24836mDxVYdAahW5SHxyoF8KSnWHnyrneB3Ski2D293n`).
  - **Reserve authorization:** gateway address whitelisted on the
    `PlatformReserve` (tx `8jXMFhiHhKhPgqAsvPmHLyTBBm8RK67AD5KoDP2cD3Xj`).
  - **Reserve funded** with 2 WAL (2_000_000_000 MIST) from deployer
    (tx `AgHwm5vDraJjhEgp3HYVzGRHRcypAn4wkVmBtiuJxCuG`).
  - **Test account / project / API key** in Postgres:
    - account `3b9d9c97-d5f2-4f58-a662-56d36ef72662` (email
      `demo@kraterion.dev`, sui_address = deployer)
    - project `1a1144ec-38b7-4266-92f5-d363c4722537`
    - access_key_id `AKIA5QHUNKTDD3UECGHS`, secret AES-wrapped in DB
      (one-time displayed value: `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`
      — testnet credentials, safe to commit to local notes; rotate before
      mainnet)
  - **Test bucket** on testnet:
    `0x23e705ec4fed90c3cd13e2053f3ec755ed1f946f80ff8fdc627c3f9770beaa68`
    (tx `6GuevhfY2xAn5rny2XNpHQ4kFzfoseXKg7YNF1XyZ184`). Owner = deployer,
    api_decryption_addresses = [gateway], encryption_mode = private.
  - Bootstrap script (`apps/gateway/scripts/bootstrap-gateway.ts`) is
    idempotent: re-running detects existing state and skips re-creation
    of every step. New constant `WAL_COIN_TYPE` in `@kraterion/shared`
    fixes the "many `*::wal::WAL` symbols on testnet" footgun.
- `[gateway]` 2026-05-08 — Phase 0 + Phase 1 of gateway build complete.
  - **Phase 0 — constants + SDK bumps.** `@mysten/seal` 0.6 → 1.1.3,
    `@mysten/walrus` 0.6.7 → 1.1.6, `@mysten/sui` aligned to ^2.16.2
    across the workspace. Added `WALRUS_AGGREGATOR_URL`,
    `WALRUS_UPLOAD_RELAY_URL`, `WALRUS_SYSTEM_OBJECT_ID`,
    `WALRUS_STAKING_POOL_ID`, `SEAL_KEY_SERVERS` (decentralized
    committee), `SEAL_THRESHOLD = 1`, `SEAL_AGGREGATOR_URL` to
    `packages/shared/src/constants.ts`.
  - **Phase 1 — wrapper packages.** `packages/walrus-client/src/index.ts`
    and `packages/seal-client/src/index.ts` shipped (replacing the empty
    stubs).
    - `walrus-client` exports: `getSuiClient()`, `getWalrusClient()`,
      `encodeBlob(bytes)`, `writeBlobToUploadRelay(opts)`,
      `certifyBlobFragment(opts)`, `readBlobByBlobId(blobId, signal?)`.
      Read path uses public aggregator HTTP — no storage-node fanout
      from our gateway.
    - `seal-client` exports: `getSealClient()`, `encrypt(plaintext, identity)`,
      `decrypt(ciphertext, sessionKey, txBytes)`,
      `getOrCreateSessionKey({ accountKey, signer, redis })`. Identity
      hex-encoding handled internally; SessionKey caching keyed by
      `accountKey` with TTL 55 min in Redis (matching Seal's 60-min
      ceiling minus skew).
  - **Workspace typecheck:** 15/15 tasks green. Documentation bumped:
    decisions.md gained 3 ADRs (SDK version bumps, decentralized
    committee choice, wrapper package boundary).
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

- `[gateway]` 2026-05-08 — **Phase 4 done — GetObject + HeadObject decrypt
  end-to-end against testnet via boto3.**

  The full read path is wired: SigV4 → Postgres lookup →
  `bucket.api_access_granted` check → Redis-cached SessionKey →
  `seal_approve` PTB build (sender = gateway address) → public Walrus
  aggregator HTTP GET → `client.decrypt()` → S3 response with the right
  headers.

  **What shipped:**
  - `GatewayKeypairService` (`OnModuleInit`) — loads the
    `api_decryption` `SubWallet` once at boot, AES-unwraps the seed via
    `KeyWrappingService`, holds the `Ed25519Keypair` as a singleton and
    asserts the derived address matches what the bootstrap stored. Fail-
    fast at boot if the row is missing (run `pnpm bootstrap`).
  - `ObjectsReadController` — `@Get(":bucket/*")` GetObject and
    `@Head(":bucket/*")` HeadObject. Streams plaintext via
    `reply.send(Buffer.from(plaintext))` with canonical headers
    (`Content-Type`, `Content-Length` on plaintext size, quoted `ETag`,
    `Last-Modified`, `Accept-Ranges: none`). Range / If-Match /
    If-None-Match / If-Modified-Since / If-Unmodified-Since rejected as
    501 in this phase.
  - `ObjectsListController` — `@Get(":bucket")` validates the bucket is
    owned + non-deleted and then 501s. Phase 6 will make ListObjectsV2
    real; this stub keeps boto3 from getting a 404 on
    `s3.list_objects_v2(Bucket=...)`.
  - Schema migration `drop_encryption_envelope` — Seal's own ciphertext
    embeds the envelope; we no longer track it as a separate column.
  - Smoke test now persists an `S3Object` row at the end via Prisma
    upsert, so boto3 has a known-good fixture to fetch back.

  **ESM conversion (incidental).** The first runtime boot of the
  Phase-4 build crashed on `ERR_UNKNOWN_FILE_EXTENSION` because the
  workspace packages had `main: ./src/index.ts` and the gateway was
  CommonJS. Fixed in two motions: gateway is now ESM (NodeNext, `.js`
  extensions on every relative import in `src/`); workspace packages
  now export from `./dist/`. `ioredis` switched from default to named
  import `{ Redis }` to match its CJS-without-`exports` shape. ADR
  written in `decisions.md`.

  **Test summary:**
  - 15/15 workspace typecheck green.
  - Gateway `nest build` produces ESM (`dist/main.js` starts with
    `import "reflect-metadata"`, no `__esModule` shim).
  - `node dist/main.js` boots; `/health` and `/health/ready` return
    `{status: "ok"}`.
  - Smoke (`pnpm smoke`): full crypto+chain round-trip green; new
    S3Object row persisted (`smoke/hello.txt`,
    `walrus_blob_id=tNr71UU6Ragp7C71M1kYbtO3a2o041JK_00S16L1cUQ`,
    `end_epoch=396`).
  - boto3 (`/tmp/boto-test.py`) — 11/11 cases pass:
    Phase-3: ListBuckets, HeadBucket(ok), HeadBucket(404),
    CreateBucket(501), bad-secret(SignatureDoesNotMatch).
    Phase-4: HeadObject(full metadata), GetObject(plaintext matches),
    GetObject(NoSuchKey), GetObject(NoSuchBucket),
    GetObject(Range→501), ListObjectsV2(501).

  **Testnet artifacts from this round (Phase 4 smoke):**
  - tx1 register: `Ho6A6s6Zd4sY2uakxnRnbhJru8biGkC6Vwrn5RHLXYhA`
  - tx2 certify+wrap: `7RCz4i5L7oDXdmFwcj25bU3QppzTHEunYpFEnEMe3Znc`
  - SharedBlob: `0xa022ed9da4f88f6e59ece7454730c7169514a7ca013da29d7326a0770f69a87c`

  **Remaining for the gateway:**
  - Phase 5 — PutObject (encrypt + register PTB + relay upload + certify
    & wrap PTB + S3Object insert). The crypto path is identical to the
    smoke; this is "wrap it in an HTTP route + S3-error mapping +
    orphan-blob logging on PTB2 failure."
  - Phase 6 — ListObjectsV2 + DeleteObject + DeleteBucket-with-objects.
  - Phase 7 — `/public/*`, `x-amz-meta-*`, content-type pass-through,
    pagination polish.

---

- `[gateway]` 2026-05-08 — **Phase-4 audit pass.** Pre-Phase-5 cleanup of
  the read controller against real S3 client conformance.

  **What changed:**
  - `Range:` no longer 501s; silently ignored per RFC 7233 §3.1 (we
    advertise `Accept-Ranges: none`). Unblocks boto3 `download_file`
    and `aws s3 sync`.
  - Conditional headers (`If-Match`, `If-None-Match`,
    `If-{Modified,Unmodified}-Since`) no longer 501; silently ignored
    per RFC 7232 §6. Phase-6 follow-up to honor `If-None-Match` → 304.
  - Successful GetObject/HeadObject responses now carry
    `x-amz-server-side-encryption: AES256`, `x-amz-request-id`, and
    `x-amz-id-2`.
  - Walrus aggregator transient failures translate to
    `ServiceUnavailable` (503) — boto3 auto-retries with backoff
    instead of surfacing opaque 500.
  - Post-decrypt byte-length check: plaintext size MUST equal
    `objectRow.size_bytes`; otherwise `InternalError` with a loud log.
  - Hard 2 GiB cap on read (AES-GCM is non-streaming); larger objects
    return `EntityTooLarge`. Chunked-frame Seal envelopes deferred.
  - `requireKraterion` / `requireBucket` / `requireKey` extracted into
    `apps/gateway/src/s3/request-context.ts` (was duplicated three
    times).
  - Hand-written `ObjectRow` interface + `as ObjectRow` cast replaced
    with `Prisma.S3ObjectGetPayload<...>`. The `select` clause is the
    single source of truth.
  - `ObjectsListController` simplified to a plain 501 stub (was doing
    an unused Postgres lookup before erroring).
  - `S3ErrorCode` union gained `ServiceUnavailable` (503) and
    `EntityTooLarge` (413).

  **Test summary:**
  - 15/15 workspace typecheck green.
  - boto3 (`/tmp/boto-test.py`) — 12/12 cases pass:
    - Phase-3: ListBuckets, HeadBucket(ok), HeadBucket(404),
      CreateBucket(501), bad-secret(SignatureDoesNotMatch).
    - Phase-4: HeadObject, GetObject(plaintext matches),
      GetObject(NoSuchKey), GetObject(NoSuchBucket),
      GetObject(Range silently ignored, 200),
      GetObject(If-None-Match silently ignored, 200),
      GetObject(canonical headers well-formed),
      ListObjectsV2(501).

  ADR `2026-05-08 — S3 read-path conformance audit` documents each
  rule with RFC + AWS source links.

---

- `[gateway]` 2026-05-08 — **Phase 5 done — PutObject + DeleteObject
  end-to-end against testnet via boto3.**

  PutObject now wraps the smoke-test crypto-and-chain pipeline in an
  HTTP handler: SigV4 → Postgres bucket lookup → mint
  `seal_identity` → Seal-encrypt → encode → PTB 1 (relay tip +
  `register_blob_for_bucket`) → relay POST → PTB 2 (`certify_blob` +
  `wrap_in_shared_blob`) → DB upsert → 200 with canonical headers.
  DeleteObject is the soft-delete on the row (the on-chain SharedBlob
  persists — that's the whole product point).

  **What shipped:**
  - `ObjectsWriteController.putObject(@Put(":bucket/*"))` — full
    write path, ~340 LoC; comments explain each PTB and every
    failure-mode → S3-error mapping.
  - `ObjectsWriteController.deleteObject(@Delete(":bucket/*"))` —
    soft delete + 204; idempotent on missing keys (S3 spec).
  - Custom Fastify catch-all body parser (`removeAllContentTypeParsers`
    + `addContentTypeParser('*', { parseAs: 'buffer' })`) so binary
    uploads land byte-exact in `req.body: Buffer`. Fastify's built-in
    `text/plain` parser would otherwise stringify, breaking the ETag
    MD5 math.
  - `S3ErrorCode` union extended with `BadDigest` (Content-MD5
    mismatch), `IncompleteBody` (declared-vs-actual length), and
    `XAmzContentSHA256Mismatch` (when the SigV4 hash claim doesn't
    match the body).
  - bodyLimit reduced from 13 GiB → 2 GiB + 1 MiB margin (matches the
    GET cap from Phase 4 — AES-GCM is non-streaming).
  - Header policy: 501 on `x-amz-meta-*` / `x-amz-tagging` (silent
    data-loss prevention); accept-and-ignore on
    `x-amz-acl` / `x-amz-storage-class` /
    `x-amz-server-side-encryption` (rclone + aws-cli compat).
  - `Content-Type` defaults to AWS-canonical `binary/octet-stream`
    when missing.
  - Overwrites are last-write-wins via Prisma upsert keyed on
    `(bucket_id, s3_key)`. The previous `walrus_blob_id` and
    `shared_blob_object_id` are logged as `ORPHAN BLOB (overwritten)`
    for the future reaper job.
  - PTB 1, relay, PTB 2, and DB-upsert failure cases each log a
    distinctive `ORPHAN BLOB (...)` line with `blobObjectId`,
    `walrus_blob_id`, and the `(bucket, key)` pair so a reaper can
    refund storage from the orphaned `Blob` later.

  **Test summary:**
  - 15/15 workspace typecheck green.
  - boto3 (`/tmp/boto-test.py`) — **24/24 cases pass** end-to-end
    against the live testnet stack. Phase-5 additions:
    - PutObject (text body) + GET round-trip; ETag = MD5(plaintext)
    - PutObject (64 KiB random binary) + GET byte-exact round-trip
    - PutObject (empty body) — accepted; ETag = MD5("")
    - HeadObject after PutObject — size + content-type + ETag match
    - PutObject with wrong Content-MD5 → BadDigest 400
    - PutObject with `x-amz-tagging` → NotImplemented 501
    - PutObject with `x-amz-meta-*` → NotImplemented 501
    - PutObject with `StorageClass=REDUCED_REDUNDANCY` → silently
      accepted, ETag returned
    - Overwrite (v1 then v2) → second GET returns v2; orphan logged
    - DeleteObject → 204; subsequent GET → NoSuchKey
    - DeleteObject(missing key) → 204 (idempotent)
    - PutObject with unicode key (`phase5/中文 名/ファイル.txt`) →
      byte-exact round-trip (key carries through SigV4 +
      URL-style parser + Postgres key column unchanged)
  - Live Suiscan: every PutObject produced a new `SharedBlob` shared
    object owned by no one (the user's KraterionBucket holds a
    pointer); SUI gas + WAL are paid by the gateway from the
    PlatformReserve.

  ADRs written:
  - `removeAllContentTypeParsers + single catch-all buffer parser` —
    why we threw out Fastify's built-in JSON/text parsers.
  - `Orphan blobs: log on failure, defer reaper to post-hackathon` —
    log format and what the reaper needs.
  - `PutObject header policy: reject feature gaps, accept-and-ignore
    client noise` — the matrix of which `x-amz-*` headers we 501,
    drop, or honor.

---

- `[gateway]` 2026-05-08 — **Phase 6 done — ListObjectsV2 conformant
  end-to-end against testnet via boto3.**

  Replaced the 501 stub in `ObjectsListController` with full V2
  support: prefix filter, delimiter rollup with proper `CommonPrefixes`
  emission, MaxKeys clamping (silent to ≤1000), pagination via
  `continuation-token` (opaque base64url JSON with `kind` discriminant
  to skip past common prefixes), `start-after`, `encoding-type=url`
  (URL-encodes Key/Prefix/Delimiter/StartAfter/CommonPrefixes), and
  `fetch-owner=true` (Owner element with accountId).

  Routing decision tree on `GET /:bucket`:
  - any of 24 known bucket sub-resource params (`?location`,
    `?versioning`, `?lifecycle`, `?acl`, etc.) → 501 with the sub-
    resource named in the message.
  - `list-type=2` → V2 list handler.
  - otherwise → 501 (V1 not supported).

  **What shipped:**
  - `ObjectsListController` rewrite (~370 LoC; all the sort/pagination
    edge cases live here, not the controller).
  - Migration `s3object_skey_collate_c` — `ALTER TABLE "S3Object"
    ALTER COLUMN "s3_key" TYPE TEXT COLLATE "C"`. Byte-wise UTF-8
    sort matches AWS semantics; indexes inherit the collation so
    Prisma's normal `orderBy: { s3_key: 'asc' }` is index-backed.
  - Continuation token codec: `base64url(JSON({v:1, kind, value}))`
    with `kind` ∈ `{"key", "prefix"}` to apply the right cursor
    comparison on the next page (skip past common prefix vs strict
    `>` on a key).
  - Element ordering in the XML response matches AWS exactly (Name,
    Prefix, KeyCount, MaxKeys, Delimiter, IsTruncated,
    ContinuationToken, NextContinuationToken, StartAfter,
    EncodingType, Contents*, CommonPrefixes*) — rclone's strict XML
    parser depends on this.
  - LastModified format = `Date.toISOString()` (ISO 8601 with
    milliseconds) — distinct from the IMF-fixdate format used in
    `Last-Modified` HTTP headers (the GET response).

  **Test summary:**
  - 15/15 workspace typecheck green.
  - boto3 (`/tmp/boto-test.py`) — **36/36 cases pass** end-to-end:
    Phase-3 (5) + Phase-4 (8) + Phase-5 (12) + Phase-6 (11). New
    Phase-6 cases:
    - flat list (no prefix) → 7 keys, byte-wise sorted, IsTruncated=false
    - prefix filter → 6 keys, no prefix leak
    - pagination via `MaxKeys=2` + `ContinuationToken` → 4 pages, no
      duplicates, full ordering preserved
    - delimiter at root (`/`) → 0 Contents, 2 CommonPrefixes
      (`phase5/`, `smoke/`)
    - nested delimiter (Prefix=`phase5/`, Delimiter=`/`) → 5 flat
      keys + 1 sub-prefix (`phase5/中文 名/`)
    - StartAfter cursor → skips byte-wise-≤
    - EncodingType=url → unicode key returned percent-encoded
    - FetchOwner=true → Owner element present; false → omitted
    - malformed ContinuationToken → InvalidArgument 400
    - MaxKeys=10000 → silently clamped to 1000
    - sub-resource queries (?location, ?versioning) → NotImplemented
    - ListObjectsV1 (no list-type=2) → NotImplemented
    - missing bucket → NoSuchBucket

  ADRs written:
  - `S3Object.s3_key uses Postgres COLLATE "C" (byte-wise sort)` —
    why we couldn't keep the locale collation and what the cost was.
  - `ListObjectsV2: opaque-versioned continuation tokens with kind
    discrimination` — the cross-page common-prefix duplicate-emission
    problem and how the kind-tagged cursor solves it.

  **Next up:** Phase 7 polish — `If-None-Match` → 304 honoring,
  `x-amz-meta-*` pass-through, `Content-Disposition` /
  `Content-Encoding` / `Cache-Control` pass-through, public read
  endpoint at `/public/:bucket/*`. None of these block the demo;
  they're "if time permits" items per the timeline.

---

- `[move]` `[gateway]` 2026-05-08 — **Phase 0 of indexer plan: Move event
  surgery + redeploy.**

  **What shipped:**
  - `KraterionObjectCreated` event extended: 3 new fields
    (`seal_identity: vector<u8>`, `size_bytes: u64`,
    `storage_end_epoch: u32`).
  - `wrap_in_shared_blob` signature adds `seal_identity` and
    `size_bytes` arguments. `storage_end_epoch` is read in-Move from
    the wrapped Blob via `walrus::blob::end_epoch(&blob)`.
  - Move package re-deployed (fresh publish; events aren't
    upgrade-compatible). New constants in
    `packages/shared/src/constants.ts`:
    - `KRATERION_PACKAGE_ID =
      0x27e1627c8d7ebb4b20b1069fd32f730b54dfb54eb7bbe5943970da8de85a0a51`
    - `KRATERION_RESERVE_ID =
      0xad3e396e21ac262256c1a056eca87699f694ffffc0bb325f1e116941c228c7ac`
    - `KRATERION_UPGRADE_CAP_ID =
      0x0a9c343af49ddac20c9d15d361b6106dc24363f5f8fd5f5a6ee765001937ec4d`
    - publish tx digest:
      `F5Sh2xuzkznxS6J5oNCxbK64X3BtUusYhBGGPtBAReBq`
  - Gateway's `objects.write.controller.ts` PutObject and
    `smoke-encrypt-roundtrip.ts` updated to pass the new args.
  - Smoke test gained relay-retry logic (up to 8 attempts with
    exponential delay) — a fresh PTB1 per retry burns reserve WAL,
    so we re-enter only the relay step on transient failure.
  - DB truncated (`Bucket`, `S3Object`, `Account`, `Project`,
    `ApiKey`, `SubWallet`); bootstrap re-run.

  **Test summary:**
  - 33/33 Move unit tests green.
  - 15/15 workspace typecheck green.
  - Smoke test round-tripped against the new package; the on-chain
    `KraterionObjectCreated` event verified to carry all 3 new
    fields:
    ```json
    "seal_identity": "nqpRVGcaFxz7iwFLnKfE8y4n11ASpBvL/OF4XBfb/RBZFG00ktxXTUHWK0bBkAYA",
    "size_bytes": "55",
    "storage_end_epoch": 396.0
    ```

  **Testnet artifacts (this round):**
  - New gateway sub-wallet:
    `0x7438d879d36f5df5c8f24c131bfcb8775226aaf24aa48df137f287ac054a86ea`
  - Test bucket on new package:
    `0x9eaa5154671a171cfb8b014b9ca7c4f32e27d75012a41bcbfce1785c17dbfd10`
  - Test AKIA: `AKIAQJVZMCMEP4LGK6OJ`
  - Test secret: `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`
  - Smoke test SharedBlob:
    `0xb0ec560b85fd4050f3b18d6f3d8383c56adc679cd96b8e911b9f9355bb5e9843`

  ADR `2026-05-08 — Move event surgery` documents why
  `shared_blob_object_id` is NOT in the event (walrus's
  `shared_blob::new` doesn't return the value; indexer recovers it
  from tx effects).

  **Next up:** Phase 1 — schema migration + indexer skeleton +
  Day-1 read-mask probe.

---

- `[indexer]` 2026-05-08 — **Phase 1 of indexer plan: schema + worker
  skeleton + first handler end-to-end on testnet gRPC.**

  **What shipped:**
  - Schema migration `indexer_init`: new `IndexerCursor` and
    `IndexerDeadLetter` tables; `(tx_digest BYTEA, event_seq INT)`
    + `event_payload JSONB` columns on `Bucket` and `S3Object` with
    composite UNIQUE for indexer idempotency. Columns are nullable
    until Phase 2 removes the gateway-direct write path.
  - `apps/worker` ESM-ified (NodeNext, `.js` extensions). Picked up
    `@mysten/sui` (gRPC client), `@protobuf-ts/grpc-transport`,
    `@grpc/grpc-js`, `prom-client`, `zod`.
  - `apps/worker/src/main.ts` rewritten as a Nest+Fastify app with
    `/health`, `/health/ready`, and `/metrics` endpoints.
  - `apps/worker/src/indexer/` module:
    - `sui-grpc.client.provider.ts` — native HTTP/2 transport with
      explicit keepalive options + 256 MiB receive cap.
    - `read-mask.ts` — checkpoint-rooted mask paths covering events
      + tx effects.
    - `event-types.ts` — Zod schemas for all 6 user-facing event
      structs (BucketCreated, ObjectCreated, ObjectExtended,
      ApiAccessGranted/Revoked, BucketVisibilityChanged) with
      lenient `.passthrough()` for Move-upgrade-resilience.
    - `handlers/handler.interface.ts` — typed per-event handler
      contract; handlers run inside the per-checkpoint Prisma tx.
    - `handlers/bucket-created.handler.ts` — first active handler.
      Resolves `project_id` via `Account.sui_address` → first
      project lookup; upserts `Bucket` keyed on
      `kraterion_bucket_object_id`; backfills indexer-provenance
      columns when the row already exists from gateway-direct
      writes.
    - `cursor.repo.ts` — `(read, advance, reset)` bracket; advance
      runs inside the open Prisma tx for atomicity with row writes.
    - `dispatcher.service.ts` — type-suffix routing
      (`::events::Kraterion...`); package-id-stripped so a redeploy
      doesn't churn the dispatcher.
    - `dead-letter.service.ts` — DLQ insert + retry-counter bump,
      `parked` after 3 attempts. `(source_id, tx_digest,
      event_seq)` natural key.
    - `run-loop.ts` — the meaty file. Subscribe → first message →
      cursor diff → unary `GetCheckpoint` backfill (concurrency=2,
      8 rps token-bucket gate) → drain live stream forward.
      Per-checkpoint Prisma transaction: events + cursor advance
      atomic. Poison-pill recovery via "find failing event by
      bisect, DLQ it, retry without it" pattern.
    - `metrics.ts` — `prom-client` registry + 6 indexer-specific
      gauges/counters.
    - `cli/probe-readmask.ts` — Day-1 probe; resolved the path-
      rooting question (rooted at `Checkpoint`, not response).
    - `cli/reset-cursor.ts` — operational tool.
    - `indexer.service.ts` — Nest lifecycle bridge
      (`OnApplicationBootstrap` → spawn loop on detached promise;
      `OnApplicationShutdown` → AbortController.abort()).

  **End-to-end verified.** Worker boots from
  `INDEXER_INITIAL_CHECKPOINT=334601968` (the package publish
  checkpoint), backfills the gap, hits the bucket-create checkpoint
  at 334605108, and `BucketCreatedHandler` runs against the
  `KraterionBucketCreated` event. Result: the existing test-bucket
  row (created by `bootstrap-gateway.ts`) is backfilled with
  `tx_digest = CKjPGvRt6ARsjw9wtLka2nLGmMaY7HWAFHf7oQM2HNy2`,
  `event_seq = 0`, and `event_payload` populated. Cursor advances
  past the bucket-create checkpoint and onward toward live tip.

  **Two ADRs written:**
  - `Indexer adopts gRPC SubscribeCheckpoints directly; read_mask
    paths root at Checkpoint` — why we skipped the JSON-RPC
    adapter and what the Day-1 probe established about mask
    semantics.
  - `Public testnet fullnode: backfill rate-limit gate at 8 rps` —
    why `BACKFILL_MIN_INTERVAL_MS=125` + concurrency=2 is the
    public-testnet sweet spot, with the env override path for
    paid endpoints.

  **One runbook entry:** `Indexer worker hits 429s during backfill`
  — symptoms, root cause, and the env-tuning paths.

  **Next up:** Phase 2 (gateway cleanup — replace gateway-direct
  Bucket/S3Object writes with `waitForS3Object` polling for the
  indexer's row), Phase 3 (remaining 4 active handlers + reserve
  log-only handlers).

---

- `[indexer]` `[gateway]` `[move]` 2026-05-08 — **Phases 2 & 3 of indexer
  plan: full handler set + gateway becomes a sole-PTB-signer.**

  **Move side (small surgery #2):** added `etag_md5: vector<u8>` (16
  raw MD5 bytes) to `KraterionObjectCreated` event +
  `wrap_in_shared_blob` arg. Gateway computes `md5(plaintext)` once
  and passes it both as the on-chain field and as the off-chain
  response ETag header. Re-deployed the package one more time:
  - new `KRATERION_PACKAGE_ID =
    0x73b16cf98849e22af31b3b3d5f54125193b5927b31b8ac06ab411234c0c2fa14`
  - new `KRATERION_RESERVE_ID =
    0x3137a20eb5f654300f08dc911aee9edcde138afb8f34075800750613c5b1733f`
  - publish tx: `2TFiWcLR7Fbw1GTAnfvLvrT5qWvMpaursKXbmSnrk38G`

  **Indexer side (5 active handlers):**
  - `BucketCreatedHandler` — already shipped Phase 1.
  - `ObjectCreatedHandler` — full S3Object reconstruction from the
    event (post-event-surgery) plus tx effects:
    `shared_blob_object_id` recovered from the unique
    `idOperation = CREATED` entry in `tx.effects.changed_objects`
    (the proto explicitly says `object_type` is NOT in raw
    checkpoints — see ADR).
  - `ApiAccessHandler` — handles `ApiAccessGranted` AND
    `ApiAccessRevoked` (multi-suffix dispatch). Sets
    `Bucket.api_access_granted = true|false`.
  - `BucketVisibilityChangedHandler` — flips
    `Bucket.encryption_mode`.
  - `ObjectExtendedHandler` — increments
    `S3Object.storage_end_epoch` with idempotent guard via
    `S3ObjectExtension` log table (counter ops aren't naturally
    idempotent on replay).
  - Multi-suffix support added to `EventHandler` interface
    (`typeSuffixes: readonly string[]`) so one class can route
    related events.
  - `IdOperation` enum bug: I had `CREATED=1, MUTATED=2` in the
    initial run-loop; actual proto is `UNKNOWN=0, NONE=1,
    CREATED=2, DELETED=3` (no MUTATED — mutated objects use NONE).
    Fixed in `normalizeIdOperation`.

  **Gateway side — single-writer:**
  - `apps/gateway/src/indexer-wait/wait-for-row.ts` — small helper
    that polls `S3Object` (or `Bucket`) by natural key with a 15s
    default timeout, throws `ServiceUnavailable` on timeout.
  - `objects.write.controller.ts` — removed the post-PTB2 inline
    `s3Object.upsert` and the orphan-overwrite-detection branch.
    Replaced with `await waitForS3Object(prisma, sharedBlobObjectId)`.
    `endEpoch` calculation also dropped (now derived in Move).
  - `bootstrap-gateway.ts` — dropped the direct `prisma.bucket.create`
    after `createGrantAndShareBucket`; the indexer writes the row
    when it sees `KraterionBucketCreated`. Bootstrap prints a hint
    to start the worker.
  - `smoke-encrypt-roundtrip.ts` — replaced manual `s3Object.upsert`
    with a 60s indexer-wait poll. The smoke test now
    end-to-end-tests the indexer's ObjectCreatedHandler too.

  **Schema changes (one migration: `indexer_object_extension`):**
  - `S3ObjectExtension` log table for idempotent extension events.

  **End-to-end verified.** Worker boots, backfills from publish
  checkpoint, picks up `KraterionBucketCreated` →
  `BucketCreatedHandler` writes Bucket row from event. Then
  `ApiAccessGranted` → `ApiAccessHandler` flips
  `api_access_granted = true`. Then `KraterionObjectCreated` →
  `ObjectCreatedHandler` writes full S3Object row from event:
  ```
  s3_key      | smoke/hello.txt
  etag        | cc9d8ecefaea961c3f3b6b98adb07e65
  size_bytes  | 55
  content_type| text/plain
  storage_end_epoch | 396
  tx_digest   | GzzkgN... (event source)
  event_seq   | 1
  ```
  All fields reconstructed from chain data alone — no gateway-direct
  write involved.

  **Two ADRs + one runbook entry written:**
  - `KraterionObjectCreated event also carries etag_md5` — why
    the third Phase-0 surgery; option analysis.
  - `ChangedObject.object_type is NOT in raw checkpoints; match
    SharedBlob via the unique id_operation = CREATED` — the proto
    indexer-layer-only annotation for object_type that bit us.
  - (also fixed `IdOperation` enum mapping inline in
    `checkpoint-events.ts:normalizeIdOperation`).

  **Known operational caveat:** during a long backfill burst (worker
  starting from far-behind cursor), PutObject's `waitForS3Object`
  may exceed boto3's retry budget. In production after the indexer's
  steady-state catch-up this disappears (lag drops to seconds). For
  test/dev: wait for `indexer_lag_seconds` < 30 before exercising
  PutObject.

  **Next up:** Verification under steady-state lag (rerun boto3
  conformance), then move on. Phase 4 (more verification) and
  reserve handlers are nice-to-haves; the main path is now
  end-to-end.

---

## 2026-05-08

- **[control-plane] Phase 0 + Phase 1 shipped end-to-end.**

  **Phase 0 (bootstrap):** ESM-converted the existing skeleton (NodeNext
  + `.js` extensions everywhere). Added Prisma module (verbatim copy
  of gateway's), JSON `ControlPlaneError` envelope + global Nest
  filter, Zod method-arg pipe, `prom-client` registry exposed at
  `/metrics`, `/health/ready` with `SELECT 1` ping, `@fastify/helmet`
  + `@fastify/cors` registered globally.

  Resolved a workspace-wide fastify version drift (`@nestjs/platform-fastify`
  hard-pins fastify@4.28.1; the cors/helmet plugins were hoisting
  4.29.1) by adding a root `pnpm.overrides` for `fastify: 4.28.1`.
  Also pinned `@fastify/helmet` to v11.x — v12 targets fastify ^5.

  **Phase 1 (identity surface):** Auth, Accounts, Projects, ApiKeys
  modules with the planned eight endpoints. Bearer JWT (HS256, 7-day
  expiry) signed with `JWT_SECRET`. Dev-only `/v1/auth/dev-sign-up`
  + `/v1/auth/dev-sign-in` (404 in production). API key secret
  returned cleartext exactly once at mint, wrapped via the same
  `EnvKeyWrapper` the gateway uses (same `KEY_WRAPPING_MASTER_KEY`
  env), so a key minted here immediately authenticates against the
  gateway. Resource-not-found vs not-yours both return 404 to avoid
  cross-account leak.

  Module structure note: split `AuthCoreModule` (global, just
  TokensService + AuthGuard + JwtModule) from `AuthModule` (the
  controller). `AuthModule` imports `ProjectsModule` + `ApiKeysModule`
  for the dev-sign-up flow; without the split, `ProjectsModule` →
  `AuthModule` would close a cycle.

  **Verification:** `apps/control-plane/test/cp-smoke.sh` runs all 9
  positive + negative cases against a live service (sign-up, /me,
  project create, key mint, list-no-leak, revoke, missing/bad bearer,
  invalid project name) — green. `apps/control-plane/test/api-keys.spec.ts`
  is six Vitest cases on the authz boundary (mint/list/revoke across
  two seeded accounts) — green. Cross-app: AKIA minted via control-plane
  authenticates against the gateway via boto3 SigV4 → `list_buckets`
  returns 200 with `Owner.ID = account_uuid`. The bootstrap script
  `bootstrap-gateway.ts` is now redundant for the account/project/key
  parts; it's left in place for the on-chain bucket creation it also
  does, until Phase 3 (PTB builders) takes over that work.

  **Out of scope (deferred to control-plane Phases 2–4):** bucket
  read views, prepare-PTB endpoints, real zkLogin, HttpOnly cookie
  fallback, rate limiting, audit log table.

---

## 2026-05-09

- **[control-plane] Phase 2 shipped — bucket / object read views.**

  Four new endpoints: `GET /v1/buckets`, `GET /v1/buckets/:id`,
  `GET /v1/buckets/:id/objects`, `GET /v1/objects/:id`. All guarded
  by `AuthGuard`, all scoped to the caller's account via the
  `project.account_id` join, all returning 404 on both
  missing-row and not-yours so the surface doesn't leak existence.
  Read-only by construction — the indexer remains sole writer.

  Wire-shape highlights: `BigInt` columns (`funding_pool_wal`,
  `size_bytes`) emitted as strings; indexer provenance
  (`tx_digest`, `event_seq`, `event_payload`) dropped; `seal_identity`
  base64-encoded for the dashboard's "On-chain details" expander.

  Pagination is opaque base64url cursor `{ v: 1, after: <id> }` — the
  same versioned-cursor pattern the gateway uses for ListObjectsV2,
  minus the `kind` discriminant. Limits: 50/100 for buckets,
  100/1000 for objects.

  **Verification:** `cp-smoke.sh` extended with 4 new steps (10–13);
  all 13 green against the live service. New `test/buckets.spec.ts`
  is 12 Vitest cases — list/paginate/cursor/auth-cross-account for
  buckets, list/prefix-filter/cross-account for objects, plus
  serialize round-trip and cursor codec edge cases. Total Vitest
  count is now 18/18.

  **Out of scope (next):** Phase 3 — bucket lifecycle PTB builders
  (`/v1/buckets/prepare-create`, `/prepare-grant-api`, etc) returning
  unsigned tx BCS for the dashboard wallet to sign + submit. Phase 4 —
  real zkLogin replaces the dev-mode auth.

---

## 2026-05-09

- **[control-plane] Phase 3 shipped — bucket-lifecycle PTB builders.**

  Four new endpoints, all under `/v1/buckets`, all authz-scoped to
  the caller's account:

  | Endpoint | Move call |
  |---|---|
  | `POST /v1/buckets/prepare-create` | `kraterion::create_grant_and_share_bucket` (or `create_and_share_bucket` if `grant_api_access:false`) |
  | `POST /v1/buckets/:id/prepare-grant-api` | `kraterion::grant_api_access` |
  | `POST /v1/buckets/:id/prepare-revoke-all` | `kraterion::revoke_all_api_access` |
  | `POST /v1/buckets/:id/prepare-visibility` | `kraterion::set_bucket_visibility` |

  Each returns `{ tx_json, expected: { package_id, function, summary,
  sender_hint } }` where `tx_json` is the output of `tx.toJSON()` —
  the canonical Mysten format for "build on server, sign on client".
  The dashboard reconstructs via `Transaction.from(tx_json)` and hands
  the `Transaction` to dApp Kit's `useSignAndExecuteTransaction`,
  which fills sender automatically via `setSenderIfNotSet` and
  resolves shared-object versions at sign time.

  Why `toJSON` over `build({ onlyTransactionKind: true })`: shared
  object versions stay symbolic, so a bucket's version bumping
  between prepare-time and sign-time doesn't cause execution
  failures. Sender stays null on purpose so the wallet's connected
  account wins over the JWT hint.

  Implementation lives in
  [apps/control-plane/src/buckets/prepare/](apps/control-plane/src/buckets/prepare/);
  shared SuiClient + GatewayAddressService in
  [apps/control-plane/src/sui/](apps/control-plane/src/sui/).
  `GatewayAddressService` is the single source for the api_addr
  parameter — it reads the bootstrap-time singleton SubWallet
  (`role: api_decryption, account_id: null`) and surfaces a clear
  `InternalError` if the row is missing.

  **Verification:** 10 new Vitest cases
  ([test/prepare-tx.spec.ts](apps/control-plane/test/prepare-tx.spec.ts))
  — every endpoint reconstructed via `Transaction.from(tx_json)` and
  the resulting Move call introspected; cross-account 404s; no-op
  visibility flip → 400; gateway-row-missing → 500. Smoke extended
  with 4 new steps (14–17); 17/17 green.

  Cross-app round-trip live: control-plane returns `tx_json`,
  `Transaction.from(...)` decodes it cleanly, `data.sender === null`
  as designed.

  **Out of scope (next):** Phase 4 — real zkLogin (Google OAuth →
  ZK proof verification → swap dev-mode auth). Likely interleaves
  with the dashboard build.

---

## 2026-05-09

- **[control-plane] Phase 4 shipped — Enoki zkLogin + sponsored transactions.**

  Two big shifts:

  1. **Real auth via Enoki.** New `POST /v1/auth/zklogin
     { google_jwt }` endpoint replaces dev-mode for production. The
     dashboard does the Enoki popup OAuth, hands the resulting Google
     ID token to us, and we call `enokiClient.getZkLogin({ jwt })` —
     Enoki performs JWT signature/audience/expiry verification against
     Google's JWKS and returns the canonical `(google_sub, app_salt) →
     sui_address`. We upsert `Account` keyed by `zklogin_sub`, mint
     a default project + API key on first sign-in, and return our
     own HS256 session JWT (unchanged shape from Phase 1). Dev-auth
     (`dev-sign-up`/`dev-sign-in`) stays gated by
     `NODE_ENV !== "production"` for tests + smoke.

  2. **Sponsored transactions via Enoki.** Refactored Phase 3's
     `prepare-*` endpoints to delegate to
     `SponsorshipService.createSponsored`. The wire format changed
     from `{ tx_json, expected.sender_hint }` to
     `{ digest, bytes, expected.{ sender, allowed_move_call_targets,
     sponsored_by: "enoki" } }`. `allowedMoveCallTargets` always
     contains exactly one fully-qualified target — even a malicious
     frontend can't redirect our Enoki budget. New
     `POST /v1/sponsor/execute { digest, signature }` relays to
     Enoki's executeSponsoredTransaction.

  Code lives in [apps/control-plane/src/enoki/](apps/control-plane/src/enoki/):
  `EnokiClientService` (lazy, hard-fails only on use),
  `SponsorshipService` (create + execute), `ZkLoginService`
  (JWT-to-account orchestration), and two small controllers
  (`zklogin`, `sponsor-execute`).

  **Subtle wins:**
  - `EnokiClientService` boots tolerantly. Missing `ENOKI_PRIVATE_KEY`
    yields a `WARN` log; the affected endpoints surface
    `InternalError("Enoki is not configured")`. Local dev without an
    Enoki account keeps every other endpoint green — including
    `cp-smoke.sh`, which probes Enoki paths in either mode.
  - `mutable: true` on the bucket argument bypasses the SDK's
    `getMoveFunction` resolver step, simplifying the test stub for
    `tx.build({ client, onlyTransactionKind: true })` to one
    `getObjects` mock.
  - `EnokiClientError → ControlPlaneError` mapping in
    `asControlPlaneError` translates 4xx/429/5xx into our JSON
    envelope cleanly.

  **Verification:**
  - 33/33 Vitest cases (`api-keys` 6, `buckets` 12, `prepare-tx`
    refactored to 10, new `zklogin` 6).
  - 19/19 smoke steps. Step 14 prints `[no-enoki] endpoint exists
    but ENOKI_PRIVATE_KEY not set — skipping live verification`
    when no Enoki account is configured locally; otherwise asserts
    the live `{ digest, bytes }` shape + single-entry allow-list.
  - End-to-end against live Enoki not yet covered (no Enoki Portal
    app provisioned for dev). Will be covered when the dashboard
    lands.

  **Out of scope (next):** Dashboard build. The full sign-in →
  prepare → sign → execute round-trip lives there. dApp Kit hooks:
  `useSignTransaction` over a `Transaction.from(bytes)` from our
  prepare endpoint, then `POST /v1/sponsor/execute`.

---

## 2026-05-09

- **[control-plane] Live Enoki sponsorship round-trip green on testnet.**

  New script:
  [apps/control-plane/scripts/enoki-live-smoke.ts](apps/control-plane/scripts/enoki-live-smoke.ts).
  Run with `pnpm -F @kraterion/control-plane enoki:smoke` against a
  running CP. It walks the full pipeline:

  1. Generate fresh Ed25519 keypair
  2. `dev-sign-up` to mint a CP session keyed to the keypair's address
  3. `prepare-create` (control-plane builds kind-bytes → Enoki returns
     `{ digest, bytes }` with gas envelope attached)
  4. Sign Enoki's bytes locally with the keypair
  5. `sponsor/execute` (control-plane relays digest+signature to Enoki)
  6. `SuiJsonRpcClient.waitForTransaction` and assert
     `KraterionBucketCreated` event fired

  **First live run:** tx
  [`25k2TZ4qgQtiitMzxa3GJq62E6J13GWkV8fyrtwkrUdJ`](https://suiscan.xyz/testnet/tx/25k2TZ4qgQtiitMzxa3GJq62E6J13GWkV8fyrtwkrUdJ)
  — new shared bucket
  `0xe88df996f9587cf20067dc9b7047871879ce26b9c3e2951a8818a5c578aa96cf`,
  user paid zero gas (Enoki sponsored). Sender = the freshly-minted
  Ed25519 keypair address; the user-side signature was a regular Sui
  Ed25519 signature (Enoki's sender-flow accepts any valid signature
  for the address, not specifically zkLogin).

  **Things this proves end-to-end (not just unit-tested):**
  - `EnokiClient` wiring + the lazy-init / hard-fail-on-use pattern.
  - `tx.build({ client, onlyTransactionKind: true })` produces bytes
    Enoki accepts (the SDK's resolver path with our `mutable: true`
    object hint works for the no-object case too).
  - `createSponsoredTransaction` with per-request
    `allowedMoveCallTargets: ["…::create_and_share_bucket"]` — the
    actual gate against frontend-redirected sponsorship.
  - `executeSponsoredTransaction { digest, signature }` settles the
    transaction.

  **Found and documented:**
  Standalone tsx scripts don't see `process.env.ENOKI_PRIVATE_KEY` even
  though the Nest app does — `@prisma/client` runs an upward-walking
  dotenv loader at import time that the Nest app benefits from but
  bare scripts don't. Fix is explicit `dotenv.config({ path: '../../../.env' })`
  at the top of any script file. Runbook entry added.

  **Next live test (deferred until dashboard exists):**
  `prepare-grant-api`, `prepare-revoke-all`, `prepare-visibility` all
  need a real shared `KraterionBucket` to mutate. The first script
  run created one; subsequent runs of those endpoints can target it.
  When the dashboard lands, those will be exercised through the real
  zkLogin path.

---

## 2026-05-09

- **[dashboard] Phase A shipped — foundations + design-system bridge.**

  Scaffold (Next.js 16 App Router on port 3001) now boots with all
  providers wired and every console-kit primitive available as typed
  React. No business logic yet — Phase B adds sign-in.

  **What landed:**
  - Deps: `@mysten/dapp-kit@^1.0.6` (legacy — has Enoki integration),
    `@mysten/enoki@^1.0.7`, `@mysten/sui@^2.16.2`,
    `@tanstack/react-query@^5.59.0`, `lucide-react@^0.460.0`,
    `@kraterion/walrus-client` workspace dep.
  - `src/app/globals.css` mirrors `/design-system/colors_and_type.css`
    + ports the relevant chunks of
    `/design-system/ui_kits/console/console.css` (sidebar, topbar,
    table, browser, drawer, modal, toast, banner, empty state, tabbed
    code, form field, on-chain ref, icon button). Tailwind v4
    `@theme inline` block exposes `bg-cream`, `text-ink`, `text-krater`,
    `border-stone-200`, the full Stone scale, and the semantic colors.
  - Providers tree (`src/app/providers.tsx`): `QueryClientProvider` →
    `SuiClientProvider` (testnet by default) → `<RegisterEnokiWallets/>`
    (effect returning `unregister` — safe under StrictMode double-mount,
    no-ops if `NEXT_PUBLIC_ENOKI_PUBLIC_KEY` absent) → `WalletProvider
    autoConnect` → `ToastProvider`.
  - 14 UI primitives ported from the console kit at
    `src/components/ui/`: `Button`, `IconButton`, `Input`, `Pill`,
    `Dot`, `Card`, `Mark` (Kraterion aperture, 4 variants),
    `Icon` (typed Lucide registry), `Drawer`, `ConfirmModal`,
    `EmptyState`, `Banner`, `FormField`, `TabbedCode`, `OnchainRef`,
    `Toast` (context + hook). All typed, all token-driven, no hardcoded
    colors.
  - Shell at `src/components/shell/`: `Shell`, `Sidebar` (Supabase-style
    nav groups: Storage / Account), `Topbar` (breadcrumb + actions).
  - Libs: `lib/env.ts` (typed `NEXT_PUBLIC_*` accessors, lazy on
    Enoki/Google keys so pre-Phase-B pages keep working),
    `lib/api.ts` (typed CP fetch wrapper, `ControlPlaneError` mirror,
    session JWT helpers, wire-shape mirrors for `BucketJson` /
    `S3ObjectJson` / `PrepareTxResponse`), `lib/format.ts`
    (`formatBytes`, `formatAddress`, `formatRelative`, `formatWal`,
    `suiscanTxUrl`, `suiscanObjectUrl`, `walruscanUrl`).
  - `src/app/(app)/` route group with `layout.tsx` mounting the shell,
    plus placeholder pages for `/buckets`, `/keys`, `/usage`,
    `/activity`, `/settings` (all `EmptyState`-only stubs Phase B–G
    replace).
  - `.env.local.example` documents every required public env var.

  **Verification:**
  - `pnpm turbo run typecheck` — 4/4 green.
  - `pnpm -F @kraterion/dashboard build` — clean (`Next.js 16.2.5
    (Turbopack)`).
  - `pnpm -F @kraterion/dashboard dev` boots in 186 ms. `/`, `/buckets`,
    `/keys` all 200. Served CSS contains `--ink`, `--cream`, `--krater`,
    `--stone-*`, `ks-app`, `ks-sidebar`, `ks-thead`, `btn-cta`,
    `pill-success` — tokens and console classes ship to the browser.

  **Known gotcha (resolved):** Lucide doesn't ship a `Bucket` icon;
  using `Container` aliased to `BucketIcon` for storage UI. The dApp Kit
  `SuiClientProvider` requires each network config to include `network:
  "testnet"` in addition to `url` — different shape from the docs
  example.

  **Out of scope for Phase A (next):** Phase B wires real Enoki sign-in,
  the `RequireAuth` wrapper, and rewrites `app/page.tsx` to redirect.

---

## 2026-05-11

- **[dashboard] Phase B shipped — Enoki Google sign-in wired end-to-end (live verification deferred to Docker bring-up).**

  Sign-in flow now runs entirely through the legacy `@mysten/dapp-kit`
  + `@mysten/enoki` pairing. One click → Enoki popup → CP session.

  **What landed:**
  - [src/lib/auth.ts](apps/dashboard/src/lib/auth.ts) — `useGoogleSignIn()`
    (`useWallets()` → filter on `isGoogleWallet` → `useConnectWallet().mutateAsync`
    → `getSession(wallet)` → POST `/v1/auth/zklogin` → persist), `useCpSession()`
    (useEffect-mounted localStorage read with cross-tab `storage` event listener),
    `useSignOut()`.
  - [src/lib/queries.ts](apps/dashboard/src/lib/queries.ts) — TanStack
    Query base. Phase B ships `useMe()`; Phase C extends with buckets /
    objects / api-keys.
  - [src/app/login/page.tsx](apps/dashboard/src/app/login/page.tsx) —
    centered "Continue with Google" surface. Already-signed-in users
    bounce to `/buckets` on mount. Inline error message on failure.
  - [src/components/auth/RequireAuth.tsx](apps/dashboard/src/components/auth/RequireAuth.tsx)
    — client gate for the `(app)` route group; renders nothing until
    `useCpSession()` has mounted, redirects to `/login` if no session.
  - [src/components/auth/SignOutButton.tsx](apps/dashboard/src/components/auth/SignOutButton.tsx)
    — ghost button wired to `useSignOut()`; mounted in the topbar of
    every `(app)` page.
  - [src/components/shell/SidebarLive.tsx](apps/dashboard/src/components/shell/SidebarLive.tsx)
    — hydrates the static `Sidebar` with `useCpSession()` + `useMe()`;
    sidebar shows the user's email + the first project's name.
  - [src/app/(app)/layout.tsx](apps/dashboard/src/app/(app)/layout.tsx)
    rewritten: `<RequireAuth><Shell sidebar={<SidebarLive/>}>…</Shell></RequireAuth>`.
  - [src/app/page.tsx](apps/dashboard/src/app/page.tsx) rewritten:
    redirects to `/buckets` or `/login` after mount, brand mark in the
    interim with an `iris` animate so the flash is intentional.
  - [apps/dashboard/.env.local](apps/dashboard/.env.local) — Next.js
    reads from the app dir, not the workspace root, so the public env
    vars live here. Mirrors the workspace `.env` entries Razvan added.

  **Trust model recap (carries forward from Phase 4 backend):**
  - The dashboard does the Enoki OAuth popup and reads the Google JWT
    via the `enoki:getSession` wallet-standard feature.
  - The control plane re-verifies the JWT through Enoki's
    `getZkLogin({ jwt })` server-side; the dashboard never trusts its
    own claim about the Sui address.
  - The CP-issued HS256 token (`localStorage["kraterion.cp_session"]`)
    is the only thing attached as Bearer on subsequent API calls.

  **Verification:**
  - `pnpm -F @kraterion/dashboard typecheck` — green.
  - `pnpm -F @kraterion/dashboard build` — green; 9 static routes.
  - `pnpm -F @kraterion/dashboard dev` boots in 187 ms, `/`, `/login`,
    `/buckets` all 200.
  - **Live sign-in round-trip blocked on Postgres bring-up** — the
    test machine doesn't have Docker running locally; control-plane
    needs `docker compose -f infra/compose/docker-compose.yml up -d`
    before its `/health/ready` will respond. Code is wired and built;
    only the live HTTP round-trip remains for the box.

  **Google Cloud Console whitelist** (one-time, for the OAuth client
  matching `NEXT_PUBLIC_GOOGLE_CLIENT_ID`):
  - Authorized JavaScript origins: `http://localhost:3001` (+ prod
    origin when we deploy).
  - Authorized redirect URIs: `http://localhost:3001` and
    `http://localhost:3001/login` — Enoki defaults `redirectUrl` to
    `window.location.href.split('#')[0]` (`@mysten/enoki@1.0.7
    /dist/wallet/wallet.mjs:98`), so the value depends on which page
    the user was on when they clicked "Continue with Google."

  **Out of scope (next):** Phase C — buckets list, bucket detail, file
  browser. Read-only views against the existing `GET /v1/buckets` /
  `:id/objects` / `:objectId` endpoints. No mutations yet.

---
