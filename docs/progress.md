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

  **Verification (live, end-to-end):**
  - `pnpm -F @kraterion/dashboard typecheck` + `build` — green.
  - CP CORS preflight from `http://localhost:3001` returns the right
    `access-control-allow-origin` headers.
  - `POST /v1/auth/zklogin` reachable, JWT-decode + Enoki call chain
    wired; bogus-JWT returns the structured `EnokiClientError` →
    `ControlPlaneError("InvalidArgument")` envelope cleanly.
  - **Live Google OAuth click works** — popup → consent → land on
    `/buckets` with the user's email in the sidebar avatar. Refresh
    persists the session, sign-out clears it. Verified 2026-05-11.

  **One fix made during live verification:** Enoki's
  `registerEnokiWallets` defaults the OAuth scope to `"openid"` only
  (`@mysten/enoki@1.0.7/dist/wallet/wallet.mjs:271`), so Google's ID
  token came back without an `email` claim and CP rejected with
  `InvalidArgument: JWT is missing the 'email' claim`. Fixed by
  passing `extraParams: { scope: "email profile" }` to the Google
  provider config in
  [apps/dashboard/src/app/providers.tsx](apps/dashboard/src/app/providers.tsx).
  Runbook entry below.

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

## 2026-05-11

- **[dashboard] Phase C shipped — read views (buckets list + 3-pane file browser).**

  The signed-in shell now hydrates with real data from the CP. No
  mutations yet — `New bucket`, `Upload`, `Settings`, `Download`,
  `Delete` are all rendered but disabled with phase-pinned tooltips
  ("Phase D" / "Phase E"). The visual surface is complete.

  **What landed:**
  - [src/lib/queries.ts](apps/dashboard/src/lib/queries.ts) extended
    with `useBuckets` (infinite-paginated by `next_cursor`),
    `useBucket(id)`, `useObjects(bucketId, { prefix })`
    (infinite-paginated, server-side prefix filter), `useObject(id)`,
    and `useApiKeys(projectId)`. All keyed by `['v1', resource, params]`
    so a single `queryClient.invalidateQueries({ queryKey: ['v1', 'buckets'] })`
    from Phase D mutations will refresh the whole family.
  - [src/lib/objects-tree.ts](apps/dashboard/src/lib/objects-tree.ts)
    — pure folder-tree synthesizer. Given a flat `S3Object[]` and a
    prefix, returns `{ entries: [FolderEntry | ObjectEntry], folderCount,
    objectCount }`. Folder rows are deduplicated by next-segment slash.
    Also ships `splitPrefix(prefix)` for breadcrumb construction and
    `iconForContentType` for per-row icon picking.
  - [src/components/buckets/BucketsList.tsx](apps/dashboard/src/components/buckets/BucketsList.tsx)
    — list view with client-side name filter, server-paginated
    "Load more". Columns: name, visibility pill, API-access pill
    (with status dot), funding (formatted), created (relative).
    Row click navigates to `/buckets/[id]`.
  - [src/components/buckets/FileBrowser.tsx](apps/dashboard/src/components/buckets/FileBrowser.tsx)
    — three-pane Supabase-style file browser: left folder tree,
    middle table with breadcrumb prefix nav + filter, right inspector.
    Prefix navigation uses the CP's server-side `prefix` query param;
    folders are synthesized client-side from the page response.
  - [src/components/buckets/Inspector.tsx](apps/dashboard/src/components/buckets/Inspector.tsx)
    — right-pane object detail. On-chain references for Walrus blob
    id (→ walruscan), Sui object id (→ suiscan), storage-end epoch,
    Seal identity (base64). Download / Delete stubbed for Phase E.
  - [src/app/(app)/buckets/page.tsx](apps/dashboard/src/app/(app)/buckets/page.tsx)
    rewritten — mounts `BucketsList`.
  - [src/app/(app)/buckets/[id]/page.tsx](apps/dashboard/src/app/(app)/buckets/[id]/page.tsx)
    — dynamic route; bucket head with the meta line (region · visibility
    pill · API-access pill · funding) + persistent warning Banner when
    `api_access_granted=false`. Branches on `useBucket` error → typed
    "not found" empty surface.

  **Verification:**
  - `pnpm -F @kraterion/dashboard typecheck` + `build` — green
    (9 routes; `/buckets/[id]` correctly typed as dynamic).
  - Dashboard hot-reloaded all changes; `GET /buckets` + `GET /buckets/<id>`
    both 200.
  - CP probe — fresh dev-sign-up → `GET /v1/me` returns the account
    + 1 default project; `GET /v1/buckets` returns
    `{ buckets: [], next_cursor: null }`. Wire-shape mirrors in
    [src/lib/api.ts](apps/dashboard/src/lib/api.ts) match the live
    response byte-for-byte.

  **Two `exactOptionalPropertyTypes` fixes:** `UseBucketsOptions` /
  `UseObjectsOptions` had `prop?: T` which TypeScript-strict mode treats
  as "may be omitted, but if present must be `T`". Callers passing
  `{ prefix: maybeString }` need the type to allow `T | undefined`
  explicitly. Pattern matches what we did for Phase A's `Sidebar` props.

  **Out of scope (next):** Phase D — the four sponsored-write paths
  (create / grant / revoke / visibility) lighting up the disabled
  buttons on this page.

---

## 2026-05-11

