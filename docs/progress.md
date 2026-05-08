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