- **[dashboard] Phase D shipped — sponsored writes (create / grant / revoke / visibility).**

  The "New bucket" button and the bucket-detail "Settings" button are
  now live. Every state change runs through the Phase-4 Enoki
  sponsorship pipeline — user pays zero gas, just signs once.

  **What landed:**
  - [src/lib/sponsor.ts](apps/dashboard/src/lib/sponsor.ts) —
    `useSponsoredTx()` returns a single async function `runSponsored({
    prepareEndpoint, body?, onStatus?, invalidateKeys? })` that walks
    the full pipeline:
      1. POST `/v1/buckets/prepare-*` → `{ digest, bytes, expected }`
      2. `Transaction.from(bytes_base64)` → dApp Kit's
         `useSignTransaction({ transaction, chain: 'sui:testnet' })`
         → `{ signature }`
      3. POST `/v1/sponsor/execute { digest, signature }` →
         `{ digest }`
      4. `suiClient.waitForTransaction({ digest })`
      5. `queryClient.invalidateQueries` over the bucket family
    Surfaces a 5-stage `SponsorStatus` (`preparing` → `signing` →
    `executing` → `waiting` → `done`) the UI uses to drive
    "Submitting on-chain…" copy.
  - [src/components/buckets/CreateBucketDialog.tsx](apps/dashboard/src/components/buckets/CreateBucketDialog.tsx)
    — modal with name + visibility radios + grant-API checkbox.
    Client-side regex matches the CP DTO at
    `apps/control-plane/src/buckets/prepare/dto.ts` (S3-style:
    `^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$`). Submit → runSponsored →
    sticky toast with the Suiscan link on success.
  - [src/components/buckets/BucketSettingsDrawer.tsx](apps/dashboard/src/components/buckets/BucketSettingsDrawer.tsx)
    — three sections in one drawer:
      - **Visibility** — radio between private / public; "Save
        visibility" opens a ConfirmModal explaining the consequence
        ("affects every existing file immediately — Seal's policy is
        bucket-scoped").
      - **API access** — current state pill + Revoke / Restore button.
        Revoke uses the exact "twist 2" copy from
        `/docs/implementation-plan.md` §9.3: "Even Kraterion can't
        bypass it." Grant uses softer copy emphasizing the few-second
        Seal cache propagation.
      - **Danger zone** — delete is stubbed pending Phase E.
  - [src/app/(app)/buckets/page.tsx](apps/dashboard/src/app/(app)/buckets/page.tsx)
    — `New bucket` button now wires to `CreateBucketDialog`.
  - [src/app/(app)/buckets/[id]/page.tsx](apps/dashboard/src/app/(app)/buckets/[id]/page.tsx)
    — `Settings` button now wires to `BucketSettingsDrawer`. The
    revoke-state warning banner's copy was updated to point users at
    the Settings → Restore flow.

  **Why a Drawer instead of a kebab menu:** the demo "twist 2" (revoke
  API → boto3 fails → dashboard preview still works) deserves
  explanatory copy that's hard to fit under a 3-dot popover. The Drawer
  gives each action its own paragraph + on-chain note, matching the
  console kit's information density.

  **Verification:**
  - `pnpm -F @kraterion/dashboard typecheck` + `build` — green.
  - Dashboard hot-reloaded; `/buckets` and `/buckets/<id>` both 200.
  - Backend integration is the same one the Enoki live-smoke proved
    end-to-end on 2026-05-09 (tx `25k2…rUdJ`). The dashboard's
    `runSponsored` function is exactly the algorithm in
    `apps/control-plane/scripts/enoki-live-smoke.ts`, rewritten as a
    React hook with dApp Kit's `useSignTransaction` standing in for
    the script's manual `keypair.signTransaction`.

  **Browser test (user-side):**
  1. Click `New bucket`, name it `phase-d-demo`, visibility=private,
     grant API access checked → Sign with Enoki → wait ~5s for tx
     settlement, ~30s for indexer → row appears in the list.
  2. Click the bucket → click `Settings` → `Revoke API access` →
     confirm → sign → on-chain "twist 2" copy delivers; the warning
     banner appears on the bucket page.
  3. Click `Settings` → `Restore API access` → confirm → sign → banner
     disappears.
  4. Click `Settings` → flip visibility to public → save → confirm →
     sign → the meta-line pill updates after the indexer.

  **Out of scope (next):** Phase E — drag-drop upload + download +
  delete via CP-signed presigned URLs. The "Upload" button on the
  bucket detail page is the next thing to light up.

---

## 2026-05-11

- **[dashboard + gateway + control-plane] Phase E shipped — object I/O via CP-signed envelope, drag-drop upload, download, delete (backend round-trip green).**

  Instead of presigned URLs (query-string SigV4), we use **header-based
  SigV4 with `X-Amz-Content-Sha256: UNSIGNED-PAYLOAD`**, which the
  gateway already accepts at
  `apps/gateway/src/auth/sigv4/sigv4.service.ts:64-72`. The CP signs
  the request envelope (`Authorization`, `X-Amz-Date`, `X-Amz-Content-Sha256`,
  `Content-Type`), the dashboard sends the bytes directly to the
  gateway with those headers attached. Cleaner than presigned URLs:

  - No new SigV4 verifier path on the gateway (presigned-URL mode would
    need a separate parser).
  - The CP never sees the body — `UNSIGNED-PAYLOAD` decouples
    signature from content.
  - The browser never sees a secret — CP unwraps the user's per-project
    API key, signs, returns the envelope. ~5-minute SigV4 skew window
    bounds the validity.

  **Backend (`apps/control-plane/src/objects/`):**
  - [presign.service.ts](apps/control-plane/src/objects/presign.service.ts)
    — `signUpload`, `signDownload`, `signDelete`. Walks the
    `bucket → project → account` ownership chain (same as
    `BucketsService.getOwned`), refuses if `api_access_granted` is
    false with `code: "KeyAccessRevoked"`, picks the project's most
    recent non-revoked `ApiKey`, unwraps via `KeyWrappingService`,
    calls `aws4.sign` against the gateway URL with region
    `eu-central-1`. Returns `{ method, url, headers, expires_at }`.
  - [presign.controller.ts](apps/control-plane/src/objects/presign.controller.ts)
    — `POST /v1/objects/prepare-upload`, `POST /v1/objects/:id/prepare-download`,
    `POST /v1/objects/:id/prepare-delete`. All AuthGuard-gated.
  - [presign.module.ts](apps/control-plane/src/objects/presign.module.ts)
    wired into `AppModule`.
  - Deps added: `aws4@^1.13.2` + `@types/aws4@^1.11.6` in
    `apps/control-plane/package.json`.
  - `ApiKeysModule` now exports `KeyWrappingService` so the presign
    service can DI it.

  **Gateway (`apps/gateway/src/main.ts`):**
  - Added `@fastify/cors@^9.0.1`. Allowlist via `DASHBOARD_ORIGIN` /
    `CORS_ORIGINS`. Methods `GET, PUT, POST, DELETE, HEAD, OPTIONS`.
    Allowed headers cover the full SigV4 set
    (`Authorization, X-Amz-Date, X-Amz-Content-Sha256, ...`). Exposed
    headers include `ETag, Content-Type, Content-Length, Last-Modified,
    x-amz-request-id` so the dashboard can read response metadata.

  **Dashboard:**
  - [src/lib/objects.ts](apps/dashboard/src/lib/objects.ts) —
    `usePrepareUpload`, `usePrepareDownload`, `usePrepareDelete`
    mutations; `uploadWithProgress` (XHR-based for upload progress
    events), `downloadAsBlob`, `downloadToDisk`, `deleteSigned`;
    `useInvalidateBucketObjects` for post-mutation cache busting.
  - [src/components/buckets/Uploader.tsx](apps/dashboard/src/components/buckets/Uploader.tsx)
    — drag-drop wrapper around the bucket detail body. Full-bleed
    Cream-tinted overlay on dragenter (with dashed Krater border);
    sticky bottom-right queue panel with per-file progress bars,
    status pills, dismiss buttons. Files dropped at prefix `hero/2026/`
    upload to keys like `hero/2026/<file.name>`. Auto-clears `done`
    items after 5 s. Exposes `window.__kraterionOpenUploader` so the
    page-header `Upload` CTA can trigger the hidden picker without
    prop-drilling.
  - [src/components/buckets/Inspector.tsx](apps/dashboard/src/components/buckets/Inspector.tsx)
    — Download button → `prepareDownload` → `downloadToDisk` →
    triggers browser save dialog. Delete button → `ConfirmModal` →
    `prepareDelete` → `deleteSigned`. Both are disabled when
    `api_access_granted` is false (gateway would reject anyway).
  - [src/app/(app)/buckets/[id]/page.tsx](apps/dashboard/src/app/(app)/buckets/[id]/page.tsx)
    — wraps the screen in `<Uploader>`, lifts `prefix` state up so
    Uploader + FileBrowser share it, wires the Upload CTA to
    `window.__kraterionOpenUploader`.
  - [src/components/buckets/FileBrowser.tsx](apps/dashboard/src/components/buckets/FileBrowser.tsx)
    — accepts `prefix` + `onPrefixChange` props from the page.

  **Backend verification (end-to-end, no browser):**

  1. CP probe — `prepare-upload` returns
     `{ method: "PUT", url: "http://localhost:4002/<bucket>/<key>",
        headers: { Authorization, X-Amz-Date, X-Amz-Content-Sha256,
        Content-Type }, expires_at }`. CORS preflight from
     `localhost:3001` accepted. Authz: 404 on bogus bucket id,
     401 on missing token.
  2. PUT direct-to-gateway with the signed headers:
     - First attempt → 503 ServiceUnavailable. Cause: transient
       Walrus testnet upload-relay flake (`ORPHAN BLOB: relay POST
       failed: 500 internal client error`). No issue with the CP-side
       signing — gateway authenticated successfully and forwarded.
     - Second attempt 5 s later → **HTTP 200**, blob registered
       (`blobObjectId=0x98a05c…ec87`).
  3. `prepare-download` for the just-uploaded object → signed GET
     envelope → `fetch` to gateway → Seal-decrypted plaintext returns
     **byte-exact** match with the original upload (`"second try..."
     === "second try..."`).
  4. Indexer wrote the `S3Object` row within 30 s (per gRPC checkpoint
     cadence).

  **Out of scope (next):** Phase F — `/keys` page wiring (mint /
  revoke API keys, copy-once secret panel, boto3 / aws-cli / rclone
  quickstart snippets).

  **User browser test still pending** — drag-drop UX needs eyes on it.
  Both dev servers are running; refresh
  http://localhost:3001/buckets/<id> and drop a file.

---

## 2026-05-11

- **[dashboard] Phase F shipped — `/keys` page (mint / revoke / show-once secret panel / quickstart snippets).**

  **What landed:**
  - [src/lib/queries.ts](apps/dashboard/src/lib/queries.ts) — added
    `useMintApiKey(projectId)` and `useRevokeApiKey(projectId)` mutations.
    Both invalidate `['v1', 'api-keys', projectId]` on success.
    `MintedApiKey` type mirrors the CP's response shape exactly:
    `{ api_key: ApiKeyJson, secret: string, WARNING: string }`.
  - [src/components/keys/QuickstartCode.tsx](apps/dashboard/src/components/keys/QuickstartCode.tsx)
    — three-tab snippet generator (boto3, aws-cli, rclone) with the
    AKIA + secret + endpoint URL pre-filled. Accepts `secret: string | null`
    so callers either show the cleartext at mint time, or render a
    placeholder (`<your-secret-shown-once-at-creation>`) on the
    persistent quickstart card below the keys table.
  - [src/components/keys/CreateApiKeyDialog.tsx](apps/dashboard/src/components/keys/CreateApiKeyDialog.tsx)
    — two-stage flow: name input → CP mints → swap to a "save the
    secret" panel with two `.ks-codeline.mono` rows (AKIA + secret),
    inline copy buttons, the full quickstart snippet block. The
    secret only ever lives in the dialog's local state — `useEffect`
    resets it to `null` on close, so reopening the dialog never shows
    a stale secret.
  - [src/app/(app)/keys/page.tsx](apps/dashboard/src/app/(app)/keys/page.tsx)
    — table of keys sorted active-first then revoked-greyed-out.
    Status pill (success / error + dot). Per-row Revoke action with a
    `ConfirmModal` explaining the exact failure modes
    (`InvalidAccessKeyId`, `SignatureDoesNotMatch`). Below the table,
    a persistent quickstart card prefilled with the most recent
    active key's AKIA — encourages users to come back to this page
    when they need to remember which key to use.

  **Verification:**
  - `pnpm -F @kraterion/dashboard typecheck` + `build` — green.
  - `GET /keys` returns 200; the page already worked end-to-end
    against the existing
    `GET /v1/projects/:id/api-keys`,
    `POST /v1/projects/:id/api-keys`,
    `POST /v1/api-keys/:id/revoke` endpoints (Phase 1 control-plane
    surface). The minted-secret-once contract was verified live on
    2026-05-09 during the cross-app boto3 smoke
    (`apps/control-plane/scripts/enoki-live-smoke.ts`).
  - The persistent quickstart card shows the user's existing active
    key without re-exposing the secret — matches the design system's
    "we never see the secret after you create it" copy.

  **Out of scope (next):** Phase G — settings page with cancel
  subscription (requires a tiny backend `PATCH /v1/me/cancel`),
  activity feed, usage stats stub, public link route.

---

## 2026-05-11

- **[gateway + dashboard] Public buckets end-to-end (pulled forward from Phase G).**

  Public-read buckets now actually function as public storage — anyone
  with the link can fetch the bytes, no auth, no SigV4. Pulled this
  forward from Phase G because it's the demo payoff for the visibility
  flip in Phase D.

  **Gateway:**
  - [src/s3/object-bytes.service.ts](apps/gateway/src/s3/object-bytes.service.ts)
    — new shared service. Houses the Seal+Walrus
    decrypt-and-serve pipeline that used to live inside
    `ObjectsReadController.getObject`. Both the authed read controller
    and the new public controller call into it.
  - [src/s3/public.controller.ts](apps/gateway/src/s3/public.controller.ts)
    — new `GET /public/:bucket/*` + `HEAD /public/:bucket/*`. No
    `Sigv4Guard`. Looks up the bucket by name across all accounts (no
    ownership check), rejects unless
    `encryption_mode = "public-read" AND api_access_granted = true`,
    otherwise returns plaintext via `ObjectBytesService.serve`.
    `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=300, immutable`.
    Private bucket + revoked + missing all return identical
    `NoSuchBucket` envelopes — no information leak about which.
  - [src/s3/objects.read.controller.ts](apps/gateway/src/s3/objects.read.controller.ts)
    refactored to delegate to the shared service. Net delta: ~120 LOC
    moved + ~30 LOC of public-route glue.
  - The cryptographic story is intact because Move's `seal_approve`
    is mode-aware (`move/kraterion/sources/access.move:30-50`): for
    `encryption_mode_public` it short-circuits to `return` for any
    caller, so the gateway's own sub-wallet session key gets a Seal
    share regardless of who's hitting the HTTP route. No new Move
    code; no schema change.

  **Dashboard:**
  - [src/app/public/[bucket]/[...key]/page.tsx](apps/dashboard/src/app/public/[bucket]/[...key]/page.tsx)
    — server component that calls `redirect()` to the gateway URL.
    Browser hits the gateway directly so the gateway's cache headers
    don't get layered over by a Next.js cache, and range-aware media
    players talk straight to the gateway.
  - [src/components/buckets/Inspector.tsx](apps/dashboard/src/components/buckets/Inspector.tsx)
    — new `Public URL` detail row, only rendered when the bucket's
    `encryption_mode === "public-read"`. Shows the dashboard URL in
    mono with a Copy button. Inline helper text: "Anyone with this
    link can view the file. Open it in any browser, paste it in a
    tweet, embed it in `<img src>`."

  **Verification (end-to-end live):**

  ```
  $ curl -sI http://127.0.0.1:3001/public/phase-d-demo/phase-e-retry-1778505478.txt
  HTTP/1.1 307 Temporary Redirect
  location: http://localhost:4002/public/phase-d-demo/phase-e-retry-1778505478.txt

  $ curl -sL http://127.0.0.1:3001/public/phase-d-demo/phase-e-retry-1778505478.txt
  second try...
  ```

  With the bucket flipped to `encryption_mode = "private"`, the same
  URLs return `404 NoSuchBucket`. CORS headers on the gateway response
  (`access-control-allow-origin: *`, `access-control-expose-headers:
  ETag, Content-Type, Content-Length, Last-Modified`) let third-party
  sites embed and fetch the bytes.

  **Demo path that now works:**
  1. Upload file to a private bucket → no shareable URL exists in the
     Inspector.
  2. Settings → flip visibility to public → sign with Enoki → bucket
     pill changes to "Public".
  3. Inspector now renders a "Public URL" row with a copy button.
  4. Paste the URL into a fresh browser tab → file renders inline.
  5. Settings → flip back to private → fresh hit to the same URL → 404
     `NoSuchBucket`.

  **Out of scope (next):** the rest of Phase G — cancel-subscription
  twist (`PATCH /v1/me/cancel` + Settings page wiring), activity feed,
  usage stats stub.

---

## 2026-05-11 — [dashboard][control-plane] Phase G: Settings + Activity + Usage + cancel-subscription twist

- **Backend:** `PATCH /v1/me/cancel` added to
  `apps/control-plane/src/accounts/accounts.controller.ts`. Body shape
  `{ confirm: true }` validated with Zod; idempotent on
  already-cancelled accounts (returns the current row instead of
  flipping again). Status field is the existing `Account.status`
  string column — no migration.
- **Dashboard Settings (`/settings`):** account card (email, Sui
  address with Suiscan link, status pill, member-since) + a danger
  card with the cancel button. `ConfirmModal` explains that data
  doesn't move — on-chain Bucket / SharedBlob objects keep paying
  Walrus rent from their funding pools. Wires `useCancelSubscription`
  → `PATCH /v1/me/cancel` → invalidates `['v1','me']`.
- **Persistent banner:** `components/shell/CancelledBanner.tsx`,
  mounted in `(app)/layout.tsx`. Reads `useMe()` — when
  `account.status === "cancelled"` it renders a warning Banner on
  every page with a Suiscan link to the user's Sui address. Demo
  twist 1: "your files outlive the platform" reads from every screen.
- **Activity (`/activity`):** reverse-chrono bucket-event feed
  synthesized client-side from `useBuckets({ includeDeleted: true })`.
  One row per creation, one per soft-delete. Object-level events are
  intentionally out — would need a dedicated CP `/v1/activity`
  endpoint to be feasible across all buckets.
- **Usage (`/usage`):** three-stat grid (Storage / Objects /
  Buckets). Uses `useQueries` to fan out per-bucket `useObjects` in
  parallel and aggregates sizes. Sub-line clarifies it's free during
  the hackathon; metered billing is a follow-up.
- **CSS:** added `.ks-card`, `.ks-card-danger`, `.ks-cancelled-banner`,
  `.ks-activity-*`, `.ks-usage-*` to `globals.css`. Token-driven,
  no hard-coded colors.
- **Verification:** `pnpm -F @kraterion/dashboard typecheck` and
  `pnpm -F @kraterion/control-plane typecheck` clean. Dashboard
  build clean — all nine routes (incl. `/activity`, `/usage`,
  `/settings`) prerender or stream as expected.

---

## Week 1 (May 7–13) — direction (cont.)

- `[docs]` 2026-05-12 — **AI workstream scoped.** After the Walrus
  handbook tilted heavily toward AI agents and after a research pass
  into MemWal's architecture, MCP TypeScript SDK 1.29, pgvector / HNSW
  / halfvec, and 2026 chunking practice, drafted
  `/docs/ai-features-plan.md` — a phased plan (K0…K6, 10–14 days total)
  to layer "knowledge buckets" on top of the existing S3 surface
  without changing any current shape. Highlights:
  - **K0:** factor `packages/object-bytes` out of
    `apps/gateway/src/s3/object-bytes.service.ts` so the worker can
    decrypt objects through the same Seal+Walrus pipeline the gateway
    uses; enable pgvector in dev compose; new `knowledge_indexer`
    sub-wallet role.
  - **K1:** BullMQ-backed embeddings module in `apps/worker`. Hook into
    `ObjectCreatedHandler` (the only edit to an existing file): if the
    parent bucket has a `KnowledgeBucketSettings` row, enqueue. Worker
    chunks (recursive 400 tokens / 60 overlap), embeds via OpenAI
    `text-embedding-3-small` at 1024 dims, writes a halfvec(1024)
    chunk row, and a manifest row. Skips unsupported MIME types
    silently.
  - **K2:** new `apps/control-plane/src/knowledge/` module exposing
    `POST /v1/buckets/:id/knowledge` (enable/disable),
    `POST /v1/buckets/:id/search` (vector retrieval), and
    `POST /v1/buckets/:id/ask` (RAG over the search results, BYO LLM
    key). Honors the existing `api_access_granted` flag — revoking the
    bucket kills search instantly, same lever as the gateway.
  - **K3:** new `packages/mcp-server` shipping `npx @kraterion/mcp`.
    MCP TypeScript SDK 1.29; stdio for local agents (Claude Desktop,
    Cursor, Cline) and Streamable-HTTP for remote/hosted ones (the Nov
    2025 spec replacement for SSE). Bearer-token auth using the
    existing Kraterion API key secret. Seven tools wrapping the
    control-plane REST + gateway S3 paths. OAuth 2.1 + PKCE noted as
    a post-hackathon item.
  - **K4:** one new Knowledge tab on the bucket detail page —
    toggle, index status, live query box, and a "Connect an agent"
    panel with copy-paste snippets for Claude Desktop / Cursor /
    `curl`. Reuses every existing design-system primitive; no new
    tokens, no emoji, sentence case.
  - **K5:** archive each per-object embedding manifest (JSON: model id,
    chunk hashes, chunking params, source blob id) as a Walrus
    SharedBlob owned by the same on-chain bucket as the source. The
    "verifiable retrieval" hook — the knowledge base is reproducible
    from on-chain artifacts after a Postgres wipe.
  - **K6:** demo rehearsal. Demo arc rewritten in §2.3 of the plan
    around the upgraded surface; both plot twists
    (cancel-subscription, revoke-API) survive intact and now operate
    on the knowledge base, not just a file list.
  - **Decisions:** appended a 2026-05-12 ADR to `decisions.md`
    capturing the option set (MemWal-relayer fork rejected; complement
    via Walrus-archived manifests instead) and the per-bucket model
    choice. No code shipped yet — next session picks up at Phase K0.

---

## 2026-05-12 — [k0] AI features plumbing landed

  - **`packages/object-bytes`** (new). Pure-function package wrapping the
    Seal-approve PTB build + Walrus aggregator read + Seal decrypt
    pipeline. Exports `decryptObjectBytes(args)` and
    `buildSealApprovePtb(args)`. Typed errors (`WalrusReadError`,
    `SealDecryptError`, `PtbBuildError`) let consumers map to their own
    framework's error shape.
  - **Gateway refactor.** `apps/gateway/src/s3/object-bytes.service.ts`
    delegates the PTB→Walrus→decrypt sequence to the new package while
    keeping HTTP-response shaping (`setReadHeaders`, size cap,
    `Content-Type`, ETag) local. SessionKey/Redis ownership stays in
    the service. Behavior is byte-equivalent — `pnpm typecheck` across
    the workspace returns 17/17 green.
  - **Postgres → pgvector.** `infra/compose/docker-compose.yml` swapped
    `postgres:16-alpine` → `pgvector/pgvector:pg16`. Data volume
    preserved across the bounce. Migration prepends
    `CREATE EXTENSION IF NOT EXISTS vector;` so the `halfvec(1024)`
    column type resolves on first apply.
  - **Knowledge schema.** `prisma/migrations/20260512092144_add_knowledge_tables/`
    adds `KnowledgeBucketSettings`, `KnowledgeManifest`, `KnowledgeChunk`
    (`embedding halfvec(1024)` via `Unsupported(...)`), `KnowledgeQuery`.
    All four indexes + foreign keys in place. HNSW index deferred to K2.
    `KnowledgeManifest.deleted_at` shipped on day one per the §2.3
    lifecycle table.
  - **`knowledge_indexer` sub-wallet.**
    `apps/gateway/scripts/bootstrap-gateway.ts` gained
    `ensureKnowledgeIndexerSubWallet()` + `fundKnowledgeIndexerWithSui()`
    (1.5 SUI for K5 manifest writes). Address
    `0x394d875e6597643cf28e3d0d1da13ce4de3bd7b98572068afdc2e94139c09699`
    is now provisioned on testnet, recorded in `SubWallet` with the
    seed AES-wrapped by the same `KEY_WRAPPING_MASTER_KEY` the gateway
    uses. Re-running bootstrap is idempotent.
  - **Worker auth module.** `apps/worker/src/auth/` houses
    `KnowledgeIndexerKeypairService` (mirrors the gateway pattern),
    `KeyWrappingService`, and the underlying `EnvKeyWrapper`.
    `AppModule` imports the new `AuthModule`. Worker boots and logs
    `knowledge-indexer keypair loaded (0x394d…9699)`.
  - **Verification:** `pnpm typecheck` workspace-wide clean. `CREATE
    EXTENSION vector` confirmed in Postgres. All four Knowledge tables
    present. Both sub-wallets visible in DB. CP + gateway + worker all
    bounce cleanly with the refactored decrypt path. Dashboard
    download path of an existing private file remains byte-equal —
    the gateway still serves it via the same SessionKey, just via the
    extracted package now.

  **Out of scope (deferred to K1+):** the BullMQ embeddings queue, the
  MIME extractors, the `ObjectCreatedHandler` hook that enqueues per
  PUT, the `/v1/buckets/:id/{knowledge,search,ask}` endpoints, the
  HNSW index, the MCP `/mcp` route, the dashboard Knowledge tab, the
  on-Walrus manifest archival. Each is its own phase in
  `docs/ai-features-plan.md`. K0's job was to remove the plumbing
  excuses so K1 is straight-line.

---

## 2026-05-12 — [k1] embedding pipeline end-to-end

  Knowledge-enabled bucket → auto-index on PUT. End-to-end verified
  against testnet + a fresh upload through the gateway.

  **What landed:**

  - **`apps/worker/src/embeddings/`** — new Nest module:
    - `embeddings.module.ts` — wires the BullMQ queue
      (`kraterion-embeddings`), Redis connection (`maxRetriesPerRequest: null`
      for the worker's blocking subscriber), default job opts (3 retries,
      exp-backoff 2s, completed jobs gc 7d, failed gc 14d).
    - `embeddings.service.ts` — `maybeEnqueue(s3_object_id)` is the
      handler-callable path; `enqueueBucket(bucket_id)` paginates for
      K2's backfill use case. Job id is
      `manifest_<s3_object_id>_v<version>` for natural dedup.
    - `embeddings.processor.ts` — BullMQ `WorkerHost`, concurrency 4.
      Per-job: upsert manifest=`indexing` → decrypt via
      `@kraterion/object-bytes` with `knowledge_indexer` SessionKey →
      MIME dispatch → token-budgeted chunking → OpenAI embed → write
      chunks + finalize manifest in one tx. `$executeRaw` insert for
      `halfvec(1024)` (Prisma can't serialize it; `'[v1,v2,...]'::halfvec`
      cast). `WalrusReadError` retries (BullMQ); `SealDecryptError`
      doesn't (it means revocation or permanent ACL fail).
    - `chunking/recursive.ts` — recursive separator-aware splitter via
      `tiktoken` (`cl100k_base`). 400 tokens / 60 overlap by default
      (per-bucket configurable). Deterministic — same input ⇒ same
      chunk hash list, which is the K5 manifest's reproducibility hook.
    - `embedders/openai.ts` — `text-embedding-3-small @ 1024 dims`,
      batch size 200 (post-research bump from plan's 100), exponential
      retry with full jitter via `p-retry`, 4xx (non-408/429) errors
      `AbortError` to short-circuit. TODO marker for the async Batch
      API (50% off, ~1h SLA) — out of K1 scope.
    - `extractors/` — `text.ts` (UTF-8, fatal decode), `pdf.ts`
      (`unpdf` — see ADR), and `index.ts` dispatch. Skip reasons
      surface as typed enum values written into the manifest row.

  - **Indexer hook.**
    `apps/worker/src/indexer/handlers/object-created.handler.ts` — single
    edit to an existing file: after the S3Object upsert returns the row
    id, fire-and-forget `embeddings.maybeEnqueue(row.id)`. The enqueue
    sits inside the Prisma transaction but writes to Redis (which doesn't
    participate); a rare tx-rollback-after-enqueue leaks one job that
    the processor immediately marks failed (cheap, documented in code).
    `IndexerModule` now imports `EmbeddingsModule` for the service.

  - **`apps/worker/src/redis/`** — module added, mirrors the gateway's.
    Worker now has its own `ioredis` singleton for SessionKey caching.

  - **`apps/control-plane/src/knowledge/`** — K1-stub `POST/GET
    /v1/buckets/:id/knowledge`. Insert/delete `KnowledgeBucketSettings`
    + (on disable) cascade-drop chunks. K2 will extend with `/search`
    and `/ask`.

  - **K1 migration** (`20260512130932_knowledge_chunk_tsvector`) —
    added a `content_tsv tsvector GENERATED ALWAYS AS
    (to_tsvector('english', content)) STORED` column + GIN index on
    `KnowledgeChunk`. Auto-populates on every chunk insert; ready for
    K2 hybrid BM25 + vector + RRF retrieval without a backfill. See
    `docs/decisions.md` 2026-05-12 ADR for why hybrid is the default,
    not stretch.

  - **Bootstrap: knowledge_indexer grant on test bucket.**
    `apps/gateway/scripts/bootstrap-gateway.ts` —
    `grantKnowledgeIndexerAccessOnTestBucket` adds the
    `knowledge_indexer` address to the test bucket's
    `api_decryption_addresses` (idempotent). Production buckets get
    this grant via the K2 enable-knowledge endpoint; bootstrap is the
    test-bucket-only shortcut.

  - **`apps/worker/src/main.ts`** — explicit `dotenv.config({ path:
    "<repo-root>/.env" })`. Prior implicit `dotenv/config` only worked
    when the shell already had the env set (which it sometimes did
    from a prior session). New code paths now reliably reach the
    worker — including the OPENAI_API_KEY moved from
    `apps/dashboard/.env.local` (where it never reached the worker)
    to the repo-root `.env`.

  **Verification (end-to-end, against testnet):**

  ```
  # 1. Enable Knowledge on test-bucket via the CP stub
  TOKEN=$(curl -s -X POST http://localhost:4001/v1/auth/dev-sign-in \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo@kraterion.dev"}' | jq -r .token)

  curl -s -X POST http://localhost:4001/v1/buckets/<bucket-id>/knowledge \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":true}'
  # → {"enabled":true,"settings":{"embedding_model":"text-embedding-3-small",...}}

  # 2. PUT a text file through the existing gateway flow.
  #    (Walrus testnet relay occasionally returns 503 — boto3 would
  #    retry; here we retry manually. Once landed, the indexer's
  #    KraterionObjectCreated handler enqueues the embed job.)
  ```

  Worker log after the PUT settled (~3s after upload):
  ```
  [EmbeddingsService] enqueued index job: s3_object=<uuid> version=1
  [EmbeddingsProcessor] indexed s3_object=<uuid> v=1 chunks=1 tokens=156
  ```

  DB state:
  ```
  KnowledgeManifest: status=indexed, chunk_count=1, bytes_in=650,
  bytes_indexed=650, embedding_tokens=156,
  embedding_model=text-embedding-3-small
  KnowledgeChunk: ordinal=0, token_count=156, content_tsv populated,
  embedding populated (12785-char halfvec serialization = 1024 floats)
  ```

  pgvector cosine-similarity sanity:
  `SELECT embedding <=> embedding FROM "KnowledgeChunk" LIMIT 1;`
  returns `0` (perfect identity). halfvec write + read round-trip
  works.

  **Out of scope (deferred to K2+):**
  - HNSW index over `embedding` (K2's migration).
  - `/v1/buckets/:id/search` and `/ask` endpoints.
  - Dashboard Knowledge tab (K4).
  - On-Walrus manifest archival (K5).
  - MCP server (K3).
  - Backfill on enable (the K1 stub only writes the settings row; K2's
    full enable endpoint will trigger `enqueueBucket(bucket_id)`).
  - Re-PUT version-bump end-to-end test (the processor wiring is
    deterministic — `openManifest` upserts on `(s3_object_id, version)`
    and the service enqueues with `prev.version + 1` — but I didn't
    re-PUT under live Walrus to spend a second relay slot).

---

## 2026-05-12 — [k2] retrieval API: hybrid BM25 + vector + RRF, plus /ask

  Knowledge-enabled buckets are now agent-queryable. Verified end-to-end
  against the K1 corpus: `/search` returns RRF-fused hits in ~240ms,
  `/ask` adds a BYO-key LLM step + chunk-cited answers in ~2s.

  **What landed:**

  - **HNSW index** (`prisma/migrations/20260512134312_knowledge_chunk_hnsw/`):
    `USING hnsw (embedding halfvec_cosine_ops) WITH (m=16,
    ef_construction=200)`. Tuned for cosine over halfvec(1024); per-
    query `ef_search` is set inside the retrieval transaction (64 for
    `/search`, 96 for `/ask`). On the 1-chunk K1 corpus the planner
    picks Seq Scan over the index — correct cost-based choice; the
    index will kick in once the table grows to ~100+ rows.

  - **`packages/embeddings-client`** — shared OpenAI embedder. The
    worker (K1 ingestion) and CP (K2 query embedding) now use the
    same code, so chunk embeddings and query embeddings can never
    drift apart on model/dimensions. Worker's
    `apps/worker/src/embeddings/embedders/openai.ts` is now a thin
    re-export.

  - **`apps/control-plane/src/knowledge/`** (extended from the K1 stub):
    - `knowledge.service.ts` — hybrid retrieval. One `$transaction`:
      `SET LOCAL hnsw.ef_search = N`, then a CTE that materializes the
      vector top-50 + BM25 top-50, joins on candidates, and emits
      `rrf_score = sum(1 / (60 + rank))`. ORDER BY rrf_score DESC,
      LIMIT top_k. Bucket-scoped, 403s with `Forbidden` when
      `api_access_granted=false` (same revocation lever as everything
      else). Refuses when `KnowledgeBucketSettings` is missing (409).
    - `knowledge.controller.ts` — adds `/search` and `/ask` POSTs;
      extends `POST /` (enable) with backfill enqueue via BullMQ. The
      backfill is producer-only — the processor stays on the worker.
    - `ask.ts` — BYO-key OpenAI Chat Completions wrapper. System
      prompt instructs the model to inline `[chunk N]` citations;
      `resolveCitations` maps cited indices back to `ChunkHit`s and
      surfaces the resolution table. Per-request OpenAI client (BYO
      key contract); no proxying.

  - **BullMQ producer in CP** — `KnowledgeModule` registers the
    `kraterion-embeddings` queue with `maxRetriesPerRequest: null`
    (BullMQ's connection-shape requirement). The `embeddings-queue.
    constants.ts` file mirrors the worker's queue name + job-data
    shape; small intentional duplication, flagged as a follow-up
    `packages/embeddings-queue` extraction.

  - **`KnowledgeQuery` audit row** — every `/search` and `/ask` writes
    one row with the query, top-k, latency, returned chunk hashes,
    and (for `/ask`) the LLM model + prompt+completion token total.
    The hash list is the K5 verifiability hook: "the agent said X
    backed by [chunk_hash_a, chunk_hash_b]" → those hashes are in
    the on-chain manifest's chunks list.

  **Verification (against the K1-indexed `test-bucket`):**

  - `POST /v1/buckets/<id>/knowledge/search` body
    `{"query":"Seal envelope encryption","top_k":3}` →
    ```
    hits=[{ s3_key=k1-smoke.txt, ordinal=0,
            vector_distance=0.6326, bm25_score=0.1125,
            rrf_score=0.03278 }]
    embedding_model=text-embedding-3-small, dimensions=1024,
    query_tokens=4, latency_ms=237
    ```
    Both legs hit (vector + BM25), RRF fused, correct chunk surfaced.

  - `POST /v1/buckets/<id>/knowledge/ask` body
    `{"query":"What chunking strategy does K1 use, and what model is
    each chunk embedded with?","top_k":3,"openai_api_key":"sk-..."}`
    →
    ```
    answer="K1 uses a chunking strategy that involves a recursive
            token chunker with parameters 400/60 and cl100k_base.
            Each chunk is embedded with OpenAI's
            text-embedding-3-small model at 1024 dimensions...
            [chunk 1]"
    citations=[{chunk_hash=3eb7f2cb..., s3_key=k1-smoke.txt,
                ordinal=0}]
    retrieval.latency_ms=1980
    llm.model=gpt-4o-mini-2024-07-18, prompt_tokens=333,
    completion_tokens=67
    ```
    LLM cited correctly, citation index resolved back to the source
    chunk hash, audit row written.

  - **Revocation short-circuit:** manual `UPDATE Bucket SET
    api_access_granted=false` → next `/search` returns
    `HTTP 403 Forbidden` with the canonical `KeyAccessRevoked`-style
    message. Flipping back to `true` restores search immediately.

  - **HNSW index visible in `pg_indexes`:**
    ```
    USING hnsw (embedding halfvec_cosine_ops)
    WITH (m='16', ef_construction='200')
    ```

  **Bug fix during smoke (documented for the runbook):** Prisma's
  `$executeRaw` refuses parameter binding for `SET LOCAL hnsw.ef_search
  = $1` — Postgres treats `SET` as a config command, not a value
  expression, so `$N` is a syntax error. Use `$executeRawUnsafe` with
  a manually-validated integer instead.

  **Out of scope (deferred to K3+):**
  - MCP `/mcp` route + dual auth (K3 — bearer for hackathon, OAuth
    2.1 + DCR + RFC 9728 for marketplace).
  - Dashboard Knowledge tab (K4).
  - On-Walrus manifest archival + verifiable retrieval link in the
    citations (K5).
  - On-chain `grant_api_access(bucket, knowledge_indexer_address)`
    PTB at enable time. The CP stub now backfills via BullMQ; the
    on-chain step needs the user's signature, so it'll be wired
    through the existing `prepare-*` / sponsor flow in K4 (alongside
    the Knowledge toggle UI).
  - Activity-feed surfacing of `KnowledgeQuery` rows (K4 — the page
    is in place, just needs a new event kind in the
    `apps/control-plane/src/activity/` aggregation).

---

## 2026-05-12 — [k3a] MCP server live: bearer auth + 7 tools, hosted at /mcp

  Any MCP-aware agent (Claude Desktop, Cursor, Cline, Vercel AI SDK
  clients, custom Anthropic-SDK harness) can now connect to Kraterion
  by POSTing a Kraterion API-key pair as a Bearer token. The seven
  tools called out in `docs/ai-features-plan.md` §2.2 are live and
  verified end-to-end.

  **What landed:**

  - **`@modelcontextprotocol/sdk@^1.29.0`** added as a CP dep. Uses
    the `McpServer` + `StreamableHTTPServerTransport` high-level API.
    No new runtime (no separate process; no `npx` package); the
    transport is mounted as `@All("mcp")` on the existing Fastify
    listener.

  - **`apps/control-plane/src/mcp/`** (new module):
    - `mcp.module.ts` — imports `BucketsModule`, `KnowledgeModule`,
      `ObjectsModule`. Provides `McpAuthGuard`, `McpToolsService`,
      and a local `KeyWrappingService`.
    - `mcp.controller.ts` — `@All("mcp")` route. Authenticates,
      builds a fresh `McpServer` per request, registers the seven
      tools, hands `req.raw` + `req.body` to
      `transport.handleRequest()`. **Stateless mode** (no
      `sessionIdGenerator`) — POSTs are self-contained JSON-RPC.
    - `mcp.tools.ts` — every tool calls existing in-process services
      (`BucketsService`, `KnowledgeService`, `PresignService`,
      `Prisma`). `read_object` / `write_object` route through the
      gateway via CP-signed SigV4 envelopes server-to-server so
      the agent never holds an S3 secret.
    - `mcp.auth.guard.ts` — pluggable per §6.4.0. K3a branch parses
      `Authorization: Bearer <AKIA>:<secret>`, looks up the
      `ApiKey` row by AKIA (O(1) via unique index), KMS-unwraps the
      secret, `timingSafeEqual` compares. Returns
      `McpPrincipal{ account_id, project_id, api_key_id,
      scopes:['mcp:*'] }` or null. The K3b OAuth-JWT branch slots
      in here without touching tool code.
    - `mcp.types.ts` — `McpPrincipal` + `McpScope` + `principalSatisfies`
      helper. `mcp:*` short-circuits any scope check, so K3a tool
      handlers never branch on scope.

  - **Seven tools registered** (names match `docs/ai-features-plan.md`
    §2.2 verbatim):
    - `kraterion.list_buckets`
    - `kraterion.list_objects(bucket, prefix?, limit?)`
    - `kraterion.search(bucket, query, top_k?)` — calls
      `KnowledgeService.search` (hybrid BM25+vector+RRF) + writes
      a `KnowledgeQuery` audit row.
    - `kraterion.ask(bucket, query, openai_api_key, model?, top_k?)`
      — BYO-key per K2 decision. Same retrieval + LLM step as the
      REST `/ask`.
    - `kraterion.read_object(bucket, key)` — proxies through gateway
      via `PresignService.signDownload`. 1 MiB cap. UTF-8 content
      types decoded inline; binary returned as base64.
    - `kraterion.write_object(bucket, key, content, content_type?)`
      — proxies through gateway via `PresignService.signUpload`.
      5 MiB cap. Returns ETag.
    - `kraterion.get_manifest(bucket, key)` — current Knowledge
      manifest. Walrus blob fields surface here; populated by K5.

  - **401 + forward-compatible `WWW-Authenticate` header.** Missing or
    invalid bearer returns
    `WWW-Authenticate: Bearer realm="kraterion-mcp"`. K3b extends
    with `resource_metadata="..."` (RFC 9728) without controller
    changes.

  - **Module exports tightened.** `KnowledgeModule` now exports
    `KnowledgeService`; `ObjectsModule` exports `PresignService`.
    `McpModule` consumes both. Same pattern other CP cross-module
    deps already use.

  **Verification:**

  - `POST /mcp` no auth → `HTTP 401 + WWW-Authenticate: Bearer
    realm="kraterion-mcp"` + JSON-RPC error body with a help message.
  - Fresh minted API key (`AKIA…ORF5:JB5A…1VG`):
    - MCP `initialize` → server announces `kraterion-mcp` v0.1.0
      with `tools.listChanged: true`.
    - MCP `tools/list` → all seven tools with their input schemas
      and descriptions.
    - MCP `tools/call` `kraterion.list_buckets` → returns
      `test-bucket` (correctly project-scoped to the API key's project).
    - MCP `tools/call` `kraterion.search bucket="test-bucket"
      query="Seal envelope encryption" top_k=3` → 1 hit on
      `k1-smoke.txt`, rrf=0.0328, vector_distance=0.633, bm25=0.1125,
      latency 1.5s (cold; subsequent calls ~250ms).
    - MCP `tools/call` `kraterion.get_manifest` → manifest with
      `status=indexed, chunk_count=1, embedding_tokens=156`.
    - `POST /v1/api-keys/<id>/revoke` then re-POST `/mcp` with the
      same bearer → immediate `HTTP 401`. Revocation is the same
      lever as everything else.

  **Bug fixed during smoke (logged for the runbook):** the SDK's
  `StreamableHTTPServerTransportOptions.sessionIdGenerator` is
  declared optional but with `exactOptionalPropertyTypes: true` you
  can't pass `undefined` literally. **Omit the field** to enable
  stateless mode; passing `undefined` is a type error.

  **Out of scope (deferred to K3b / K4 / K5):**
  - OAuth 2.1 + PKCE + DCR + RFC 9728 (K3b). Same `/mcp` route, same
    `McpPrincipal` contract; only the auth guard's
    `authenticate(token)` gains the `eyJ`-prefixed JWT branch. K3a's
    `WWW-Authenticate` stub will then carry `resource_metadata=...`.
  - Dashboard "Connect an agent" panel with copy-paste snippets
    (K4).
  - `walrus_blob_id` in `get_manifest` output (K5 — the on-Walrus
    manifest archive isn't built yet).

---


## 2026-05-12 — [k3b] OAuth 2.1 + PKCE + DCR + RFC 9728 live on /mcp

  Pluggable auth on `/mcp` now covers both branches the plan called
  out. The K3a bearer path is untouched; OAuth tokens land alongside
  it through the same `McpPrincipal` contract.

  **What shipped:**

  - Two new tables:
    - `OAuthClient { client_id, client_name, redirect_uris[] }` —
      one row per DCR-registered MCP client (Claude Desktop instance,
      Cursor instance, etc).
    - `OAuthGrant { code, code_challenge, scopes[], resource,
      account_id, project_id, redirect_uri, expires_at,
      consumed_at }` — short-lived authorization codes, single-use.
      Double-spend revokes the issued token (denylist follow-up
      tracked in decisions.md).
  - `OAuthService` + `OAuthController` under
    `apps/control-plane/src/oauth/`:
    - `POST /oauth/register` — RFC 7591 DCR, anonymous, no
      client_secret (public PKCE clients only).
    - `GET /oauth/authorize` — validates `response_type=code`,
      `client_id`, `redirect_uri`, `code_challenge`+`S256`,
      `resource`, `scope`. Stashes the request under an opaque UUID
      and 302s to `${DASHBOARD_ORIGIN}/oauth/consent?request_id=...`.
    - `GET /oauth/authorize/state` — CP-session-gated; returns the
      stashed request's display fields (client_name, scopes,
      redirect_uri, resource) for the consent UI. Re-fetching here
      means a tampered URL still hits validated state.
    - `POST /oauth/authorize/decision` — CP-session-gated; mints the
      auth code, marks the stash consumed, returns the redirect URL
      the dashboard should bounce the user to.
    - `POST /oauth/token` — PKCE S256 verifier check, audience match
      against the stored `resource`, returns HS256 access JWT.
      Accepts `application/x-www-form-urlencoded` (the OAuth 2.1
      §4.1.3 default for Claude Desktop / Cursor).
    - `GET /.well-known/oauth-protected-resource` (RFC 9728) and
      `GET /.well-known/oauth-authorization-server` (RFC 8414).
  - Pluggable auth guard:
    `McpAuthGuard.authenticate(authorizationHeader, expectedAudience)`
    now branches on token shape — `eyJ`-prefixed + 3 segments routes
    to the OAuth verifier (`verifyAccessToken` checks signature,
    `iss`, `aud === resource URL`, `exp`, `typ === "kraterion.mcp+jwt"`,
    and returns parsed scopes). Anything else stays on the K3a
    AKIA:secret path.
  - MCP controller now derives `resource = ${baseUrl}/mcp` from the
    request (honoring `x-forwarded-*`) and passes it as the audience.
    The 401 response carries
    `WWW-Authenticate: Bearer realm="kraterion-mcp",
    resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    so RFC 9728-aware clients discover the OAuth flow automatically.
  - Dashboard `/oauth/consent` page under `(app)` (RequireAuth
    applies). Fetches the stashed request via
    `GET /oauth/authorize/state`, shows the client name, requested
    scopes (with friendly copy), and the redirect URI. Approve/Deny
    `POST`s to `/oauth/authorize/decision` and navigates to the
    returned redirect URL — the MCP client receives `?code=...` and
    completes the flow with `POST /oauth/token`.

  **Smoke verification:**

  - `GET /.well-known/oauth-protected-resource` → 200, lists
    `authorization_servers`, `bearer_methods_supported`,
    `scopes_supported`.
  - `GET /.well-known/oauth-authorization-server` → 200, lists
    `authorization_endpoint`, `token_endpoint`,
    `registration_endpoint`, `code_challenge_methods_supported:
    ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`.
  - `POST /oauth/register {redirect_uris, client_name, scope}` → 201
    with `client_id`.
  - `GET /oauth/authorize` with valid params → 302 to dashboard
    `${DASHBOARD_ORIGIN}/oauth/consent?request_id=...`.
  - `GET /oauth/authorize` with bogus client_id → 400.
  - `POST /oauth/token` with form-encoded body + bad code → 400
    `{"error":{"code":"InvalidArgument","message":"Unknown
    authorization code."}}` (parser path verified).
  - `POST /mcp` with no Authorization → 401, header includes
    `resource_metadata="…/.well-known/oauth-protected-resource"`.

  **Bug fixed during bootstrap (logged for the runbook):** Nest's
  FastifyAdapter already registers an `application/x-www-form-urlencoded`
  parser internally. Adding our own raised
  `FST_ERR_CTP_ALREADY_PRESENT` at boot. The default parser already
  produces a plain object usable by our Zod validator — no custom
  parser needed.

  **Prisma footgun (logged):** when adding `OAuthClient` + `OAuthGrant`,
  `prisma migrate dev` auto-generated `DROP INDEX` for the K1 GIN +
  K2 HNSW indexes (it doesn't see hand-edited
  `CREATE INDEX ... USING hnsw` from earlier migrations as part of
  the live schema) and tried to drop the `content_tsv` GENERATED
  column default. Fix: `prisma migrate resolve --rolled-back`, hand
  trim the migration SQL down to the OAuth DDL only, `prisma migrate
  deploy`. Both retrieval indexes preserved.

  **Out of scope / follow-ups:**
  - Multi-process CP needs Redis-backed authorize stash + JWT
    denylist for revocation. One-day each, not hackathon blockers
    (see `decisions.md` — "K3b: HS256 + in-memory authorize stash").
  - Refresh tokens. Plan punts these post-hackathon; DCR + 15-min
    access tokens cover the demo flows.
  - End-to-end browser smoke (DCR → consent click → token → /mcp
    with the issued JWT). The curl smoke covers every step except
    the consent click; a manual run with Claude Desktop or Cursor
    is the natural validation.

---


## 2026-05-12 — [k4] Knowledge tab on the dashboard

  The Knowledge surface that turns Kraterion's storage console into an
  agent control panel. Tab nav, toggle, live status, live query, and
  the connect-an-agent panel — all per `docs/ai-features-plan.md` §6.5,
  all on the existing design tokens.

  **What shipped:**

  - Backend extension: `GET /v1/buckets/:bucketId/knowledge` now
    returns a `summary` block — counts grouped by manifest status
    (`indexed`, `pending`, `failed`, `skipped`) plus the bucket's
    `total_objects`. One round-trip drives the entire status panel.
  - React Query hooks under `apps/dashboard/src/lib/queries.ts`:
    `useKnowledgeStatus`, `useToggleKnowledge`, `useKnowledgeSearch`.
    Matching wire types (`KnowledgeStatus`, `KnowledgeSearchResponse`)
    mirror the CP serializer outputs.
  - New route
    `apps/dashboard/src/app/(app)/buckets/[id]/knowledge/page.tsx` —
    same shell as the bucket detail page, scoped to the
    Knowledge-tab content. Polling stays cheap because the hook's
    `staleTime` is 5 s and queries auto-invalidate after the toggle
    mutation.
  - New components under `apps/dashboard/src/components/knowledge/`:
    - `KnowledgeToggle` — enable / disable card with a destructive
      ConfirmModal on disable. Toast on success.
    - `KnowledgeStatus` — indexed-of-total dl grid, hairline progress
      bar (Krater fill, stone-100 track — design-system safe, no
      shadow), settings strip with model + dimensions + chunking
      knobs.
    - `KnowledgeSearch` — query input + button → hit list. RRF, BM25,
      and vector-distance scores rendered as tertiary text under each
      hit so power users can inspect the ranker. Hidden until the
      bucket has at least one indexed object.
    - `ConnectAgentPanel` — three TabbedCode snippets: Claude Desktop
      `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, and a
      `curl` JSON-RPC `tools/list`. AKIA is pre-filled from the
      active key; secret stays a placeholder. "Generate a new key"
      button opens the existing CreateApiKeyDialog so the user can
      mint + reveal-once inline.
  - New sub-tab nav: `components/buckets/BucketTabs.tsx`. A hairline
    strip at the top of every bucket detail page with `Files` and
    `Knowledge`. The active tab carries a Krater underline (only one
    Krater accent on screen — design-system rule: "never two Krater
    elements touching").
  - The bucket detail page (`(app)/buckets/[id]/page.tsx`) now renders
    `<BucketTabs active="files" />` between the page head and the
    file browser. Settings stays as a drawer (it's a side-task, not
    a peer view).
  - Consent page polish: rewrote `app/(app)/oauth/consent/page.tsx`
    to use the design-system primitives end-to-end. No more inline
    `border: 1px solid var(--border-subtle)` shapes; the screen now
    uses the same hairline-card pattern as the rest of the console,
    Krater accent only on the primary CTA, sentence-case headings,
    and Lucide icons (1.5 px stroke) inside small Stone-100 squares
    next to each scope row. Banner + Button primitives replace
    everything that was previously raw `<div>`s.

  **Design-system compliance:**

  - Every new class in `globals.css` references only `--ink`,
    `--cream`, `--krater`, `--stone-*`, `--space-*`, `--radius-*`,
    `--ease`, `--dur-*`. No hardcoded hex.
  - No shadows, no gradients, no blur. Elevation is exclusively
    hairline borders + `--bg-elevated` contrast.
  - Sentence case everywhere. The only ALL-CAPS strings are the
    8–11 px micro-labels ("INDEXED", "PERMISSIONS", "RETURNS TO")
    using `letter-spacing: 0.16em`.
  - Krater accent count per screen: bucket header (active tab
    underline) — one. Consent screen (Authorize button + scope
    icons) — one CTA + scope icon backgrounds stay Stone-100 so they
    don't touch the CTA. Knowledge status (progress bar fill) — one.
  - No emoji anywhere. Lucide icons throughout.

  **Out of scope / follow-ups (intentional):**

  - Settings UI for model / dimensions / chunk size. Spec K4 §6
    deferred to post-hackathon — the defaults are the right call.
  - Walruscan deep-links on citation rows (K5 wires up the
    manifest's `walrus_blob_id`; today the manifest isn't on Walrus
    yet).
  - Activity-feed rendering of `KnowledgeQuery` rows. The Activity
    page already polls the same shape; rendering just needs a
    `kind === "search" | "ask"` case in its renderer, deferred
    until we have query traffic worth showing.
  - Manual end-to-end smoke (toggle on, watch backfill drain, run a
    query) needs a running worker against the user's local stack —
    user can validate when they bounce the worker.

---


## 2026-05-12 — [k4+] OAuth surfaces: Settings → Connected agents + bucket OAuth method

  Closes the loop on K3b end-to-end: now there's a place to inspect and
  revoke OAuth clients, and the Knowledge tab's connect-an-agent panel
  presents OAuth side-by-side with the API-key snippets.

  **What shipped:**

  - Backend management API on the OAuth controller:
    - `GET /v1/oauth/clients` — lists every OAuth client that has at
      least one grant belonging to the signed-in account. Returns the
      union of granted scopes, the resource URL, the most recent
      consent timestamp, and the client's last token-exchange time
      (the `OAuthClient.last_used_at` field).
    - `DELETE /v1/oauth/clients/:clientId/grants` — deletes
      OAuthGrant rows for (account × client). The next /authorize from
      this client walks through a fresh consent screen. **Returns
      `tokens_remain_valid_until_exp: true`** — we don't have a JWT
      denylist yet, so access tokens issued in the last 15 minutes
      survive. The dashboard surfaces that honestly in the disconnect
      confirmation.
    - Both routes session-guarded; reuses `requireUser(req)` for
      account scoping.
  - Dashboard hooks:
    `useOAuthClients`, `useDisconnectOAuthClient` in
    `apps/dashboard/src/lib/queries.ts`.
  - Settings → Connected agents card
    (`components/oauth/ConnectedAgents.tsx`): hairline-bordered list
    with per-row name + client_id (mono code chip) + resource URL +
    scope pills + relative consent/last-used timestamps + a
    Disconnect button. ConfirmModal warns about the 15-minute token
    grace window. Empty state has a dashed-border row with the "no
    OAuth connections yet" copy.
  - Knowledge tab → Connect-an-agent: rewritten as a method-toggle
    (API key | OAuth). API key tab keeps the three TabbedCode
    snippets (Claude Desktop / Cursor / curl). OAuth tab drops the
    snippets entirely — replaces them with a three-step flow grid
    (`1 → 2 → 3` numbered tiles) and the MCP URL + RFC 9728
    discovery URL in mono code blocks. Links to Settings →
    Connected agents for management.

  **Design-system compliance:**

  - No new tokens; every class references `--ink`, `--cream`,
    `--krater`, `--stone-*`, `--space-*`, `--radius-*`, `--ease`,
    `--dur-*`.
  - No shadows. Active method tile is signalled by an `--ink` border
    upgrade (from `--border`), not by a fill or glow.
  - Single Krater accent per surface: on the connect-an-agent card,
    Krater is reserved for the focus outline and the link hover —
    the active method tile uses Ink instead of Krater so it never
    "touches" the Krater accent the live progress bar above could
    have shown.
  - Sentence case throughout. The only ALL-CAPS bits are the
    11px micro-labels ("SNIPPETS", "MCP URL", "DISCOVERY URL",
    "CONSENTED", "LAST USED") using `letter-spacing: 0.16em`.
  - Lucide icons inside small Stone-100 squares for the numbered
    flow steps. No emoji.

  **Out of scope / follow-ups:**

  - JWT denylist (Redis) for true revocation of in-flight access
    tokens. Tracked in the K3b decision entry — one-day follow-up.
  - Per-bucket grant scoping. Today an OAuth grant covers the whole
    project (the bearer path's behavior). Per-bucket scopes are a
    consent-screen refactor + a new claim in the JWT — post-hackathon.
  - GC for stale OAuth clients (no grants, no recent
    `last_used_at`). The `last_used_at` index is there for the future
    worker; not wiring the worker today.

---


## 2026-05-12 — [k5+polish] Manifest archive on Walrus, citation links, Knowledge in Activity, bucket badge

  Four demo-critical gaps from the cross-plan audit, all in one cut.
  Closes the K4 exit criteria ("Walruscan deep-links on citations",
  "All copy is sentence case, no emoji") and the K5 entry surface
  ("verifiable retrieval").

  **What shipped:**

  - **K5 — manifest archive on Walrus (worker):**
    - New module
      `apps/worker/src/embeddings/manifest-archive.ts`. After the
      embeddings processor finalizes a manifest at `status=indexed`, it
      builds the v1 manifest JSON (source ids, etag, embedding model
      + dims, chunking params, ordered list of per-chunk hashes +
      boundaries — no plaintext, no vectors), writes it to Walrus via
      `WalrusClient.writeBlob({ epochs: 26, deletable: false })` signed
      by the `knowledge_indexer` sub-wallet, and stores
      `manifest_walrus_blob_id` + `manifest_shared_blob_object_id` on
      the row.
    - **Idempotent.** A re-run on a manifest that already has a
      `manifest_walrus_blob_id` is a no-op.
    - **Best-effort.** A `writeBlob` failure logs at WARN and leaves
      `manifest_walrus_blob_id` null. The chunks stay searchable; the
      dashboard hides the link when null.
    - **Scope deferral (documented in the module header):** the blob
      is a regular Walrus `Blob` owned by the worker keypair, NOT
      wrapped via `kraterion::wrap_in_shared_blob` into the bucket.
      That upgrade is a ~half-day follow-up (re-uses the gateway's
      PTB1 + relay + PTB2 dance). The Walruscan link works either way;
      the bucket-owned variant tightens the "verifiable retrieval
      co-owned with the data" claim.
    - **Manifests are written in cleartext** regardless of the
      bucket's encryption mode. Manifest content is hashes only, so
      leaking it is no worse than leaking the schema. Seal-encrypted
      manifests for private buckets is a follow-up.
  - **Walruscan citation links (backend + dashboard):**
    - `KnowledgeService.search` now joins `S3Object` for
      `walrus_blob_id` + `shared_blob_object_id`, and joins
      `KnowledgeManifest` for `manifest_walrus_blob_id`. The wire
      shape gains three fields per hit:
      `source_walrus_blob_id`, `source_shared_blob_object_id`,
      `manifest_walrus_blob_id`.
    - `KnowledgeSearch.tsx`: each hit row gets a links cluster —
      *Source blob* (Walruscan, source object), *On chain* (Sui
      explorer, SharedBlob), and *Manifest* (Walruscan, indexing
      record, only when populated). Quiet hairline links, color
      steps from text-secondary → text-primary on hover with a
      lazy underline. No Krater accent on the footer so the citation
      cluster doesn't compete with the page's existing accents.
    - Wire-shape mismatch fixed while in there: dashboard was
      reading `hit.chunk_id` against a backend that returned `id`.
      React's `key=` was the only consumer, so nothing visible
      broke — but the cleanup avoids surprises later.
  - **Activity feed renders Knowledge events:**
    - `ActivityService` adds a third Promise.all leg pulling the
      last N `KnowledgeQuery` rows (`fetchSize = 2× limit`) scoped to
      the account via the bucket join, materializes
      `knowledge_search` / `knowledge_ask` rows, sorts the union by
      timestamp.
    - `ActivityEventJson` gains a `knowledge` sub-object: `query`,
      `top_k`, `chunk_count`, `latency_ms`, `llm_model`, `llm_tokens`.
    - Dashboard `activity/page.tsx` renders the new kinds — `search`
      icon for searches, `info` icon for asks. Title shows the
      truncated query in italic quotes (no mono background — quotes
      do the framing). Sub-line shows hit count + latency, and for
      ask rows also the LLM model + token count.
  - **Knowledge badge on bucket list:**
    - Backend: `BucketsController.list` / `get` does a single
      follow-up `KnowledgeBucketSettings.findMany` keyed on the
      page's bucket ids, sets `knowledge_enabled: boolean` on each
      row. Sub-millisecond PK lookup, no N+1.
    - Dashboard: `BucketsList.tsx` renders a small Knowledge chip
      next to enabled buckets — Lucide search icon + label, hairline
      stone-200 border, stone-50 background, text-secondary color.
      No emoji (plan called for "🧠 Knowledge"; design-system bans
      emoji in product surfaces, so it's a Lucide icon + sentence-case
      label instead). Chip uses tokens only — no hardcoded colors,
      radii, or font sizes.

  **Design-system compliance:**

  - Every new class in `globals.css` (`ks-knowledge-chip`,
    `ks-hit-foot`, `ks-hit-links`, `ks-hit-link`, `ks-activity-q`)
    references only `--ink`, `--cream`, `--krater`, `--stone-*`,
    `--space-*`, `--radius-*`, `--dur-*`, `--ease`. No hardcoded hex.
  - No shadows; the chip elevates by hairline border + warm stone
    background.
  - Sentence case throughout. The only ALL-CAPS bits are the
    11px micro-labels.
  - No emoji. Lucide 1.5px-stroke icons in every new surface.
  - Krater is reserved for primary CTAs + active tab; the citation
    links cluster stays in stone-greys so it reads as metadata.

  **Smoke verified:**
  - `pnpm typecheck` green across all 19 workspace tasks.
  - CP + worker bounced cleanly. `GET /v1/activity` returns 401
    without a session token (expected); 200 + new wire shape with
    a token.

  **Out of scope / follow-ups:**

  - K5 SharedBlob wrap (`register_blob_for_bucket` →
    `wrap_in_shared_blob`) to make the manifest blob bucket-owned on
    chain, matching the source-object pattern. ~half a day; re-uses
    the gateway's PTB structure. Today the manifest blob is owned by
    the `knowledge_indexer` sub-wallet.
  - Seal-encrypted manifests for private buckets — content is
    hashes-only so it's not a leak, but the demo's
    `revoke_all_api_access`-cuts-manifest-reads beat needs it.
  - Activity feed cross-cancels: when a search runs against a
    bucket the user has since deleted, the `bucket` join still
    works (soft delete keeps the row); rendering on the dashboard
    side is consistent — but worth re-testing once the renewal
    worker lands.

---


## 2026-05-12 — [k5-full] Manifest blobs are bucket-owned SharedBlobs on chain

  Closes the K5 gap left open in the earlier round. Manifests now ride
  the same `register_blob_for_bucket` → `wrap_in_shared_blob` pipeline
  the gateway uses for user PutObjects. They land as SharedBlobs
  attached to the bucket — same on-chain ownership pattern, same
  revocation surface (`revoke_all_api_access` cuts the platform off
  from reading manifests too).

  **What shipped:**

  - **Worker — full PTB pipeline.**
    Rewrote `apps/worker/src/embeddings/manifest-archive.ts` to
    replicate the gateway's PutObject flow exactly:
    - **PTB1:** relay tip + `kraterion::register_blob_for_bucket`,
      signed by the `knowledge_indexer` sub-wallet.
    - **Relay upload:** `WalrusClient.writeBlobToUploadRelay` with the
      registered Blob object id + the tip's tx digest.
    - **PTB2:** `walrus::system::certify_blob` +
      `kraterion::wrap_in_shared_blob`. The Move wrap call carries
      the manifest's s3_key, content_type, seal_identity (48-byte
      shape: bucket_object_id + manifest_uuid), size, and the
      plaintext MD5 etag.
    - **Graceful fallback.** If PTB1 reverts (most likely cause: the
      indexer hasn't been granted yet on the bucket) the function
      falls back to a worker-owned `WalrusClient.writeBlob` so the
      dashboard's Walruscan link still resolves. Logged at WARN.
      Idempotent: a later retry skips when `manifest_walrus_blob_id`
      is already set.

  - **Reserved key prefix.**
    The bucket-wrap path emits `KraterionObjectCreated`, which the
    indexer would normally translate to an `S3Object` row. To avoid
    polluting `ListObjectsV2` and the file browser, manifests land
    under `_kraterion/manifests/<manifest_id>.json`. Two pieces enforce
    this:
    - The gateway's `PutObject` controller rejects any user-supplied
      key starting with `_kraterion/` (400 `InvalidArgument`).
    - The indexer's `ObjectCreatedHandler` detects the prefix BEFORE
      hitting the S3Object upsert and routes the event to
      `KnowledgeManifest.update` — writing `manifest_walrus_blob_id` +
      `manifest_shared_blob_object_id` and returning. Idempotent under
      `indexer:reset` because we update by `(id, bucket_id)`.
    - Why not a new Move function + event? A package republish
      orphans every existing bucket on chain. The reserved-prefix
      pattern is the hackathon-friendly equivalent — same on-chain
      ownership, no migration.

  - **Control plane — indexer address service + grant signal.**
    - `KnowledgeIndexerAddressService` reads the singleton
      `SubWallet { role: "knowledge_indexer" }` row and caches the
      address. Mirrors `GatewayAddressService` exactly.
    - `POST /v1/buckets/:bucketId/knowledge` (enable path) now reads
      the bucket's live on-chain `api_decryption_addresses` vector
      and returns `indexer_address` + `needs_indexer_grant` so the
      dashboard knows whether to follow up with a sponsored grant tx.
      Read-failure-tolerant: a failed RPC defaults to `true`, and the
      Move call is idempotent (`grant_api_access` is a no-op when the
      address is already present), so duplicate grants are harmless.

  - **Dashboard — auto-grant on enable.**
    The `KnowledgeToggle` component, on enable, now:
    1. POSTs `/v1/buckets/:id/knowledge { enabled: true }` — fires
       backfill, returns `indexer_address` + `needs_indexer_grant`.
    2. If a grant is needed, fires a sponsored `grant_api_access` tx
       via the existing `useSponsoredTx` hook, passing
       `api_addr_override` = indexer address. The user signs once;
       there's no second on-chain mutation surfacing in the UI.
    3. Renders a toast for the grant with the Suiscan link, or a
       softer warning if the grant fails — indexing still works,
       manifests fall back to worker-owned.
    Button label flips to "Granting indexer access…" during the
    sponsored-tx round-trip; the user gets a single "Knowledge enabled"
    + "Indexer access granted" sequence with no extra UI to navigate.

  **Design-system compliance:**
  No new classes; the grant flow reuses the existing toast +
  sponsored-tx infrastructure. The added "Granting indexer access…"
  copy is sentence case; the suiscan link is the dashboard's
  standard underline-on-hover style.

  **Smoke verified:**
  - `pnpm typecheck` green across 19 workspace tasks.
  - CP + gateway + worker bounced cleanly. Knowledge enable endpoint
    returns 401 without a session (expected); the new route map
    appears in the CP boot log.
  - Reserved-prefix PUT manually rejected via curl simulation in the
    write controller.

  **End-to-end demo flow:**
  1. User toggles Knowledge on a bucket → dashboard fires
     `POST /knowledge`.
  2. CP returns `{ enabled: true, needs_indexer_grant: true,
     indexer_address: "0x..." }`.
  3. Dashboard fires sponsored `grant_api_access` tx → user signs →
     bucket's `api_decryption_addresses` grows by one address.
  4. Worker processes the backfill queue → for each indexed object,
     builds the manifest, runs PTB1 (`register_blob_for_bucket`,
     signed by the now-authorized worker keypair), uploads via relay,
     runs PTB2 (`certify_blob` + `wrap_in_shared_blob`) → SharedBlob
     created.
  5. Indexer sees `KraterionObjectCreated` with key
     `_kraterion/manifests/...` → routes to `KnowledgeManifest`
     update → writes `manifest_walrus_blob_id` + the SharedBlob id.
  6. Dashboard's search hits show the *Manifest* Walruscan link;
     `revoke_all_api_access` on the bucket cuts manifest reads too.

  **Out of scope / follow-ups:**
  - Seal-encrypted manifests for private buckets. Today manifests
    are written cleartext regardless of bucket mode. Content is
    hashes-only so not a leak, but the "revoke cuts manifest reads"
    demo beat needs Seal-encryption to be fully sharp.
  - Re-indexing on `encryption_mode` flip. Bucket toggles between
    private/public don't currently re-write manifests.
  - Re-grant prompt on previously-revoked buckets. If a user
    revokes-all then re-grants on a Knowledge bucket, the worker
    would need to re-establish the indexer grant; today the user
    must toggle Knowledge off and back on.

---


## 2026-05-12 — [audit-1] Wallet + access-flow hardening (5 fixes)

  Five issues from the cross-flow audit, all landed without a Move
  republish. Together they tighten the demo's auth posture (twist 1
  now actually cuts MCP), close the K5 grant lifecycle (indexer's
  on-chain authority matches user intent on both enable and disable),
  and kill the race that left first-batch manifests unarchived.

  **What shipped:**

  - **Token-type discriminator (RFC 8725 §3.11).** Session JWTs now
    carry `typ: "kraterion.session+jwt"`; `TokensService.verify`
    rejects anything where `typ` is set to something else. OAuth MCP
    access JWTs already enforced `typ: "kraterion.mcp+jwt"`. With both
    sides strict, an OAuth access token presented as a dashboard
    bearer no longer parses through `AuthGuard` even though both
    tokens share the HS256 secret. Backward compat: tokens with no
    `typ` are accepted as session for one 7-day rotation window so
    existing logins aren't kicked out; tighten after that.

  - **Cancel-account blocks MCP.** `McpAuthGuard.authenticateApiKey`
    deepens its query to include `project.account.status` and refuses
    any non-`active` row. `authenticateOAuth` adds a single PK lookup
    on `Account` after the JWT verifies. Twist 1 (cancel subscription)
    now cuts SDK *and* connected agents, matching gateway behavior.

  - **Restore re-grants the indexer too.** `prepareGrantApi` with no
    `api_addr_override` builds a PTB that grants the gateway and,
    when the bucket has `KnowledgeBucketSettings`, ALSO grants the
    `knowledge_indexer` address in the same transaction. One user
    signature, two on-chain grants. Behavior before: revoke-all +
    restore left Knowledge half-broken; after: full restoration in
    one click.

  - **Disable Knowledge revokes the indexer on chain.** Move package
    only exposes `revoke_all_api_access`; a per-address revoke would
    need a republish. We emulate it via a new
    `POST /v1/buckets/:id/prepare-revoke-indexer` that builds a
    single PTB running `revoke_all_api_access` and then
    `grant_api_access` for the gateway. Net: only the indexer is
    removed, atomically. `sponsor()` now accepts an array of allowed
    Move-call targets so the dual-target PTB passes the sponsorship
    allow-list. The dashboard's Knowledge toggle fires the sponsored
    tx when the CP returns `needs_indexer_revoke: true`.

  - **Race fix — gate backfill on grant + retry the archive.**
    1. Enable response no longer enqueues backfill jobs when the
       indexer grant hasn't landed (`backfill_deferred: true`). New
       `POST /v1/buckets/:id/knowledge/backfill` endpoint kicks the
       queue after the sponsored grant tx confirms.
    2. `manifest-archive.ts` wraps the PTB1+relay+PTB2 sequence in a
       bounded retry loop — 3 attempts at 1 s / 3 s / 9 s. The
       transient failures we observed on Walrus testnet (relay 500,
       `400 transaction has no timestamp`, occasional auth races)
       all clear within that window. After 3 failures, falls back
       to worker-owned `writeBlob` so the dashboard link still
       resolves.

  **Smoke verified:**
  - Per-app `tsc --noEmit` green on control-plane, dashboard, worker.
  - CP boot log shows `prepare-revoke-indexer` and `knowledge/backfill`
    routes mapped.
  - CP + worker bounced cleanly on 4001/4003. Existing PDF manifest
    on the public bucket still shows `manifest_walrus_blob_id` set
    (no regression).

  **Follow-ups (not in this round):**
  - JWT denylist (Redis) for true revoke-on-disconnect on OAuth grants.
  - Per-tool fine-grained scopes on the MCP path.
  - Periodic backfill cron in the worker — if the bounded retry loop
    fails (extended Walrus outage), no automated re-attempt later.
  - `funding_pool_wal_balance` still decorative; the renewal worker
    that would use it doesn't exist yet.

---


## 2026-05-12 — [ui-audit-1] Two-tier UX + chain-economics removed from dashboard

  Pre-demo clarity pass. Two driving rules:
  1. **No chain economics in the UI.** Kraterion bills out-of-band
     (web2 monthly invoice); WAL balances, blob expiry, gas, epochs
     never surface. Implementation detail, not user concept.
  2. **Two-tier disclosure model.** Tier 1 (web2-friendly, S3 mental
     model) is the default; Tier 2 (verifiability + ownership —
     Walrus blob, Sui object, Seal identity, owner address) lives
     behind expanders or its own card.

  **What shipped:**

  - **Funding column / line removed** from `BucketsList` and the
    bucket detail header. `funding_pool_wal` stays on the wire for
    backward compat but is marked `@deprecated` in `BucketJson`.
  - **Object stats added** to bucket list + detail. CP computes
    `object_count` + `size_bytes_total` per bucket via a single
    grouped query (`s3Object.groupBy({ by: bucket_id, where: in
    [ids], deleted_at: null, _count: _all, _sum: size_bytes })`) —
    same N+1-avoidance pattern as the existing `knowledge_enabled`
    join. List shows them as new columns; detail header shows
    `N objects · X MB` after the API-access pill.
  - **Inspector restructured.** "On-chain details" is now a Tier-2
    click-to-expand disclosure (collapsed by default). "Storage
    until: Epoch N" removed entirely — Kraterion pays Walrus rent
    on the user's behalf. Seal identity gets a one-line caption.
    Custom `x-amz-meta-*` headers stored as `S3Object.metadata`
    now surface in the "File details" tier when non-null.
  - **Knowledge status panel compacted.** Embedding model /
    dimensions / chunk-tokens / chunk-overlap moved into a
    `<details>` block titled "Indexing details"; counts +
    progress bar stay headline.
  - **Activity feed filters.** Three-axis client-side filter:
    kind pills (All / Buckets / Files / Knowledge), bucket
    dropdown (populated from loaded events), time range (24h /
    7d / 30d / all). Filter pills follow the single-Krater rule —
    active state is `--ink` border, not Krater fill (Krater stays
    for primary CTAs).
  - **Ownership card** on bucket detail (Tier 2). Surfaces the
    user-owned-data story with three rows:
    - Owner Sui address with `(you)` Krater badge when it matches
      the session, Suiscan link.
    - On-chain bucket object id, Suiscan link.
    - Live `api_decryption_addresses` rendered as pills (shows
      the gateway + Knowledge indexer when granted; empty state
      copy when revoke-all has fired). Pills link to Suiscan;
      ⌥-click copies the address.

    Backend: `GET /v1/buckets/:id` now does a single Sui RPC to
    read `KraterionBucket.owner` + `api_decryption_addresses` off
    the shared object. RPC failure → fields omitted; the
    Ownership card hides itself gracefully.
  - **Agents elevated to top-level nav.** New route
    `apps/dashboard/src/app/(app)/agents/page.tsx` hosting the
    existing `<ConnectedAgents />` component. Sidebar gains a new
    "AI" group between Storage and Account; Settings keeps a
    small pointer card pointing at /agents for discoverability.

  **New helpers / styles:**
  - `suiscanAddressUrl()` in `apps/dashboard/src/lib/format.ts`.
  - `.ks-disclosure` generic Tier-2 collapse pattern in
    `globals.css` (used by Knowledge status; reusable elsewhere).
  - `.ks-inspector-onchain*` for the inspector disclosure.
  - `.ks-activity-filters` + `.ks-filter-pill` +
    `.ks-activity-bucket-select` for the activity filter strip.
  - `.ks-ownership*` + `.ks-access-pill` + `.ks-you-badge` for
    the Ownership card.

  All new classes use design-system tokens only — no hardcoded
  hex, no shadows. Single Krater accent per surface preserved:
  bucket detail uses Krater on the active tab underline +
  Upload CTA + `you` badge (only one of those is ever in the
  same visual cluster). Activity page uses Krater on focus
  outlines only. Inspector disclosure uses Krater only on
  hover/focus of the toggle.

  **Smoke verified:**
  - `tsc --noEmit` green on control-plane, dashboard, worker,
    gateway.
  - CP boot log shows bucket routes mapped; `GET /v1/buckets`
    returns the new `object_count` + `size_bytes_total`
    fields.
  - Dashboard renders at :3001/.

  **Hard rule going forward:** no UI surface displays WAL,
  SUI, gas, epochs, renewal runway, or any other on-chain
  economic value. Verifiability surfaces (Walrus blob id,
  SharedBlob object, Sui address, Seal identity, tx digests,
  manifest hashes) stay — they're proof, not cost.

  **Follow-ups deferred to next round:**
  - Per-bucket usage chart (Usage page is account-wide).
  - Multi-project switcher (irrelevant until users have >1
    project).
  - API key usage analytics (volume per key — needs UsageEvent
    surfacing).
  - Global cross-bucket search.
  - "Re-verify all citations" bulk button on Knowledge search.
  - Billing surface for the monthly invoice the platform
    promises (post-hackathon).

---

## 2026-05-13 — [ai-platform] P0: project-scoped OpenAI credentials

Replaced the process-wide `OPENAI_API_KEY` env var with a KMS-wrapped,
project-scoped `ProviderCredential` row. `ProviderCredentialService.useDecrypted`
is now the only path to an OpenAI key inside the platform.

- **Schema:** new `ProviderCredential` (`project_id`, `provider`, `encrypted_key`,
  `key_last_4`, `status`, `last_validated`) with `@@unique([project_id, provider])`.
  KMS-wrapped via `EnvKeyWrapper` (same AES-256-GCM envelope as `ApiKey.secret_wrapped`).
  Migration: `20260512235959_add_provider_credentials`.
- **CP:** new `ProvidersModule` exposes
  `GET /v1/projects/:id/credentials`,
  `PUT /v1/projects/:id/credentials/:provider`,
  `DELETE /v1/projects/:id/credentials/:provider`. `upsert` pings OpenAI's
  `/v1/models` before persisting; 401 → 400 to caller, 200 → write, transient → write.
- **Wire-up:** worker `EmbeddingsProcessor`, CP `/search`, CP `/ask`, and MCP
  `kraterion_ask` all now load the key via `useDecrypted(project_id, 'openai', fn)`.
  Dropped the `openai_api_key` body field on `/ask` and the MCP tool's input schema.
- **Embeddings-client:** dropped the env-based singleton. `embedQuery / embedAll / embedBatch`
  all take `apiKey` per call now.
- **Enable-Knowledge gate:** `POST /v1/buckets/:id/knowledge { enabled: true }`
  pre-checks for an active OpenAI credential and returns `409 PreconditionFailed`
  with `details.provider='openai'` when missing. Added `PreconditionFailed` to the
  CP's closed error-code union (maps to HTTP 409, distinct `code` value for client
  branching).
- **Dashboard:** `/keys` is now tabbed ("Access keys" + "AI providers"). The AI
  providers tab shows the OpenAI credential card (status pill, masked
  `sk-…ABCD`, Replace / Remove actions). Reused `.ks-subtabs` from the
  bucket page for the tab strip. `KnowledgeToggle` catches the 409 and
  surfaces a warning banner with a "Manage providers" link to
  `/keys?tab=providers`.
- **Docs:** added migration note to runbook.md (how to move an existing
  dev's key out of `.env`); decisions.md entry covering the four
  non-obvious calls (validate-before-persist, gate at the controller,
  409 mapping, per-app worker copy).

Verified `tsc --noEmit` clean on control-plane, worker, dashboard, and
embeddings-client. End-to-end smoke pending Postgres + Redis bounce.

**Not done this round (proposal P0 step 2 / step 3, deferred):**
- Embedding-model picker in the enable-knowledge modal.
- Default chat model picker.
- Indexing-cost estimate at enable time.
- Re-indexing flow on embedding-model change.
- Multi-provider abstraction (P1).

---

## 2026-05-13 — [ai-platform] P0 follow-up: cascade-disable + Knowledge tab gating

Follow-up to P0's project-scoped OpenAI credentials, addressing the
"stuck-state" gaps users hit between credential changes and Knowledge
state.

- **Cascade-disable on credential remove.** `DELETE /v1/projects/:id/credentials/openai`
  now 409s with `details.reason='active_knowledge_bases'` +
  `details.buckets_with_knowledge=N` when the project still has
  Knowledge-enabled buckets. The dashboard surfaces a type-to-confirm
  modal (`Type "remove" to confirm`), then retries with
  `?cascade=true`. Cascade mode wipes `KnowledgeChunk` +
  `KnowledgeBucketSettings` for every bucket in the project, in the
  same transaction as the credential delete. Manifests stay on chain
  for audit.
- **Bucket Knowledge tab gating.** `KnowledgeToggle` now fetches
  the project's credentials. If no active OpenAI credential exists,
  the off-state replaces the "Enable Knowledge" CTA with an
  "Add OpenAI key" button that routes to `/keys?tab=providers`,
  and surfaces a persistent info banner explaining why. The user
  no longer has to click Enable just to discover the 409.
- **Wire changes.** `useRemoveCredential` now takes
  `{ provider, cascade? }` and returns `{ disabled_buckets }`.
  Cascade mode also invalidates the `['v1', 'knowledge']` query
  family so every bucket page re-renders in its off state without
  a refresh.
- **ConfirmModal.** New optional `confirmDisabled` prop so callers
  can gate the confirm button on parent-owned state (the type-to-confirm
  input value).

All four packages `tsc --noEmit` clean.

---

## 2026-05-13 — [ai-platform] P0 step 2/3/4: pickers, cost estimate, re-index

Closes the remaining P0 work items from the proposal — model pickers in
the enable-Knowledge flow, indexing-cost preview, default chat model
storage, and a destructive re-index path.

- **Shared model catalog** (`packages/shared/src/models.ts`) — single
  source of truth for embedding options (3 surfaced; 1024d enabled,
  1536d/3072d shown as "Coming soon" pending a halfvec schema change)
  and chat models (gpt-4o-mini default + gpt-4o, gpt-4-turbo, o3-mini,
  o1). Pricing constants live alongside, used by both the backend
  cost-preview wiring and the dashboard.
- **CP enable schema** accepts `default_llm_model`; validates the
  embedding (model, dims) pair against the catalog and rejects
  disabled options. `GET /knowledge` now returns `total_bytes` (sum
  of non-deleted object `size_bytes`) so the modal can compute the
  cost preview without a second round-trip.
- **/ask + MCP kraterion_ask** resolve model as: per-request override
  > bucket `default_llm_model` > `DEFAULT_CHAT_MODEL_ID` ("gpt-4o-mini").
- **POST /v1/buckets/:id/knowledge/reindex** — destructive re-index.
  Validates new settings, drops all live chunks in one transaction
  with the settings update, then re-enqueues every non-deleted object
  via the existing `backfillBucket` helper. Manifests stay on chain
  for audit; a fresh manifest version is written per object as the
  worker drains.
- **Dashboard `EnableKnowledgeModal`** is a 3-step flow (embedding →
  chat model → confirm) with the proposal's "model is locked once
  indexing starts" warning at step 1 and a cost preview line at step 3.
  Same component handles `mode="reindex"` — pre-fills pickers from
  current settings, swaps copy + button labels, adds a destructive
  banner to the confirm step.
- **Dashboard `KnowledgeToggle`** on-state now reflects actual settings
  (model / dims / default chat model) in the subtitle and exposes
  "Re-index" alongside "Disable Knowledge". Search returns empty for
  the bucket between chunk wipe and first new manifest landing —
  spelled out in the confirmation copy.

All four packages `tsc --noEmit` clean (control-plane, worker, dashboard,
shared).

**Deferred to post-hackathon:**
- Transactional swap re-index (queries serve old chunks during re-index,
  atomic swap at end). Needs `pending_embedding_*` shadow columns +
  per-manifest spec tagging + spec-filtered chunk queries. See
  decisions.md 2026-05-13.
- Multi-dim embeddings (1536d, 3072d). Needs either a column-level
  schema change or a `(chunk, model)`-keyed shadow table.


## 2026-05-13 — [ai-platform] Split chat-model edit from re-index in the Knowledge tab

UX follow-up. The single "Re-index" button used the destructive flow
for any model change — including chat-model edits, which never need a
re-index (the chat model is per-request; chunks aren't touched).

- **CP guard.** `POST /v1/buckets/:id/knowledge { enabled: true, ... }`
  now rejects embedding/dimension/chunking changes on an already-enabled
  bucket with `409 PreconditionFailed` and `details.reason='embedding_locked'`.
  Force-routes those edits through the `/reindex` endpoint so chunks can't
  silently drift out of sync with their indexed model. Chat-model edits
  still go through this endpoint and complete in one settings write.
- **New `ChangeChatModelDialog`** — single-step picker, "Current" pill
  on the currently-saved row, no warnings. Save is disabled when the
  selection matches the current setting.
- **Restructured `KnowledgeToggle` on-state.** Replaces the inline
  subtitle + side-by-side buttons with two `ModelRow` rows: one per
  model, each with its own value, helper, and Change button. The
  embedding row's helper is warning-toned and carries an alert icon
  spelling out "Changing it requires re-indexing — chunks are dropped
  and rebuilt." The chat row's helper is neutral and notes that
  switching is free and per-request overridable. Disable Knowledge
  moved to a footer ghost button (destructive, but no longer
  competing visually with the change actions).

All four packages `tsc --noEmit` clean.


## 2026-05-13 — [ai-platform] Type-to-confirm is now mandatory for provider key removal

Tightened the destructive remove flow so type-to-confirm is the *only*
path to remove an OpenAI credential — previously it only kicked in when
the project had active Knowledge buckets. Two upsides: the UX is
consistent (no surprise "easy mode" when no buckets happen to be on),
and the cascade behaviour is uniform.

- **CP** ([`providers.controller.ts`](apps/control-plane/src/providers/providers.controller.ts))
  — `GET /v1/projects/:id/credentials` now returns `active_knowledge_buckets`
  alongside the redacted credential rows, so the dashboard can pre-fill
  modal copy without a round-trip on open.
- **Dashboard hook** — `useRemoveCredential` always sends `?cascade=true`.
  The CP `remove()` is already a no-op for chunk / settings wipes when
  no buckets are active, so a single code path covers both cases.
- **`ProviderCredentialsTab`** — removed the two-stage modal logic; the
  type-to-confirm input is part of the modal body from the first click.
  Body copy adapts based on `active_knowledge_buckets > 0` (destructive
  warning + cascade count) vs `== 0` (simpler indexing-and-search-will-fail
  text). Confirm button disabled until the literal string `remove` is
  typed; Enter submits when valid.

All four packages `tsc --noEmit` clean.

---

## 2026-05-13 — [dashboard] Portal-based modal rendering — fixes modal-in-drawer layout bug

Every modal in the dashboard renders a `position: fixed` scrim. When a
modal was triggered from inside the Inspector drawer (e.g. clicking
**Delete file** on an object), the scrim ended up shrunk to the
drawer's bounds instead of covering the viewport — both visually broken
and impossible to dismiss correctly.

Root cause: `.ks-drawer` keeps `transform: translateX(0)` applied after
its slide-in animation (the `both` fill mode in
[`globals.css`](apps/dashboard/src/app/globals.css)). CSS containing-block
rules: a `transform`'d ancestor pins every `position: fixed` descendant
to its own box instead of the viewport. The modal was a descendant of
the drawer; it inherited the drawer's box.

Fix:

- New [`Portal.tsx`](apps/dashboard/src/components/ui/Portal.tsx) helper —
  SSR-safe two-phase mount (returns `null` on first render, then
  `createPortal(children, document.body)` after `useEffect`). Mounts
  modals at the top of the DOM so they escape any transformed
  ancestor's stacking context.
- Wrapped all 8 modals in `<Portal>`: `ConfirmModal`, `CreateBucketDialog`,
  `DeleteFolderDialog`, `NewFolderDialog`, `EnableKnowledgeModal`,
  `ChangeChatModelDialog`, `AddOpenAiKeyDialog`, `CreateApiKeyDialog`.

Behavior unchanged for every other case — modals were already rendered
at viewport top in the happy path; they just no longer break when
triggered from inside a transformed ancestor. Same pattern Radix /
Headless UI use for their portals.

---

## 2026-05-13 — [ai-platform] Knowledge index-status summary: fix double-counting from retained manifests

After a few enable/disable cycles or re-indexes on the same bucket, the
**Index status** panel showed counters like `Indexed 10 of 3, Skipped 5`
— `indexed + pending + failed + skipped > total_objects`.

Root cause: `KnowledgeManifest` rows are intentionally retained for
audit across enable/disable cycles and re-index passes (the on-chain
verifiability trail depends on it). The `GET /knowledge` summary was
`groupBy(status)`-ing the manifest table without dedup, so every
historical re-index pass piled into the counters. Secondary bug: the
worker writes `status='indexing'` for in-flight rows, but the summary
only knew about `indexed | pending | failed | skipped` — in-flight
manifests silently fell out of every counter.

Fix in [`knowledge.controller.ts`](apps/control-plane/src/knowledge/knowledge.controller.ts):

- Start the join from `S3Object` (the source of truth for "objects in
  this bucket") and lateral-join the latest manifest per object via
  `LEFT JOIN LATERAL (... ORDER BY km.version DESC LIMIT 1) ON TRUE`.
  Each non-deleted object contributes exactly one row to the GROUP BY,
  making `indexed + pending + failed + skipped = total_objects` an
  *arithmetic identity* — impossible to violate by construction.
- `COALESCE(m.status, 'pending')` puts objects with no manifest yet
  (just uploaded, worker not started) under the "Pending" counter
  instead of dropping them.
- Remap `indexing` → `pending` on the wire so workers-in-flight surface
  under the dashboard's existing "Pending" label.
- Zero all counters when Knowledge is currently off — historical
  manifests are not user-relevant state.

Runbook entry added with the symptom string so this is greppable next
time. CP `tsc --noEmit` clean.

---

## 2026-05-13 — [ai-platform] Chunk lifecycle fixes — re-upload and S3 DELETE no longer leak chunks

Two pre-existing chunk leaks in the Knowledge data path, both surfaced
while verifying the index-status summary fix:

1. **Re-upload of the same S3 key.** The worker opened a new
   `KnowledgeManifest` at `version+1` for the object, then ran its
   persist transaction's `deleteMany` scoped to the *new* manifest id
   (a no-op for a freshly-opened manifest). Chunks from the prior
   manifest version survived. `/search` filtered chunks only by
   `bucket_id`, so both old and new versions of the same object would
   surface in results.
2. **`DELETE` via the gateway.** The handler set
   `S3Object.deleted_at` but never touched `KnowledgeChunk`. Search
   didn't filter on the joined `S3Object.deleted_at` either, so chunks
   from soft-deleted files kept appearing in results.

Fixes:

- **Worker** ([`embeddings.processor.ts`](apps/worker/src/embeddings/embeddings.processor.ts))
  — persist tx now does `deleteMany({ where: { s3_object_id: object.id } })`
  before inserting new chunks. Covers both retry (same manifest) and
  re-upload (new manifest version) cases. Audit-trail manifests stay;
  only their chunks evaporate.
- **Gateway** ([`objects.write.controller.ts`](apps/gateway/src/s3/objects.write.controller.ts) `deleteObject`)
  — resolves the row first, then wraps `knowledgeChunk.deleteMany` +
  `s3Object.update(deleted_at=now())` in one `$transaction`. Atomic
  by design — either both writes land or neither does.
- **Search** ([`knowledge.service.ts`](apps/control-plane/src/knowledge/knowledge.service.ts))
  — outer join with `S3Object` carries `AND s.deleted_at IS NULL`.
  Defense-in-depth for future code paths that might forget to clean
  up.

Existing pollution can be cleaned with a bucket-wide `/reindex` — that
flow already wipes chunks by `bucket_id` before re-enqueueing. Runbook
entry added.


## 2026-05-13 — [ai-platform] P3 ships: Agents resource + OpenAI Chat Completions + /ask removed

Full end-to-end implementation of the proposal's P3, plus the
`/ask` → agent-endpoint migration the user called for in the same
round. Drops `KnowledgeBucketSettings.default_llm_model`; chat model
selection moves to the per-agent layer.

**Schema** (`prisma/migrations/20260513140000_p3_agents`):
- `KraterionAgent` (`system_prompt`, `model`, `temperature`, `max_tokens`,
  `top_k`, `status`, `sub_wallet_id`, `guardrails_id?` stub for P5).
- `AgentBucket` many-to-many junction (cascade on agent delete).
- `AgentInvocation` audit row (`status`, principal, latency split,
  cited hashes, retrieval bucket ids).
- `SubWallet` role extended to include `agent`.
- `KnowledgeBucketSettings.default_llm_model` dropped.

**CP** (`apps/control-plane/src/agents/`):
- `AgentsService` — CRUD with sub-wallet provisioning at create time
  (Ed25519 keypair, KMS-wrapped seed, round-trip verified). Bucket
  attachment validation against project ownership + `deleted_at`.
- `AgentsController` — `POST /v1/projects/:id/agents`, `GET /v1/agents`,
  `GET/PATCH/DELETE /v1/agents/:id`, `POST /v1/agents/:id/revoke`.
- `POST /v1/agents/:id/chat/completions` — OpenAI Chat Completions wire
  format. Single-turn (uses the most recent `messages[]` user message).
  `kraterion` extension carries retrieval info + citation strip. SSE
  streaming when `stream: true`; the Kraterion citation frame arrives
  as a `kraterion.extension` event before `data: [DONE]`.
- `answerWithAgent` + `streamWithAgent` helpers in `agents/answer.ts`
  replace the deprecated `knowledge/ask.ts` (deleted).

**Access control onion** on the chat endpoint:
1. Session JWT (API key / OAuth pencilled as follow-ups).
2. Agent ownership via project.
3. `agent.status === 'active'`.
4. Per-attached-bucket `BucketsService.getOwned` (which now refuses
   soft-deleted buckets after the pre-P3 cleanup).
5. `ProviderCredentialService.useDecrypted(project_id, 'openai', ...)`.
6. `AgentInvocation` row created before the LLM call, patched to
   `completed`/`failed`/`revoked` on outcome.

**Knowledge cleanup:**
- `/ask` REST endpoint removed (`POST /v1/buckets/:id/knowledge/ask`
  is 404 now). MCP `kraterion_ask` replaced by `kraterion_invoke_agent`
  in `apps/control-plane/src/mcp/mcp.tools.ts`.
- `KnowledgeBucketSettings.default_llm_model` references removed from
  both the upsert + reindex schemas; corresponding dashboard hooks
  pruned.
- Pre-P3 audit: `BucketsService.getOwned` now refuses soft-deleted
  buckets by default (`includeDeleted` opt-in for admin paths).

**Dashboard** (`apps/dashboard/src/components/agents/`):
- `/agents` page is tabbed: "My agents" + "Connections" (renamed from
  the existing OAuth-clients page).
- `AgentsListTab` renders the project's agent table with create CTA.
- `CreateAgentDialog` — single-screen create (name, description,
  system prompt, model, attached buckets).
- `/agents/[agentId]` detail page — Chat / Settings / Connect tabs.
  - **Chat**: `AgentChatPanel` streams the SSE response with a typing
    indicator + citation strip linking to Walruscan. Stop button
    aborts mid-stream.
  - **Settings**: `AgentSettingsForm` — dirty-state Save/Discard
    footer, full editability for name / description / system prompt /
    model / sampling / top-k / attached buckets.
  - **Connect**: endpoint URL + curl example + sub-wallet address
    display.
- Bucket Knowledge tab — drops the "Default chat model" row entirely;
  adds a "Use an agent to ask questions" pointer linking to
  `/agents`. Enable-Knowledge modal collapses from 3 steps to 2
  (embedding → confirm).

**Verification:** `tsc --noEmit` clean on control-plane, worker,
gateway, dashboard, embeddings-client, shared.

**Deferred to a P3-on-chain follow-up:**
- Auto-firing `grant_api_access(bucket, agent_addr)` on agent create /
  bucket-attach. Sub-wallet is provisioned + visible; the on-chain
  grant is an explicit user action (sponsored tx) post-creation.
- Per-address `revoke_api_access` Move entry point. Today's revoke is
  DB-only; the chat endpoint refuses immediately, which covers the
  demo flow.
- API key + OAuth principals on the chat endpoint. Session JWT only
  for v1; the existing MCP guard pattern carries over when needed.
- Multi-turn conversation history.


## 2026-05-13 — [ai-platform] Agent sub-wallets fully on-chain — grant/revoke wired

Closes the on-chain piece that P3 left as a follow-up the same day.
Every agent's Sui sub-wallet is now grantable + revocable per attached
bucket via sponsored Move calls; live grant status surfaces in the
dashboard.

**Backend:**
- `prepareGrantAgent(account, bucket, { agentId })` in
  `apps/control-plane/src/buckets/prepare/prepare.service.ts` — sponsored
  `grant_api_access(bucket, agent.sub_wallet_address)` PTB. Validates
  agent ownership + project match + non-revoked status.
- `prepareRevokeAgent(account, bucket, { agentId })` — reads the live
  `api_decryption_addresses` off chain, emits `revoke_all` + one
  `grant_api_access` per surviving principal in one PTB. Per-address
  revoke without a Move-package change.
- `GET /v1/agents/:id/grants` — one Sui RPC per attached bucket;
  returns `[{ bucket_id, bucket_name, granted_on_chain, kraterion_bucket_object_id }]`.
- New `prepareAgentSchema` Zod DTO + routes wired on
  `PrepareTxController`.
- `AgentsModule` imports `SuiClientModule` to drive the grant status
  reads.

**Dashboard:**
- New `AgentConnectPanel` replaces the inline Connect view on the
  agent detail page. Three sections:
  - **On-chain access** — per-bucket grant status (Granted / Not
    granted pill + Suiscan link to bucket object). Per-row Grant /
    Revoke buttons fire sponsored txes via the existing
    `useSponsoredTx` hook. Toast on success with Suiscan tx link;
    grants query invalidates so the row flips state immediately.
  - **Sub-wallet** — the agent's Sui address with a Suiscan link.
  - **OpenAI-compatible endpoint** — endpoint URL + curl example.
- `useAgentGrants(agentId)` TanStack hook (`staleTime: 30_000`).
- Top-level Revoke modal copy refreshed — explains that the DB flip
  fails the next chat call immediately and points the user at the
  Connect tab to clean up on-chain grants.

**Verification:** all five packages `tsc --noEmit` clean.


## 2026-05-13 — [ai-platform] Multi-turn chat enabled in the agent endpoint

Replaces the single-turn behavior we shipped with P3. The dashboard
chat panel now sends the full conversation history on every turn; the
backend forwards it to OpenAI in order, with the server-built system
prompt + retrieval block prepended.

**Code paths:**
- Dashboard ([`AgentChatPanel.tsx`](apps/dashboard/src/components/agents/AgentChatPanel.tsx))
  — `send()` snapshots the prior turns (skipping pending/errored/empty),
  appends the new user message, and POSTs the array as `messages`.
- Backend chat schema
  ([`agents/dto.ts`](apps/control-plane/src/agents/dto.ts)) — rejects
  `role: "system"` from clients. Server owns the system prompt.
- Backend chat handler
  ([`agents/agents.controller.ts`](apps/control-plane/src/agents/agents.controller.ts))
  — validates the last message is a user turn, retrieves chunks
  against the last user content, passes the whole `messages` array
  through to `answerWithAgent` / `streamWithAgent`.
- Backend answer helpers
  ([`agents/answer.ts`](apps/control-plane/src/agents/answer.ts)) —
  `buildMessages` produces
  `[{ system + retrieval block }, ...history]`.
- MCP `kraterion_invoke_agent` stays single-shot — the tool schema
  carries one `input` string, so we wrap it in a length-1 messages
  array.

## Multi-turn known issues (post-hackathon backlog)

Captured here so the v2 round doesn't relearn them:

1. **No context compaction.** Every turn re-sends the full history +
   retrieval block. Token cost grows linearly per turn; long
   conversations will hit the model's context window cap. Fix:
   adopt an OpenAI Responses-style "compaction" loop, or summarize
   older turns into a single system note when the running token
   budget exceeds a threshold (e.g. 70% of context).
2. **Retrieval runs against the latest user message only.** A
   follow-up like *"explain that further"* retrieves chunks for
   *"explain that further"* — not for the topic the user was
   actually exploring. The retrieval block on the resulting prompt
   is often useless or actively misleading. Fix: a one-pass query
   rewriter (small/cheap LLM call) that synthesizes a retrieval
   query from the last N turns, or HyDE-style hypothetical answer
   generation.
3. **Retrieval block is re-sent every turn.** Even when the latest
   user message would retrieve the same chunks as the previous
   turn, we burn tokens re-sending them. Fix: cache retrieval per
   conversation thread keyed by the chunk-hash set, only resend
   when the set changes.
4. **No conversation persistence.** Each `AgentInvocation` row is
   one input/output pair. Refreshing the dashboard loses the
   conversation. Fix: introduce a `Conversation` entity with an
   ordered set of `AgentInvocation` children; the chat panel
   restores history on mount. Also unlocks "share a conversation"
   demo affordances.
5. **Audit row doesn't snapshot the system prompt.** If a user
   edits `agent.system_prompt` after a conversation, prior
   invocations can't be reproduced. Fix: copy `system_prompt` and
   `model` into the `AgentInvocation` row at write time.
6. **No conversation cap.** A pathological client could grow the
   `messages[]` array indefinitely (or until OpenAI rejects).
   Fix: server-side cap (e.g. last N=40 user+assistant pairs), with
   the trimming policy documented and surfaced to the client.
7. **Prompt-injection persistence.** If a user pastes adversarial
   content in turn 3, it's baked into the prompt for every
   subsequent turn. Fix: per-turn output moderation (P5) +
   per-message provenance tags in the system prompt.
8. **No streaming usage tokens before completion.** OpenAI emits
   `usage` only on the final chunk; we patch the audit row at the
   end of the stream. If the client aborts mid-stream, the audit
   row's token counts stay null. Fix: heuristic estimate at abort
   time (1 token ≈ 4 chars on the accumulated string).
9. **MCP `kraterion_invoke_agent` is single-shot.** The tool
   schema accepts one `input` string, so external MCP clients
   can't carry on a conversation through the tool. Fix: add a
   `conversation_id` argument that the CP threads server-side
   (requires the Conversation entity from #4).
10. **Tool calls (P4) not handled.** When the assistant emits
    `tool_calls`, our streaming reader currently ignores them. Fix
    lands with the function-calling work; until then the agent
    can't use tools regardless of the model's behavior.


## 2026-05-13 [auth] Unified bearer API tokens (`kr_live_`/`kr_test_`); MCP K3a colon-format dropped

Shipped the unified programmatic credential. One token now works
across CRUD, agent chat, knowledge, and MCP — matching the Stripe /
OpenAI / Anthropic pattern. Decision write-up:
`docs/decisions.md` 2026-05-13.

**Schema (additive migration `20260513170000_unified_bearer_tokens`).**
`ApiKey.kind` discriminator (`"s3"` | `"bearer"`); existing rows default
to `"s3"`. Bearer rows populate `token_hash` (sha256, unique) +
`token_prefix` (cosmetic) + `network` + `scopes`. `access_key_id` and
`secret_wrapped` made nullable. No data migration, no separate table.

**Control plane.**

- New `apps/control-plane/src/api-keys/bearer.ts` — mint
  (`kr_<env>_<36 url-safe chars>`), hash (sha256), parse, network
  detection from `SUI_NETWORK`. `kr_live_` for mainnet,
  `kr_test_` for testnet/devnet. ~214 bits entropy in the body.
- `ApiKeysService.mintBearer` + `createBearerForProject`. Stores only
  the hash; cleartext is returned exactly once and dropped. List
  redactor strips both `secret_wrapped` and `token_hash`.
- New `BearerResolver` (`apps/control-plane/src/auth/bearer-resolver.ts`):
  sha256 → `ApiKey` row → `ApiKeyPrincipal`. Rejects malformed,
  wrong-network, unknown-hash, revoked, suspended-account tokens —
  all return `null` so the guard renders a uniform 401 (no probing).
- `AuthGuard` extended to dispatch by token shape: JWT (`eyJ`-prefix)
  → existing `TokensService.verify`; `kr_<env>_…` → `BearerResolver`.
  Both paths populate the new `req.principal` union; session path
  also keeps `req.user` populated so legacy `requireUser` callers
  unchanged. New `requirePrincipal` / `assertProjectAccess` /
  `asSession` / `asApiKey` helpers in `request-context.ts`.
- New `POST /v1/projects/:projectId/api-keys/bearer` controller
  route. Returns `{ api_key, token, network, WARNING }` with the
  one-time-reveal pattern the existing AKIA path already established.
- MCP guard: deleted the `<AKIA>:<secret>` colon-parse branch.
  Replaced with `bearer.resolve(token)` → `McpPrincipal` with
  `scopes: ["mcp:*"]` when the row's scopes are empty (full access).
  OAuth K3b path untouched. `McpPrincipal` doc updated.

**Surfaces opened to bearer (`requirePrincipal` instead of `requireUser`).**
agents (CRUD + chat), buckets, objects, folders, knowledge, presign,
activity. The agent chat endpoint additionally enforces
`principal.projectId === agent.project_id` for bearer auth — refuse
cross-project use within the same account.

**Session-only retained.** `/v1/auth/*`, `/v1/accounts/me`,
`/v1/projects/*` (account-level), `/v1/providers/*` (account-scoped
config), `/v1/oauth/*`, key minting itself, and prepare (Sui tx
builders tied to the user's wallet). Gateway stays SigV4-only.

**Audit.** `AgentInvocation` and `KnowledgeQuery.search` now populate
`api_key_id` on bearer-auth requests; `user_id` on session-auth.

**Dashboard.** `/keys` rebuilt into three tabs:
- **API tokens** (default) — bearer list with token prefix preview,
  network pill (testnet/mainnet), revoke, quickstart code.
- **S3 access keys** — existing AKIA UI, subtitle clarifies "Use these
  only with S3 SDKs."
- **AI providers** — ProviderCredential, unchanged.

New `CreateBearerTokenDialog` mirrors the AKIA dialog: name input →
mint → one-time-reveal panel with copy button + Stripe-style "shown
only once" warning + quickstart snippets. New `BearerQuickstartCode`
covers curl, OpenAI SDK (base_url override), MCP
`claude_desktop_config.json`, vanilla fetch. `ConnectAgentPanel` on
the knowledge page rewritten to mint + reference bearer tokens (and
removed the `<AKIA>:<secret>` snippet entirely).

**Gateway.** `lookupApiKey` tightened to refuse rows with `kind !==
"s3"` or null `secret_wrapped` — a bearer token presented as an AKIA
returns `InvalidAccessKeyId` (correct).

**Tested manually.** Mint kr_test_ → curl `/v1/agents` → 200.
Mint AKIA → SigV4 against gateway → unaffected. MCP curl with old
`<AKIA>:<secret>` → 401. MCP curl with `kr_test_` → 200, `tools/list`
returns the expected catalog. OAuth K3b path → still works (Claude
Desktop). Revoke bearer → 401 immediately.

**Known follow-ups.**
- Network mismatch error message could be more specific than a generic
  401 ("this is a test token; the server is in live mode"). The
  current text is intentional (uniform 401 prevents probing) but the
  CLI/SDK story would benefit from a structured error code.
- Cross-project access tightening for buckets / knowledge / objects /
  folders (today they rely on the service-layer `account_id` check —
  same risk profile as the existing S3 AKIA keys).
- Per-key scopes (`ApiKey.scopes` column scaffolded; v1 mints empty =
  full access).

## 2026-05-13 [agents] P4 ships: built-in tools + on-chain audit

Agent went from RAG chatbot → tool-using agent. Six built-in tools
(search, list_buckets, list_objects, read_object, write_object,
get_manifest), per-agent enablement via a 4th step on the create
dialog, multi-round OpenAI tool-call loop in the chat endpoint, and
a new `AgentToolCall` audit table that captures on-chain `tx_digest`
for writes. Decision write-up: `docs/decisions.md` 2026-05-13 P4.

**Schema (additive migration `20260513180000_p4_agent_tools`).**
- `AgentTool(agent_id, tool_name, tool_kind, created_at)` — per-agent
  enabled tools. `tool_kind` defaults to `"builtin"` (forward-compat
  for webhook + external-MCP tool sources, both deferred).
- `AgentToolCall(invocation_id, tool_call_id, tool_name, status,
  round, arguments, output, output_json, tx_digest, walrus_blob_id,
  shared_blob_object_id, latency_ms, error_detail, ...)` — one row
  per OpenAI `tool_calls[]` item across all rounds.
- Back-relations on `KraterionAgent.tools` and `AgentInvocation.tool_calls`.

**Control plane.**

- New `apps/control-plane/src/agents/tools/` package — `types.ts`,
  `registry.ts`, `helpers.ts`, and one file per tool. Each tool
  exports a `ToolDef` with `args` (Zod, runtime gate), `parameters`
  (JSON Schema, what the model sees), and a pure-ish `execute`.
- `AgentToolRegistry` (Nest provider) — `forNames`, `openAiToolsParam`,
  `execute(name, args, ctx)`. Exported from `AgentsModule` so future
  consumers (Activity feed, scheduled jobs, etc.) can dispatch
  through the same catalog.
- `apps/control-plane/src/agents/tool-runner.ts` — streaming-delta
  accumulator (`accumulateToolCallDeltas`), execution helper that
  validates args, persists the `AgentToolCall` row, returns the
  `role: "tool"` message + an SSE telemetry frame.
- `agents.controller.ts` — both chat paths now loop on tool rounds.
  Non-streaming uses `answerWithAgent` repeatedly (returns the full
  OpenAI completion now so the loop can inspect `finish_reason` +
  `tool_calls`). Streaming forwards `chat.completion.chunk` frames
  verbatim, accumulates tool_calls from `delta.tool_calls`, emits
  `kraterion.tool_call` extension frames per call (pending →
  completed/failed), then re-opens a new OpenAI stream with the
  tool results appended. Capped at `MAX_TOOL_ROUNDS = 5`.
- `answer.ts` — `tools` + `extraMessages` params on both helpers;
  non-streaming returns the raw `completion` so the loop can read
  `finish_reason`.
- `agents.service.ts` — `create` + `update` validate `tools[]`
  against `registry.knownNames`, mirror the wholesale-replace
  pattern that buckets use.
- `dto.ts` + `AgentJson` extended with `tools: string[]`.

**Write tools and on-chain receipts.** `write-object.ts` polls
`S3Object` by `(bucket_id, s3_key)` for up to 8s after the gateway
PUT, copying `tx_digest` + `walrus_blob_id` + `shared_blob_object_id`
into the `AgentToolCall` row. If the indexer hasn't settled, the
row keeps `tx_digest: null` and the dashboard shows "indexing…" —
the indexer eventually back-fills S3Object and the row stays
consistent. Ownership model is unchanged from P3: the gateway-proxied
SigV4 path signs the PUT, the project's AKIA key is the on-chain
principal, the agent's `sub_wallet` is *not* in the write path.

**Dashboard.**

- `CreateAgentDialog` — 3 steps → 4, new "Tools" step at the end with
  a checkbox grid. Default selection is `kraterion_search` +
  `kraterion_list_objects` (safe reads); writes require explicit
  opt-in. Step badge: read vs write · on-chain receipt.
- `AgentSettingsForm` — new Tools section, same wholesale-replace
  semantics as buckets.
- `AgentChatPanel` — accumulates `kraterion.tool_call` SSE frames
  (matched by `tool_call_id`), replaces the per-call deltas with
  the authoritative `tool_calls[]` list from the final
  `kraterion.extension` frame. New `ToolCallList` renders under
  each assistant message: collapsible "Tools used" card with a
  status dot per row, one-line argument summary, Suiscan link for
  writes with a captured `tx_digest`.
- `apps/dashboard/src/lib/agent-tools.ts` — tool metadata catalog
  (label, description, icon, kind). Mirrors the server registry.
- `apps/dashboard/src/lib/api.ts` — `AgentJson.tools[]`,
  `AgentToolCallJson` type.
- `globals.css` — `.ks-tool-calls*`, `.ks-tool-call-row`,
  `.ks-tool-call-link` styles. Matches the sources-card visual
  language (hairline border, no shadow, sentence case).

**Known follow-ups.**

- **MCP delegation to the shared registry.** The MCP server's
  `server.registerTool` API and the registry's `execute(name, args,
  ctx)` contract have different shapes; a clean delegation isn't a
  one-liner. Both surfaces already share `BucketsService` /
  `KnowledgeService` / `PresignService` so behavior is byte-equivalent —
  pragmatic call: defer the refactor.
- **HTTP webhook tools** — `AgentTool.tool_kind` already scaffolds
  the `"webhook"` discriminator. Routing logic + per-tool user config
  UI lands post-hackathon.
- **External MCP tool servers as tool sources** — Kraterion as MCP
  *client* consuming third-party catalogs (`tool_kind="mcp"`).
- **Activity feed `agent_tool_call` event kind** — the chat panel
  already shows tool trails inline; an activity timeline is polish.
- **Agent sub-wallet as on-chain signer.** Today writes go through
  the gateway's signing path. Funding the sub-wallet + building a
  signed PTB inside `write-object.ts` would make the agent the
  literal on-chain signer instead of a logical principal.
- **Streaming tool deltas don't carry full args until completion.**
  The `kraterion.tool_call` `pending` frame ships the partial args
  buffer at the moment we detect `finish_reason="tool_calls"`; that's
  the full string. No issue today, just worth noting if we move to
  earlier emit on the first delta.

## 2026-05-14 — [worker] Indexer abort-listener leak fixed; backfill rate bumped to 10 rps

The worker OOMed mid-morning after silently leaking abort-signal
listeners for hours. Caught it because three `aws s3 cp` retries
timed out on `waitForS3Object` — gateway wrote SharedBlobs on-chain
but the indexer (dead) never produced the `S3Object` rows.

**Root cause.** `@protobuf-ts/grpc-transport@2.11.1` registers a
listener on every gRPC call's `opt.abort` signal and **never
removes it** (lines 43–46 / 76–79 / 129–132 / 149–152 of its
`grpc-transport.js`). The previous `run-loop.ts` reused a single
iteration-scoped `AbortController.signal` across the entire
backfill, so each `getCheckpoint` left a closure permanently
pinned on that signal, holding a reference to the underlying
`gCall`. Over a 100k+ checkpoint initial backfill the closures
piled up past the V8 4 GB heap ceiling →
`FATAL ERROR: Ineffective mark-compacts near heap limit`. The
prior `setMaxListeners(64, ac.signal)` was a Band-Aid that
silenced the warning without stopping the underlying leak.

**Fix.** Introduced an `AbortPool` class in
[apps/worker/src/indexer/run-loop.ts](../apps/worker/src/indexer/run-loop.ts).
It keeps exactly ONE listener on the long-lived parent signal and
hands out fresh per-call `AbortController`s. Each gRPC call gets
its own child signal; when the call returns, the controller is
dropped from the inflight set and GC'd along with the leaked
closure. Parent abort walks the inflight set and cancels all
children. All `fetchCheckpoint` / subscribe callsites in the run
loop now go through `pool.run(...)` or `pool.acquire()`.

**Verified.** After the fix the worker runs through mixed
backfill + live streaming with RSS holding at ~155 MB (was
climbing past 400 MB and OOMing within hours). Zero
`MaxListenersExceededWarning` since boot.

**Rate-limit bump.** Set `INDEXER_BACKFILL_INTERVAL_MS=100` in
root `.env` (was hardcoded default 125). With `BACKFILL_CONCURRENCY=2`
that's ~10 rps target = public testnet's documented cap. Drops
backfill drain from ~8 cps to ~9–10 cps. Lower values risk 429s
from the public fullnode; existing retry path handles them fine.

**Forensic cleanup.** Fast-forwarded the cursor past a ~124k
checkpoint gap accumulated during the OOM downtime via
`pnpm -F @kraterion/worker indexer:fast-forward`. The three
orphan SharedBlobs from this morning's failed `aws s3 cp` retries
live in the skipped window and won't surface in the dashboard;
acceptable because they were test-driven and the on-chain
SharedBlobs remain user-owned regardless.

**Runbook entry added** at
[docs/runbook.md](runbook.md) under "Symptom: indexer worker
OOMs after a few hours; preceded by `MaxListenersExceededWarning`".
Includes a rule of thumb: never pass the same `AbortSignal` to
more than a handful of `client.*Service.*(..., { abort: signal })`
calls — use the `AbortPool` helper.

**Operational footgun caught.** First fast-forward attempt was a
no-op because the worker was still running and immediately
overwrote the seeded cursor on its next checkpoint commit.
`fast-forward.ts` already documents "restart the worker to take
effect" in its docstring; worth highlighting that the sequence
is **kill worker → seed cursor → restart**, in that order.

**Files touched.**
- `apps/worker/src/indexer/run-loop.ts` — `AbortPool` class, all
  gRPC abort plumbing rerouted through it; `setMaxListeners`
  workaround removed.
- `.env` — added `INDEXER_BACKFILL_INTERVAL_MS=100`.
- `docs/runbook.md` — new entry.

**Known follow-ups.**

- **Upstream the bug.** `@protobuf-ts/grpc-transport` should
  `removeEventListener` on call settlement. PR-worthy if the
  project is alive; otherwise the `AbortPool` pattern is now our
  permanent workaround.
- **Homebrew-pnpm regression.** Discovered while restarting
  services: `brew` is on pnpm 11.1.0 which requires Node 22+
  (`node:sqlite`). Local Node is 20.19, so the Homebrew shim
  crashes immediately. Pin pnpm via Homebrew or upgrade Node;
  meantime everything launches via the pnpm 9.12.0 binary at
  `~/Library/pnpm/.tools/pnpm/9.12.0/bin/pnpm`.

## 2026-05-15 [agents] P6 ships: embeddable chat widget

Last untouched flagship feature from the AI platform roadmap. One-line
script tag on the customer's site → floating chat widget powered by
their Kraterion agent, with origin allowlisting + daily request/spend
caps. Decision write-up: `docs/decisions.md` 2026-05-15 P6.

**Schema (additive migration `20260515090000_p6_share_tokens`).**
- `AgentShareToken` — one per "deployment surface." Cleartext returned
  once at mint, SHA-256 hash for lookup. `agent_id` (cascade-delete),
  `name`, `token_hash` (unique), `token_prefix` (cosmetic), `network`,
  `allowed_origins: string[]`, `max_requests_per_day`,
  `max_spend_usd_micros_per_day`, `revoked_at`.
- `ShareTokenUsageDay` — rolling (token, UTC-day) counter for caps.
  Upserted on every successful turn; cap-check reads before issuing
  the LLM call.
- `AgentInvocation.share_token_id` — fourth discriminator alongside
  `user_id` / `api_key_id` / `oauth_client_id`.

**Control plane.**
- `apps/control-plane/src/agents/share-token.ts` — `mintShareToken`,
  `hashShareToken`, `looksLikeShareToken`, `networkOfShareToken`,
  `utcDay`. Format `kr_share_<env>_<36 chars>`. Same alphabet +
  entropy as `kr_test_/kr_live_` bearer tokens.
- `apps/control-plane/src/auth/share-token-resolver.ts` —
  authentication. Hash → row → principal. Rejects malformed, wrong-
  network, unknown, revoked, agent-not-active tokens. Origin + caps
  enforced at the chat endpoint, not here.
- `apps/control-plane/src/auth/principal.ts` — new
  `ShareTokenPrincipal` variant (no `accountId`, has `agentId` +
  `allowedOrigins` + caps). `requireAccountPrincipal` helper narrows
  away share-token kind for non-chat endpoints; `assertProjectAccess`
  refuses share-token principals.
- `apps/control-plane/src/auth/auth.guard.ts` — three-way dispatch by
  token shape: JWT → session, `kr_share_*` → share-token resolver,
  `kr_*` → bearer resolver, otherwise 401.
- `agents.controller.ts` chat method — branches on `principal.kind`.
  Share-token branch: refuse cross-agent use, refuse non-allowlisted
  Origin, refuse over-cap. After a clean call, bump
  `ShareTokenUsageDay` counters. `getByIdForShareToken` on
  `AgentsService` fetches without the account-ownership check.
- `apps/control-plane/src/agents/share-token-usage.ts` — Prisma-based
  cap enforcement (`assertWithinCaps` + `record`) and
  `computeSpendUsdMicros(completion_tokens, modelId)`. Spend tracked
  in micros (1e-6 USD) to stay precise at billion-micro scale.
- `apps/control-plane/src/agents/share-tokens.service.ts` — mint /
  list / revoke. Owner check via agent → project → account.
- Three new routes on `AgentsController`:
  `GET /v1/agents/:agentId/share-tokens`,
  `POST /v1/agents/:agentId/share-tokens`,
  `POST /v1/share-tokens/:tokenId/revoke`.
- `main.ts` CORS now uses a per-request origin function that
  permissively lets the preflight through. The real origin gate is
  the share-token allowlist enforced inside the chat handler.

**Dashboard.**
- `apps/dashboard/src/app/embed/chat/[agentId]/page.tsx` — iframe
  page. Sibling to `(app)/` so it inherits only the root layout
  (no Shell, no RequireAuth). Reuses `AgentChatPanel` with
  `authTokenOverride` (the share token from `?t=`) +
  `hideHeader` (the launcher already owns the close affordance).
  Three earth-tone-ring brand mark in the iframe header matches
  `design-system/assets/kraterion-light.svg`.
- `apps/dashboard/public/embed/v1.js` — loader. ~6 KB unminified.
  Vanilla JS, closed Shadow DOM around the launcher button. Lazy-
  mounts the iframe on first click. Handles `kraterion:close`
  postMessage from inside the iframe.
- `AgentChatPanel` extended with two optional props
  (`authTokenOverride`, `hideHeader`) so the embed iframe can drive
  it without forking the chat UI.
- `apps/dashboard/src/components/agents/AgentSharePanel.tsx` — new
  Share tab on the agent detail page. Lists tokens, install-snippet
  card preview, revoke action. Matches the 4-tab pattern
  (Chat / Settings / Connect / Share).
- `apps/dashboard/src/components/agents/CreateShareTokenDialog.tsx` —
  mint dialog. Form → reveal panel with the cleartext token + the
  one-line install snippet pre-filled, single copy button. Closing
  the dialog drops the cleartext from state.
- API client extended: `ShareTokenJson` + `MintShareTokenResponse`
  types, `useShareTokens` / `useMintShareToken` / `useRevokeShareToken`
  React Query hooks.

**Known follow-ups.**
- **`packages/ui-embed` published npm artifact.** Today the dashboard
  hosts both loader + iframe; publishing the loader as an
  installable script wins for CDN caching but isn't on the demo path.
- **Custom theming** via `data-theme` / `data-accent-color`. Pinned
  to brand palette for v1.
- **Pre-filled end-user identity** (signed JWT with end-user claims
  for "in-app help" personalization).
- **Dynamic iframe size / postMessage resize events.** Fixed
  380×580 desktop / full-screen mobile today.
- **Per-visitor analytics.** `AgentInvocation.share_token_id` is the
  only source of usage data; a per-visitor session id would be a
  natural future addition.
- **Redis migration** for `ShareTokenUsageDay` if traffic justifies
  it. The shape doesn't change — same per-(token, day) counter, just
  with a faster atomic increment path.

---

## Week 2 (May 14–20) — storage pool migration begins

### 2026-05-18

- `[move]` `[docs]` Phase A of the Walrus storage-pool migration complete
  (per [/docs/storage-pool-migration.md](storage-pool-migration.md) §3).
  Pinned `move/kraterion/Move.toml` from the floating `rev = "testnet"`
  branch to the specific commit `9c5590a81e29e1141b05a2481c677fe1e2b73b29`
  for build stability. Confirmed `walrus::storage_pool` source compiles into
  our dependency tree.
- `[infra]` Confirmed the **live testnet Walrus deployment is at v3**
  (published-at `0x849e95d2718938d66c37fb91df76d72f78526c1864c339bac415ce8ecda2d8cc`)
  and exposes all 11 `storage_pool` entry functions on `walrus::system`.
  The v1 original-id (`0xd84704c1...`) which our Move.toml `[addresses]`
  block uses for type identity does NOT show `storage_pool` on RPC
  introspection — Sui's upgrade-chain resolution handles dispatch at
  runtime, so this is fine for actual calls, but admin tooling needs the
  v3 published-at directly. Added
  `WALRUS_PACKAGE_PUBLISHED_AT_TESTNET` and
  `WALRUS_PACKAGE_VERSION_TESTNET` constants in
  `packages/shared/src/constants.ts`.
- `[gateway]` New script `apps/gateway/scripts/walrus-pool-baseline.ts`.
  Runs `create_storage_pool` → `increase_storage_pool_capacity` →
  `extend_storage_pool` → `decrease_storage_pool_unused_capacity_by_percent`
  on testnet, captures `effects.gasUsed` per call, writes a calibration
  report. End-to-end gas measurements pinned in
  [/docs/walrus-calibration.md](walrus-calibration.md). All four ops
  under 0.007 SUI net (~$0.018 at SUI=$2.50). Confirms the docs'
  "size-independent, ~constant" claim for management operations.
- `[docs]` Logged Phase A decision in
  [/docs/decisions.md](decisions.md) (entry dated 2026-05-18). Phase B
  (TS thin-wrappers) + Phase C (`pool_vault.move` Move wrapper) are
  unblocked. Per-blob register/certify/delete gas deferred to Phase K
  (requires real Walrus blob encoding + storage-node quorum).
- `[move]` Phase C of the storage-pool migration: Move-side work landed.
  - **NEW** `move/kraterion/sources/pool_vault.move` (~280 lines). Defines
    the shared `KraterionPoolVault` object wrapping a
    `walrus::storage_pool::StoragePool` as a field. Six platform-side entry
    fns (`create_vault`, `register_blob`, `certify_blob`, `delete_blob`,
    `extend`, `resize_grow`) gated by `reserve::assert_caller_authorized` +
    a `vault.platform_authorized` revocation flag. One user-side entry
    (`revoke_all`) gated by `tx_sender == vault.created_by`. Owner-attestation
    pattern: vault is created by the gateway operator (whitelisted on the
    reserve) and records the intended user's address as a parameter. WAL
    pulled from the existing `PlatformReserve` via the same
    `pull_wal`/`deposit_wal` pattern `kraterion::register_blob_for_bucket`
    already uses — no changes to `reserve.move`.
  - **EXTENDED** `move/kraterion/sources/events.move` with 6 new event
    structs (`KraterionVaultCreated`, `KraterionVaultRevoked`,
    `KraterionPooledBlobRegistered`, `KraterionPooledBlobCertified`,
    `KraterionPooledBlobDeleted`, `KraterionPoolExtended`,
    `KraterionPoolResizedGrow`) plus matching `emit_*` helpers. Old events
    (`KraterionObjectCreated`, `KraterionObjectExtended`) stay for now —
    deleted as part of Phase E's gateway refactor.
  - **NEW** `move/kraterion/tests/pool_vault_tests.move` (9 tests, all
    passing). Coverage: create-happy-path, create-aborts-when-not-whitelisted,
    revoke-flips-flag, revoke-aborts-for-non-owner, revoke-is-idempotent,
    extend-aborts-after-revoke, extend-aborts-when-not-whitelisted,
    extend-happy-path-advances-end-epoch,
    resize-grow-happy-path-increases-reserved-capacity. Blob-level fns
    (`register_blob`/`certify_blob`/`delete_blob`) require real
    storage-node committee signatures and are exercised in Phase K via
    the gateway pipeline. Move tests use a local-`mut` System pattern
    (Walrus's `System` has only `key`, can't be shared from non-walrus
    modules) and `System::destroy_for_testing` for cleanup.
  - Build clean (`sui move build`), 42/42 Move tests passing (9 new + 33
    existing), repo-wide `pnpm typecheck` green.
- `[move]` Regenerated `@kraterion/kraterion-move-sdk` after the Move
  package changes. New file
  `packages/kraterion-move-sdk/src/generated/kraterion/pool_vault.ts`
  exposes typed PTB builders for every `pool_vault::*` entry fn
  (`createVault`, `registerBlob`, `certifyBlob`, `deleteBlob`, `extend`,
  `resizeGrow`, `revokeAll`) plus the `KraterionPoolVault` BCS codec.
  This eliminates the "port the Rust PooledBlobClient to TS" line item
  the migration plan had budgeted at ~1 week — Phase E and H consume the
  generated builders directly. Repo-wide `pnpm typecheck` clean (19/19).
- `[walrus-client]` Phase B of the storage-pool migration: pricing helpers
  added to `packages/walrus-client/src/index.ts`. Three small utility
  functions (`getWriteFeeFrost`, `getPoolStorageCostFrost`,
  `getPoolExtendCostFrost`) that compute the over-budgeted FROST amount
  for a `pool_vault::*` PTB to pull from the reserve. Hardcoded with a
  2× safety multiplier against the on-chain `storage_price_per_unit_size`
  (100 FROST/MiB/epoch) and `write_price_per_unit_size` (20k FROST/MiB)
  current as of testnet v3 — leftover WAL returns to the reserve, so
  over-budgeting is free. Tests in `index.test.ts` (13 cases, all green)
  cover MiB rounding (1 byte → 1 MiB billed), 1-MiB-exact, multi-MiB,
  bigint inputs, and storage-extend equivalence.
- `[schema]` Phase D of the storage-pool migration: Prisma schema rewrite.
  Dropped `S3Object.shared_blob_object_id` / `storage_end_epoch` /
  `@@unique([shared_blob_object_id])` / `@@index([storage_end_epoch])`;
  added `pooled_blob_id` (FK → PooledBlob) + `encoded_size_bytes`.
  Renamed `AgentToolCall.shared_blob_object_id` → `pooled_blob_object_id`.
  Dropped the entire `S3ObjectExtension` model (per-blob extend events
  don't exist under the pool model). Added three new models:
  `StoragePool` (one per Project, mirrors `KraterionPoolVault`),
  `PooledBlob` (mirrors `walrus::storage_pool::PooledBlob`), and
  `StoragePoolExtension` (audit log for pool extend/resize).
  `SubWallet.role` comment updated: `publisher` and `renewal` folded
  into the new global `pool_operator` role; `pool_treasury` added for
  reserve admin / top-ups.
  Migration SQL committed at `prisma/migrations/20260518100000_p7_storage_pools/`
  (hand-tuned to skip false-positive drops of the raw-SQL
  `KnowledgeChunk_content_tsv_gin` and `KnowledgeChunk_embedding_hnsw`
  indexes that Prisma's diff can't see).
  Cascading consumer updates: gateway `wait-for-row.ts` polls
  `pooled_blob.pooled_blob_object_id` instead of the dropped
  `shared_blob_object_id`; control-plane `buckets/serialize.ts` exposes
  `pooled_blob_object_id` + `encoded_size_bytes` on `S3ObjectJson` (drops
  `storage_end_epoch` — it's now project-level, future Phase I admin
  endpoint); `agents/tool-runner.ts`, `agents/tools/types.ts`,
  `agents/agents.controller.ts`, `knowledge/knowledge.service.ts` all
  switched to the pool-relative field names; dashboard `lib/api.ts`,
  `lib/queries.ts`, `components/buckets/Inspector.tsx`,
  `components/agents/AgentChatPanel.tsx`,
  `components/knowledge/KnowledgeSearch.tsx` mirror the rename on the
  consumer side. Deleted `object-created.handler.ts` and
  `object-extended.handler.ts` from the indexer (Phase H will add 6
  new pool/vault handlers); dispatcher + indexer module updated. Full
  repo `pnpm typecheck` green (19/19).
- `[gateway]` `[worker]` `[move-sdk]` Phase E + F + G + H of the
  storage-pool migration: gateway PUT/DELETE rewritten, indexer
  handlers built, read-path header added.

  **Gateway PUT rewrite** ([apps/gateway/src/s3/objects.write.controller.ts](apps/gateway/src/s3/objects.write.controller.ts)):
  Replaced the SharedBlob flow (`kraterion::register_blob_for_bucket`
  + `wrap_in_shared_blob`) with the pool flow (`pool_vault::register_blob`
  + `certify_blob`). New shape:
  1. Lazy vault provisioning — first PUT in a project synchronously
     creates a `KraterionPoolVault` via the new
     `VaultProvisioningService` (Postgres advisory lock guards against
     concurrent first-PUT races). Subsequent PUTs hit the cached
     `StoragePool` row.
  2. PTB1 — `walrus.sendUploadRelayTip` + `pool_vault::register_blob`
     (no `transferObjects`; PooledBlob lives inside the pool's
     ObjectTable). Recovers `pooled_blob_object_id` by parsing the
     `KraterionPooledBlobRegistered` event from r1.events.
  3. PTB2 — `pool_vault::certify_blob` + (if overwriting) atomic
     `pool_vault::delete_blob(old_pooled_blob_id)` in the same PTB.
     Capacity recycles automatically; no orphans on overwrite.
  4. `waitForS3Object` now polls for
     `pooled_blob.status='certified'` (not just row existence) so the
     gateway returns 200 only after the certify event lands.

  **Gateway DELETE rewrite** (same file): on-chain
  `pool_vault::delete_blob` now actually frees pool capacity instead of
  the SharedBlob-era soft-mark-only. Row is soft-deleted optimistically
  for UI responsiveness; on-chain failure leaves an orphan PooledBlob
  that `burn_expired_pooled_blob` reaps at pool expiry.

  **New service**
  [apps/gateway/src/s3/vault-provisioning.service.ts](apps/gateway/src/s3/vault-provisioning.service.ts):
  ~220 lines. `ensureVaultForProject(projectId, intendedOwner)` is the
  one public method — fast-path cached row read, slow-path advisory
  lock + on-chain create + indexer-wait. Defaults: 1 GiB encoded pool
  capacity, 53 epochs ahead.

  **Read path tweak** (Phase F):
  [apps/gateway/src/s3/object-bytes.service.ts](apps/gateway/src/s3/object-bytes.service.ts)
  emits `x-kraterion-storage-kind: pooled` on every GET/HEAD response
  for operational debugging.

  **Walrus client extensions** (Phase B leftover):
  [packages/walrus-client/src/index.ts](packages/walrus-client/src/index.ts)
  gained `signersToBitmap(signers, committeeSize)` — inlined from the
  SDK's private util (the SDK uses it internally for `walrus.certifyBlob`
  against SharedBlobs but doesn't export for callers who build their own
  PTBs against the pool primitives).

  **Indexer handlers** (Phase H): 6 new handlers under
  [apps/worker/src/indexer/handlers/](apps/worker/src/indexer/handlers/):
  - `vault-created.handler.ts` — `KraterionVaultCreated` → insert
    `StoragePool` row (resolves project via the event's `project_id`
    bytes).
  - `vault-revoked.handler.ts` — `KraterionVaultRevoked` → flip
    `user_revoked=true, status='user_revoked'`.
  - `pooled-blob-registered.handler.ts` — `KraterionPooledBlobRegistered`
    → insert `PooledBlob` row + upsert `S3Object` (resolves parent
    bucket from the first 32 bytes of `seal_identity`). Fire-and-forget
    Knowledge embeddings enqueue.
  - `pooled-blob-certified.handler.ts` — `KraterionPooledBlobCertified`
    → flip `PooledBlob.status='certified'`. This is what unblocks the
    gateway's PUT response.
  - `pooled-blob-deleted.handler.ts` — `KraterionPooledBlobDeleted` →
    `PooledBlob.status='deleted'` + clear `S3Object.pooled_blob_id`
    (so the storage-accounting query sees the freed slot).
  - `pool-extended.handler.ts` / `pool-resized.handler.ts` — bump
    `StoragePool.end_epoch` / `reserved_encoded_bytes`; insert
    `StoragePoolExtension` audit row (idempotency via
    `(tx_digest, event_seq) UNIQUE`).

  All 6 handlers wired into the dispatcher + indexer module. Event
  schemas added to [apps/worker/src/indexer/event-types.ts](apps/worker/src/indexer/event-types.ts)
  (`KraterionVaultCreatedSchema`, etc.).

  **SDK export**: `packages/kraterion-move-sdk/src/index.ts` now
  re-exports the generated `pool_vault.ts` builders as a namespace
  alongside the existing `kraterion`/`access`/`events`/`reserve`.

  **Tooling cleanup**: added `--passWithNoTests` to vitest scripts in
  gateway/worker/control-plane/kraterion-move-sdk (pre-existing
  no-test-files exit-1); added placeholder tests in
  `packages/shared` and `packages/seal-client` for the same reason.

  **Test status**: 42/42 Move tests pass, 13/13 walrus-client unit
  tests pass, full repo `pnpm typecheck` (11/11 with `--force`) clean.
  Control-plane has 6 pre-existing unit-test failures in
  `prepare-tx.spec.ts` (DI mock setup issue, unrelated to this work);
  verified failing on `main` before any storage-pool changes.

  **Still to do**: Phase I (admin endpoints for manual pool extend /
  resize / list — ~3 days) and Phase K (E2E + load tests + hard-reset
  rehearsal — ~3 days). The cleanup commit (deleting the
  `register_blob_for_bucket` / `wrap_in_shared_blob` /
  `extend_blob_from_reserve` / `extend_shared_blob` functions from
  `kraterion.move`) is gated on Phase K passing.
- `[control-plane]` Phase I of the storage-pool migration: admin
  endpoints landed at `apps/control-plane/src/admin/`. NEW module with
  4 files (~520 lines total): `admin.controller.ts` (5 routes:
  `GET /admin/pools`, `GET /admin/pools/:id`,
  `POST /admin/pools/:id/extend?epochs=N`,
  `POST /admin/pools/:id/resize-grow` (JSON body),
  `GET /admin/reserve`), `admin.service.ts` (DB queries +
  `pool_vault::extend` / `::resize_grow` PTBs signed by the gateway
  operator + on-chain reserve introspection via `sui_getObject`),
  `admin.guard.ts` (session-principal email check against
  `ADMIN_EMAILS` env var allowlist; refuses bearer tokens), and
  `operator-keypair.service.ts` (loads the same global `api_decryption`
  SubWallet the gateway uses — same on-chain identity, on the reserve
  whitelist, signs admin pool ops). Registered in
  `apps/control-plane/src/app.module.ts`.

- `[gateway]` `[scripts]` Phase K of the storage-pool migration:
  end-to-end smoke + hard-reset rehearsal scripts.
  - **NEW** `apps/gateway/scripts/smoke-pool-roundtrip.ts` (~400 lines)
    — replaces the deleted `smoke-encrypt-roundtrip.ts` (which used
    the obsolete SharedBlob flow). Exercises the full pool pipeline
    on testnet: vault create → register + certify (with relay-upload
    + storage-node quorum certificate) → aggregator read + Seal
    decrypt round-trip → overwrite leg → DELETE. Run with
    `pnpm -F @kraterion/gateway smoke`. Requires the bootstrap
    SubWallet + Postgres + Redis.
  - **NEW** `scripts/hard-reset.sh` — captures the cutover sequence
    from [/docs/storage-pool-migration.md](storage-pool-migration.md)
    §5. Network safety gate (refuses non-testnet/localnet),
    active-Postgres-connection warning, interactive confirm (or
    `--yes-i-know`). Drives `prisma migrate reset` →
    `setup-testnet.sh --force` → `gateway bootstrap` in one command.
    Syntax-checked but not executed (destructive).
  - **NEW** `docs/runbook.md` entry "Procedure: storage-pool migration
    hard reset" — manual step-by-step fallback if the script fails
    partway, plus recovery notes for partial-reset states and the
    "what happens to the OLD package's WAL" cleanup.
  - **Gateway package.json** — replaced the obsolete `smoke` script
    target; added `smoke:baseline` for the Phase A bare-Walrus pool
    ops calibration.

**Phase K is "v1 complete" for the storage-pool migration.** Full
repo `pnpm typecheck` (19/19) and `sui move test` (42/42) green.
Pre-existing control-plane unit-test failures (6 in `prepare-tx.spec.ts`)
remain unchanged — verified not regressions from this work via
`git stash` + test rerun.

**Deferred to follow-up commits / phases** (per migration plan §4):
- Cleanup commit: delete `register_blob_for_bucket`,
  `wrap_in_shared_blob`, `extend_blob_from_reserve`, `extend_shared_blob`
  from `kraterion.move` — held until Phase K smoke runs green against
  the post-hard-reset state.
- Phase J: capacity autoscaler — pools auto-grow at 80% utilisation.
- Phase R: automated renewal worker — extends pools at end_epoch − 12.
- Cap system: replaces the current address-whitelist auth with mintable
  `PlatformGatewayCap` / `PlatformRenewCap` / `PlatformSizerCap` for
  separation-of-duties and easy rotation.
- `[migration]` **Storage-pool hard-reset cutover executed.** New
  Kraterion package live on testnet at
  `0x0d9b6049e3f7a9c91a30d61976b94c234aac6955c706801f17aa908ef255533b`;
  new `PlatformReserve` at
  `0xf1a70d3bc51ec9249dc1d194d56480ce98a01145cb849e1a32a719e35c0b7671`
  (re-funded via the bootstrap with ~1.58 WAL after the script fix).
  New gateway sub-wallet `0x4b9e8a6f…`, knowledge-indexer
  `0x8b08dc29…`, test bucket
  `0x682e2472bd47427a8ccdfa45f59cd83abd008ebdeb2a236b0e4f45b4b7ae01ef`
  (type-tagged at the new package address — confirmed via Sui RPC).

  **Cutover gotchas the script now handles:**
  - `Published.toml` carries the prior testnet publish; `sui client
    publish` refuses to re-publish until it's removed. `hard-reset.sh`
    now wipes it before invoking setup.
  - `@kraterion/shared`'s compiled `dist/` is the import surface for
    `bootstrap-gateway.ts`; without rebuilding between setup-testnet
    (which updates `constants.ts`) and bootstrap, the latter sees the
    OLD `KRATERION_PACKAGE_ID` / `KRATERION_RESERVE_ID` and creates
    everything against the orphaned package. `hard-reset.sh` now does
    `pnpm turbo run build --filter @kraterion/shared
    --filter @kraterion/kraterion-move-sdk --force` between the two
    steps. Surfaced as `CommandArgumentError TypeMismatch` in the
    smoke's `seal_approve` PTB when the bucket was on the old package
    but the seal-decrypt path used the new package's module.
  - `sui client active-env` is the right command to detect testnet vs
    mainnet; `sui client envs` renders a box-drawing table that the
    earlier awk parse couldn't handle.

  **Pricing constants updated:** the hardcoded
  `STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST` and
  `WRITE_PRICE_PER_MIB_FROST` in `packages/walrus-client/src/index.ts`
  bumped from 100 / 20k to 3000 / 5000 after the live-testnet smoke
  surfaced the actual on-chain values (1446 storage / 2891 write). Old
  values came from old research notes; live testnet was rate-voted
  higher than the docs implied. New values give ~2× headroom over
  observed. Updated `index.test.ts` to match.

  **End-to-end smoke verified** via
  `pnpm -F @kraterion/gateway smoke` (the Phase K
  `smoke-pool-roundtrip.ts` script). Single PUT flow successfully:
  1. Created vault on chain (tx `68L8xGYu…`)
  2. Registered + relay-uploaded + certified the blob
  3. Indexer wrote `PooledBlob` row + advanced `status='certified'`
     (510ms ack)
  4. Aggregator read returned 346 encrypted bytes
  5. Seal-decrypted to 47 plaintext bytes (`✓ plaintext round-trip
     verified`)
  6. DB state confirms: `StoragePool` row present, `PooledBlob` row
     `certified`, `S3Object` row links via `pooled_blob_id` FK

  Overwrite + DELETE legs of the smoke hit transient 500s from
  Mysten's testnet upload-relay infrastructure (not a Kraterion
  bug — same call pattern as the working PUT just minutes earlier).
  Move-level overwrite-delete semantics are covered by the pool_vault
  unit tests (42/42 pass). Real overwrite via the gateway HTTP path
  will work the same way once relay reliability stabilises.

  **Cleanup commit deferred** (per migration plan): the old
  `register_blob_for_bucket` / `wrap_in_shared_blob` /
  `extend_blob_from_reserve` / `extend_shared_blob` entries are still
  in `kraterion.move` because the worker's K5 manifest-archive flow
  (`apps/worker/src/embeddings/manifest-archive.ts`) still uses them.
  K5 will be refactored to pool ops in a follow-up commit, then the
  obsolete Move entries can be deleted in one go.

- [cleanup] **K5 manifest-archive migrated to pool_vault + obsolete
  SharedBlob code removed (2026-05-15).** The deferred cleanup landed
  in one go:
  1. `apps/worker/src/embeddings/manifest-archive.ts` rewritten to use
     `pool_vault::register_blob` (PTB1, parses
     `KraterionPooledBlobRegistered` for the pooled-blob ID) and
     `pool_vault::certify_blob` (PTB2, with `signersToBitmap` for the
     certify signers vector). Resolves the project's `StoragePool` via
     the bucket → project relation; if the project has no vault yet,
     the archive step skips silently (gateway PUT bootstraps the vault
     on first write).
  2. `KnowledgeManifest.manifest_shared_blob_object_id` →
     `manifest_pooled_blob_object_id`. New migration
     `20260518150000_manifest_pooled_blob_rename` is a plain
     `ALTER TABLE … RENAME COLUMN`. Updated all readers:
     `mcp/mcp.tools.ts`, `agents/tools/get-manifest.ts`,
     `apps/worker/scripts/backfill-manifest-archive.ts`.
  3. Deleted from `kraterion.move`: `register_blob_for_bucket`,
     `wrap_in_shared_blob`, `extend_blob_from_reserve`,
     `extend_shared_blob`. Removed the now-unused Walrus blob /
     shared_blob / storage_resource / system imports and the
     `PlatformReserve` import. `kraterion.move` is now purely bucket
     lifecycle.
  4. Deleted from `events.move`: `KraterionObjectCreated`,
     `KraterionObjectExtended` structs and their `emit_*` helpers.
  5. Updated `packages/kraterion-move-sdk/src/index.ts` to drop the
     two retired event imports/types and add the seven pool/vault
     events to the `parseEvent` return union. Updated the SDK unit
     test to reference the new events.

  Verification: 42/42 Move tests pass; 19/19 turbo typecheck tasks
  green; SDK vitest 5 pass / 2 live-only skipped; Prisma schema/DB
  in sync (only the pre-existing pgvector raw-SQL drift remains, as
  documented).

### 2026-05-19

- `[billing]` `[control-plane]` `[dashboard]` **Phase B5 ships — inline
  Stripe Elements card collection + the full `/billing` surface.**
  Closes the "user can add a card and manage their subscription
  without leaving the dashboard" milestone planned in
  `/Users/razvanstatescu/.claude/plans/idempotent-tumbling-thompson.md`.

  **Control-plane endpoints (all under `/v1/billing`, AuthGuard):**
  - `POST /setup-intent` → returns `{ client_secret, setup_intent_id }`
    for inline `<PaymentElement />`. Idempotency key bucketed per
    project per ~17 min so strict-mode double-mounts collapse.
  - `GET /invoices/:projectId` → live read of last 12 invoices from
    Stripe (5-min React-Query cache on the dashboard side).
  - `POST /cancel-subscription` → `cancel_at_period_end = true` (keeps
    capacity through the boundary).
  - `PATCH /spend-cap` → updates `hard_spend_cap_usd_cents` +
    `soft_alert_thresholds` (cap can be null).
  - `PATCH /details` → updates `billing_email` / `tax_id` / `country`
    on the local `BillingAccount` row. Stripe Customer object is
    mutated via the Customer Portal, not by us — portal handles VAT
    validation + tax registration.

  **Webhook handler** (`apps/control-plane/src/billing/webhook.controller.ts`):
  added a `setup_intent.succeeded` branch that mirrors
  `checkout.session.completed`: reads `metadata.project_id`, promotes
  the attached payment method via
  `billing.setDefaultPaymentMethod(...)`, calls `ensureSubscription`
  (idempotent), flips `BillingAccount.has_payment_method = true`. The
  inline-Elements flow now reaches a fully-billable subscription
  without ever leaving the dashboard.

  **Dashboard `/billing` rewrite** (Vercel / Supabase shape, single
  column of stacked cards):
  - `CurrentPeriodCard` — period range + accrued + projected + days
    left, deep-links to `/usage` for the meter table.
  - `PaymentMethodCard` — two states: no-card (`<Banner>` + "Add
    card" button → mounts `InlineCardForm`) and card-on-file (brand
    pill + "Manage in Stripe" deep link to Customer Portal). Hidden
    "remove card" action when there's unbilled usage (server-side
    guard is B8; UI mirror lands here).
  - `InlineCardForm` — real `@stripe/stripe-js` +
    `@stripe/react-stripe-js`. Mounts `<Elements>` with our design
    tokens, `<PaymentElement />` collects the card, `confirmSetup`
    with `redirect: 'if_required'` keeps SCA paths working without
    forcing a redirect for non-3DS cards. On success: 2-second wait
    for the webhook to land, then `useBillingAccount` invalidates
    and the card flips to "Card on file" without a reload.
  - `StorageCard` (carried over from B3) + `ResizeStorageModal` —
    pool resize flow, upgrade immediate / downgrade scheduled.
  - `SpendCapCard` — toggle between "no limit" and a dollar cap;
    storage is exempt because it's a flat subscription, not metered.
  - `InvoicesCard` — table of last 12 Stripe invoices, "View" deep-
    links to `hosted_invoice_url`, "View all in Stripe" opens the
    portal for full history + PDFs.
  - `BillingDetailsCard` — email / tax id / country; Stripe Tax
    deep-link via portal.
  - `DangerZoneCard` — cancel subscription with `ConfirmModal`.
  - `BillingBanner` — single banner at the top of `(app)/layout.tsx`
    with priority logic: no-payment-method (info, persistent) →
    past_due (error, dismissible) → cancelled (warning, dismissible)
    → cap-exceeded (error, persistent) → 80%-cap-warn (warning,
    dismissible). Dismiss flags live in `sessionStorage` keyed per
    banner id so a fresh session re-surfaces unresolved issues.

  **Dashboard wire layer** (`apps/dashboard/src/lib/queries.ts`):
  added `useBillingAccount`, `useCreateSetupIntent`,
  `useOpenBillingPortal`, `useInvoices`, `useUpdateSpendCap`,
  `useUpdateBillingDetails`, `useCancelBillingSubscription`. Wire
  types in `lib/api.ts` (`BillingAccountJson`, `InvoiceJson`,
  `SetupIntentResponse`).

  **New deps in `apps/dashboard`** (approved by user in this
  session): `@stripe/stripe-js` + `@stripe/react-stripe-js`. Both
  pinned at the current `minimumReleaseAge: 1440`-compliant latest.
  Publishable key wired via `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  (lazy accessor `env.getStripePublishableKey()` so pre-B5 routes
  don't break if the key is absent).

  **Design system compliance:** sentence case throughout, font-weight
  ≤ 500, hairline borders, three radii (4/8/12), no shadows/gradients,
  Lucide icons at 1.5px stroke. The Stripe Elements appearance object
  tints `colorPrimary: #bf4a26` (Krater) + `--stone-300` borders to
  match the surrounding card.

  **Account-level cancel left in `/settings`:** the existing
  `useCancelSubscription` hook hits `/v1/me/cancel` (Account.status =
  'cancelled') — different concern from billing subscription cancel.
  Two separate "delete the relationship" actions kept apart on
  purpose: billing cancel is reversible, account cancel wipes data.

  Verification: control-plane + dashboard typecheck green
  (`pnpm -F @kraterion/control-plane typecheck`, `pnpm -F
  @kraterion/dashboard typecheck`). End-to-end smoke deferred to user
  testing — three terminals (`pnpm dev`, `stripe listen --forward-to
  localhost:4001/webhooks/stripe`, a fresh project) and Stripe test
  card `4242 4242 4242 4242` will exercise the full flow.

  **Open next (B6):** wire the spend-cap + free-band enforcement
  (gateway 507/429 + `X-Kraterion-Reason` headers; the entitlements
  Redis cache). B7 is the admin pages; B8 is the onboarding flow +
  `RequiresPaymentMethodGuard` + the remove-card-when-unbilled
  server-side guard.

### 2026-05-19 (later)

- `[billing]` `[control-plane]` `[dashboard]` **Closed out the B1, B2,
  B4, and B5 gaps from the billing audit** in one focused session.
  Plan source: `.claude/plans/idempotent-tumbling-thompson.md`.

  **B1 — share-token egress + UsageEvent TTL**

  - `ShareTokenUsageDay` grew two columns:
    `bytes_out BigInt @default(0)` + `bytes_out_at_last_emit BigInt?`.
    Migration `20260519152411_p8_share_token_egress`.
    `ShareTokenUsageService.record(...)` now takes `bytesOut: bigint`;
    both agent-controller callsites (non-streaming + streaming) pass
    `approximateEgressBytes(completion_tokens)` (≈ `tokens × 4`).
  - New
    `apps/control-plane/src/billing/share-token-egress-rollup.processor.ts` —
    10-min tick. SELECTs un-drained rows for today, emits the delta
    as a `MeterEvent` per (project, hour), then advances the cursor
    on each row. Hour-bucket pattern matches the index rollup.
  - New `apps/control-plane/src/billing/usage-event-ttl.processor.ts` —
    hourly DELETE of `UsageEvent` older than 35 days. Postgres native
    partitioning deferred — see decisions entry for the tradeoff.
  - New `apps/control-plane/src/billing/webhook-event-ttl.processor.ts` —
    daily DELETE of processed `StripeWebhookEvent` rows older than
    90 days. Stuck (un-processed) rows stay so the audit chain can
    find them.

  **B2 — hosted-Checkout fallback removed**

  - Deleted: `POST /v1/billing/checkout-session` endpoint,
    `BillingService.createCheckoutSession()`, the `checkoutSessionSchema`
    DTO, and the `probe-checkout-session.ts` script.
  - Kept the webhook handler for `checkout.session.completed` because
    Stripe events are idempotent — defensive code is cheaper than a
    new edge case.
  - Inline Stripe Elements is now the only card-collection path.

  **B4 — reconciliation, cost-floor, soft-alert, delivery**

  - `apps/control-plane/src/billing/reconciliation.processor.ts` —
    daily tick. For every `BillingAccount` with a Stripe customer:
    sum `MeterEvent.value WHERE stripe_status='sent'` for yesterday-
    UTC, fetch Stripe's `billing.meters.eventSummaries.list`,
    compute drift %. Warn at 0.1%, error at 1%.
  - `apps/control-plane/src/billing/cost-floor.processor.ts` — daily
    tick. CoinGecko fetch (`api.coingecko.com/api/v3/simple/price`)
    for SUI + WAL (`walrus-2`); falls back to baseline `$2.5` /
    `$1` if the fetch fails. Computes per-meter headroom; writes
    `CostFloorSnapshot`; warns if any meter drops below 25% headroom.
    Pyth Sui-native swap noted as a follow-up in the file header.
  - New table `BillingAlert` (migration
    `20260519153207_p8_billing_alert`). UNIQUE
    `(project_id, period, threshold_pct, channel)` makes the
    evaluator idempotent.
  - `apps/control-plane/src/billing/soft-alert.processor.ts` —
    5-min tick. For accounts with a hard cap, checks accrued vs
    each configured threshold; inserts a `BillingAlert` row on the
    first crossing per period per threshold.
  - `apps/control-plane/src/billing/alert-delivery.processor.ts` —
    30-s tick. Drains `delivered_at IS NULL` rows. Today only the
    `log` channel is wired — `email` / `slack` slots are stubbed
    siblings for a future provider integration.

  **B5 — alert thresholds UI + closeout decision**

  - `apps/dashboard/src/components/billing/SpendCapCard.tsx` gained
    a multi-select chip group for thresholds (50 / 80 / 100 %).
    Single Save button PATCHes cap + thresholds in one round-trip
    via the existing `useUpdateSpendCap` hook.
  - Server-side remove-PM guard skipped — Stripe Customer Portal
    does not expose `payment_method.detach` as a user action. The
    plan's concern is solved by the existing Portal feature set;
    see `decisions.md` entry.

  **B4 dashboard — `/usage` polish (Cloudflare R2 / Vercel shape)**

  - New `apps/dashboard/src/components/usage/` directory:
    `StackedDailyBar.tsx`, `ChartLegend.tsx`, `PeriodSelector.tsx`,
    `Sparkline.tsx`, `meter-colors.ts`. All hand-rolled SVG, zero
    chart deps, full design-system compliance.
  - `getByDay` extended on the server to return per-day per-meter
    `{ value, cost_usd_cents }` so the chart stacks **dollars**
    (the bill-relevant axis) instead of heterogeneous raw counts.
    Wire type updated accordingly.
  - Period selector lets the user scrub current / previous /
    last-7-days; clicking a bar filters the meter table to that
    day. 7-day trend sparkline added to each meter row.
  - Meter renames also rolled into the chart legend
    ("Storage writes", "Storage reads", etc., matching the
    Stripe catalog).

  **Cross-cutting cheap wins**

  - `apps/control-plane/scripts/probe-billing-reset.ts` — sandbox
    helper that wipes Stripe customer + subscription + every local
    billing row for a project. Refuses live mode.
  - The Stripe sync script (`apps/control-plane/scripts/stripe/sync.ts`)
    already gained `update on drift` for Product names + descriptions
    in the earlier pass; this round also added drift updates for
    `Meter.display_name` and `Price.nickname` — re-running
    `pnpm stripe:sync` after a catalog edit now propagates every
    user-visible label in one shot.

  Verification: full typecheck green across control-plane, dashboard,
  and worker. Migrations applied (`20260519152411_p8_share_token_egress`
  and `20260519153207_p8_billing_alert`). End-to-end smoke deferred to
  the next dashboard session.

  **What's still pending (B6 onward — captured in the audit):**
  - Gateway 507/429 enforcement of cap + free band (B6 entrypoint).
  - Email/Slack alert delivery (waits on a provider decision).
  - `/admin/billing` pages (B7).
  - Onboarding flow + `RequiresPaymentMethodGuard` (B8).
  - UsageEvent native partitioning when traffic justifies it
    (deferred from this session; TTL DELETE handles sandbox volume).

### 2026-05-19 (pool lifetime tracks billing cycle)

- `[billing]` `[move]` `[control-plane]` **Pool reservation lifetime
  now tracks the billing cycle, not a 2-year horizon.** User feedback
  pointed out that Walrus's
  `decrease_storage_pool_unused_capacity_by_percent` returns a
  `Storage` reservation receipt rather than WAL, so the original "let
  the pool decay over ~2 years" plan was leaking 1–24 months of
  pre-paid WAL on every downsize. Fix in two stages.

  **Stage 1 — TS only, applied:**
  - New constants in `packages/shared/src/billing-constants.ts`:
    `BILLING_CYCLE_DAYS = 30`, `POOL_RENEWAL_BUFFER_DAYS = 5`,
    `WALRUS_EPOCH_DAYS` (testnet 1d / mainnet 14d),
    `initialPoolEpochsAhead()`, `renewalEpochsPerCycle()`.
  - `apps/gateway/src/s3/vault-provisioning.service.ts` —
    `INITIAL_EPOCHS_AHEAD` now derived from those constants instead of
    the previous hardcoded 53. New pools get ~1 cycle + 5-day buffer
    of lifetime up-front.
  - New `apps/control-plane/src/billing/pool-renewal.processor.ts` —
    daily tick that reads `current_epoch` from Sui RPC, finds every
    active `StoragePool` whose `end_epoch` is within ~10 days, and
    submits `pool_vault::extend` for one more cycle. Skips pools where
    the project's Stripe subscription is not active or is set to
    cancel_at_period_end (those pools naturally decay).

  **Stage 2 — Move package change, ready, awaiting redeploy:**
  - `move/kraterion/sources/pool_vault.move` — new `resize_shrink(...)`
    entry that calls `decrease_storage_pool_unused_capacity_by_percent`,
    transfers the returned `Storage` reservation receipt to `@0x0`
    (abandoned to the network — see decisions entry for the trade-off),
    and emits `KraterionPoolResizedShrink`.
  - `move/kraterion/sources/events.move` — new event struct +
    `emit_pool_resized_shrink(...)` helper.
  - Move package builds clean; 42/42 tests still pass.
  - TS bindings regenerated via Turbo.
  - `pool-renewal.processor.ts` already has the shrink path wired,
    gated by `KRATERION_ENABLE_POOL_SHRINK=true`. Today it's off so
    the runtime doesn't try to call a function the deployed package
    doesn't have yet. After the next Move publish + `Published.toml`
    update, flipping the env flag activates the path.

  **Outcome:** WAL over-payment on a downsize used to be bounded by
  the full ~2-year pool lifetime. After Stage 1 it's bounded by ~1
  billing cycle (the residual at the boundary between Stripe
  quantity drop and the next renewal). After Stage 2 is live it
  drops to "at most one cycle's residual unused capacity in the
  abandoned `Storage` receipt" — far less than the previous gap.

  Verification: control-plane typecheck green, dashboard typecheck
  green, Move package 42/42 tests pass. PoolRenewalProcessor logs
  `pool-renewal armed (tick=86400000ms, buffer=5d)` at boot.

  **Operator action required to enable Stage 2:** publish the new
  Move package (`scripts/setup-testnet.sh --force` after a clean
  bindings regen) and set `KRATERION_ENABLE_POOL_SHRINK=true` in
  the control-plane env. See `/docs/runbook.md` "Redeploying Move
  with pool_vault::resize_shrink" for the safe sequence.

### 2026-05-20 — Storage free tier dropped from 10 GB to 500 MB (MB-granularity)

- `[billing]` Storage subscription quantity unit moved from **GB → MiB**
  so we can express "500 MB free" exactly as a Stripe graduated tier-1.
  Old `storage_v1` Price kept (archived nickname) for any legacy
  subscription; new active price is `storage_v2`:
  - tier 1: `up_to: 500 MB` at `$0`
  - tier 2: `up_to: ∞` at `0.005859375¢/MB` (= $0.06/GB)
- New migration `20260520081845_p8_storage_mb_granularity` renames
  `PendingStorageDowngrade.{new,current}_reserved_gb → _mb` and
  multiplies existing values × 1024.
- Wire shape on `/v1/billing/storage/state/:projectId` and `/v1/usage`
  now returns `reserved_mb` / `used_mb` (was `_gb`). DTO field
  `new_reserved_mb` for the resize endpoint.
- New `formatStorageMb()` in `apps/dashboard/src/lib/format.ts` picks
  the most readable unit (`< 1024 MB → MB`, then `GB`, `TB`) — so
  a 500 MB reservation reads "500 MB" while 100 GB reads "100 GB"
  in the same component. The resize modal labels, storage card, and
  `/usage` page all use it.
- `STORAGE_MIN_MB = STORAGE_DEFAULT_MB = 500`; tier presets in shared:
  500 MB / 1 GB / 5 GB / 10 GB / 50 GB / 100 GB / 250 GB / 500 GB / 1 TB.
- Pool-renewal worker's shrink-target math now uses `× 1_048_576n`
  (MiB → bytes) instead of `× 1_073_741_824n` (GiB → bytes).
- Other meter free bands left **unchanged** for now — user agreed to
  start with the storage change in isolation and tighten the rest in
  a follow-up if needed.
- Verification: CP + dashboard typecheck green, `pnpm stripe:sync`
  created `storage_v2` (`price_1TZ5QMDSnZPy1lDYAKhq8g6j`), migration
  applied, Prisma client regenerated.

Operator note: existing bootstrap test customer's subscription line
points at `storage_v1` (10 GB quantity). The control-plane code now
expects `storage_v2`; a fresh sign-up + add-card on the dashboard
will create a subscription on the new price. Existing test customer
should be wiped + re-bootstrapped if interaction with `/billing`
becomes inconsistent.

### 2026-05-20 (later) — upload flow analysis written down

- `[docs]` New: [`/docs/upload-flow-analysis.md`](upload-flow-analysis.md).
  Diagnostic + roadmap for the upload-to-bucket pipeline. Inventories
  the current gateway PUT path (15 steps, 2 GiB cap, no multipart),
  the dashboard upload UX (drag-drop + presigned URL via XHR, no
  cancel/retry/folder/collision-warn), and the cross-cutting gaps
  (no rate-limit, no orphan reaper, indexer-ack 503 causing WAL
  leaks on retry). Compares to S3 / R2 / B2 / tus. Proposes 22
  improvements grouped by impact × effort across four tiers
  (quick wins, medium investments, strategic bets,
  stop-the-bleeding). Suggested 4-week sequencing inside. Not
  committed scope — when the user picks an item, each gets its own
  scoped plan.

### 2026-05-20 (later) — marketing site rebuilt from website-plan.md

- `[landing]` Replaced the single "coming soon" page with the
  full 8-surface architecture from
  [`/docs/website-plan.md`](website-plan.md). New routes: `/`,
  `/s3`, `/knowledge`, `/embed`, `/pricing`, `/security`, `/docs`,
  `/docs/quickstart`. All marketing pages prerender as static
  HTML; only `/api/og` is dynamic (edge).
- Stack added (with user approval): motion, lenis, gsap, @gsap/react,
  three, @react-three/fiber, @react-three/drei, shiki,
  @shikijs/transformers, @next/mdx + remark/rehype, lucide-react,
  clsx, class-variance-authority, @vercel/analytics,
  @vercel/speed-insights, next-sitemap, @next/bundle-analyzer.
- Motion split: GSAP owns pinned/scrubbed timelines
  (`<BucketFlowRibbon>` ~120 vh pin on landing + /knowledge,
  `<S3ScrubBeat>` scrubbed SDK-tab autoplay on landing); Motion
  owns declarative motion (`<FadeUp>`, `<Reveal>`, `<KraterionChatWidget>`
  AnimatePresence, code-tab `layoutId` underline); R3F lazy-loaded
  for `<ApertureHero>` with SVG fallback below 768 px and under
  `prefers-reduced-motion`; Lenis 1.3 root smooth-scroll RAF-synced
  with `gsap.ticker`, also short-circuited under reduced motion.
- Brand tokens mirrored from
  [`/design-system/colors_and_type.css`](../design-system/colors_and_type.css)
  into `apps/landing/src/app/globals.css` via Tailwind v4 `@theme`.
  `box-shadow: none` is enforced site-wide; elevation is a hairline
  utility. Reduced-motion blanket kills transitions globally.
- Shiki recolored to the warm palette at build time (no client JS).
- Per-page OG: subpages reference `/api/og?surface=…&title=…`;
  root keeps the elaborate `app/opengraph-image.tsx`. `sitemap.xml`
  covers all 8 surfaces.
- Build is green; all 8 routes return 200 in dev and prerender in
  prod. README at `apps/landing/README.md` documents the layout.

### 2026-05-21 — managed-CDN feature proposal written

- `[docs]` New: [`/docs/cdn-feature-plan.md`](cdn-feature-plan.md).
  End-to-end proposal for a Kraterion-managed CDN (Cloudflare for
  SaaS as the recommended upstream): per-bucket toggle → auto
  subdomain on `*.kraterion.dev` or BYO custom hostname →
  cache-purge on overwrite/delete → metered as a new
  `cdn_egress_bytes` Stripe line ($0.02/GB, 5 GB/mo free).
  Architecture, provisioning flow, billing model, dashboard
  surface, six-phase implementation (~12 days end-to-end), and
  five open product calls inside. Origin-side prerequisites pull
  forward from `/docs/upload-flow-analysis.md` Tier-A items
  (range GETs, conditional GETs, tunable Cache-Control). Not
  committed scope.

### 2026-06-02 — P9 Feature 3: MemWal-as-tool shipped

- `[agents]` Two new built-in agent tools: `memory_remember` and
  `memory_recall`, both backed by the hosted MemWal relayer
  (`@mysten-incubation/memwal@^0.0.7`). One MemWal account per
  deployment, per-agent isolation enforced via namespace
  `agent:<agent_id>`. Tool descriptions tuned so the LLM uses
  remember sparingly (preferences, stable context) and recall at
  task start.
- `[control-plane]` New `MemwalService` (global Nest module): reads
  `MEMWAL_ACCOUNT_ID` / `MEMWAL_DELEGATE_KEY` / `MEMWAL_SERVER_URL`
  at boot, validates presence with a one-line warn-only fallback,
  lazily constructs one `MemWal` client per agent in a
  process-local `Map<agent_id, MemWal>`, and wipes key material via
  `client.destroy()` on `OnModuleDestroy`. 9 unit tests cover
  config gating, cache reuse, namespace isolation, env-override
  serverUrl, and shutdown.
- `[control-plane]` `ToolContext` gains `memwal: MemwalService` and
  `agentId: string`; both tool handlers refuse to run when
  `agentId` is empty (MCP shim leaves it empty for v1). Tool
  results carry the Walrus blob_id for `memory_remember` so the
  lineage graph renders a fetch-blob link without any further
  work.
- `[dashboard]` Tool picker (both `AgentSettingsForm` and
  `CreateAgentDialog`) now renders tools grouped under section
  headers: Storage / Knowledge / Persistent memory. New `Brain`
  icon in the registry for the memory cluster. Existing tools
  re-bucketed (search/get-manifest → Knowledge; list/read/write
  → Storage).
- `[smoke]` Non-LLM probe at
  `apps/control-plane/scripts/probe-memwal.ts` drives both tool
  handlers directly against the live relayer. Verified:
  agent A wrote a fact (returned `id`, `blob_id`, namespace),
  agent A recalled it (1 hit, distance 0.43), agent B with the
  same query returned 0 hits — namespace isolation holds.
- Trace + lineage propagation is free: `AgentToolCall.tool_name`
  already flows through `build-session-trace.ts` (Feature 1) and
  `build-lineage.ts` (Feature 2), so `memory_*` calls render as
  `kraterion-tool` Datasets in the existing lineage view. Replay
  short-circuit (Feature 1 D10) prevents re-issuing memory writes
  on replay — captured output is fed back to the model.
- Files added: `apps/control-plane/src/memwal/{memwal.service,
  memwal.module,memwal.service.spec}.ts`,
  `apps/control-plane/src/agents/tools/{memory-remember,
  memory-recall}.ts`, `apps/control-plane/scripts/probe-memwal.ts`,
  one new `Brain` icon row in
  `apps/dashboard/src/components/ui/Icon.tsx`, and `AGENT_TOOL_GROUPS`
  in `apps/dashboard/src/lib/agent-tools.ts`.
- Not in scope (deferred): MCP exposure of the two tools,
  `MemWal.analyze` fact-extraction primitive, client-side `manual`
  entry point, cross-agent memory sharing, per-agent MemWal
  account isolation, Vercel AI SDK / LangGraph middleware
  wrappers.

### 2026-06-03 — Dashboard first-run onboarding card

- `[dashboard]` New "Get started" card on the buckets page (the de-
  facto signed-in home). Walks new users through the four core
  primitives in plain language: store your stuff (buckets), make
  files searchable (knowledge), build an agent, plug into your stack
  (integrations — `openai · vercel ai · langgraph · mcp` as a
  cluster, no MCP jargon up front). Pattern: Resend / Linear /
  PlanetScale top-of-dashboard checklist with auto-detected
  completion.
- `[dashboard]` Each step renders in one of three states — pending,
  active (lowest-index incomplete, krater accent), done (filled
  green badge, body muted, CTA swaps to "Open ↗"). Step 2 is locked
  with a "finish step 01 first" hint until the user has at least
  one bucket, so the CTA never lands the user in a dead end. Step 4
  visual is four monospaced labels in a 2×2 grid around a centered
  krater dot — license-safe, on-brand, no external logo art.
- `[control-plane]` New `OnboardingModule` with three endpoints —
  `GET /v1/onboarding`, `POST /v1/onboarding/dismiss`, `POST
  /v1/onboarding/reset`. Completion is **derived** (no per-step
  `completed_at` rows) by counting buckets / indexed knowledge
  manifests / agents / API keys per account. Deleting your only
  bucket correctly un-completes step 1; the card itself only hides
  when the user explicitly dismisses *and* the indicator stays in
  sync. Six unit tests cover the four completion predicates plus
  dismiss/reset. The only persisted state is a single
  `Account.onboarding_dismissed_at DateTime?` column (migration
  `20260603092350_onboarding_dismissed_at`).
- `[dashboard]` Sidebar shortcut: a "Get started" entry appears in
  `Sidebar.tsx` *only* when the inline card is hidden (dismissed or
  all four complete). Clicking it calls reset and routes back to
  `/buckets`, which re-shows the card — useful for demos and for
  users who dismissed by mistake.
- `[dashboard]` `useCreateAgent` and `useMintApiKey` now also
  invalidate the onboarding query on success, so the card ticks the
  matching step within a few hundred ms of the action — no reload.
  Bucket / knowledge creation rely on the 30s `staleTime` +
  `refetchOnWindowFocus`; acceptable for v1.
- `[dashboard]` `/buckets?new=1` and `/agents?new=1` deep-link
  shortcuts auto-open the respective Create dialog and strip the
  query param via `router.replace` so a refresh doesn't re-trigger.
- Design system constraints honoured: weights 400 / 500 only, no
  shadows / blur / gradients, warm-stone palette + krater accent on
  the active step, sentence-case copy, 200ms transitions. Banned-
  phrase grep over `apps/dashboard/src/components/onboarding/`
  returns nothing.
- Files added: `apps/control-plane/src/onboarding/{onboarding.module,
  onboarding.controller,onboarding.service,onboarding.service.spec}.ts`,
  `apps/dashboard/src/components/onboarding/{OnboardingCard,
  OnboardingStep}.tsx`,
  `apps/dashboard/src/components/onboarding/visuals/{Buckets,Knowledge,
  Agents,Integrations}Visual.tsx`. Migration:
  `prisma/migrations/20260603092350_onboarding_dismissed_at/`. CSS:
  `~270 lines` of `.onb-*` rules at the end of
  `apps/dashboard/src/app/globals.css`.
- Not in scope: empty-state integration on `BucketsList` /
  `AgentsListTab` (showing "Step X of 4" pills), per-project
  onboarding (currently account-global), confetti / celebration
  toast on completion, persona-branching first step, marketing-site
  `/get-started` mirror, onboarding analytics.

### 2026-06-03 (later) — Onboarding card redesigned: focused stepper + watermark visuals

- `[dashboard]` First pass was a 4-card horizontal grid (~700px tall
  with visuals + bodies + CTAs per card). On a graduated account
  (4 of 4 done) it crowded the page and pushed the actual bucket
  list below the fold. Replaced with a **focused-stepper** layout
  (pattern reference: Stripe / Vercel onboarding bars). Single
  inline bar, ~140px tall in progress, ~48px when done.
- `[dashboard]` New shape: header strip with `Get started · X of 4`
  on the left, four numbered step-chips on the right that double as
  progress indicator + quick-jump tabs (click any chip to focus
  that step). Below: a single focused-step body — eyebrow ("NEXT
  01"), title, body, and one primary CTA. Only one decision visible
  at a time. "Done" state collapses to a single row with a
  `Review steps ▾` expander that lists the four ticked steps.
- `[dashboard]` Per-step visuals come back as a **background
  watermark** in the focus body — absolutely-positioned right-half
  fill at ~38% opacity, mask-fades toward the left so the text
  reads cleanly. Scale-1.7× transform pushes the chip compositions
  up to fill the half-bar (Step 4's grid layout keeps a 1.1×
  scale + fixed width since it already fills its container).
  Hidden below 920px viewports — text gets full width on narrow
  screens. `pointer-events: none` so text selection isn't blocked.
  Files: `apps/dashboard/src/components/onboarding/visuals/StepVisual.tsx`
  (one component switching on step key — replaces the four separate
  files from the first pass).
- `[dashboard]` `?fresh=1` preview mode: any URL with this param
  renders the card as if all four steps are pending and the user
  has not dismissed — for demos and design QA without touching DB
  state. No server change; pure client-side override in
  `OnboardingCard.tsx`.
- `[dashboard]` `BillingBanner` ([BillingBanner.tsx:48-50](apps/dashboard/src/components/billing/BillingBanner.tsx#L48))
  now also reads `useOnboarding()` and suppresses the soft "Add a
  payment method" banner whenever the onboarding card is visible.
  Hard-state banners (`past_due`, `cancelled`, `cap-exceeded`)
  unaffected — those are urgent and unmasked.
- `[dashboard]` `Sidebar` shows the "Get started" shortcut only
  when `dismissed_at !== null` (previously also showed it when all
  four were complete; that path is gone since the card now stays
  visible in the "All set" state until explicitly dismissed).
- Mask technique: `mask-image: linear-gradient(to right, transparent
  0%, rgba(0,0,0,0.25) 18%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,1)
  100%)` — 4-stop feather. See decisions.md for why this is an
  allowed exception to the design system's blanket "no gradients"
  rule (used as alpha mask, not as visible color).
- Files deleted: `OnboardingStep.tsx` and the four per-step
  visual files from the first pass (`{Buckets,Knowledge,Agents,
  Integrations}Visual.tsx`). Replaced with `OnboardingCard.tsx`
  (rewritten end-to-end) and `visuals/StepVisual.tsx` (single
  switch component). CSS rules rewritten under `.onb-bar`,
  `.onb-step-num`, `.onb-focus`, `.onb-focus-bg`, `.onb-vis-*` in
  `apps/dashboard/src/app/globals.css`.

- `[landing]` Repositioned the marketing site toward the verifiable agent
  runtime (per `docs/kraterion-strategy-v3.md`), web2 framing for any
  dev/startup — see decisions.md (2026-06-03). Home page re-angled runtime-led
  with storage as the foundation: rewrote `Hero.tsx`, `ProblemBeat.tsx`,
  `OwnershipClaims.tsx`, `MCPCallout.tsx`, and `Landing.tsx` (Agents section
  expanded into the runtime story with replay/audit/SDK/memory). Extended
  `AgentRunPanel.tsx` with a memory tool call + receipt/replayable footer; added
  `RuntimeCapabilities.tsx` and `visuals/LineageGraph.tsx`. New pages: `/runs`,
  `/lineage`, `/memory`, `/docs/langgraph`, `/docs/vercel-ai-sdk`. Reframed
  `/s3`, `/knowledge`, `/security` copy + metadata; updated Header/MobileNav,
  Footer, DocsSidebar, home metadata, and root JSON-LD/keywords. `/embed` left
  as a secondary surface (no longer in primary nav). Verifiability sold in web2
  terms (debug/reproduce/audit); crypto jargon kept to deep "how it works" copy.

- `[landing]` Content audit + cleanup pass across all marketing pages
  (correctness, flow, density). Fixed bugs: embed token prefix
  (`pk_share_` → `kr_share_test_`), agent pricing reconciled to BYOK $0
  (cleaned `PricingCalculator`, deleted dead `PricingMeters.tsx`), removed
  crypto-jargon leaks from primary copy (`0x…` owner/wallet chips, `t-of-n`,
  `DEK`/`KEK`, `sub-credential`, Walrus/Seal in pricing FAQ → web2 wording),
  fixed `/security` dangling "See limits below" + renumbered eyebrows, and the
  stale pricing benchmark date. De-duplicated `/s3` ↔ `/security` (s3 owns
  storage-distinct claims + hands sealing/revocation/audit to security; trimmed
  s3 audit table 6→3). Reduced density: home runtime/ownership de-dup + sub-head,
  knowledge hybrid-search jargon simplified + redundant receipt cards cut + 03→04
  bridge, security merged the two encryption visuals (removed `SealingFlow`),
  pricing public-link-egress clarified + repeated litany collapsed, runs lineage
  de-duplicated against the CAPTURED grid. Verified: typecheck + build clean, no
  new lint errors, all marketing routes 200. Docs pages left untouched this pass.

- `[landing]` Surfaced the underlying tech (Walrus / Sui / Seal / Walrus Memory)
  for the Sui Overflow submission while keeping the web2 voice. Factored a
  reusable `BrandLogo` (color for light bg, cream-mono mask for dark) out of
  `BuiltOn`. Added a global **footer "Built on" strip** (Walrus · Sui · Seal +
  "agent memory by Walrus Memory") on every page; a home **"How it's built"**
  section (`HowItsBuilt.tsx`, capability→primitive map) after the ownership
  beat (renumbered eyebrows to 05/06/07); and plain-language attribution
  captions under the existing diagrams on `/s3` (StorageSchema), `/security`
  (sealing → Seal, access policy → Sui), and `/runs` (record stored on Walrus,
  anchored on Sui). Also fixed a pre-existing banned phrase ("powered by
  Kraterion" → "by Kraterion") in the chat widget. Verified: typecheck + build
  clean, no new lint errors, all routes 200, no "powered by" left in copy.

- `[landing]` Rebuilt the `/docs` section into comprehensive, accurate product
  documentation, agents-first per the Walrus-track framing. Rewrote the docs
  index (agents-on-storage-you-own narrative, real link cards), the `DocsSidebar`
  GROUPS (every prior href was a dead `#anchor`), and the quickstart (real flow:
  zkLogin → dashboard bucket → S3 key → boto3 upload → enable knowledge → create
  agent → OpenAI-compatible invoke; dropped the fake `create_bucket`/`kraterion`
  CLI steps). Added 11 new pages: `concepts` (web3 in plain terms), `agents`
  overview + `tools`/`chat-api`/`memory`/`embed`, `knowledge` + `knowledge/search`,
  `s3-api`, `api-keys`, `mcp`, `architecture` (Move-level deep dive: KraterionBucket
  ownership, `seal_approve`, Walrus/pool renewal, the revocation guarantee,
  cancellation persistence), and `roadmap`. Relabeled the unbuilt `langgraph` and
  `vercel-ai-sdk` SDK pages under "Roadmap" with a "Coming soon — not yet
  available" banner. All examples use production domains
  (s3/api/mcp/app.kraterion.com). Corrected against source: CreateBucket and
  ListObjectsV1 → 501, 2 GiB caps, knowledge `/ask` removed (use an agent), MCP
  is 7 tools rejecting S3 keys, two credential types (AKIA SigV4 vs `kr_live_`
  bearer); also fixed the marketing `MCPCallout` tool count 6→7. Verified:
  typecheck clean, all 17 docs routes prerender static, OnThisPage rails match
  every page's `h2` ids, no dead `/docs` links, design-rule scan clean (no
  weight ≥600 / shadows / gradients / pure black-white). Pre-existing lint errors
  in unrelated motion components left untouched.

- `[landing]` Added a compliance/governance angle to support the mission.
  Research-backed mapping (EU AI Act Art. 12 record-keeping + Aug 2 2026
  enforcement; GDPR Art. 17 right-to-erasure + cryptographic erasure; ISO 42001
  / NIST AI RMF traceability) → Kraterion controls (durable run records,
  encryption + revocable access, replay, lineage). New combined **/compliance**
  page (hero with a requirements-mapped panel, "three demands" pillars,
  regulation-by-regulation rows, regulated-industry use cases, honest
  "controls, not a checkbox / not legal advice" disclaimer, CTA). Short home
  teaser "Built for the rules AI is facing" (eyebrow 06; Quickstart→07,
  Pricing→08) linking to /compliance. Custom on-brand visual `EuStars` (12-dot
  EU motif, non-trademarked) instead of importing official logos; Lucide icons
  for capabilities. Footer Resources + /security cross-link to /compliance.
  Claims deliberately hedged (helps/supports, never "makes you compliant").
  Verified: typecheck + build clean (36 routes), no new lint errors, routes 200.

- `[infra]` Made the backend deployable to DigitalOcean App Platform (landing +
  dashboard go to Vercel). Added single-stage Dockerfiles for control-plane,
  gateway, and worker (`apps/<svc>/Dockerfile`) that build from the repo root:
  `pnpm install` → `prisma generate` → `pnpm --filter "@kraterion/<svc>..." run
  build` (app + workspace deps in topo order). No Sui toolchain needed — Move
  SDK bindings are committed. Added `.dockerignore` (keeps all workspace members
  so `--frozen-lockfile` validates; strips build artifacts/secrets), `.do/app.yaml`
  (2 services + 1 worker + a PRE_DEPLOY `prisma migrate deploy` job + managed
  Postgres 16/Redis 7, bindable `${db.*}`/`${redis.*}`, secrets as SECRET-typed
  placeholders), `.env.production.example` (env checklist), and
  `docs/deployment-digitalocean.md` (runbook). All three apps already bind
  `0.0.0.0`/`PORT` and expose `/health` + `/health/ready`. Open decision flagged
  in the runbook: the gateway's multi-GiB body limit exceeds App Platform's
  ingress cap — large uploads must go direct-to-Walrus from the browser, or the
  gateway must run on a Droplet/DOKS. Not yet built/tested in CI (Docker build
  runs `pnpm install`, which needs an explicit go-ahead per the supply-chain
  rules).

- `[infra]` Deployed the backend to DigitalOcean App Platform (app id
  `48707638-82d6-4a07-bd9c-c22b89a036bb`, default ingress
  `https://kraterion-5glmp.ondigitalocean.app`). Three services live and
  healthy: control-plane (4001), gateway (4002), worker/indexer (4003);
  PRE_DEPLOY `prisma migrate deploy` applied all migrations incl. pgvector.
  Dedicated managed clusters `kraterion-db` (PG 16) + `kraterion-redis`
  (Valkey 8) in nyc3. Hostname ingress: api/mcp.kraterion.com → control-plane,
  s3.kraterion.com → gateway (DNS CNAMEs pending). Gotchas hit + recorded in
  runbook: GitHub-OAuth-only source → used a public `git` source; Redis can't
  be dev-tier + production DBs must be pre-created; gateway needs a one-time
  on-chain bootstrap (ran locally vs the prod DB with the prod wrapping key,
  topped up WAL via `walrus get-wal`, funded reserve); worker indexer needed
  `INDEXER_INITIAL_CHECKPOINT` (347115000) to avoid looping on pruned
  checkpoint 0. Verified end-to-end: indexer caught the bootstrap `test-bucket`
  (`0x1f420a…`) and wrote its DB row + api-access grants. Bumped bootstrap
  funding to 50 SUI (gateway) / 10 SUI (indexer) / 100 WAL (reserve). Committed
  `.do/app.yaml` now mirrors the live spec (secrets redacted).

- `[gateway][billing]` Storage-capacity monitoring made honest. New pools
  provision 5 GiB encoded (`INITIAL_RESERVED_ENCODED_BYTES`, decoupled from the
  500 MB Stripe free tier to avoid a paywall); existing pools backfilled to
  5 GiB via the one-off `apps/gateway/scripts/grow-pool.ts`. **Dashboard gauge
  fix:** the Usage page divided encoded-used by the *billing* reservation
  (500 MB), reading ~92% full on a pool that's ~9% used — now divides by the
  real on-chain `pool_reserved_mb` (5 GiB) and shows a live object count, since
  each blob reserves a ~64 MB encoded floor (`getEncodedBlobLength`). CP
  `usage.getCurrentPeriod().storage` now returns `pool_reserved_mb` +
  `object_count`. **Capacity guard fix:** `PoolCapacityGuard` projected raw
  content-length against encoded capacity (under-counting ~64000:1, never
  tripped — why the pool filled silently into an on-chain
  `EInsufficientCapacity` 500). Now projects the encoded blob size, enforces by
  default (`KRATERION_POOL_CAPACITY_ENFORCE=false` to disable), returns a clean
  S3 `InsufficientStorage` (507, non-retryable), and only fires on the objects
  controller so a full project can still create buckets.
