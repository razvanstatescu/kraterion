# Decisions

Architectural and product decisions. Append-only, chronological. Each entry
explains *why*, not just *what* — so a future reader (you, Claude, a teammate)
can judge whether the decision still holds when the context changes.

**When to add an entry:** any time a non-obvious choice gets made (tooling,
shape, tradeoff between two valid options). Not for routine implementation.

**Format:** date, title, status, context, decision, consequences. Keep it tight
— a paragraph each is plenty.

---

## 2026-05-07 — Monorepo with Turborepo + pnpm workspaces

**Status:** Accepted

**Context:** 5 apps + 5 packages + a Move package + a shared design system, all
shipping together for a single hackathon submission. Multi-repo would have
forced npm publishing (or git submodules) for cross-package types and made
"change a shared type, update 5 callers" into 5 PRs.

**Decision:** Single git repo. Turborepo + pnpm workspaces. `workspace:*`
protocol for internal deps. Single Prisma schema at the root, shared by all
NestJS apps.

**Consequences:** One PR for cross-cutting changes. One CI run. Turbo handles
build order via `dependsOn: ["^build"]` and caches outputs. `git worktree` lets
us run multiple Claude Code sessions in parallel on different workstreams (per
plan §15.3). Cost: every contributor needs the whole repo, but with 5 packages
and a 6-week horizon that's a non-issue.

---

## 2026-05-07 — Service split: control plane vs gateway vs worker

**Status:** Accepted (per plan §3.2)

**Context:** Tempting to ship one NestJS app for everything in week 1.

**Decision:** Three separate NestJS apps from day one. Control plane (cold,
session-auth CRUD, port 4001), gateway (hot, SigV4, S3 ops, port 4002), worker
(BullMQ, renewal, port 4003).

**Consequences:** Different scaling profiles, different auth models, different
deploy cadences — splitting now avoids a painful refactor at scale. Cost: three
processes in dev. Mitigated by `pnpm dev` (Turbo runs them all in parallel with
prefixed logs).

---

## 2026-05-07 — Landing separate from dashboard

**Status:** Accepted

**Context:** Both are Next.js — could co-locate.

**Decision:** Two Vercel projects, two `apps/` directories. Landing on port
3000, dashboard on 3001.

**Consequences:** Independent deploy cadence (marketing copy ships without
touching the console). Vercel deploys only what changed because each project's
"Root Directory" is its `apps/X`. Cost: shared UI primitives need a third
package (`packages/ui`) — already done.

---

## 2026-05-07 — Move package lives in the monorepo

**Status:** Accepted

**Context:** Some teams ship on-chain code in its own repo for immutability /
audit isolation.

**Decision:** Keep `move/kraterion/` in the monorepo. The TS bindings in
`packages/kraterion-move-sdk` track Move ABI commit-for-commit; splitting them
into separate repos creates a sync problem with no upside at hackathon scale.

**Consequences:** Easy to keep bindings in sync. Easy to reproduce a build of
"this exact gateway with this exact Move package." Re-evaluate post-hackathon
if a real audit firm asks for an isolated Move repo.

---

## 2026-05-08 — Buckets are always shared objects (enforced at the API surface)

**Status:** Accepted

**Context:** The S3 gateway signs PutObject transactions with its own
keypair, not the user's. If a `KraterionBucket` were owned, only the user
could include it as a tx input and S3 SDK uploads would be impossible.
The contract needs to *guarantee*, not just *suggest*, that buckets end up
shared.

**Decision:** The contract exposes only entry functions that share
atomically — `create_and_share_bucket(name, mode, ctx)` and
`create_grant_and_share_bucket(name, api_addr, mode, ctx)`. There is no
`public fun create_bucket(...) -> KraterionBucket`. The internal `new_bucket`
helper that returns the value is module-private. Every caller — including
arbitrary PTBs and future modules in the package — is forced through one of
the share-atomic paths.

**Consequences:** Compile-time guarantee that no unshared bucket ever escapes.
Authorization is enforced at the Move level via `ctx.sender()` checks
(`owner` for everything, `api` addresses for read+write). Cost: callers can't
do "create + grant + custom step + share" — every new combination needs a
new entry function. Acceptable for hackathon scope; revisit if PTB
flexibility becomes a real need.

---

## 2026-05-08 — Encryption is always on; the bucket's mode controls the policy, not the bytes

**Status:** Accepted (deviates from `docs/implementation-plan.md` §2.5)

**Context:** Plan §2.5 described public-read files as plaintext on Walrus
served via the aggregator's open URL. That's faster for public reads (no
Seal call) but it forces re-uploads when a bucket flips public→private,
and it splits the data shape on Walrus into two paths (encrypted vs
plaintext).

**Decision:** Every file at the gateway is Seal-encrypted regardless of
bucket mode. The bucket's `encryption_mode` controls the access policy
inside `seal_approve` — public buckets approve anyone, private buckets
approve owner + api list. Switching modes is a single function call
(`set_bucket_visibility`); no re-upload, no migration.

**Consequences:** Stronger guarantee — the user can flip a public bucket
private at any time, and access changes immediately for every existing file.
Same story for the demo's "make this private" lever. Cost: public-read
serves go through Seal threshold key servers instead of plain CDN reads;
that's slower and not CDN-cacheable. For testnet/hackathon: irrelevant. For
production: revisit if public-read traffic gets large.

---

## 2026-05-08 — Access policy is per-bucket, not per-file

**Status:** Accepted

**Context:** Plan §4 originally stored `encryption_mode: u8` on each
`KraterionObjectMetadata` (per-file). That requires every PutObject call to
pass a mode argument and lets a bucket end up with a mix of public and
private files — a UX footgun.

**Decision:** `encryption_mode: u8` lives on `KraterionBucket`. All files in
the bucket inherit it. `wrap_in_shared_blob` no longer takes a mode
parameter; `seal_approve` reads the mode off the bucket reference it
already has.

**Consequences:** Simpler gateway code, simpler mental model, simpler demo
("flip THIS bucket public→private" instead of "flip THIS file"). Combined
with always-encrypt, switching modes is a single owner-only Move call.
Trade-off: no support for "bucket is mostly public except a few private
files" — hackathon scope doesn't need it.

---

## 2026-05-08 — No `Clock` parameter in any entry function; no `timestamp_ms` in any event

**Status:** Accepted

**Context:** Plan §4 had `clock: &Clock` on every event-emitting function so
the event could carry `timestamp_ms`. Each `Clock` reference adds a
shared-object input to the tx (consensus cost), and the timestamp is
duplicating information already available in the transaction effects.

**Decision:** Drop `Clock` from every entry function. Drop `timestamp_ms`
from every event struct. The off-chain indexer reads the executed-at
timestamp from `TransactionEffects` when materializing events into Postgres
— that's the authoritative source anyway.

**Consequences:** Cheaper transactions (no Clock shared-input), simpler
function signatures, less on-chain noise. The indexer must always join
event → tx digest → executed_at; that's already the canonical pattern in
Sui indexers, so no extra cost.

---

## 2026-05-08 — Metadata via events, not dynamic fields on `SharedBlob`

**Status:** Accepted

**Context:** Plan §4.2 attached `KraterionObjectMetadata` to each `SharedBlob`
via `df::add(&mut shared.id, ...)`. But upstream `walrus::shared_blob`
doesn't expose `&mut UID` on the SharedBlob, so external modules cannot
attach dynamic fields. The pattern in §4.2 won't compile.

**Decision:** Drop the dynamic-field metadata. Emit a
`KraterionObjectCreated` event on every wrap with all the metadata the
indexer needs (`s3_key`, `content_type`, `walrus_blob_id`,
`walrus_blob_object_id`, `wrapped_by`, `funded_amount`, etc). Postgres is
the authoritative metadata store; on-chain `SharedBlob` is the
source of truth for *existence* and *funding*.

**Consequences:** Off-chain indexer is required for metadata reads — works
fine for the dashboard and gateway flows. Re-evaluate if/when Walrus
exposes the SharedBlob's UID for external dynamic fields. Note: the new
SharedBlob's Sui object ID is *also* not in the event because
`shared_blob::new_funded` shares internally and doesn't return it; the
indexer joins by tx digest (created-objects list ↔ event payload).

---

## 2026-05-08 — Walrus + WAL deps via Walrus testnet branch only

**Status:** Accepted

**Context:** Move.toml originally pinned both Sui (`framework/testnet`) and
Walrus (`main`). The two pin different Sui revisions, which the build
rejected with a "depends on multiple versions of package 0x...0002" error.

**Decision:** Drop the explicit `Sui` dependency. List only
`Walrus = { ..., rev = "testnet" }`; the Sui CLI auto-includes Sui +
MoveStdlib + System using whichever Sui rev Walrus's Move.toml pins
(`testnet-v1.71.1` at the time of writing). The `wal::wal::WAL` token type
is brought in transitively because `contracts/walrus/Move.toml` depends on
the local `contracts/wal` package.

**Consequences:** No version conflict; deterministic dep graph. Cost: we
inherit Walrus's Sui pin, so a Sui framework upgrade requires waiting for
Walrus to upgrade first. That's fine — we're tracking testnet, not
mainnet.

---

## 2026-05-08 — TS bindings via `@mysten/codegen`, generated bindings committed

**Status:** Accepted

**Context:** `packages/kraterion-move-sdk` needs to expose typed PTB-builder
helpers and BCS schemas so the gateway, worker, and dashboard can call the
deployed Move package without hand-writing 16+ wrappers + 6 BCS decoders.
Two viable tools in May 2026: Mysten's first-party `@mysten/codegen`
(`sui-ts-codegen` CLI), and the older community `kunalabs-io/sui-client-gen`.

**Decision:** Use `@mysten/codegen` 0.10.4. Its config-driven workflow
(`sui-codegen.config.ts` → `sui move summary` → `sui-ts-codegen generate`)
fits the monorepo. Output goes to `packages/kraterion-move-sdk/src/generated/`
and **is checked into git** so consumers (apps/gateway, apps/worker,
apps/dashboard) don't need the Sui CLI to build. Only the intermediate
`move/kraterion/package_summaries/` is gitignored.

**Consequences:** ~15 lines of config, one `pnpm generate` command, and the
SDK has fully typed bindings with `.fromBase64`/`.fromHex`/`.parse`/`.get`
on every event and struct. Iteration cost: re-run `pnpm generate` after
every Move-source change. Future-proofing: if codegen emits invalid TS or
the `@mysten/sui` SDK breaks the API, the build catches it (we run
typecheck on every CI run). The community alternative `sui-client-gen`
is now functionally superseded — Mysten ships the canonical path.

**Notes:** `@mysten/codegen` requires `@mysten/sui` ≥ 2.x for its
`ClientWithCoreApi` / `SuiClientTypes` types — bumped from 1.20 to 2.16
during this work. The SDK 2.x rename (`SuiClient` → `SuiJsonRpcClient`,
`getFullnodeUrl` → `getJsonRpcFullnodeUrl`, in `@mysten/sui/jsonRpc`) is
a known migration footgun; logged in `docs/runbook.md`.

---

## 2026-05-08 — `Published.toml` and `Move.lock` are the on-chain source of truth, `constants.ts` is the runtime mirror

**Status:** Accepted

**Context:** Two files now carry our deployed package ID: Move's own
`move/kraterion/Published.toml` (auto-written by `sui client publish`) and
`packages/shared/src/constants.ts::KRATERION_PACKAGE_ID` (written by our
`scripts/setup-testnet.sh`).

**Decision:** Both are committed and authoritative for their respective
toolchains:
- `Published.toml` is consumed by `sui move build` / `sui move upgrade`
  to know what's deployed where. It says inside itself "SHOULD be
  committed to source control."
- `constants.ts` is consumed by the TS runtime (gateway, worker,
  dashboard, codegen MVR override) and is the only thing JS bundlers can
  import.
- `setup-testnet.sh` is the one source that writes `constants.ts`; never
  hand-edit. After re-publish (`--force`), both files update on the same
  commit so they can't drift.

**Consequences:** Two files, one truth — checkable by diffing the package
ID across both. Cost: one extra place to update; mitigated by the script
keeping them in sync.

---

## 2026-05-08 — Bindings auto-regenerate via Turbo on Move source change; deploy script enforces sync as a safety net

**Status:** Accepted

**Context:** Generated TS bindings can drift from the Move source they were
produced from. Hooking codegen on *deploy* would catch the drift far too
late — by then, app code has already been written against stale bindings.
The right hook is on Move source change, with a defensive check at deploy.

**Decision:** Two layers.

1. **Turbo wiring (primary).** `turbo.json` declares
   `@kraterion/kraterion-move-sdk#generate` with
   `inputs: [move/kraterion/sources/**, move/kraterion/Move.toml,
   sui-codegen.config.ts]`. The package's `build`, `typecheck`, and `test`
   tasks all depend on `generate`. So `pnpm typecheck` at the repo root
   regenerates bindings automatically when Move source has changed, and
   uses the cache when nothing has. Verified empirically: cached run is
   ~20 ms; cache invalidates correctly when Move source content changes.

2. **Deploy-script safety net (secondary).** `scripts/setup-testnet.sh`,
   before any publish, runs `sui move test`, regenerates bindings, and
   typechecks the SDK package. If any step fails, the publish is aborted.
   This catches the case where someone bypasses Turbo (e.g., publishes
   from a different machine that doesn't have node_modules installed).

**Consequences:** Bindings can never silently drift from Move source on a
machine that runs `pnpm typecheck` or the deploy script. Cost: every Move
source change incurs one codegen run on the next typecheck; ~2s. Manual
escape hatch: `pnpm --filter @kraterion/kraterion-move-sdk generate`.

**Alternatives rejected:**
- Post-publish hook: too late. Apps are already broken before deploy.
- Pre-commit hook: hostile to WIP commits, slow.
- CI-only check: doesn't help local dev iteration.

---

## 2026-05-08 — Single Prisma schema at the repo root, generated client at workspace root

**Status:** Accepted

**Context:** Three NestJS apps (control-plane, gateway, worker) all share
the same Postgres. The plan §3.3 puts `prisma/schema.prisma` at the repo
root. Possible alternatives: per-app schemas (drift), a `packages/db`
package re-exporting `PrismaClient` (extra package boundary, marginal
benefit at this scale).

**Decision:** Keep `prisma/schema.prisma` at the repo root; install
`prisma` and `@prisma/client` at the workspace root (devDeps); apps import
`@prisma/client` directly. Root `pnpm db:*` scripts wrap the CLI with the
schema path baked in. The `.env` file at the root carries `DATABASE_URL`
and is loaded automatically by Prisma; apps consume the same env via
`process.env`.

**Consequences:** One schema, one truth, one migration history. Cost: one
extra workspace-root devDep instead of per-app; outweighed by avoiding
schema duplication. Future move to `packages/db` is a refactor, not a
rewrite — if an app needs a custom Prisma extension or a typed
`PrismaService`, that's the time.

---

## 2026-05-08 — `encryption_mode` lives on `Bucket` only, not on `S3Object`

**Status:** Accepted (deviates from `docs/implementation-plan.md` §5)

**Context:** Plan §5 carries `encryption_mode` on `S3Object`. That made
sense when the design allowed per-file modes. Our final Move design (per
the per-bucket-policy decision recorded above) makes mode a bucket-wide
property — flipping `set_bucket_visibility` changes access for *every*
object in the bucket instantly.

**Decision:** Drop `encryption_mode` from `S3Object`. Read it off the
parent `Bucket` row. `seal_identity` and `encryption_envelope` are
unconditionally populated for every object (since encryption is always on
at the gateway).

**Consequences:** No way for `S3Object.encryption_mode` to disagree with
`Bucket.encryption_mode` — the row simply doesn't exist. ListObjectsV2
needs to JOIN on `Bucket` to surface mode in the response, which adds one
index lookup per page; acceptable for hackathon scale and easy to
denormalize later if it ever becomes hot.

---

## 2026-05-08 — Walrus integration: SDK + public testnet upload-relay (Architecture D)

**Status:** Accepted (deviates from `docs/implementation-plan.md` §3.1 and §10)

**Context:** Plan §3.1 listed a self-hosted Walrus publisher binary (8
sub-wallets, JWT-gated) and a self-hosted aggregator. Plan §10.2 already
softened that to "use the SDK directly." Research into the Walrus
operator docs and the `@mysten/walrus` SDK source surfaced a third path:
the SDK can offload the encoding + storage-node fanout to an Upload Relay
(`https://docs.wal.app/operator-guide/upload-relay.html`) while the
client retains the on-chain signer.

**Decision:** Use the SDK with the upload-relay write path. For testnet,
use Mysten's public relay (`https://upload-relay.testnet.walrus.space`)
and aggregator (`https://aggregator.walrus-testnet.walrus.space`). For
production, host our own relay (light, stateless, no keypair) but
continue to skip the publisher binary entirely.

**Consequences:**
- The gateway always signs every on-chain operation with its own keypair.
- WAL is paid by the gateway from a single on-chain platform reserve
  (see the next decision). Storage-extension renewals are also paid
  from the reserve.
- The relay never sees plaintext (we Seal-encrypt before upload), never
  signs anything, and can't substitute the blob ID. Single-request
  liveness risk only.
- Atomic PTB composition is preserved — `writeBlobFlow.register()` returns
  a composable Transaction we can extend with our `wrap_in_shared_blob`
  call before signing.
- No publisher droplets, no JWT auth setup, no sub-wallet pool to manage.

**Rejected alternatives:**
- Architecture A (SDK-only, gateway streams to ~100 storage nodes per
  write) — too noisy on egress at any real load.
- Architecture B (public Mysten publisher) — public publisher caps blobs
  at 10 MiB and is rate-limited; structurally incompatible with our
  13 GiB target.
- Architecture C (self-hosted publisher binary) — what Inkray does; loses
  atomic-PTB composition because the publisher signs its own register tx
  before we can extend it.

---

## 2026-05-08 — Single platform WAL reserve, no per-bucket funding pools

**Status:** Accepted (replaces plan §4 `funding_pool` field + §3.1 publisher sub-wallet pool)

**Context:** Plan §4.2 had a `funding_pool: Balance<WAL>` on each
`KraterionBucket`, with `fund_bucket` allowing anyone to top it up and
`wrap_in_shared_blob` draining it. Plan §3.1 separately specified an 8-
wallet publisher sub-wallet pool. Both proliferated WAL across many
on-chain locations and required moving WAL between wallets per-upload —
expensive (gas) and operationally noisy.

**Decision:** Drop per-bucket pools entirely. Introduce a single shared
`PlatformReserve` object (in the new `kraterion::reserve` module) that
holds the platform's WAL. The reserve has:
- `admin: address` — the deployer; can authorize callers and withdraw.
- `authorized_callers: vector<address>` — whitelist of platform wallets
  (gateway, renewal worker) that can drain WAL from the reserve.
- `wal_balance: Balance<WAL>` — the platform's WAL pot.

WAL leaves the reserve only inside specific atomic operations:
- `register_blob_for_bucket` — pays for storage reservation + blob
  registration. Two-check auth: caller must be on the reserve whitelist
  AND on the target bucket's `api_decryption_addresses` (or be the
  bucket's owner).
- `extend_blob_from_reserve` — pays for storage extension on a SharedBlob.
  One-check auth: caller must be on the reserve whitelist. No bucket
  reference — the operation is per-blob, not per-bucket.

Anyone can call Walrus's native `register_blob` (paying themselves) and
`shared_blob::extend` (draining the SharedBlob's own jar). Our wrapped
versions are *additions* to those, not replacements.

**Consequences:**
- One WAL pot to top up; one balance to monitor.
- Two-check auth on register cleanly prevents two abuses: a bucket-
  authorized address that's not on the reserve whitelist (a user, an
  ex-platform-wallet) can't drain platform funds; a reserve-whitelisted
  address that's not authorized for a bucket can't write into someone
  else's bucket.
- `KraterionBucket.funding_pool` field is gone. So is `fund_bucket`.
  `KraterionObjectCreated.funded_amount` event field is also gone — we
  no longer pre-fund the SharedBlob's jar at wrap time. The jar starts
  empty; renewals pump WAL into it on demand.
- Users can self-fund by calling Walrus's own `shared_blob::fund` /
  `shared_blob::extend` — works for the cancellation-persistence demo
  (anyone can keep your blob alive after we cancel your account).

---

## 2026-05-08 — `PlatformReserve` is spawned by Move's `init`, not via a follow-up tx

**Status:** Accepted

**Context:** With the `kraterion::reserve` module added, deploy now needs
two on-chain entities: the package, and the singleton reserve. We could
require a second tx after publish (`create_and_share_reserve`) to spawn
the reserve, or use Sui's package-`init` mechanism to do it atomically
during publish.

**Decision:** Make creation part of `init(ctx)` in the reserve module.
Sui calls `init` exactly once at publish time, with `ctx.sender()` set to
the publisher's address — that becomes the reserve's `admin`. The
package is fully operational the moment `sui client publish` returns.

The previously-public `create_and_share_reserve` is gone. A
`#[test_only] public fun init_for_testing(ctx)` mirror lets unit tests
drive the same construction path (Move's test framework doesn't run
package `init` automatically).

**Consequences:**
- One-step deploy: `setup-testnet.sh --force` lands the package AND the
  reserve in a single tx. No "did you remember to spawn the reserve"
  failure mode.
- Deployer becomes admin automatically — no extra step to assign.
- The reserve's object ID is captured by `setup-testnet.sh` from the
  publish response's `objectChanges` filtered by type
  `${PACKAGE_ID}::reserve::PlatformReserve`, then written into
  `packages/shared/src/constants.ts` as `KRATERION_RESERVE_ID`.
- Re-publishing creates a fresh reserve at a new object ID. The old one
  is orphaned but harmless (its WAL is still recoverable via
  `withdraw` if it had any). Worth flagging in the runbook.
- Future "v2" reserves (e.g. region-sharded) would need to be created
  via a separate dedicated entry function. We can add that when the
  need actually arises.

---

## 2026-05-08 — Bumped `@mysten/seal` to 1.1.3 and `@mysten/walrus` to 1.1.6 to match decentralized committee + relay APIs

**Status:** Accepted

**Context:** The plan was written when our installed SDKs were
`@mysten/seal@0.6` and `@mysten/walrus@0.6.7`. Two newer realities forced
bumps:
- The Decentralized Seal Committee (3-of-5 internal threshold across
  Mysten + Natsai + Overclock + NodeInfra + Ruby Nodes) requires SDK
  ≥ 1.1.
- `@mysten/walrus@1.1.6` is the version that ships the
  `writeBlobToUploadRelay({ blob, blobId, nonce, txDigest, blobObjectId,
  deletable })` shape we depend on (returns `{ blobId, certificate }`
  ready to feed into `certifyBlob`).

**Decision:** Pin `@mysten/seal: ^1.1.3`, `@mysten/walrus: ^1.1.6`,
`@mysten/sui: ^2.16.2` across the workspace (peer-dep alignment).

**Consequences:** All 15 workspace `typecheck` tasks pass. SDK 2.x's
`SuiClient → SuiJsonRpcClient` and `getFullnodeUrl →
getJsonRpcFullnodeUrl` rename was already documented in the runbook
from earlier work. No breaking changes to our generated bindings
(codegen output is unchanged).

---

## 2026-05-08 — Decentralized Seal Committee for testnet (single trust unit, threshold 1)

**Status:** Accepted

**Context:** Plan §7.8 originally suggested a 2-of-3 of independent
open-mode key servers. Mysten shipped a Decentralized Seal Committee
(`https://blog.sui.io/introducing-decentralized-seal-key-server-testnet/`)
that exposes one on-chain object backed by a 3-of-5 internal threshold
across geo-distributed operators with a Mysten-operated trustless
aggregator.

**Decision:** Use the Decentralized Committee. Configure `SealClient`
with one `KeyServerConfig` (objectId
`0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98`,
weight 1, `aggregatorUrl: https://seal-aggregator-testnet.mystenlabs.com`)
and SDK-side threshold `1`. Stronger trust property than independent
servers (geo-distributed, MPC-protected master key) with the same SDK
shape.

**Fallback:** If the committee proves unstable on testnet, swap to a
2-of-3 of independent open-mode servers. One-line config change in
`packages/shared/src/constants.ts`; everything downstream is unaffected.

**Consequences:** Encryption/decryption requests go through the
aggregator (single endpoint) instead of fanning out to N key servers
from our process. Slightly different latency profile than independent
servers; expected to be faster and more stable since the committee
absorbs internal-share fanout.

---

## 2026-05-08 — Architecture-D wrapper packages live in `packages/{walrus,seal}-client`, not in the gateway

**Status:** Accepted

**Context:** The gateway, the worker, and (eventually) the dashboard
all need to talk to Walrus and Seal with identical config. Putting the
construction logic inside the gateway tied configuration to one app
and forced the others to duplicate.

**Decision:** Both wrappers live as workspace packages. Each exports a
memoized factory (`getWalrusClient`, `getSealClient`) plus a small
surface of "the only operations Kraterion uses":
- `walrus-client`: `encodeBlob`, `writeBlobToUploadRelay`,
  `certifyBlobFragment`, `readBlobByBlobId`, `getSuiClient`.
- `seal-client`: `encrypt`, `decrypt`, `getOrCreateSessionKey`,
  `getSealClient`.

Network constants (relay URL, aggregator URL, key-server IDs,
threshold) come from `@kraterion/shared`. SessionKey caching lives in
`seal-client.getOrCreateSessionKey(opts)` — caller passes a Redis
instance.

**Consequences:** Apps import a tiny, intent-revealing API instead of
constructing SDK clients themselves. Swapping testnet→mainnet is a
one-line constants change; the wrapper APIs don't move. SessionKey
caching lives once (instead of being re-implemented per app). Read path
uses the public Walrus aggregator via plain `fetch` — no storage-node
fanout from the gateway, single HTTP GET per read.

---

## 2026-05-08 — Wrapper packages must add value, never duplicate the SDK

**Status:** Accepted (codified after a Phase-2 audit found 6 redundant pass-throughs)

**Context:** First-pass `@kraterion/walrus-client` and `@kraterion/seal-client`
exported thin pass-throughs of `client.encodeBlob`,
`client.computeBlobMetadata`, `client.writeBlobToUploadRelay`,
`client.certifyBlob`, `client.encrypt`, and `client.decrypt`. Each was
1–3 lines forwarding arguments. Looked like cohesion; was actually drag —
every consumer paid an extra import indirection and the wrapper API
drifted as soon as the SDK added a new option (`signal`, `aad`, etc).

**Decision:** Wrappers expose only what the SDK doesn't already give us:

1. **Constructor / config functions** that bake in our network choice,
   key-server set, relay tip cap, etc. — `getSuiClient`,
   `getWalrusClient`, `getSealClient`.
2. **Helpers the SDK has internally but doesn't export publicly** —
   `getEncodedBlobLength` and `rootHashBytesToU256` in walrus-client;
   `getOrCreateSessionKey` (Redis-cached) in seal-client. Each is
   documented with the upstream gap it fills.
3. **Re-exports** of public SDK helpers we want every consumer to find
   under our package name (e.g. `blobIdToInt` re-exported as
   `blobIdStringToU256` for naming consistency at our call sites).
4. **Read-path overrides** where the SDK's default does the wrong thing
   for our case. `readBlobByBlobId` uses the aggregator's HTTP endpoint
   instead of the SDK's `client.readBlob()` storage-node fanout — a
   deliberate latency/egress choice for our gateway.

**Forbidden:** 1:1 pass-throughs in `packages/{walrus,seal}-client`. If
the only thing a function does is call `getXxxClient().method(arg)`, it
must be deleted and callers updated to call the SDK directly via the
memoized client.

**Consequences:** Wrappers stay small (~150 LOC each) and self-
explaining. Callers lean on the SDK's typings, signal-handling, and
option set without us having to re-thread changes. New SDK methods are
zero-effort to consume. Cost: one extra step per call site
(`getWalrusClient()` then `client.encodeBlob(...)` instead of just
`encodeBlob(...)`) — a tolerable trade for the lower drift.

**The audit that triggered this:** dropped 6 pass-throughs (4 in
walrus-client, 2 in seal-client), replaced `getAllCoins` + filter loop
with `client.getBalance({ coinType })`, and replaced manual `splitCoins`
ceremony with `coinWithBalance({ type, balance })` from
`@mysten/sui/transactions`. Smoke test still passes end-to-end.

---

## 2026-05-08 — Gateway uses Nest Guards (not Middleware) for SigV4 in Fastify mode

**Status:** Accepted

**Context:** Nest's `NestMiddleware` in Fastify mode receives Node's
raw `req`/`res` objects, not Fastify's typed request. We want
`req.kraterion = { identity, bucket, key }` to be readable from
controllers via the Fastify module-augmentation pattern (`declare
module "fastify" { interface FastifyRequest { kraterion?: ... } }`).
With raw req, we'd be reaching into a different object than the one
controllers see — silent "set somewhere, can't read it" bugs.

**Decision:** SigV4 enforcement lives in `Sigv4Guard` (a Nest
`CanActivate`), applied per-controller via `@UseGuards(Sigv4Guard)`.
Guards' `ExecutionContext.switchToHttp().getRequest()` returns the
actual `FastifyRequest`, so the augmentation works. Guards also
naturally throw `HttpException` (our `S3Error` subclasses it), which
the global `S3ExceptionFilter` catches and renders as canonical XML.

**Consequences:** `/health*` stays unauthenticated (no `@UseGuards`
on `HealthController`). Every S3 controller adds one `@UseGuards`
decorator. No global guard — that would break liveness probes. URL-
style parsing (bucket extraction) happens inside the guard rather
than upstream — acceptable since `parseUrlStyle()` is pure CPU and
runs once per request.

---

## 2026-05-08 — `CreateBucket` returns 501 from the S3 API; bucket creation lives in the dashboard

**Status:** Accepted

**Context:** Bucket creation requires the user's zkLogin signature —
the on-chain `KraterionBucket.owner` field is set to `ctx.sender()`
of the create transaction. We can't fake that from gateway code; the
user has to sign with their own wallet.

**Decision:** S3 API's `PUT /:bucket` returns `501 NotImplemented`
with a message pointing the user at the Kraterion dashboard. Test
buckets for development are created by
`scripts/bootstrap-gateway.ts` (signed with the deployer keypair, so
the deployer ends up as `owner` — fine for dev, replaced by real
zkLogin flow when the dashboard ships).

**Consequences:** boto3 / aws-cli / rclone users who try
`s3 mb s3://x` get a clear error pointing them to the dashboard. No
silent half-failure where a bucket exists in DB but not on-chain.
Demo flow stays: dashboard.create-bucket → boto3.put_object works.

---

## 2026-05-08 — Gateway is ESM; workspace packages export from `dist/`, not `src/`

**Status:** Accepted

**Context:** Phase 4 of the gateway build is the first place we wire the
workspace packages (`@kraterion/walrus-client`, `@kraterion/seal-client`,
`@kraterion/kraterion-move-sdk`, `@kraterion/shared`) into the gateway's
NestJS controllers — until Phase 4 those packages were only consumed by
the off-S3 smoke test, which runs through `tsx` and never exercised the
gateway's compiled output.

Two issues surfaced as soon as the read controller imported them:

1. The workspace packages are pure ESM (`"type": "module"`), and the
   gateway was CommonJS. CJS `require()` of an ESM module fails at
   runtime; tsc emits no warning under `module: CommonJS` because the
   incompatibility is a Node-runtime-level concern, not a type concern.

2. The workspace packages had `"main"`/`"types"`/`"exports"` pointing at
   `./src/index.ts` directly. Node ESM cannot load `.ts` files at
   runtime — only the dev-time `tsx` loader can. The first `node
   dist/main.js` boot crashed with `ERR_UNKNOWN_FILE_EXTENSION` for
   `packages/shared/src/index.ts`.

**Decision:**

- Gateway is now ESM. `apps/gateway/package.json` has `"type": "module"`,
  `tsconfig.json` is `module: NodeNext` + `moduleResolution: NodeNext`,
  and every relative import in `src/` carries an explicit `.js`
  extension (matching Node's runtime ESM resolution).
- All four workspace packages now export compiled `dist/` artifacts
  rather than `src/`. The new `package.json` shape is:
  ```json
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
  ```
  Turbo's `typecheck: { dependsOn: ["^build"] }` already builds workspace
  packages before consumers typecheck, so the `.d.ts` artifacts are
  always fresh.

**Consequences:**

- One-time cost: 16 relative imports in gateway src gained a `.js`
  extension; one workspace package package.json change apiece.
- The gateway boots clean under `node dist/main.js`, with NestJS 10 +
  Fastify decorators emitting normally under TypeScript NodeNext.
- `ioredis` requires named import `{ Redis }` instead of default — the
  package ships CJS without `exports`, so under NodeNext the default
  becomes the whole module record rather than the class.
- Future workspace packages must keep building before consumers
  typecheck. If we ever skip a build (`turbo run typecheck --no-deps`),
  consumers will see stale `.d.ts` files.
- The smoke test (`tsx`) is unaffected — `tsx` resolves both `src/` and
  `dist/` paths.

**Rejected alternatives:**

- *Keep gateway as CJS, dynamic-import the ESM workspace deps:* every
  call site would need an `await import(...)` cache, polluting every
  Nest service. Untenable surface area.
- *Ship dual CJS+ESM builds for workspace packages:* doubles the build
  output, requires `tsup`/`tshy`-style tooling, no actual consumer needs
  CJS. Premature.
- *`module: CommonJS` + `moduleResolution: Bundler`:* TS warns and the
  combination doesn't actually fix the runtime problem (Node still
  can't `require()` ESM).

---

## 2026-05-08 — Drop `S3Object.encryption_envelope`; Seal embeds it in the ciphertext

**Status:** Accepted (deviates from original plan §5)

**Context:** Plan §5 carried a separate `encryption_envelope` column on
`S3Object` for the AES envelope. That made sense when we planned to
generate AES keys ourselves and have Seal wrap *just the AES key* (the
"old" Seal pattern from the AES-only era). The actual `@mysten/seal` 1.1
SDK `client.encrypt({ packageId, id, threshold, data, demType: AesGcm256 })`
returns a single `encryptedObject` blob that already contains:

  - The BCS-encoded recipient set (key servers + threshold)
  - The IBE-derived envelope key
  - The AES-GCM ciphertext + authentication tag

Splitting the envelope into a separate column would mean prying open the
SDK's BCS structure to extract the prefix, which (a) wastes a column,
(b) re-implements internals the SDK already handles, and (c) would break
on every SDK bump that changes the envelope layout.

**Decision:** Drop `S3Object.encryption_envelope`. The full Seal-encrypted
output is what we push to Walrus, what Walrus content-addresses by
`walrus_blob_id`, and what we hand back to `seal.decrypt()` at GET time.
The `seal_identity` column (48 bytes: `bucket_uid || object_uuid`) is the
only extra IBE input the gateway needs to track per-object; everything
else is reconstructable from the ciphertext.

**Consequences:**

- Migration `20260508104237_drop_encryption_envelope` removes the column.
- Gateway code never serializes/deserializes the envelope independently.
- One less moving part to keep in sync across PutObject/GetObject paths.

---

## 2026-05-08 — S3 read-path conformance audit: silent-ignore Range and conditionals; canonical success headers

**Status:** Accepted

**Context:** First end-to-end audit of `ObjectsReadController` against
real S3 client behavior (boto3 + aws-cli). Three findings against our
v1 surface:

1. **`Range:` was returning 501.** RFC 7233 §3.1 says "A server that
   does not support range requests for the target resource... MUST
   ignore a Range header field." We *do* advertise `Accept-Ranges:
   none` (the spec-compliant signal), so the 501 was inconsistent.
   More importantly: boto3's `download_file` probes ranges first and
   falls back to single-shot on 200; on 501 it surfaces the error
   directly. `aws s3 sync`, multipart-download fallback, rclone, and
   smart_open all break on 501.

2. **Conditional headers were also returning 501.** RFC 7232 §6 says
   servers MAY ignore conditionals on resources that don't support
   them. AWS S3 honors all four (`If-Match`, `If-None-Match`,
   `If-{Modified,Unmodified}-Since`); CloudFront, `aws s3 sync`,
   Terraform's S3 backend, and any caching client rely on
   `If-None-Match` for cheap "is this stale?" checks. 501 made
   `aws s3 sync` re-download every object every run.

3. **Canonical success headers were missing.** AWS S3 success responses
   include `x-amz-server-side-encryption` (when SSE was used),
   `x-amz-request-id`, `x-amz-id-2`. Our error filter set the latter
   two; the success path didn't.

**Decision:**

- `Range:` and the four conditional headers are now *silently ignored*.
  We return 200 with the full body. Honoring `If-None-Match` → 304 is
  a Phase-6 follow-up (~5-line change once we have ListObjectsV2
  working).
- `setReadHeaders` adds `x-amz-server-side-encryption: AES256`,
  `x-amz-request-id`, and `x-amz-id-2` on every successful read.
  AES256 is the standard SSE marker; under the hood we run Seal IBE
  → AES-GCM-256, but AWS-aware tooling parses the canonical enum.
- Walrus aggregator transient failures (timeout, 5xx, connection
  reset) translate to **`ServiceUnavailable` (503)** instead of
  bubbling as `InternalError`. Boto3 auto-retries on 503 with capped
  exponential backoff; we get free retries without re-implementing.
- A post-decrypt byte-length check asserts `plaintext.byteLength ===
  Number(objectRow.size_bytes)`. A mismatch is silent corruption —
  log loudly, return `InternalError`, never auto-retry past it.
- Hard cap on read path: `MAX_DECRYPT_BYTES = 2 GiB`. AES-GCM is
  non-streaming (the auth tag at the end of the ciphertext must be
  validated before any plaintext is released), so we have to buffer
  both ciphertext and plaintext in RAM. Larger objects return
  `EntityTooLarge`. Chunked-frame Seal envelopes (Iceberg-style) are
  post-hackathon.

**Consequences:**

- 12/12 boto3 cases pass, including a new "canonical headers
  well-formed" assertion that locks in the response shape.
- `aws s3 sync` works (caveat: re-downloads on every run until we
  honor `If-None-Match` → 304).
- Boto3's multipart-download fallback works (Range is ignored
  cleanly).
- Walrus brownouts no longer surface as opaque 500s.
- Storage-layer corruption is detected at the gateway, not at the
  client.

**Other cleanups bundled with this audit:**

- `requireKraterion` / `requireBucket` / `requireKey` extracted into
  `apps/gateway/src/s3/request-context.ts` — was duplicated in three
  controllers.
- `ObjectsReadController` now uses `Prisma.S3ObjectGetPayload` /
  `Prisma.BucketGetPayload` types instead of a hand-written
  `ObjectRow` interface plus `as` cast.
- `ObjectsListController` simplified — the unused-Postgres-lookup
  before the 501 was removed; it was burning a round-trip on a path
  that always errored.

**Sources:**
- [RFC 7233 — Range Requests](https://www.rfc-editor.org/rfc/rfc7233)
- [RFC 7232 — Conditional Requests](https://tools.ietf.org/html/rfc7232)
- [AWS S3 Common Response Headers](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTCommonResponseHeaders.html)
- [boto3 issue #657 — ETag returned with quotes (won't fix)](https://github.com/boto/boto3/issues/657)
- [Apache Iceberg AES GCM Stream Spec](https://iceberg.apache.org/gcm-stream-spec/)

---

## 2026-05-08 — `removeAllContentTypeParsers` + single catch-all buffer parser

**Status:** Accepted

**Context:** Phase-5 PutObject reads the request body byte-exact for two
reasons: (1) ETag is `MD5(plaintext)` per the S3 spec, (2) when
`x-amz-content-sha256` is a hex hash (not `UNSIGNED-PAYLOAD`), we have
to verify it matches `SHA-256(body)`. Boto3 sends `Content-Type:
text/plain` whenever `ContentType="text/plain"` is passed (or detected
by python's mimetypes module). Fastify's built-in `text/plain` parser
runs and stringifies the body, which (a) breaks the byte-exact hash
math, (b) round-trips bytes through UTF-8 (so a 1024-byte random
binary becomes a different 1024-byte string), and (c) returns a
`string` to `req.body`, defeating `@Body() body: Buffer`. The first
PutObject test against the gateway returned `IncompleteBody` because
the typed-as-Buffer body was actually a string and `body.byteLength`
disagreed with `Content-Length`.

**Decision:** In `main.ts`, call `fastify.removeAllContentTypeParsers()`
before registering a single catch-all `addContentTypeParser('*', {
parseAs: 'buffer', bodyLimit: MAX_BODY_BYTES }, ...)` that hands every
body to the controller as a Buffer regardless of `Content-Type`.
Removing the JSON parser is safe — no S3 endpoint accepts JSON bodies
and the health endpoints are GET-only.

**Consequences:**
- `@Body() body: Buffer` works uniformly across `application/octet-stream`,
  `binary/octet-stream`, `text/plain`, and any user-supplied
  `Content-Type:`.
- Hash math is correct on the wire bytes, not a Unicode-roundtripped
  copy.
- bodyLimit on both the FastifyAdapter and the parser is 2 GiB + 1 MiB
  margin (matches the GET-side AES-GCM-buffered cap from the Phase-4
  audit).

---

## 2026-05-08 — Orphan blobs: log on failure, defer reaper to post-hackathon

**Status:** Accepted

**Context:** PutObject is a four-step write across a non-transactional
substrate: PTB 1 (`register_blob_for_bucket`) → relay POST → PTB 2
(`certify_blob` + `wrap_in_shared_blob`) → DB upsert. A failure after
PTB 1 succeeds leaves an on-chain `Blob` owned by the gateway with no
SharedBlob wrapper. A failure after PTB 2 succeeds leaves a SharedBlob
on-chain with no DB row. Plus: every overwrite produces an orphan —
the previous SharedBlob is no longer addressable via S3 but still
holds user WAL on-chain.

The principled path is a `pending_upload` table + a reaper worker that
sweeps stuck rows. That's two new Prisma models and a worker
workstream we don't have time for pre-submission.

**Decision:** For v1, log every orphan-producing failure at ERROR
level with enough context for a future reaper to act on:
- the `blobObjectId` (so the reaper can `delete_blob` to refund
  storage)
- the `walrus_blob_id` (the content-addressed identifier)
- the `(bucket, s3_key)` pair (to disambiguate)
- the `shared_blob_object_id` for the overwrite case

The renewal worker (separate workstream) will gain the reaper
responsibility post-hackathon. Until then orphans accumulate; they
don't block correctness.

**Consequences:**
- Demo flow is correct: every successful PUT produces a SharedBlob the
  user owns, and every GET reads the most recent one.
- During a relay flake, boto3's auto-retry on 503 amplifies orphan
  count: each retry runs PTB 1 fresh, so a single client call that
  retries 3× leaves 2 orphan Blobs and 1 success. Acceptable for
  testnet.
- One log line is the entire trail for the reaper. Make sure the log
  format stays parseable (the `ORPHAN BLOB (...)` prefix is what the
  reaper will grep for).

---

## 2026-05-08 — PutObject header policy: reject feature gaps, accept-and-ignore client noise

**Status:** Accepted

**Context:** Real S3 clients (boto3, aws-cli, rclone) send a
constellation of `x-amz-*` headers by default — most of which are
features we either don't support yet (`x-amz-meta-*`, `x-amz-tagging`)
or never plan to expose (`x-amz-acl`, `x-amz-storage-class`). Two
failure modes to avoid:

1. **Silent data loss.** If the client sends `x-amz-meta-author=alice`
   and we drop it on the floor without telling them, they'll later
   `head_object` and find no metadata, but their workflow assumed it
   was stored.
2. **Spurious 400s.** rclone defaults to setting `x-amz-storage-class:
   STANDARD`. If we 400 every request that includes a header we don't
   recognize, rclone breaks before its first useful call.

**Decision:**
- `x-amz-meta-*` and `x-amz-tagging`: **reject with `NotImplemented`
  (501).** Clients learn we don't store the data and can decide
  whether to retry or remove the header.
- `x-amz-acl`, `x-amz-storage-class`, `x-amz-server-side-encryption`:
  **accept and silently ignore.** AWS deprecated `x-amz-acl` in 2023
  (BucketOwnerEnforced default), `STANDARD` is the only storage class
  we implement, and we always SSE — these headers convey no
  information that changes our behavior.
- `Content-Disposition`, `Content-Encoding`, `Cache-Control`,
  `Content-Language`, `Expires`: **Phase-7 work** (pass-through into
  metadata + echoed on GET/HEAD). Not in v1 yet — acceptable to
  silently drop because they're stylistically optional, not
  load-bearing.
- Default `Content-Type` to `binary/octet-stream` when missing — AWS-
  canonical, not the more common `application/octet-stream`. Boto3
  notices the difference.

**Consequences:**
- aws-cli, rclone, and boto3 default flows work without `--no-...`
  flags.
- Future feature work (custom metadata) doesn't change wire behavior
  — clients that already work continue to.
- Documented in the boto-test conformance suite so the policy is
  asserted, not just implied.

---

## 2026-05-08 — DB writes are gateway-direct today; replace with event-driven indexer when the dashboard lands

**Status:** Accepted (interim — supersedes itself)

**Context:** Every Postgres write today happens inline in the process
that executes the PTB:
- `ObjectsWriteController.putObject` parses `r2.objectChanges` for
  `SharedBlob.objectId` and upserts `s3_object` in the same handler.
- `ObjectsWriteController.deleteObject` and
  `BucketsController.deleteBucket` flip `deleted_at` directly.
- `scripts/bootstrap-gateway.ts` and the smoke test write `bucket` /
  `s3_object` rows after their PTBs.

This works because the gateway (or the bootstrap script) is the *only*
PTB executor in v1. The Move package already emits 11 events covering
every state change — `KraterionBucketCreated`,
`KraterionObjectCreated` (carries `s3_key`, `content_type`,
`walrus_blob_id`, `seal_identity`, `shared_blob_id`, `end_epoch`),
`KraterionObjectExtended`, `ApiAccessGranted/Revoked`,
`BucketVisibilityChanged`, plus reserve events — so the architectural
groundwork for event-driven indexing is in place; we just don't
consume those events yet.

**Decision:**
- For the gateway-only write paths (PutObject / DeleteObject /
  DeleteBucket / bootstrap), keep the direct DB writes. They're
  simple, low-latency for the S3 client, and have no other writer
  competing for the row.
- When the dashboard ships, the user-signed flows
  (`createGrantAndShareBucket`, `set_bucket_visibility`,
  `revoke_all_api_access`, `revoke_api_access_for_user`,
  `transfer_bucket`) execute PTBs the gateway never sees. At that
  point, **rip out the gateway's inline DB writes wholesale and
  replace them with an event-driven indexer** that:
  - reads on-chain events from a Sui checkpoint cursor (resumable
    after restart),
  - writes/updates rows keyed on `(event_seq, tx_digest)` for
    idempotency,
  - is the *single* writer for `bucket` and `s3_object` rows.
- The indexer also fixes the orphan-SharedBlob recovery case (gateway
  crashed after PTB 2 but before DB upsert): the
  `KraterionObjectCreated` event carries everything needed, so the
  indexer reconstructs the row on its next sweep.

**Why migrate everything, not run both side-by-side:** dual-writer
correctness is a load-bearing assumption to get wrong. If the gateway
writes inline AND the indexer writes from events, every row needs an
unambiguous "who wins" rule and idempotency tokens at every call
site. Cheaper to flip cleanly: indexer is the writer, gateway only
ever signs PTBs.

**Consequences:**
- Today's code is simpler, ships faster, has fewer moving parts.
- A swathe of code in `objects.write.controller.ts`,
  `buckets.controller.ts`, `bootstrap-gateway.ts`, and
  `smoke-encrypt-roundtrip.ts` will be deleted when the indexer
  lands. Don't sink effort into making the inline writes more
  sophisticated (transactions, retry logic) — that work is
  throwaway.
- The orphan-blob log lines from Phase 5 stay relevant for the
  reaper job; they're orthogonal to indexing.
- No event consumer exists yet, so events emitted today are purely
  on-chain audit trail. That's fine.

---

## 2026-05-08 — `S3Object.s3_key` uses Postgres `COLLATE "C"` (byte-wise sort)

**Status:** Accepted

**Context:** AWS S3 ListObjectsV2 specifies byte-wise UTF-8 ascending
sort order. Postgres `text` defaults to the cluster's locale collation
(typically `en_US.UTF-8`), which sorts case-insensitively in some
contexts and groups punctuation locale-specifically. The two diverge
visibly on:
- ASCII case: `Aaa` vs `aaa` — locale collates them adjacently; AWS
  puts `A` (0x41) before `a` (0x61).
- Punctuation: `_` vs `/` — locale-specific; AWS is byte-wise.
- Mixed unicode: locale-specific Asian-character ordering vs raw UTF-8
  byte order.

These differences would let `aws s3 sync` and other tools that depend
on stable byte-wise key order get out of sync between AWS and our
gateway, plus break our continuation-token pagination (which assumes
monotonic byte-wise order to skip past common prefixes).

**Decision:** Migration `s3object_skey_collate_c` runs `ALTER TABLE
"S3Object" ALTER COLUMN "s3_key" TYPE TEXT COLLATE "C"`. The `"C"`
collation is Postgres's byte-wise mode. Indexes on `s3_key` (the
unique `(bucket_id, s3_key)` index) inherit the column's collation
automatically, so `ORDER BY s3_key ASC` in any Prisma query produces
AWS-equivalent ordering with index support.

**Rejected alternatives:**
- *Per-query `ORDER BY s3_key COLLATE "C"`* — works but bypasses the
  index (Postgres can't use an index whose collation differs from the
  ORDER BY clause). Catastrophic for buckets with millions of keys.
- *Cast to `bytea` for ORDER BY* — bulletproof but no index can
  satisfy. Same problem.
- *Accept locale-aware sort as a documented limitation* — breaks
  pagination correctness for unicode buckets and silently diverges
  from AWS.

**Consequences:**
- All `s3_key` comparisons (`>`, `>=`, `LIKE`, `BETWEEN`) are now
  byte-wise. The continuation-token cursor advance in
  `ObjectsListController` (`commonPrefixSuccessor`) produces a string
  that's compared byte-wise against the column, so skipping past a
  common prefix works correctly.
- One-time cost: rebuilds indexes on the column. Empty in our
  hackathon DB; on a populated table the cost is `O(n log n)` of
  index size.
- Future Prisma schema regenerations preserve the collation because
  Postgres stores it column-level — `prisma migrate dev` won't strip
  it on schema-only diffs.

---

## 2026-05-08 — ListObjectsV2: opaque-versioned continuation tokens with kind discrimination

**Status:** Accepted

**Context:** S3 specifies the continuation token as opaque to clients.
Implementations choose their own format. Two cursor scenarios:
1. **Pagination terminating on a `<Contents>` entry** — the next page
   wants `s3_key > last_key`.
2. **Pagination terminating on a `<CommonPrefixes>` entry** — the next
   page wants `s3_key >= byteWiseSuccessor(common_prefix)` so we
   don't re-emit the same common prefix on the next page.

A naive cursor that's just "the last raw key processed" works for (1)
but breaks (2): if the next page's first row is also under the same
common prefix, we'd add it to `<CommonPrefixes>` again. boto3's
paginator doesn't dedup across pages, so the user would see the same
prefix twice.

**Decision:** Continuation token is `base64url(JSON({ v: 1, kind:
"key" | "prefix", value: string }))`. The discriminant lets the next
page apply the correct comparison:
- `kind: "key"` → `s3_key > value` (strict, normal cursor).
- `kind: "prefix"` → `s3_key >= commonPrefixSuccessor(value)`,
  where `commonPrefixSuccessor(s)` is `s` with its last byte
  incremented (handling 0xFF cascades). For ASCII delimiters (the
  realistic case) this stays valid UTF-8.

The `v: 1` version tag lets us evolve the format without breaking
outstanding tokens — future versions add a new tag, old tokens still
decode under their original handler.

**Consequences:**
- No duplicate `<CommonPrefixes>` across pages.
- Malformed tokens (bad base64, bad JSON, wrong version) → 400
  `InvalidArgument` with the canonical AWS message "The continuation
  token provided is incorrect."
- For pathological all-0xFF inputs to `commonPrefixSuccessor` we
  append ` ` (space) — produces a valid UTF-8 string that still
  sorts past the original. Edge case unreachable for normal inputs.
- Tested in the conformance suite via the "paginate through MaxKeys=2"
  case which exercises both `kind: "key"` and `kind: "prefix"`
  cursors.

---

## 2026-05-08 — Move event surgery: `KraterionObjectCreated` carries `seal_identity`, `size_bytes`, `storage_end_epoch`; `shared_blob_object_id` recovered from tx effects

**Status:** Accepted

**Context:** The event-driven indexer (planned next) needs every field
required to populate `S3Object` from a single event. The original
`KraterionObjectCreated` carried `bucket_id`, `walrus_blob_object_id`,
`walrus_blob_id`, `s3_key`, `content_type`, `owner_address`, and
`wrapped_by`, but lacked four pieces:

1. **`seal_identity` (48 bytes)** — gateway-minted at PutObject time,
   not derivable from chain state. The indexer needs it to populate
   `S3Object.seal_identity`, which `seal_approve` checks at GET time.
2. **`size_bytes`** — the plaintext byte count S3 GET returns as
   `Content-Length`. Distinct from the Walrus blob's size (which is
   the *encrypted* size from `walrus::blob::Blob.size`). Gateway
   knows it; chain doesn't carry it elsewhere.
3. **`storage_end_epoch`** — the Walrus end epoch for renewal
   scheduling. Available on the inner Blob's storage resource, but
   surfacing it on the event saves an extra `getObject(SharedBlob)`
   round-trip per indexer event.
4. **`shared_blob_object_id`** — the wrapping SharedBlob's Sui object
   ID.

**Decision:** Add fields 1–3 to the event. For field 4, the Move-side
reality blocks event-encoding: `walrus::shared_blob::new(blob, ctx)`
both constructs and shares the SharedBlob in one call without
returning the value, so the kraterion module never sees the
SharedBlob's ID. We can't replicate the constructor (walrus's
`SharedBlob` fields are private to its module), and we won't fork
walrus. The indexer recovers `shared_blob_object_id` from
`tx.effects.changed_objects` in the same checkpoint payload — a
single client-side filter for `objectType` ending in
`::shared_blob::SharedBlob`. The gRPC `SubscribeCheckpoints` read
mask already pulls effects, so this is zero extra RPC calls.

**Implementation.**

- `events.move`: add the three fields to `KraterionObjectCreated` +
  match on `emit_object_created`.
- `kraterion.move`: `wrap_in_shared_blob` gains
  `seal_identity: vector<u8>` and `size_bytes: u64` parameters;
  `storage_end_epoch` is read in-Move from the inner Blob via
  `walrus::blob::end_epoch(&blob)` before consuming it into
  `shared_blob::new`.
- 33/33 Move unit tests still green.
- Gateway's `objects.write.controller.ts` and
  `smoke-encrypt-roundtrip.ts` pass the new args. Verified on chain:
  ```json
  "seal_identity": "nqpRVGc…/oF4XBfb/RBZFG00…", // base64 48 bytes
  "size_bytes": "55",
  "storage_end_epoch": 396.0
  ```

**Why not pass `storage_end_epoch` from the gateway too.** Could; the
gateway computes `currentEpoch + EPOCHS_AHEAD` and that matches what
walrus stores. But surfacing it from `&blob` inside Move makes the
event the authoritative source — no risk of gateway/chain drift if
walrus's storage rounding ever changes.

**Why not fork walrus to surface `shared_blob_object_id`.** A patched
fork is a maintenance liability; the indexer-side recovery is a
2-line filter that costs nothing in latency or bandwidth.

**Consequences:**
- Old `KRATERION_PACKAGE_ID = 0x5dfc…64db` is abandoned. New ID is
  `0x27e1627c8d7ebb4b20b1069fd32f730b54dfb54eb7bbe5943970da8de85a0a51`.
- New `KRATERION_RESERVE_ID = 0xad3e396e…c228c7ac` (re-spawned by the
  new package's `init`).
- All on-chain SharedBlobs from the old package are stranded — they
  reference the dead package's types and can't be queried under the
  new module address. Acceptable on testnet; documented in the
  runbook.
- `Bucket` and `S3Object` rows truncated; bootstrap re-run with new
  AKIA / secret / bucket on the new package. Test data from earlier
  phases is gone.

---

## 2026-05-08 — Indexer adopts gRPC `SubscribeCheckpoints` directly (no JSON-RPC adapter); read_mask paths root at `Checkpoint`

**Status:** Accepted (locked in by user instruction)

**Context:** Sui's JSON-RPC sunsets 2026-07-31 — 10 days after our June
21 submission. Building a JSON-RPC adapter that breaks one month
later is wasted code; the user explicitly directed us to skip it. The
indexer ships on `@mysten/sui/grpc`'s `SubscriptionService.SubscribeCheckpoints`
from day 1, with `LedgerService.GetCheckpoint` as the unary call for
backfill.

Two implementation findings that shape the code:

1. **`@mysten/sui/grpc`'s default transport is gRPC-Web over fetch.**
   That has no keepalive knobs and silently drops long-lived streams
   when intermediaries idle them out. For a Node.js indexer running
   `SubscribeCheckpoints` indefinitely, native HTTP/2 gRPC with
   explicit keepalives is mandatory: `@protobuf-ts/grpc-transport`
   + `@grpc/grpc-js` with channel options
   `keepalive_time_ms=60_000`, `keepalive_timeout_ms=20_000`,
   `keepalive_permit_without_calls=1`,
   `http2.max_pings_without_data=0`, and a 256 MiB receive cap (vs
   the 4 MiB default). See `sui-grpc.client.provider.ts`.

2. **`read_mask` paths root at `Checkpoint`, not the subscribe
   response.** The official proto comments don't disambiguate this.
   Day-1 probe (`apps/worker/src/indexer/cli/probe-readmask.ts`)
   subscribed with both candidate shapes:
   - `["checkpoint.transactions...", "cursor"]` — returned an empty
     wrapper (~55 bytes), no events.
   - `["transactions.events.events...", ...]` — returned the full
     payload (~3 KB for a busy checkpoint), events present.

   The checkpoint-rooted paths are correct. ALSO: the response-level
   `cursor` field is populated automatically — it's not subject to
   the mask. We don't need to include `"cursor"` in the path list.

   No mask at all returns near-empty (~55 bytes). Specifying a mask
   is mandatory.

**Decision:** Indexer's mask paths live in
`apps/worker/src/indexer/read-mask.ts`. The minimum useful set
includes per-event fields (`package_id`, `module`, `event_type`,
`sender`, `json`) plus tx digest plus the effects fragments needed
to recover `shared_blob_object_id` from
`tx.effects.changed_objects[]` (per the previous Move-event-surgery
ADR — walrus's `shared_blob::new` doesn't expose the SharedBlob ID
in its return).

The `SubscribeCheckpoints` and `GetCheckpoint` mask shapes are
identical because both target the `Checkpoint` proto.

**Consequences:**
- One adapter, one wire format, one set of mask paths to maintain.
- No JSON-RPC code that would need ripping out at sunset.
- The day-1 probe is committed as a CLI
  (`pnpm -F @kraterion/worker indexer:probe-readmask`) so future
  Sui SDK updates can be re-validated cheaply if the mask
  semantics ever change.
- gRPC stream has no built-in reconnect; we wrap it in an explicit
  forever-loop with exponential backoff in `run-loop.ts`.

---

## 2026-05-08 — Public testnet fullnode: backfill rate-limit gate at 8 rps

**Status:** Accepted

**Context:** First end-to-end indexer run hit `429 Too Many Requests`
from the public testnet fullnode (`fullnode.testnet.sui.io:443`)
within ~5s of starting backfill at concurrency=4. Sui Foundation's
public RPC quota is 10 rps; bursts over that get rejected immediately,
not throttled.

The existing exponential-backoff path on `RpcError` (`UNAVAILABLE`
code) DID recover correctness — cursor never advanced past
unprocessed events, retries resumed from the right place — but the
churn was painful: every 5 seconds we'd backfill ~200 checkpoints,
hit 429, back off, restart from the new cursor. ~4-minute backfill
turned into a ~10-minute exercise.

**Decision:** Add an explicit token-bucket rate gate inside
`backfillRange`. Each call to `getCheckpoint` waits until
`nextAllowedFetchAtMs`, which advances by
`BACKFILL_MIN_INTERVAL_MS = 125ms` per call. With
`BACKFILL_CONCURRENCY = 2`, that's ~16 calls per 2 seconds = 8 rps,
leaving 2 rps headroom under the 10 rps cap. Both knobs are env-
overridable for paid endpoints (Shinami, Triton, BlockVision) where
limits are higher.

The `RpcError` exponential-backoff path stays as the safety net for
non-rate-limit failures (network blips, stream timeouts).

**Consequences:**
- Backfill latency is bounded: live-tip-minus-cursor checkpoints at
  ~8 rps. ~10k checkpoints (a typical "stale for a few hours" gap)
  = ~20 minutes. Acceptable for hackathon scale.
- Once caught up, the live `SubscribeCheckpoints` stream emits ~1
  msg/sec — well under any quota.
- Move to a paid RPC the moment we have demo traffic; document
  `INDEXER_BACKFILL_INTERVAL_MS=50` (20 rps) as the recommended
  setting on Shinami / similar.

---

## 2026-05-08 — `KraterionObjectCreated` event also carries `etag_md5` (16 raw bytes)

**Status:** Accepted

**Context:** Phase 2/3 of the indexer plan made the indexer the sole
writer of `S3Object`. While wiring the `ObjectCreatedHandler`, the
`S3Object.etag` column surfaced as a Phase-0-missed gap: it stores the
plaintext MD5 (per the S3 spec for non-multipart uploads — boto3
verifies it locally during `aws s3 sync`), but plaintext MD5 is
gateway-knowable only and isn't on chain anywhere.

Three options considered:
1. Compute etag at first-GET inside the gateway (decrypt → MD5),
   cache. Breaks HeadObject which doesn't decrypt, and pays a CPU
   hit per cold object.
2. Use `walrus_blob_id` (encrypted root hash) as a synthetic etag.
   Round-trips fine for boto3 read-back tests but breaks `aws s3
   sync`'s diff (local plaintext MD5 != server etag).
3. Add `etag_md5: vector<u8>` (16 raw MD5 bytes) to the event.
   Gateway already computes MD5 in the existing `etag` derivation;
   pass it as an arg.

**Decision:** Option 3. The Move event surgery is small (one new
field + one new arg to `wrap_in_shared_blob`), the gateway change
is one line (`Array.from(etagRaw)`), and the indexer hex-encodes
the bytes for `S3Object.etag` (which is what the gateway returns
in the `ETag:` header).

**Consequences:**
- Yet another fresh package publish on testnet (the third in this
  build session). Documented as accepted churn under Phase-0
  surgery — testnet artifacts are sacrificial.
- Bootstrap + smoke + boto3 stack continues to exercise the full
  flow end-to-end with no regressions.
- Future S3 features that need plaintext-derived metadata (CRC32,
  Content-MD5 for clients that demand exact match, etc.) follow
  the same "pass via Move event" pattern.

---

## 2026-05-08 — `ChangedObject.object_type` is NOT in raw checkpoints; match SharedBlob via the unique `id_operation = CREATED`

**Status:** Accepted

**Context:** `ObjectCreatedHandler` needs `shared_blob_object_id` —
walrus's `shared_blob::new` doesn't return the SharedBlob, so the
event can't carry it (per the earlier ADR). The plan was to find the
SharedBlob by walking `tx.effects.changed_objects[]` and matching
`objectType` ending in `::shared_blob::SharedBlob`.

The Day-2 issue: the proto doc on `ChangedObject.object_type` says
*"Type information is not provided by the effects structure but is
instead provided by an indexing layer"*. `getCheckpoint` and
`SubscribeCheckpoints` return the raw effects with `object_type =
undefined`. Only the indexer-backed `getTransaction` API surfaces
typed change lists.

A probe confirmed: `getTransaction(GzzkgN…)` returned
`changed_objects[i].objectType = "0xd84…::shared_blob::SharedBlob"`,
but `getCheckpoint(seq)` for the SAME tx returned
`changed_objects[i].objectType = undefined`.

**Decision:** Match on `id_operation === CREATED` instead.

In a `wrap_in_shared_blob` transaction:
- the bucket, gas coin, and inner Blob are mutated (id_operation =
  NONE, mapped to "unknown" by our normalizer);
- the SharedBlob is the unique newly-created object (id_operation =
  CREATED).

So filtering `tx.effects.changedObjects` for `idOperation ===
"created"` and asserting exactly one result gives us the SharedBlob
deterministically. The handler throws → DLQ → human triage if the
invariant ever breaks (e.g. a future Move change that creates more
than one object in the wrap PTB).

**Rejected:** an extra `getTransaction(tx_digest)` per
`KraterionObjectCreated` event would surface `object_type` correctly
but adds an RPC round-trip per object create. At scale (hundreds of
events/day) it's fine; at hackathon scale it's pure overhead because
the unique-CREATED invariant holds.

**Consequences:**
- `ObjectCreatedHandler` is one unary call shorter per event.
- Future kraterion entry-functions that ALSO emit
  `KraterionObjectCreated` AND create more than one object in the
  same PTB would break this assumption. None are planned, but if
  it ever happens, fall back to the `getTransaction` lookup.
- The IndexerDeadLetter clearly calls out the count mismatch in its
  error message, so the failure surface is explicit.

**Related fix:** `IdOperation` proto enum is `{ UNKNOWN=0, NONE=1,
CREATED=2, DELETED=3 }` — I had it wrong (`{ CREATED=1, MUTATED=2,
DELETED=3 }`) in the initial run-loop. The two values (NONE for
mutations, no separate MUTATED) explains why the handler.interface
union dropped `"mutated"`. Documented inline at
`checkpoint-events.ts:normalizeIdOperation`.

---

## 2026-05-08 — `subscribeCheckpoints` doesn't populate `event.json`; live stream is a heartbeat, fetch via `getCheckpoint`

**Status:** Accepted

**Context:** While verifying Phase 2/3 end-to-end, every
`KraterionObjectCreated` event arriving via the live
`subscribeCheckpoints` stream landed in the DLQ with empty payloads.
The same events processed via the backfill path (unary
`getCheckpoint`) deserialized correctly. A targeted probe
(`/tmp/probe-live-vs-get.ts`, since deleted) confirmed the wire-level
discrepancy:

```
live cp=334634729      hasJson=false   hasContents=true
getCheckpoint(334634729) hasJson=true  hasContents=true
```

Both surfaces populate `event.contents` (raw BCS bytes), but only
`getCheckpoint` and `getTransaction` populate `event.json` (the
pre-decoded `google.protobuf.Value` mirror). The `json` decode is
done by the indexer layer that backs those two unary RPCs;
`subscribeCheckpoints` skips it (returns the raw checkpoint stream).

This pattern matches `ChangedObject.object_type` from the previous
ADR — both fields are explicitly indexer-layer-only and aren't in
the raw checkpoint payload.

**Decision:** Use the live `subscribeCheckpoints` stream as a
heartbeat — read only `cursor` from the response and discard
`checkpoint`. For each cursor we observe, fetch the actual
checkpoint via `getCheckpoint(cursor)` to get the json-decoded
payload. The subscribe `read_mask` is reduced to just
`["sequence_number"]` (cursor is wrapper-level, populated
regardless of mask).

This adds ~1 unary RPC per live checkpoint. At testnet's ~250ms
cadence, that's ~4 rps steady-state — well under the public
fullnode's 10 rps cap. When activity is bursty, our own backfill
gate (8 rps) kicks in too; combined we stay under the cap.

**Rejected:** decoding `event.contents` (raw BCS) client-side. It
would halve the RPC count and is faster-per-event, but requires
wiring per-event-type BCS layouts from `@kraterion/kraterion-move-sdk`'s
generated bindings into the indexer. Worth doing eventually
(post-hackathon) when traffic grows; not worth it for hundreds of
events per day.

**Consequences:**
- One file changed (`run-loop.ts:processSubscribeResponse`) — the
  live path now goes through the same `fetchCheckpoint` helper
  that backfill uses.
- The subscribe-mask code-path stays minimal — only what's needed
  to advance the cursor.
- Demonstrated working end-to-end: `boto3 put_object → S3Object
  row appears via indexer in ~17s → boto3 get_object returns
  byte-exact plaintext`.

---

## 2026-05-08 — Control-plane v1 uses dev-mode email auth; real zkLogin deferred to Phase 4

**Status:** Accepted

**Context:** The dashboard build (next workstream) needs a CRUD API
behind `/v1/me`, `/v1/projects`, and `/v1/projects/:id/api-keys`. The
target identity model is zkLogin (Google OAuth → ZK proof verified
against Google JWKS), but standing that up requires (a) an OAuth
callback host with a stable redirect URI, (b) JWKS cache + rotation,
(c) ZK proof verification wired into the Sui address derivation. None
of that helps us ship a usable dashboard today.

**Decision:** Phase 1 ships two dev-only endpoints — `POST
/v1/auth/dev-sign-up` and `POST /v1/auth/dev-sign-in` — that mint a
JWT keyed off email. Both 404 in production (`NODE_ENV` gate). The
sign-up endpoint mirrors what `bootstrap-gateway.ts` does today: create
`Account` + first `Project` + first `ApiKey`, return the cleartext
secret once. `Account.zklogin_sub` is set to `dev:<email>` so the
Phase-4 zkLogin migration can switch the prefix without breaking
foreign keys.

**Rejected:** A magic-link email flow. Saves "no password" gripes but
needs SMTP + token-store wiring; not worth it for a hackathon dev tool.

**Rejected:** Dropping in Auth0 / Clerk. Faster to wire than zkLogin,
but doesn't get us closer to the on-chain identity story; Phase 4
would replace it anyway.

**Consequences:**
- Phase 4 work is a focused swap of the auth controller, no schema
  changes (zklogin_sub already in `Account`, sui_address required at
  sign-up).
- `bootstrap-gateway.ts` can be retired in favour of `curl POST
  /v1/auth/dev-sign-up` once the dashboard lands.

---

## 2026-05-08 — Control-plane uses Bearer JWT (HS256) signed with `JWT_SECRET`; cookies optional later

**Status:** Accepted

**Context:** The control plane needs session auth. Two reasonable
defaults: HttpOnly signed cookies (browser-native, CSRF-prone) or
Bearer JWTs (pure header, easier for SDKs and CLIs). The dashboard is
a separate origin from the control plane (`localhost:3001` vs
`localhost:4001`); cookie-based auth requires CORS credentials +
SameSite finagling.

**Decision:** Phase 1 ships Bearer-only — the dashboard sends
`Authorization: Bearer <token>` with each request. Tokens are HS256
JWTs signed with `JWT_SECRET` (32-byte hex), 7-day expiry. Verification
is a wrapper around `@nestjs/jwt`'s `JwtService.verify`; failures
rethrow as `ControlPlaneError("Unauthorized", ...)`. The `AuthGuard`
populates `req.user = { accountId, email, suiAddress }` and is
registered globally via `AuthCoreModule` so any module can `@UseGuards`
without reimporting auth.

**Cookie support is deliberately left as a future-compatible
extension:** if/when we add `@fastify/cookie`, the guard can fall back
to `req.cookies?.cp_session` ahead of the header. No schema changes
required; existing tokens keep working.

**Consequences:**
- `JWT_SECRET` is a hard-fail at boot if missing — caught in
  `AuthCoreModule.jwtSecret()`. Generate with `node -e
  'console.log(require("crypto").randomBytes(32).toString("hex"))'`.
- Rotating `JWT_SECRET` invalidates active sessions; intentional and
  cheap to recover from in dev.
- The dashboard will keep the token in `localStorage` for v1.
  Acceptable for the hackathon scope; the cookie story is the upgrade
  path when XSS exposure becomes a real concern.

---

## 2026-05-08 — API-key secret returned cleartext exactly once at creation; otherwise wrapped via the same `EnvKeyWrapper` the gateway uses

**Status:** Accepted

**Context:** S3-style API keys (`AKIA…` + 40-char secret) are the
gateway's SigV4 surface. We need the control plane to mint, list, and
revoke them; we also need any minted secret to authenticate against
the gateway *immediately*, with no cross-service handshake.

**Decision:**
1. `ApiKey.secret_wrapped` (Bytes) stores the AES-256-GCM-wrapped
   secret. Wrapping uses the same `EnvKeyWrapper` and the same
   `KEY_WRAPPING_MASTER_KEY` env var the gateway already reads — both
   apps unwrap interchangeably. The file is a verbatim copy of
   `apps/gateway/src/auth/key-wrapping.ts` (under
   `apps/control-plane/src/auth/`); promotion to a shared workspace
   package is on hold until we have ≥3 consumers.
2. `POST /v1/projects/:id/api-keys` returns the cleartext `secret`
   exactly once in the response body, alongside a `WARNING` field
   instructing the caller to store it. Subsequent reads
   (`GET /v1/projects/:id/api-keys`) strip both `secret_wrapped` and
   `secret` before serializing.
3. Secret regeneration is not implemented — if a user loses a secret
   they revoke and mint a new key. Matches AWS's IAM ergonomics.

**Rejected:** AWS KMS now. Same interface as `EnvKeyWrapper`
(`KeyWrapper.{wrap,unwrap}`), so swapping is a one-liner
(`new EnvKeyWrapper()` → `new AwsKmsWrapper(...)`). Defer until we
have a non-hackathon production deployment.

**Consequences:**
- Cross-app verified: a secret minted via `POST /v1/auth/dev-sign-up`
  authenticates against the gateway via boto3 SigV4 immediately
  (`s3.list_buckets()` returns 200 with `Owner.ID = account_uuid`).
- Rotating `KEY_WRAPPING_MASTER_KEY` invalidates *every* existing
  `ApiKey` and `SubWallet.mnemonic_wrapped`. Same blast radius as the
  gateway already has; acceptable.

---

## 2026-05-09 — Control-plane bucket / object views are read-only mirrors of the indexer's writes

**Status:** Accepted

**Context:** Phase 2 ships the control plane's read surface for the
dashboard: `GET /v1/buckets`, `GET /v1/buckets/:id`,
`GET /v1/buckets/:id/objects`, `GET /v1/objects/:id`. The data lives
in `Bucket` and `S3Object`, but the indexer (worker app) is the sole
writer to those tables — see "DB writes are gateway-direct today;
replace with event-driven indexer." We need a way for the dashboard
to *read* without re-introducing dual-writer semantics.

**Decision:** `BucketsService` is read-only. Every method takes
`accountId` as the first parameter and filters by
`project: { account_id }`. Methods that take a bucket or object id
(getOwned / getObject) re-walk the join chain and return 404 on both
"row missing" and "row not yours" so the surface doesn't leak
existence across accounts. `BucketsController` and `ObjectsController`
mount under `/v1/buckets` and `/v1/objects` respectively, both
guarded by `AuthGuard`. No write verbs are defined on either — bucket
creation / deletion will arrive in Phase 3 as PTB builders, signed
client-side, and persisted to Postgres only via the indexer once the
on-chain change emits its event.

**Pagination:** opaque base64url-encoded cursor `{ v: 1, after: <id> }`,
the same pattern (minus the `kind` discriminant) the gateway uses for
ListObjectsV2. Limits: 50 default / 100 max for buckets; 100 default /
1000 max for objects (the dashboard's file browser fetches more rows
per page than the bucket list does). Stable secondary order on `id`
prevents shifting offsets under concurrent indexer writes.

**Serialization:** `BigInt` fields (`funding_pool_wal_balance`,
`size_bytes`) are emitted as strings — `JSON.stringify(BigInt)` throws.
Indexer-provenance fields (`tx_digest`, `event_seq`, `event_payload`)
are dropped from the wire shape; they're not user-facing. The
`seal_identity` bytes are exposed as base64 because the dashboard's
"On-chain details" expander wants to display the IBE identity tuple
verbatim.

**Rejected:** Exposing `Bucket` / `S3Object` Prisma rows directly. The
BigInt issue alone is reason enough; the wire shape also needs to be
stable across schema changes (a column rename shouldn't break the
dashboard).

**Consequences:**
- The dashboard never reads from Postgres directly. Every `Bucket` /
  `S3Object` field the dashboard renders comes through this surface,
  which means we can change column shape (rename, retype, split
  tables) without coordinating with frontend deploys.
- Adding a field is one line in `serialize.ts`; removing one is a
  breaking change communicated via `next_cursor` versioning if it
  ever needs to happen.
- Sign-up + indexer round-trip is observable from the dashboard:
  on-chain bucket-create completes → indexer writes row → next
  `/v1/buckets` call shows it. Lag ≤ 30s in steady state per
  `progress.md`.

---

## 2026-05-09 — Bucket lifecycle PTBs are server-built unsigned via `tx.toJSON()`; the dashboard wallet signs and submits

**Status:** Accepted

**Context:** Phase 3 ships the four bucket-lifecycle endpoints —
`POST /v1/buckets/prepare-create`, `:bucketId/prepare-grant-api`,
`:bucketId/prepare-revoke-all`, `:bucketId/prepare-visibility`. Each
calls into the Move package via the user's address (the on-chain
asserts `ctx.sender() == bucket.owner` for the three mutators), so
the user has to sign. The control plane is allowed to build the PTB
because nothing about the build needs the user's keys; the question is
only how to hand the unsigned tx to the dashboard.

The Mysten SDK supports two patterns for "build on server, sign on
client":
1. `await tx.build({ onlyTransactionKind: true })` → BCS bytes; the
   client uses `Transaction.fromKind(bytes)` and fills in gas + sender.
   Used in sponsored-transaction flows.
2. `await tx.toJSON()` → JSON v2 string; the client uses
   `Transaction.from(json)` and the wallet (or dApp Kit's
   `useSignAndExecuteTransaction`) calls `setSenderIfNotSet` and
   resolves shared-object versions at sign time.

**Decision:** Use option (2), `tx.toJSON()`. The wire payload is:

```ts
{
  tx_json: string,           // raw output of tx.toJSON()
  expected: {
    package_id: "0x…",
    function: "kraterion::…",
    summary: "human-readable",
    sender_hint: "0x…",      // user's sui_address from the JWT
  }
}
```

`expected` is non-binding metadata for the dashboard's confirmation UI
and telemetry — clients MUST NOT rely on it for security decisions.
The signed bytes are the source of truth.

**Why toJSON over kind-bytes:**
- Shared-object versions stay symbolic in `toJSON`. The bucket's
  version may bump (someone else flips visibility, grants/revokes API)
  between build time and sign time; with kind-bytes the BCS would be
  pinned to a stale version and execution would fail. With JSON v2 the
  client SDK re-resolves at sign time.
- Sender stays null. dApp Kit's `useSignAndExecuteTransaction` calls
  `setSenderIfNotSet(signerAccount.address)` automatically. We don't
  pre-fill it on the server because the JWT-derived address is just a
  hint — the wallet's connected account is authoritative.
- No gas-budget / gas-price pinning. The dashboard's signer fills both
  using the network's current price and a fresh budget estimate.

**Authorization:** every endpoint takes `accountId` from the JWT and
walks `bucket → project → account_id` (or just `project → account_id`
for `prepare-create`) before building anything. Foreign rows return
404 — same convention as the read views (don't leak existence).
`prepare-visibility` additionally rejects no-op flips with 400 because
Move's `set_bucket_visibility` is silent in that case (no event
emitted) and submitting it would burn gas for nothing.

**Move bindings:** the generated `@kraterion/kraterion-move-sdk`
helpers default `package: '@local-pkg/kraterion'` — a
NamedPackagesPlugin placeholder. We pass `package: KRATERION_PACKAGE_ID`
explicitly so the prepare path doesn't depend on the plugin being
registered on the calling Transaction.

**Rejected:** Sponsoring the transaction (control plane pays gas).
Adds a sub-wallet, splits ownership across two addresses, and isn't
needed for the hackathon scope. zkLogin accounts have a faucet path
for SUI; cheap to keep self-paid.

**Rejected:** Returning BCS bytes via kind-bytes. The shared-object
version-pinning issue alone is reason enough; also, debugging is
nicer when humans can read the JSON v2 payload over the wire.

**Consequences:**
- Verified end-to-end: `Transaction.from(response.tx_json)` reconstructs
  a `Transaction` whose first command is the expected
  `${KRATERION_PACKAGE_ID}::kraterion::<fn>` Move call, with
  `data.sender === null`. Vitest covers all four endpoints +
  cross-account 404s; cp-smoke covers the live HTTP path including a
  malformed `encryption_mode` 400.
- The dashboard never sees BCS — its only Mysten dependency for this
  flow is `@mysten/sui/transactions`. The signing call is
  `mutate({ transaction: Transaction.from(tx_json) })` via dApp Kit.
- Adding a fifth bucket-lifecycle PTB is one method on
  `PrepareTxService` + one `@Post(...)` route. The wire format is
  stable.

---

## 2026-05-09 — zkLogin via Enoki (Mysten Labs); backend-mediated and per-request scoped

**Status:** Accepted

**Context:** Phase 1 shipped a dev-only email-based auth path with a
TODO to swap in real zkLogin. Phase 4 closes that. Self-hosting the
full zkLogin stack is a meaningful weekend of work — Google JWKS
rotation, salt management, ephemeral keypair generation, calls to a
ZK proving service, Groth16 proof bookkeeping, and key-server
selection — and we want to ship the dashboard, not maintain an
identity provider.

Mysten Labs' Enoki packages all of this behind one private API key.
Their `getZkLogin({ jwt })` endpoint takes a Google ID token and
returns the canonical Sui address derived from `(google_sub, app_salt)`.
The salt is per-app and Enoki-managed; the same Google account always
maps to the same address inside a given Enoki app, across devices and
browsers. There is no salt rotation surface — this is a one-way
one-time anchor.

**Decision:** Use Enoki for both zkLogin (Google → Sui address) and
sponsored transactions. Backend-mediated path:

- `apps/control-plane/src/enoki/EnokiClientService` is a lazy
  `EnokiClient` wrapper. Boot is tolerant: missing `ENOKI_PRIVATE_KEY`
  doesn't fail the process; instead, any sponsored / zkLogin call
  surfaces `InternalError("Enoki is not configured")`. Local dev
  without an Enoki account keeps every non-Enoki endpoint working,
  including the dev-mode auth path.
- `POST /v1/auth/zklogin { google_jwt }` is the production sign-in.
  We decode (do **not** verify) the JWT to extract `sub` + `email`,
  then call Enoki's `getZkLogin` — Enoki performs signature, audience,
  and expiry verification against Google's JWKS, and returns the
  canonical address. We upsert the `Account` row keyed by
  `zklogin_sub`, mint a `default` project + API key on first sign-in,
  and return our own HS256 session JWT (unchanged from Phase 1).
- The dev-mode endpoints (`/v1/auth/dev-sign-up`, `dev-sign-in`)
  remain gated by `NODE_ENV !== "production"`. They're for tests and
  smoke runs that don't have a real Google JWT.

**Trust model and the JWT decode-without-verify:**

We never verify Google's signature ourselves. The Enoki round-trip
*is* the verification — the address it returns is provably derived
from the JWT (Enoki cannot return a valid address for a forged or
expired token because the salt-mixing requires the JWT's claims).
The local decode is just to read the stable `sub` (which we
double-check survives Enoki's check by re-reading the same `sub`
from the JWT after Enoki accepts it implicitly). If Enoki rejects
the JWT it 4xx's and we surface the error to the caller.

We also defensively reject if Enoki ever returns a different address
for an already-registered `sub` (impossible per Enoki's salt
contract, but cheap to catch). Vitest covers this.

**Rejected alternatives:**

- **Self-host JWKS verification + zkLogin proof generation.** The
  proving step requires either running a local prover (Groth16 in
  Rust, hours of integration) or calling Mysten's prover directly —
  which is what Enoki wraps. We'd save the cost of Enoki on testnet
  ($0 anyway) at the cost of weeks of maintenance and a
  bigger-than-needed surface area.
- **Auth0 / Clerk.** Faster to wire than self-hosted zkLogin, but
  doesn't get us closer to the on-chain identity story; Enoki gives
  us the address derivation in the same call.
- **Frontend-only Enoki (no server SDK).** Simpler boot, but we'd
  trust a frontend-asserted address. The backend would have no way
  to pin which Move-call targets get sponsored from our budget. With
  the **private** API key in the control plane we can attach
  `allowedMoveCallTargets` and `allowedAddresses` per request — see
  the next ADR.

**Consequences:**

- The dashboard's only auth ceremony becomes Enoki's "Continue with
  Google" popup. We don't host a callback page.
- Migration to mainnet is a Portal-config change + an env-var swap;
  no code changes.
- If we outgrow Enoki on cost/scaling, the swap is bounded: replace
  `EnokiClientService` and `SponsorshipService` with self-hosted
  equivalents. The schema (`zklogin_sub`, `sui_address` on `Account`)
  was designed for this from Phase 1.

---

## 2026-05-09 — Sponsored transactions via Enoki: backend-mediated, kind-bytes wire format, per-request Move-call allow-list

**Status:** Accepted

**Context:** The user-paid model ("user has testnet SUI in their
wallet") collides with the friction of zkLogin onboarding —
Continue with Google then Sui faucet then top up gas is a 4-click
detour for what should be one click. Enoki ships a sponsored-tx
flow that fits the same shape as our existing `prepare-*` endpoints;
the backend already builds the PTB and only the signature was missing.

Enoki accepts kind-bytes (`tx.build({ client, onlyTransactionKind: true })`)
and returns gas-paid bytes for the user to sign. The two API knobs
that matter for security are `sender` and `allowedMoveCallTargets` —
the second is the one that prevents a malicious frontend from
redirecting our Enoki budget to arbitrary Move calls.

**Decision:** Refactor `apps/control-plane/src/buckets/prepare/` to:

1. Build the PTB with the single Move call as before (Phase 3 behavior
   preserved at the construction level).
2. Mark every `&mut KraterionBucket` argument as `mutable: true` via
   `tx.object({ $kind: "UnresolvedObject", UnresolvedObject: { objectId, mutable: true } })`.
   Without this hint the SDK's resolver would call `getMoveFunction`
   to discover mutability — extra RPCs, harder to stub. Setting it
   explicitly keeps the resolver on its happy path: it only needs
   `getObjects` to fill in the version.
3. Serialize via `tx.build({ client, onlyTransactionKind: true })` —
   Enoki accepts kind-bytes only.
4. Call `enoki.createSponsoredTransaction({ network: "testnet",
   transactionKindBytes, sender, allowedAddresses: [sender],
   allowedMoveCallTargets: [<exact target>] })`. The `allowedMoveCallTargets`
   list always has exactly one entry — there's no batching at this
   layer; one `prepare-*` call yields one Move call gets sponsored.
5. Return `{ digest, bytes, expected }` where `bytes` is what the
   dashboard signs and `digest` is what the dashboard sends back to
   `POST /v1/sponsor/execute` along with the signature.

The wire shape **changed** from Phase 3:

```
// Phase 3 (pre-Enoki):
{ tx_json: string, expected: { ... sender_hint } }

// Phase 4:
{ digest: string, bytes: string, expected: {
    package_id, function, summary, sender, allowed_move_call_targets, sponsored_by: "enoki"
} }
```

The dashboard's flow is now:

```
1. POST /v1/buckets/prepare-create { ... }              → { digest, bytes }
2. const tx = Transaction.from(fromBase64(bytes))       (dApp Kit)
3. const { signature } = await signTransaction({ transaction: tx })
4. POST /v1/sponsor/execute { digest, signature }       → { digest }
5. await client.waitForTransaction({ digest })          (optional; for indexer freshness)
```

**Why backend-mediated and not frontend-only:**

Enoki's frontend-only path uses the *public* API key and enforces
the Move-call allow-list at the **Portal** level. That works, but:

1. Portal allow-lists are coarse — package-wide globs, not per-request.
2. The frontend can't pre-validate (e.g., "this user owns this
   bucket") before sponsorship; we'd be paying Enoki for failed-Move
   transactions caused by client bugs.
3. The control plane already has the user context (JWT) and the
   ownership lookup. Walking that before calling Enoki is one DB
   round-trip we already do.

With backend-mediated sponsorship using the **private** key, we can
attach `allowedMoveCallTargets: ["<PKG>::kraterion::revoke_all_api_access"]`
per request. Even if a malicious frontend swaps the digest, Enoki
refuses to settle anything not on the list.

**Tests:**

- `test/prepare-tx.spec.ts` (10 cases) stubs `SponsorshipService.createSponsored`
  and asserts every prepare path emits exactly one fully-qualified
  Move-call target, the user's address as `sender`, and well-formed
  base64 kind-bytes. Cross-account ownership checks are asserted to
  short-circuit before any Enoki call.
- The fake SuiClient in tests provides only `getObjects` +
  `resolveTransactionPlugin: () => undefined`. Because we set
  `mutable: true` on the bucket argument, the SDK never calls
  `getMoveFunction`, so the stub's surface stays small.
- `test/zklogin.spec.ts` (6 cases) covers the JWT decode + Enoki
  `getZkLogin` orchestration: first sign-in creates the
  account+project+key trio; repeat sign-ins are idempotent;
  address rotation 409s; missing `sub`/`email` claims 400.

**Live verification:** `cp-smoke.sh` step 14 runs in two modes —
with `ENOKI_PRIVATE_KEY` set, it asserts the live Enoki round-trip
returns `digest`, `bytes`, and a single-entry `allowed_move_call_targets`;
without, it asserts the endpoint exists and surfaces the
`InternalError("Enoki is not configured")` JSON envelope. All 19
smoke steps green in either mode.

**Consequences and migration:**

- Phase 3's `tx.toJSON()` wire format is gone. Anything that consumed
  `tx_json` (no production caller does — the dashboard isn't built
  yet) needs to switch to `bytes`/`digest`.
- The dashboard, once built, uses `@mysten/enoki/registerEnokiWallets`
  for sign-in and dApp Kit's `useSignTransaction` for signing the
  prepared bytes. No `useEnokiFlow` (deprecated in Enoki 0.6.0).
- The package version exported by `@mysten/enoki` we ship against is
  1.0.7. Pin lightly (`^1.0.7`); breaking changes have been frequent
  in the 0.x line but the 1.x track is stable.

---

## 2026-05-09 — Dashboard uses legacy `@mysten/dapp-kit@^1.0.6` (not the newer `dapp-kit-core` / `dapp-kit-react`)

**Status:** Accepted

**Context:** Mysten has been splitting dApp Kit into two packages:
the legacy `@mysten/dapp-kit` (single-package, React-only, currently
1.0.x) and a newer split — `@mysten/dapp-kit-core` + `@mysten/dapp-kit-react`
based on `createDAppKit` / `<DAppKitProvider>` — that the getting-started
guide on docs.sui.io is starting to push.

For our Enoki integration the choice is forced: as of Enoki 1.0.7,
**all of Enoki's documented React surface — `registerEnokiWallets`,
the post-connect `getSession` lookup, the `isEnokiNetwork` helper —
targets the legacy package's `SuiClientProvider` / `WalletProvider`
duo, and there is no Enoki integration documented for the new split
yet.** Cited: docs.enoki.mystenlabs.com/ts-sdk/register and the
"Register Enoki Wallets" demo at `MystenLabs/ts-sdks/packages/enoki/demo/`.

**Decision:** Pin `@mysten/dapp-kit@^1.0.6` in `apps/dashboard/package.json`.
The provider order is the one Enoki's docs ship verbatim:

```
QueryClientProvider
  → SuiClientProvider (networks must include `network: "testnet"` per entry, see runbook)
    → <RegisterEnokiWallets/>      // effect-only, returns unregister
      → WalletProvider autoConnect
        → ToastProvider             // our own
          → {children}
```

`<RegisterEnokiWallets/>` is a sibling component above `WalletProvider`,
not nested in it — the call must happen *before* the wallet store
opens, so the Enoki wallet shows up at autoConnect time.

The `useEffect` inside it returns the `unregister` callback so the
StrictMode double-mount in dev doesn't leave duplicate wallets
registered. Skipping that returns is the most common Enoki integration
bug in the wild (per Mysten's own demo PRs).

**Rejected:**

- `@mysten/dapp-kit-core` + `@mysten/dapp-kit-react`. Newer surface,
  but no Enoki wiring documented. Worth migrating to post-hackathon
  once Enoki publishes a `createDAppKit` adapter.
- Frontend-only Enoki without dApp Kit (call `EnokiClient` directly
  in the browser). Skips the wallet abstraction but loses
  `useSignTransaction` and the standard `useConnectWallet` UX. dApp
  Kit's hooks are doing real work — keep them.

**Consequences:**

- The dashboard imports `@mysten/dapp-kit/dist/index.css` to inherit
  the wallet-modal styles, but every other style is our own design-system
  tokens. The CSS bleed is bounded to the connect-modal surface.
- Migration cost to the split when Enoki supports it: one provider
  rewrite, no consumer-side changes (the `useConnectWallet` / `useSignTransaction`
  hook names are preserved). Bounded.

---

## 2026-05-12 — Layer an AI/agent surface on top of S3 (knowledge buckets + MCP)

**Status:** Accepted (Draft, see `/docs/ai-features-plan.md` for the
full plan)

**Context:** Walrus published the track problem statement and tilted hard
toward AI agents — long-term verifiable memory, multi-agent workflows,
artifact-driven systems, MemWal. Our pitch as-shipped ("S3 with
SharedBlobs + Seal + revocation") is strong infra but reads off-axis from
that brief. Two options surfaced: (a) reframe-only with a thin demo
overlay, (b) build a real agent surface on top. After researching MemWal's
architecture (relayer-centric, no storage-adapter interface — integration
would mean forking the relayer, ~1–2 weeks plus drift risk), the cleanest
path is (b): a *complementary* product surface, not a fork.

**Decision:** Ship "knowledge buckets" as an opt-in flag on existing
buckets. PUTs auto-embed via a new BullMQ queue inside `apps/worker`.
`/v1/buckets/{id}/search` and `/ask` on the control plane. The MCP
surface is **hosted on the control plane** as `POST /mcp` (Streamable
HTTP transport per the MCP November 2025 spec), bearer-authed with
existing Kraterion API key secrets — no `npx` package, no install step.
Per-object embedding manifests get archived as Walrus SharedBlobs owned
by the same on-chain bucket as the source — that's the "verifiable
retrieval" line that differentiates from every other S3-on-Walrus
submission and complements MemWal (which sits at the semantic-memory
layer, not the corpus-over-files layer). pgvector with HNSW + halfvec
stays in our existing Postgres; no new datastore. OpenAI
`text-embedding-3-small` at 1024 dims by default; recursive chunking at
400 tokens / 60 overlap. BYO LLM key for `/ask`.

**Rejected:**

- *Fork the MemWal relayer to route through Kraterion.* Strong story
  ("MemWal-on-Kraterion-buckets") but ~1 week minimum, owning a fork of a
  Mysten-maintained service for the demo window, and ongoing drift.
  Kept as a future-roadmap bullet, not a hackathon line item.
- *Build a separate vector database.* pgvector handles our scale (1k–10k
  chunks per bucket) with one less service to operate.
- *Per-object LLM proxying for `/ask`.* The caller (agent or dashboard
  power user) brings the key. We don't want to manage a billing
  relationship for inference inside the hackathon window.
- *Add a new Move event for manifests up front.* Manifests are Walrus
  blobs referenced from Postgres in v1; a `KnowledgeManifestPublished`
  on-chain event is a stretch item (§6.7 of the plan), not the critical
  path. Move package upgrades are the most expensive thing in the build,
  and the manifest's existence is already verifiable from Walrus.
- *Reusing the gateway for embedding.* The gateway's PUT path is hot
  (sub-second budget per `apps/gateway/CLAUDE.md`). Embeddings depend on
  third-party APIs and can take 4–10s per document. The worker app's
  brief already isolates "long-running, network-heavy" work; embedding
  fits there cleanly.
- *Distributing the MCP server as a local `npx` package.* The MCP Nov
  2025 spec made Streamable HTTP first-class and every major MCP client
  (Claude Desktop, Cursor, Cline) now supports remote servers natively.
  A local package would add an install step that hurts the demo,
  duplicate auth + tool-dispatch logic that already lives in the
  control plane, and carry a separate release cadence. Hosting `/mcp`
  on the control plane is simpler (~1.5 days vs ~3), keeps auth on the
  existing bearer/API-key path, and lets revocation use the same lever
  as the rest of the surface. A thin `packages/mcp-cli` wrapper is a
  post-hackathon stretch item if anyone ever wants keychain-stored
  secrets or fully-offline operation.

**Consequences:**

- Demo arc keeps both plot twists (cancel-subscription, revoke-API) and
  upgrades the surface they operate on from a file list to a knowledge
  base. The narrative becomes louder, not weaker.
- The `api_access_granted` flag on `Bucket` continues to be the single
  revocation lever — it now also short-circuits search/ask, which is the
  exact UX we want.
- A small refactor in K0 factors the Seal+Walrus decrypt pipeline out of
  `apps/gateway/src/s3/object-bytes.service.ts` into
  `packages/object-bytes`, so the worker can share the read path. That
  refactor pays off the moment any future service needs plaintext.
- Net new code: ~4 new Prisma tables, one new control-plane module, one
  new worker module, one new package (`mcp-server`), one new dashboard
  tab. Zero changes to existing schema columns, S3 surface shape, or
  Move modules.
- Adds a runtime dependency on OpenAI's embeddings API. Mitigated by
  exposing a `LocalEmbedder` interface and shipping a bge-small backup
  via `@xenova/transformers` if the demo can't rely on the network.
- Per-bucket embedding model is recorded in `KnowledgeBucketSettings` so
  a future model change is opt-in per bucket; old chunks stay queryable
  with their original model. Cross-bucket queries stay out of scope.

---

## 2026-05-12 — MCP server auth: dual model (bearer + OAuth 2.1), ship in two phases

**Status:** Accepted (target: ship both for hackathon; OAuth is
cuttable if K0–K2 or K4 slip — see `/docs/ai-features-plan.md` §6.4
and §8)

**Context:** The 2026 MCP spec mandates OAuth 2.1 + PKCE + DCR + RFC
9728 Protected Resource Metadata + RFC 8707 Resource Indicators for
*public remote* MCP servers. Bearer-token auth is still allowed for
*private remote* MCP servers and is what every CI/scripted/unattended
workflow actually wants. Comparable products ship both: Linear and
Stripe accept OAuth and API key bearer; GitHub accepts OAuth and PAT;
Notion is OAuth-only and as a result excludes scripted callers. The
question is whether to ship one or both for the hackathon.

**Decision:** Ship both, behind a pluggable auth guard on `/mcp`:

- **K3a — bearer-token (required for hackathon, ~1.5 days).** Uses
  existing Kraterion API key secrets as bearer tokens. Stub
  `WWW-Authenticate: Bearer realm="kraterion-mcp"` on 401 leaves room
  for K3b to extend the header with `resource_metadata="..."` without
  any churn.
- **K3b — OAuth 2.1 (target for hackathon, ~2–3 days, cuttable).**
  Self-hosted Authorization Server inside the control plane.
  `/oauth/authorize`, `/oauth/token`, `/oauth/register` (DCR, public
  clients only — no `client_secret`), `/oauth/revoke`.
  `/.well-known/oauth-protected-resource` (RFC 9728) and
  `/.well-known/oauth-authorization-server` (RFC 8414). RFC 8707
  `resource` parameter on token requests; `aud` validation on every
  MCP request. Three scopes: `mcp:read`, `mcp:write`, `mcp:ask`.

Token dispatch by shape: tokens starting with `eyJ` go through the
JWT validator (OAuth path); everything else goes through the API-key
HMAC-fingerprint lookup. Both paths resolve to the same
`McpPrincipal { project_id, scopes }` so tool implementations are
auth-scheme-agnostic.

**Rejected:**

- *Bearer only.* Closes the door on the Anthropic Connector
  marketplace, Cursor's MCP catalog, and any agent that only
  implements OAuth. Long-term wrong even if short-term cheap.
- *OAuth only.* Breaks every script/CI/unattended-agent flow where an
  interactive consent screen is a non-starter. Notion's mistake.
- *Vendored OAuth (WorkOS AuthKit, Stytch, Clerk).* Each ships a
  drop-in MCP-aware OAuth provider in 2026; ~half a day to integrate
  vs ~2 days self-hosted. Rejected because adding a vendor on the
  auth path is the hardest thing to walk back later, and the
  self-hosted flow re-uses identity primitives we already have
  (Account, zkLogin, sessions). Revisit only if K3b risks slipping
  into K4.
- *Refresh tokens in v1.* Add complexity for a marginal demo
  improvement; DCR + 15-minute access tokens cover hackathon flows.
  Post-hackathon.
- *Fine-grained per-tool scopes.* Three scopes are enough for the
  consent screen to mean something without making it unreadable.
  More granularity is post-hackathon polish.

**Consequences:**

- Critical-path budget grows from ~11 days (K3a only) to ~13–14
  days (K3a + K3b). Still inside the available window if K0–K2 and
  K4 don't slip; the §6.4.2 "when to slip K3b" rule names the cutoff
  explicitly.
- Two new tables (`OAuthClient`, `OAuthGrant`) ship in K3b's
  migration; no `OAuthToken` table because tokens are signed JWTs
  validated offline. Revocation goes through a Redis denylist on the
  JWT `jti`.
- The pluggable auth guard means K3b is purely additive: if we ship
  K3a and stop, every existing config keeps working forever. No
  migration risk to the dev-flow auth path even if OAuth lands later.
- Eligibility for the Anthropic Connector marketplace and Cursor MCP
  catalog requires K3b. If those listings matter for the demo /
  pitch deck, K3b must ship. If we're showing the agent flow from
  pre-configured Claude Desktop / Cursor instances on the demo
  machine, K3a is sufficient.
- Adds a runtime EdDSA keypair the control plane must hold. Same
  KMS-wrapped pattern as existing sub-wallet keys (`SubWallet.role
  = "oauth_signer"`).

---


## 2026-05-12 — K1 RAG-stack defaults (post-research correction round)

  **Status:** Decided + implemented.

  **Context:** the ai-features-plan was drafted on 2026-05-12 but with
  some library / pattern choices we wanted to validate against the
  current industry consensus before locking K1's code in. Did one
  research pass (web search across MTEB leaderboards, PgVector best
  practices, Node-PDF libraries, OpenAI batching, MCP transport
  patterns) and updated the plan's defaults in three places.

  **Decisions:**

  - **Embedding model: `text-embedding-3-small` @ 1024 dimensions.**
    Unchanged. No `text-embedding-4`. Qwen3 / Gemini Embedding 001
    outscore 3-small by 5–8 MTEB points but the vendor swap isn't worth
    it at 5–50 docs/bucket. Stays the right "cheap, fast, good-enough"
    default.

  - **Chunking: recursive 400 tokens / 60 overlap via `tiktoken`
    (`cl100k_base`).** Unchanged. Late chunking + contextual retrieval
    (Anthropic) deliver +5-15% recall but ~2× ingestion cost; the
    absolute miss count on hackathon-scale corpora doesn't justify it.
    `tiktoken` (WASM) preferred over `js-tiktoken` (pure JS) — 2–3×
    faster batch tokenization, no edge-runtime constraint here.

  - **PDF extraction: swap `pdf-parse` → `unpdf`.** Real correction
    from the plan. `pdf-parse` is unmaintained, CJS-first, drags
    `canvas` (native compile) which breaks in NestJS+ESM. `unpdf` is
    UnJS, ESM-native, zero native deps, wraps `pdfjs-dist` cleanly,
    works in serverless. `unpdf` API used: `getDocumentProxy(bytes)`
    + `extractText(pdf, { mergePages: true })` — `unpdf` inserts
    `\n\n\f\n\n` page boundaries which the chunker treats as a
    standard paragraph break.

  - **OpenAI batch size: 100 → 200.** Practical sync sweet spot per
    research is 200–500 inputs/request (latency × 429-headroom). Bump
    to 200 saves round-trips for typical PDFs. The async Batch API
    (50% discount, ~1h SLA) is a documented TODO marker in the
    embedder code but out of scope for K1.

  - **`halfvec(1024)` over `vector(1024)`.** Unchanged. 50% storage
    reduction, up to 67× HNSW build speedup, recall delta within
    noise for normalized 1024-d embeddings. Prisma can't serialize
    `halfvec` natively, so writes use `$executeRaw` with
    `'[v1,v2,...]'::halfvec(1024)` casts; reads via `$queryRaw` with
    the `<=>` operator.

  - **Hybrid retrieval (BM25 + vector + RRF) scaffolding shipped in
    K1 even though K1 doesn't ship retrieval.** Research consensus
    (Superlinked, BSWen Feb 2026): vector-only recall@10 ≈ 78%,
    hybrid ≈ 91% on realistic corpora with exact identifiers (code,
    citation keys, error strings). Code corpora are exactly K1's
    target. We add `KnowledgeChunk.content_tsv` as a `GENERATED ALWAYS
    AS (to_tsvector('english', content)) STORED` column + GIN index in
    the K1 migration so K2's retrieval can be hybrid from day one
    without a backfill. Zero K1 code change — the column auto-populates
    on every INSERT/UPDATE of `content`.

  **Sources:**
  - https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026
  - https://chudi.dev/blog/serverless-pdf-processing-unpdf-vs-pdfparse
  - https://www.pkgpulse.com/guides/gpt-tokenizer-vs-js-tiktoken-vs-xenova-transformers-llm-2026
  - https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost
  - https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/
  - https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking
  - https://docs.bswen.com/blog/2026-02-25-hybrid-search-vs-reranker/
  - https://developers.openai.com/api/docs/guides/batch
  - https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-march-2026/

  **Consequences:**
  - One extra workspace dep (`unpdf`), one removed-from-future-plan dep
    (`pdf-parse` never shipped).
  - GIN index on `content_tsv` adds ~10% write cost on each chunk
    insert. Acceptable; ingestion is bursty + offline.
  - K2's retrieval can do hybrid scoring straight away. The migration
    seam is closed at K1; the K2 query just adds the SQL fork.

---

## 2026-05-12 — K2 retrieval: hybrid BM25 + vector + RRF as the default

  **Status:** Decided + implemented.

  **Context:** with K1's `KnowledgeChunk.content_tsv` generated column
  in place, K2's `/search` could either ship vector-only (simpler) or
  hybrid (one more SQL leg + RRF fuse). The 2026 RAG research consensus
  cited in K1's ADR points to hybrid as the default, not the stretch
  goal. K2 implementation phase needed the call locked.

  **Decision: hybrid BM25 + vector + Reciprocal Rank Fusion (k=60)
  as the default `/search` and `/ask` retrieval architecture.**

  - Per-leg candidate count: **50**. Higher than top_k (so the fuse
    has material to work with) but bounded to keep the SQL fast.
    Marginal recall gains past 50 are negligible for hackathon-scale
    corpora.
  - RRF constant **k = 60**. Cormack et al. canonical; insensitive
    to small perturbations.
  - BM25 leg uses `plainto_tsquery('english', ?)` — the "AND of
    words" parser. Forces the BM25 leg to be conservative; the
    vector leg picks up the loose-semantic matches. Empty BM25
    candidates (uncommon english stems) is harmless.
  - `ef_search` per-query: **64** for `/search`, **96** for `/ask`.
    Wider window for `/ask` because the LLM step benefits from
    slightly higher recall before it picks citations.

  **Why now, not as K2 stretch:** the K1 migration already added the
  `content_tsv` column + GIN index, so the BM25 leg costs only one SQL
  CTE. The infrastructure was free; the lift is +10 lines of SQL in
  the fused query. Shipping as default beats shipping vector-only and
  re-doing the SQL later.

  **Consequences:**
  - K3's MCP tools (when they land) inherit hybrid retrieval for free
    via the same service.
  - The K4 dashboard query box reads the same RRF-fused hits the API
    does — no per-surface ranking divergence.
  - If we ever swap embedding models, the BM25 leg keeps working as
    a recall floor during the re-indexing window.

---

## 2026-05-12 — `/ask` brings its own LLM key

  **Status:** Decided + implemented.

  **Context:** K2's `/ask` runs a prompt-stuffed Chat Completions
  call. Either Kraterion pays (via a server-side platform key) or the
  caller brings their own. The plan §6.3 specifies BYO.

  **Decision: caller supplies `openai_api_key` (or future
  `anthropic_api_key`) in the request body; CP never proxies LLM
  calls or holds caller LLM credits.**

  - The CP constructs a per-request `OpenAI(apiKey: dto.openai_api_key)`
    client. No connection pooling between callers.
  - The shared `@kraterion/embeddings-client` is server-paid (our key,
    server-side ingestion) — never used for `/ask`. The two clients
    are deliberately separated so we can't mix keys.

  **Why BYO is right for our scope:**
  - Avoids a billing/proxying ledger we don't have time to build.
  - Sidesteps Anthropic-key-vs-OpenAI-key model-routing entirely —
    the user picks; we run.
  - Keeps the Kraterion platform's OpenAI bill bounded to ingestion
    (one embedding per chunk, no LLM tokens).
  - Matches what every "BYO key MCP server" pattern does in 2026.

  **Tradeoffs:**
  - Dashboard `/ask` is harder to ship in K4 — the user needs to
    paste a key. We'll cache it in `sessionStorage` after first paste;
    that's the dashboard-side ergonomic fix.
  - Demo recording needs a "paste your OpenAI key once" step. Worth
    it for the architectural cleanliness.

---

## 2026-05-12 — K3b: HS256 + in-memory authorize stash (correction to K3b plan)

**Status:** Decided + implemented.

**Context:** The K3b plan (decision above, 2026-05-12) called for
EdDSA-signed tokens and an `oauth_signer` sub-wallet pattern. While
implementing, two of those choices turned out to be premature.

**Decision 1: HS256, not EdDSA.** The CP is the only verifier of MCP
access tokens today (the auth guard runs in the same process that
signs). HS256 with the existing `JWT_SECRET` env var is the same key
surface the dashboard session JWTs already use — one secret, one
verifier. EdDSA is the right call once a separate gateway or worker
needs to verify these tokens offline; swapping in a keypair is a
one-line change in `OAuthService.signAccessToken()`.

**Decision 2: in-memory authorize stash, not Redis (yet).** The
authorize-request stash bridges the CP-side validation step
(`GET /oauth/authorize`) and the dashboard-side consent step
(`POST /oauth/authorize/decision`). The window is bounded (5 min TTL)
and bouncing the CP between the two is recoverable — the user gets
sent back to /authorize, not destroyed state. A `Map<request_id, ...>`
in the `OAuthService` instance is enough for a single-replica
hackathon deploy; production replaces it with `RedisModule.set(... PX
... NX)` and that is one edit.

**Decision 3: `typ: "kraterion.mcp+jwt"` claim.** Dashboard session
JWTs and MCP access JWTs are both HS256 against the same secret. The
`typ` claim is the discriminator the MCP guard checks — without it,
a stolen dashboard JWT would unlock the MCP surface and vice versa.
The auth guard fails closed on a missing or mismatched `typ`.

**Consequences:**

- No `oauth_signer` sub-wallet row. The K0 bootstrap script doesn't
  need to provision it.
- A multi-process CP deploy needs Redis for the authorize stash and
  a JWT denylist for revocation. Both are one-day follow-ups, not
  hackathon blockers.
- The MCP guard cross-checks `typ` *before* `aud` and `exp`, so the
  cheapest comparison runs first.

---

## 2026-05-13 — Project-scoped OpenAI credentials replace the global env var (P0)

**Status:** Accepted, shipped.

**Context:** Until now every OpenAI call (worker ingestion, CP `/search`
query embedding, CP `/ask`, MCP `kraterion_ask`) read `OPENAI_API_KEY`
from process env or accepted a per-request `openai_api_key` body field.
That blocks every "AI feature that runs without a human in the request"
arc the AI platform proposal needs: scheduled jobs, agents, embedded
widgets, background re-indexing — none of them have a caller to paste
a key.

**Decision:** Add a project-scoped `ProviderCredential` table KMS-wrapped
via the existing `EnvKeyWrapper` (same envelope as `ApiKey.secret_wrapped`
and `SubWallet.mnemonic_wrapped`). Surface `ProviderCredentialService` with a
single read path — `useDecrypted(projectId, provider, fn)` — that unwraps
in-memory for the duration of `fn` only. Wire every existing OpenAI
callsite through it; drop the env var and the per-request `openai_api_key`
field on `/ask` and `kraterion_ask`.

**Decision 1: validate-before-persist.** `PUT
/v1/projects/:id/credentials/openai` pings OpenAI's `/v1/models` (Bearer
auth, 5s timeout) before writing. 401 → 400 to the caller; 200 → write
with `status='active'`; any other status / network error → write
`status='active'` anyway (transient failures should not poison the
stored row, the next `useDecrypted` will surface the real problem). The
alternative — persist then validate async — leaves an invalid key live
through the first indexing batch, which is the worst possible time to
discover it.

**Decision 2: gate enable-Knowledge at the controller, not the worker.**
The POST `/v1/buckets/:id/knowledge { enabled: true }` handler checks
`ProviderCredentialService.list` before any DB write; missing OpenAI
credential → `409 PreconditionFailed` with `details.provider = 'openai'`.
The dashboard's KnowledgeToggle branches on that code and surfaces a
"Configure an OpenAI key first → Manage providers" banner linking to
`/keys?tab=providers`. The alternative — let enable succeed, fail at
embed time — leaves a confusing zombie "Knowledge enabled, zero
chunks" state.

**Decision 3: `PreconditionFailed` maps to HTTP 409, not 412.** The
dashboard's existing `cpFetch` already treats 409 as recoverable
user-fixable state (existing `Conflict` code uses 409 for things like
"project name taken"). Adding 412 would mean a new branch in every
fetch helper; reusing 409 with a distinct `code` field lets the
dashboard branch cleanly without touching transport code.

**Decision 4: per-app worker copy of the service, not a shared package.**
`apps/control-plane` and `apps/worker` each get their own
`ProviderCredentialService`. They share the wrapped ciphertext via the
`ProviderCredential` table and the master key via `KEY_WRAPPING_MASTER_KEY`
env — that's the contract. Extracting a third package for ~30 LOC of
DI plumbing would cost more than it saves. The worker version omits
`list/upsert/remove` (worker is read-only) and throws `MissingProviderCredentialError`
instead of `ControlPlaneError` so the embeddings processor can finalize
the manifest with a typed reason without dragging Nest's HTTP layer
into the worker.

**Consequences:**
- One credential per (project, provider) — `@@unique([project_id, provider])`
  encodes the proposal's "project, one provider key" rule and leaves P1
  (Anthropic, Cohere) a no-migration extension.
- The `embeddings-client` package drops its env-based singleton; every
  `embedQuery / embedAll / embedBatch` call takes `apiKey` per request.
  Callers without per-project context (none today) would need to manage
  their own key plumbing.
- Indexing jobs that hit a missing/invalid credential finalize the
  manifest with `status='failed'` + `error_detail='openai_credential_missing'`
  and the worker keeps draining other buckets. No retry storm.
- Removing the OpenAI credential on `/keys` does not delete existing
  chunks — they stay queryable until search runs and fails on the next
  `useDecrypted`. The remove modal copy makes that explicit.

---

## 2026-05-13 — Embedding-model picker only exposes 1024d; re-index is destructive (P0 step 2/3/4)

**Status:** Accepted, shipped.

**Context:** P0 step 2 of the AI platform proposal asks the dashboard's
enable-Knowledge modal to offer three OpenAI embedding options (1024d,
1536d, 3072d) and warn that the choice is locked once indexing starts.
Step 3 adds a default chat model picker; step 4 adds an indexing-cost
estimate. Step "re-indexing flow" asks for a destructive change-settings
flow with a confirmation that spells out the consequences.

**Decision 1: Show 1536d / 3072d as "Coming soon" rather than enable them.**
The `KnowledgeChunk.embedding` column is `Unsupported("halfvec(1024)")` —
pgvector requires a fixed dimension per column. Storing 1536d or 3072d
vectors needs a column-level schema change (or a per-dim shadow table
keyed by `(chunk_id, model)`). Surfacing the options as disabled keeps
the proposal's intent ("here are the embedding tradeoffs") visible
while honestly representing what the storage layer supports today. Both
the backend (catalog `.disabled` flag) and the dashboard reject
selection of the 1536d/3072d rows. When we add the schema, flipping the
`disabled` bit in `packages/shared/src/models.ts` is the only change
needed in the catalog.

**Decision 2: Destructive re-index, not transactional swap.** The
proposal's preferred behavior is to keep serving old chunks until the
new pass completes, then atomically swap. That would need a
`pending_embedding_*` shadow on `KnowledgeBucketSettings`, per-manifest
embedding-spec tagging, a routing rule that filters chunks by current
spec, and a swap step. ~1.5 days of schema + query work for a behavior
that mostly matters when re-indexing a bucket that's actively serving
production traffic. Destructive re-index — drop chunks, swap settings,
re-enqueue every object — is one transaction plus the existing backfill
loop, the confirmation modal warns the user that search returns empty
for the bucket until the worker drains, and matches the behavior of
disable + re-enable (which already works this way). Pencilled as
post-hackathon: see `docs/ai-platform-proposal.md` §"Re-indexing flow"
for the transactional version's shape.

**Decision 3: Schema column kept as `default_llm_model`, not
`default_chat_model`.** The K1 schema already had `default_llm_model` and
no code read it. The proposal calls the field "default chat model";
renaming the column would have been a no-value migration. The wire field,
hook field, and UI label all use `default_llm_model` to stay consistent.

**Decision 4: Model catalog lives in `packages/shared/src/models.ts`.**
Both backend (validation) and frontend (pickers + cost preview) read
the same list. Adding a model is a one-line edit; adding a provider is
a new entry plus a `provider` switch in the validation ping. The
catalog also exposes the pricing constants used for the indexing-cost
estimate (`BYTES_PER_TOKEN_ESTIMATE` = 4, list prices as of 2026-05-13).
Pricing accuracy is rough by design — the UI labels every cost figure
as "estimate".

**Consequences:**
- Switching the chat model on a Knowledge-enabled bucket is free
  (per-request override, no re-index needed). Switching chunking
  parameters or the embedding model requires re-index. The dashboard
  treats both via the same modal in "reindex" mode.
- The manifest archive's verifiability promise — given chunk hashes,
  the on-chain manifest proves how they were derived — only holds for
  the bucket's *current* embedding spec. After a destructive re-index,
  the old manifests still exist on chain but their chunk hashes no
  longer correspond to live chunks. The new manifests are written when
  each object re-indexes. The dashboard confirmation copy spells this
  out before the user confirms.
- The 5-second OpenAI `/v1/models` validation ping on credential
  upsert costs $0 against OpenAI's bill (the endpoint is free); the
  same is true for the per-request ping that any future provider
  abstraction (P1) would need to add.


## 2026-05-13 — All modal scrims render through a React portal

**Status:** Accepted, shipped.

**Context:** The dashboard's drawer (`.ks-drawer`) keeps
`transform: translateX(0)` applied after its slide-in animation (CSS
`animation-fill-mode: both`). Modals triggered from inside the drawer
— `ConfirmModal` for "delete file" being the canonical case — rendered
their `position: fixed` scrims pinned to the drawer's bounds instead
of the viewport. CSS containing-block rules: a transformed ancestor
overrides the viewport-as-containing-block default for fixed
descendants.

**Decision:** Wrap every modal scrim in a small `<Portal>` component
that mounts children on `document.body` via `createPortal`. The
component does an SSR-safe two-phase mount — return `null` on first
render, upgrade to the portal after `useEffect` — matching how Radix
and Headless UI handle the same problem.

**Why this and not alternatives:**

- *Drop the drawer's `transform` after the animation finishes* —
  would need either a JS-driven class swap on animation end or
  switching from CSS animations to React-state-driven transitions.
  Both add complexity and reintroduce flicker. Portals are a single
  ~15-line component that solves the same class of bug for any future
  scrim under any future transformed ancestor.
- *Render modals at the page-level and pass open state up* — works
  but spreads modal lifecycle across components and breaks the
  invariant that "the component that owns the action owns its
  confirmation". Portals keep the modal co-located with its trigger
  while still escaping the stacking context.
- *Set `position: fixed` via `inset: 0` on a manually managed
  top-level div in `RootLayout`* — same end state as a portal but
  hand-rolled. The React API exists for this.

**Consequences:**

- All 8 dialogs (`ConfirmModal`, `CreateBucketDialog`,
  `DeleteFolderDialog`, `NewFolderDialog`, `EnableKnowledgeModal`,
  `ChangeChatModelDialog`, `AddOpenAiKeyDialog`, `CreateApiKeyDialog`)
  go through `<Portal>`. The behavior is unchanged for modals not
  triggered from inside a drawer.
- Future modal scrims should always wrap in `<Portal>` — even if
  the immediate trigger isn't inside a transformed ancestor, adding
  one later (a drawer, an animated card, a `transform: scale(...)`
  hover effect on a parent) silently breaks the scrim layout
  otherwise.
- This implicitly sets a convention: anything `position: fixed` that
  must always be viewport-relative belongs in a portal.

---

## 2026-05-13 — Removing an AI provider credential always requires type-to-confirm

**Status:** Accepted, shipped.

**Context:** The initial cascade-disable design only required type-to-confirm
when the project had active Knowledge-enabled buckets. With no active
buckets, the modal showed a one-tap "Remove key" button. That created
two UX paths for the same destructive action and inverted the usual
heuristic — destructive actions are *more* dangerous when there's no
visible blast radius, because the user is more likely to click through
without reading.

**Decision:** Type the literal string `remove` to confirm, always.
The CP also `?cascade=true` is now sent on every removal — the
transaction is a no-op for the wipe step when there are no active
buckets, so a single code path covers both cases. The dashboard adapts
the modal copy (destructive warning + bucket count vs. simpler
"indexing/search will fail" copy) based on the project's
`active_knowledge_buckets` count, which the credentials list endpoint
now returns alongside the redacted credential rows.

**Consequences:**

- One code path for credential removal in the dashboard. No
  conditional flows, no surprise UX changes when the bucket state
  shifts.
- The credentials list response carries `active_knowledge_buckets` so
  the modal opens with accurate copy without a round-trip.
- Confirm button stays disabled until the literal `remove` is typed;
  Enter submits when valid. Consistent with Stripe, GitHub, Linear
  remove-confirmation patterns.

---

## 2026-05-13 — Worker chunk delete is scoped to `s3_object_id`, not `manifest_id`

**Status:** Accepted, shipped.

**Context:** The embeddings worker's persist transaction was running
`knowledgeChunk.deleteMany({ where: { manifest_id: manifest.id } })`
before inserting new chunks. That handled retries on the same
manifest correctly — same-manifest chunks from a prior attempt get
cleared. But on a re-upload, the worker opens a *new* manifest at
`version + 1`; the `manifest_id`-scoped delete becomes a no-op on the
freshly-opened (empty) manifest, and the previous version's chunks
survive. `/search` reads chunks by `bucket_id` with no version filter,
so both old and new versions of the same object would surface in
results.

**Decision:** Switch the persist-tx delete to scope by `s3_object_id`
instead. Wipes every chunk for the object regardless of which
manifest version they came from, then inserts the fresh chunks under
the current manifest. Same behaviour as before for retries; correct
behaviour for re-uploads.

**Why not version-filter `/search` instead:** the leak would still
waste DB space and pgvector index churn on chunks that can never be
returned. Cleaning up at the write site removes the problem entirely
rather than masking it at read time. The defensive
`AND s.deleted_at IS NULL` filter added to `/search` is for the
*soft-delete* leak (a separate bug, see below), not for stale
versions.

**Consequences:**

- One write site (the worker's persist tx) is the only place that
  decides chunk lifetime. Audit-trail manifests stay; their chunks
  evaporate when a new version of the object is indexed.
- Pairs with the gateway's `deleteObject` change, which wipes chunks
  + soft-deletes the `S3Object` atomically. Together: every code path
  that ends an object's lifetime — overwrite or delete — removes its
  chunks immediately.
- Future indexers (other content types, other embedding providers)
  inherit the convention: scope chunk deletes by `s3_object_id`, not
  by `manifest_id`.


## 2026-05-13 — Hackathon scope cuts: skip P1, P5, and three P0 deviations for the Sui Overflow 2026 submission

**Status:** Committed for the Jun 21, 2026 submission.

**Context:** `docs/ai-platform-proposal.md` was written as a full 30-day
platform shape (P0–P6 + appendices). With 39 days to the submission
deadline and parallel Walrus-track demands (deploy infra, demo video,
README rewrite, deployed demo, submission form), we cannot honestly
ship the full proposal. Time-boxing the AI surface protects the demo
quality on the parts we do ship.

**Decision:** Lock the AI-platform shipping queue for the submission as:

1. **P0** — done.
2. **P2 — Reranker** — next; highest-precision-per-engineering-hour move
   on the list.
3. **P3 — Agents** + **P4 — Function calling** — the demo-defining
   surface; ship both before the final cut.
4. **P6 — Embeddable widget** — stretch; lands harder if it ships, fine
   to drop if W6 budget tightens.

**Explicitly deferred past Jun 21:**

- **P1 — Multi-provider model abstraction.** OpenAI-only at the demo.
  P0's schema is already provider-tagged, so this is a clean additive
  move later. No demo value without a second-provider user behind it.
- **P5 — Guardrails.** Production-shipping concern, not a hackathon-
  judging concern. P3 will stub `guardrails_id?` on the agent model so
  P5 plugs in later without a schema break, but no middleware ships.
- **1536d / 3072d embedding picker enablement.** Surfaced as "Coming
  soon" in the modal. Enabling them needs a per-dim shadow column or
  shadow table — real migration cost, no demo lift.
- **Transactional swap during re-index.** Current re-index is
  destructive (search returns empty during the worker pass). The
  swap-over needs `pending_embedding_*` shadow columns + per-manifest
  spec tagging + spec-filtered chunk queries. ~1.5 days for a
  property that only matters at production traffic levels.
- **"Test connection" button** in the Add-OpenAI-key modal. Validation
  happens implicitly on Save — same `GET /v1/models` ping, one fewer
  click, same outcome.

**Consequences:**

- The embedding picker stays single-option through the submission. P0
  is correctly described as "Partial — hackathon cut documented inline"
  in the proposal.
- Search returns empty for a few seconds during re-index. The
  confirmation copy is honest about this; it's the expected behaviour,
  not a bug.
- Anyone reading the proposal sees per-section status badges + a
  top-level "Hackathon scope" block + this decisions entry. No
  surprises during demo-prep.
- On Jun 22 (post-submission), the proposal becomes the post-hackathon
  roadmap. The deferred items become candidates for the next round.


## 2026-05-13 — Hackathon scope amendment: P2 (reranker) also deferred

**Status:** Committed for the Jun 21, 2026 submission. Amends the earlier
2026-05-13 entry ("Hackathon scope cuts: skip P1, P5, and three P0
deviations").

**Context:** P2 was originally in the shipping queue (called out as the
cheapest precision-per-engineering-hour move on the list). After
researching the actual integration path — see
[`docs/p2-reranker-research.md`](p2-reranker-research.md) for the
provider comparison and three-stage `search()` decomposition — we are
also cutting P2 from the submission.

**Decision:** P2 ships post-hackathon. Updated shipping queue:

1. **P0** — done.
2. **P3 — Agents** + **P4 — Function calling** — the demo-defining
   surface; both still in scope.
3. **P6 — Embeddable widget** — still stretch.

**Why:**

- **No native OpenAI reranker as of May 2026** — launching P2 means
  adding **Cohere** (or Voyage / BGE) as the provider. That's a second
  credential surface on `/keys?tab=providers`, effectively triggering
  P1 scaffolding before P1's own deferral.
- **The demo's wow factor is the on-chain Verify trail + Agents**, not
  retrieval precision tweaks. A reranker improves search recall@k but
  is invisible to a 60-second demo audience.
- **The ~3.5-day budget is better spent on P3 + P4 polish.** Agents
  with function calling is the resource users compare to ChatGPT
  custom GPTs and Claude projects; it's the unit every product manager
  understands. Reranker is an optimization on top of an already-good
  retrieval story.

**Consequences:**

- Search continues to use RRF-only (BM25 + vector + Reciprocal Rank
  Fusion). Recall@10 ~91%, which is already strong for the demo.
- The proposal's `KnowledgeBucketSettings.reranker_model` column is
  not added. Adding it later remains a single additive migration on
  top of the existing schema.
- Research is preserved in `docs/p2-reranker-research.md` so the
  post-hackathon round doesn't repeat the provider comparison or
  re-derive the architecture plan.
- The post-hackathon backlog has P2 as the first item — it's the
  cheapest quality lift on the list.


## 2026-05-13 — P3 ships: Agents resource + OpenAI Chat Completions endpoint; /ask removed, per-bucket chat model deprecated

**Status:** Accepted, shipped.

**Context:** Before P3 the AI surface had three coupled gaps:

1. The `/ask` endpoint baked a hardcoded system prompt, temperature,
   max-tokens, and citation format into [`apps/control-plane/src/knowledge/ask.ts`](apps/control-plane/src/knowledge/ask.ts).
   No conversation history, no streaming, non-OpenAI-compatible
   response shape. Every consumer had to learn a Kraterion-specific
   wire format that no OpenAI SDK speaks.
2. `KnowledgeBucketSettings.default_llm_model` put model selection on
   the wrong resource. A bucket conceptually owns retrieval spec
   (embedding model, chunking); the chat model is an agent concern.
   Two different agents reading the same bucket should be able to
   pick different chat models without changing bucket state.
3. There was no "agent" resource users could compare to ChatGPT
   custom GPTs / Claude projects / DigitalOcean agents — the unit
   every PM understands. MCP tools were generic over buckets; every
   external consumer re-invented prompts.

**Decision:** Ship P3 in full. Drop `/ask`. Drop
`KnowledgeBucketSettings.default_llm_model`. The new shape:

- **`KraterionAgent` resource** owned by a project, with fields
  `name`, `description`, `system_prompt`, `model`, `temperature`,
  `max_tokens`, `top_k`, `status`, attached `buckets[]`, and a
  provisioned `SubWallet` (role='agent'). Many-to-many bucket
  attachment via `AgentBucket`. Full audit row per call in
  `AgentInvocation`.
- **`POST /v1/agents/:id/chat/completions`** — strict-subset OpenAI
  Chat Completions wire format. SSE streaming when `stream: true`,
  buffered otherwise. Kraterion extensions (`retrieval`, `citations`)
  live under a `kraterion` field that stock OpenAI SDK consumers
  ignore. Per-call model override allowed.
- **MCP `kraterion_ask` → `kraterion_invoke_agent`.** Input is
  `{ agent_id, input, model? }`. Replaces the bucket-scoped ask tool;
  no back-compat alias (the migration window is short and the demo is
  the only consumer).
- **Dashboard `/agents`** is now tabbed: "My agents" (KraterionAgent
  list with create / detail / revoke / delete) + "Connections" (the
  existing OAuth-clients list). Agent detail page has Chat /
  Settings / Connect tabs.
- **Knowledge tab** drops the "Default chat model" row entirely;
  replaced with an "Agents" pointer that routes to `/agents`.
- **Enable-Knowledge modal** drops its third step (chat model
  picker). Now 2 steps: embedding model → confirm with cost estimate.

**Decision 1: Strict-subset Chat Completions, not the Responses API.**
OpenAI is migrating new builders to the Responses API (Assistants
deprecates 2026-08-26), but Chat Completions remains the canonical
shape for *deterministic, idempotent, audit-friendly* RAG flows —
which is exactly Kraterion's profile. Plus DigitalOcean's own
`gradient-ai/agents` ship Chat-Completions-compatible endpoints, so
this matches the closest market reference. Responses API would force
us to adopt OpenAI-hosted threads/state which conflicts with the
on-chain verifiability story.

**Decision 2: Sub-wallet provisioned at agent-create time, on-chain
grant deferred.** Every agent gets an Ed25519 keypair generated and
KMS-wrapped at create time (same pattern as `knowledge_indexer`).
The Sui address is the agent's stable on-chain identity going
forward. **What's deferred:** auto-firing the
`grant_api_access(bucket, agent_addr)` Move call on each attached
bucket. Today the agent's chat endpoint refuses when
`agent.status='revoked'`, but the Move package isn't aware of the
agent yet. Pencilled as a P3-on-chain follow-up; the architectural
seam is in place (`SubWallet` role='agent', address exposed on the
Connect tab) and adding the sponsored grant/revoke PTBs later is
additive.

**Decision 3: `/ask` is removed, not aliased.** No backward-compat
shim. The demo is the only consumer; aliasing would just leave the
old surface in place for a few weeks and force two response shapes.
External consumers point an OpenAI SDK at
`/v1/agents/{id}/chat/completions`.

**Decision 4: Single-turn chat at submission.** The agent endpoint
accepts a `messages[]` array (OpenAI shape) but only honors the most
recent user turn — system prompt comes from the agent, not the
request. Multi-turn conversation history with compaction is a clean
follow-up.

**Decision 5: Cross-bucket retrieval merges by RRF.** An agent
attached to N buckets queries each one in parallel (today: serial
loop, fine at hackathon scale), then merges the hits by their
existing `rrf_score` before slicing to `agent.top_k`. Per-bucket
failure is silent — the agent answers from accessible buckets and
keeps going. A bucket-wide credential miss still surfaces (every
bucket would fail).

**Consequences:**

- Bucket-level `default_llm_model` is dropped. Existing buckets keep
  working (the column is removed by the same migration that adds the
  Agent tables); ad-hoc "ask this bucket" is now "create an agent
  attached to this bucket and chat with it".
- MCP consumers that previously called `kraterion_ask` need to switch
  to `kraterion_invoke_agent({ agent_id, input })`. Tool description
  spells this out.
- The dashboard's `/agents` page is the demo-defining surface — every
  Kraterion-native angle (on-chain identity, sub-wallet, verifiable
  citations, per-agent revoke) lives there.
- Chat works in the dashboard via SSE streaming; the citation strip
  renders inline with the assistant response.


## 2026-05-13 — Agent sub-wallet goes fully on-chain: sponsored grant + per-address revoke emulation

**Status:** Accepted, shipped.

**Context:** The earlier P3 ship landed every layer of the agents
resource except the on-chain side — sub-wallets were provisioned at
agent-create time but their addresses weren't wired into the bucket's
`api_decryption_addresses` list. Revoke was a DB-only flag flip,
which loses the "agent access is an on-chain capability" angle that
makes the agents demo distinct from DigitalOcean / ChatGPT custom
GPTs / Claude projects.

**Decision:** Wire the sub-wallet end-to-end:

- **Grant** — new `POST /v1/buckets/:bucketId/prepare-grant-agent {
  agent_id }` builds a sponsored
  `grant_api_access(bucket, agent.sub_wallet_address)` PTB. Same Move
  call, same Enoki sponsorship plumbing, same allow-listed target as
  the existing gateway / indexer grants — the only delta is which
  address goes in.
- **Per-address revoke** — `POST /v1/buckets/:id/prepare-revoke-agent
  { agent_id }` reads the bucket's current
  `api_decryption_addresses` from chain, filters out the agent's
  address, emits a single PTB:
  `revoke_all_api_access(bucket)` + one `grant_api_access(bucket, addr)`
  per surviving principal. Same emulation pattern the
  `prepare-revoke-indexer` flow uses, generalized to N survivors.
- **Status query** — `GET /v1/agents/:id/grants` fans out one Sui RPC
  per attached bucket and reports `granted_on_chain: boolean`. The
  dashboard's Connect tab uses it to drive per-bucket Grant / Revoke
  buttons.
- **Dashboard Connect tab** — per-bucket row showing on-chain status
  (Granted / Not granted pill, Suiscan link to the bucket object),
  Grant button when not granted, Revoke button when granted. Each
  action fires a sponsored tx via the existing `useSponsoredTx` hook,
  toasts on success with a Suiscan tx link, then invalidates the
  grants query so the row flips state immediately.
- **Top-level Revoke stays DB-only.** Flipping `agent.status='revoked'`
  fails the next chat call instantly (the chat endpoint checks the
  DB row). The on-chain grants stay until the user explicitly revokes
  them from the Connect tab — separate user intent: "make this agent
  stop working right now" vs. "scrub it from the chain". The modal
  copy points the user at the Connect tab for the cleanup.

**Why read on-chain ACL state at revoke time, not from a DB shadow:**
no indexer handler exists for `KraterionApiAccessGranted` /
`Revoked` events — the chain is the source of truth and DB drift is
a real risk. Reading the list right before building the PTB
guarantees we never accidentally re-grant a principal that was just
removed, or drop one we didn't know about (e.g. a wallet granted via
the Sui CLI outside the dashboard's view). One extra RPC per revoke;
acceptable cost.

**Decision 1: One sponsored tx per (agent × bucket) action, not a
batch.** Sponsored Enoki transactions cap at one Move-call target
allow-list per tx. Bundling N bucket revokes for one agent into a
single PTB would force one target list spanning all of them and
become hard to reason about. Keeping each grant / revoke as its own
sponsored tx mirrors how the existing gateway + indexer grants
already work, and lets the user see one Suiscan link per action.

**Decision 2: No DB shadow of `api_decryption_addresses`.** Adding
an indexer handler for grant / revoke events would close the live
"is X granted on Y" question without an RPC, but it costs a new
indexer surface area, a new shadow table, and another consistency
invariant to defend. The Sui RPC read takes ~200ms in steady state;
the dashboard caches via TanStack `staleTime: 30s`. Cheap.

**Decision 3: On-chain status surfaces alongside HTTP endpoint info
on the Connect tab, not in a separate tab.** The user wants to know
"how do I connect / how do I revoke" in one view. Splitting on-chain
status into its own tab fragments the mental model.

**Consequences:**

- The demo arc the proposal pitched is now live end-to-end: create
  agent → grant on chain per bucket (sponsored tx, Suiscan link) →
  chat works → revoke from the Connect tab (sponsored tx, the agent's
  address disappears from `api_decryption_addresses` on chain) →
  re-grant idempotently. The "agent access is on-chain" claim no
  longer needs a footnote.
- Granting / revoking agents is independent of the gateway and
  indexer grants — those keep working through the agent's lifecycle.
  The per-address revoke pattern (read + filter + re-grant) handles
  any number of co-resident principals.
- Move package doesn't need a per-address revoke entry point for
  agents to be safe. If we ever add it post-hackathon, the dashboard
  flow simplifies (single Move call vs. N+1) but no migration is
  needed.


## 2026-05-13 — Unified bearer API tokens (`kr_live_…` / `kr_test_…`); drop the MCP `<AKIA>:<secret>` colon-format

**Status:** Shipped.

**Context.** Programmatic auth across the platform was fragmented:

- **Gateway (S3)** — AWS SigV4 with `AKIA…` + KMS-wrapped secret. Universal,
  every S3 SDK speaks it. Stays.
- **CRUD / agent chat / knowledge** — session JWT only. A dev could not
  script against `/v1/agents/:id/chat/completions` without scraping a
  browser cookie. No documented programmatic path.
- **MCP K3a** — `Authorization: Bearer <AKIA>:<secret>` (the S3 key reused
  as a colon-separated bearer). Functional, but off-pattern: the
  colon-separator looks like HTTP Basic auth (`base64(user:password)`),
  and stamping the S3 secret onto a non-S3 surface created the wrong
  mental model ("am I sending my S3 secret in plaintext?"). The
  K3a docstring already flagged the single-token form as a follow-up.
- **MCP K3b** — OAuth 2.1 + DCR (RFC 7591) + PRM (RFC 9728) + PKCE.
  Spec-compliant. Stays.

**What every industry reference does.** Stripe, OpenAI, Anthropic,
Cohere, Pinecone, Voyage, and DigitalOcean Gradient AI all expose
**one opaque bearer token kind** with a network-encoding prefix:
`sk_live_…` / `sk_test_…` (Stripe), `sk-…` (OpenAI), `sk-ant-…`
(Anthropic). One token works across CRUD, AI, and (where it exists)
MCP. SigV4 keys are kept separate **only** because S3 protocol mandates
an id+secret pair.

**Decision.** Introduce `kr_live_…` (mainnet) and `kr_test_…` (testnet +
devnet) bearer tokens as the unified programmatic credential for the
control plane. Replace MCP K3a entirely — `<AKIA>:<secret>` is gone.
Keep SigV4 keys on the gateway because the protocol forces an
id+secret pair. Two credential kinds total, distinguished by
**protocol**, not by **surface**:

| Kind          | Format                | Consumer                                                              |
|---------------|-----------------------|-----------------------------------------------------------------------|
| S3 SigV4 key  | `AKIA…` + secret      | Gateway only (SigV4 protocol-mandated)                                |
| Bearer token  | `kr_live_…` / `kr_test_…` | Control plane CRUD, agent chat, knowledge, MCP (replaces K3a)     |
| OAuth JWT     | `kraterion.mcp+jwt`   | Third-party MCP clients (Claude Desktop, Cursor) — unchanged          |

**Why the prefix encodes the network, not the surface.** Stripe's
killer UX moment is "you can't accidentally fire a live transaction
from your test deployment." We get the same property for free: a
`kr_test_…` token presented to a `SUI_NETWORK=mainnet` control plane
is rejected with a 401, and vice-versa. Encoding the surface (e.g.,
`kr_mcp_…` + `kr_api_…`) would have been the wrong axis — devs want
one token everywhere, scoped at issuance, not three tokens to keep
straight per env file.

**Why hash, not KMS-wrap, the bearer token.** Unlike SigV4 secrets
(which the gateway needs to recover to recompute HMACs), the bearer
token is never used to sign anything — the auth path is just "look
up the row by `sha256(token)`." Storing only the hash means a DB
compromise cannot reveal active tokens; the cleartext exists exactly
once, in the mint response, then in the user's clipboard. Stripe and
GitHub PATs do the same. We keep `EnvKeyWrapper` for the SigV4 path
where it's actually load-bearing.

**Why drop K3a entirely instead of supporting both formats.** The
colon-separated form taught devs the wrong shape and made the docs
example confusing ("is the colon a separator or part of the token?").
With OAuth (K3b) as the spec-mandated remote-MCP path and the new
bearer covering local/CLI/CI use, there is no use case left for
`<AKIA>:<secret>` that isn't already covered. Hackathon-stage —
breaking the old format costs nothing.

**Why open the bearer to more surfaces than MCP.** A token that only
works on `/mcp` doesn't help the dev who wants to curl
`/v1/agents/:id/chat/completions` or list buckets from a CI job. The
plan + this ship extend `AuthGuard` (the foundational CRUD guard) to
accept the bearer in addition to the session JWT, so one token works
on CRUD, agent chat, knowledge, MCP. Session-only stays: account
settings, key minting, OAuth consent, gateway SigV4.

**Schema decision.** Reuse the existing `ApiKey` table with an
additive `kind` discriminator (`"s3"` | `"bearer"`). Bearer rows
populate `token_hash` (unique) + `token_prefix` (cosmetic preview
for the dashboard) + `network` + `scopes`; S3 rows keep populating
`access_key_id` + `secret_wrapped`. Both column groups become
nullable. No data migration, no separate table — same revocation
story, same project ownership, same audit trail.

**Consequences.**

- **Dev experience.** Curl examples now read like every other AI
  provider: `Authorization: Bearer kr_test_…`. The `/keys` dashboard
  page has three tabs: **API tokens** (default, bearer), **S3 access
  keys** (AKIA), **AI providers** (ProviderCredential, unchanged).
- **MCP migration.** Existing MCP clients using `<AKIA>:<secret>`
  break and must re-mint. Hackathon scope — no production users,
  and the OAuth flow (Claude Desktop / Cursor) was always the
  recommended path anyway.
- **Audit.** `AgentInvocation.api_key_id` and
  `KnowledgeQuery.api_key_id` are populated when the request
  authenticated with a bearer; `user_id` is populated on session
  JWT. Easy to grep "what did the bot do" vs. "what did the user do"
  in any one project.
- **Per-key scoping.** `ApiKey.scopes` column is scaffolded but
  empty for all v1-minted tokens (= full project access). Layering
  scopes onto `kr_*` tokens is post-hackathon; the column being
  there now means we won't need a schema change later.
- **Cross-project access within an account.** Bearer tokens are
  project-scoped at the type level (`ApiKeyPrincipal.projectId`).
  The agent chat endpoint enforces this — a token for project A
  cannot invoke an agent in project B even when both belong to the
  same account. Buckets / knowledge / objects / folders rely on the
  service-layer `account_id` check today (same risk profile as the
  S3 AKIA keys). Tightening the rest is a hardening follow-up.
- **Network gating.** A `kr_test_…` token presented to a
  `SUI_NETWORK=mainnet` control plane returns 401 — Stripe-style.
  The dashboard creation dialog shows a "Testnet" / "Mainnet" pill
  so the dev knows what prefix they're about to receive.

## 2026-05-13 — P4 ships: built-in agent tools + per-call audit with on-chain receipt

**Status:** Shipped.

**Context.** The agent shipped in P3 was a RAG chatbot — retrieval + an
answer, nothing more. The hackathon demo arc the Walrus track judges
will respond to is "agent reads a contract → drafts a summary →
writes it back to the bucket → the audit trail is on-chain." P4
turns the agent into a tool-using agent and lights up that arc.

**Decision.** Add six built-in tools (the seven MCP tools minus
`invoke_agent` for recursion safety), expose them per-agent via a
4th step in the create dialog, run the OpenAI tool-call loop inside
the chat endpoint (streaming + non-streaming both), record each
call in a new `AgentToolCall` audit table, and — for writes —
capture the indexer-populated `tx_digest` on that row so the
dashboard can link to Suiscan.

**Tool catalog** (`apps/control-plane/src/agents/tools/`):

| Name                        | Kind  | Notes                                                |
|-----------------------------|-------|------------------------------------------------------|
| `kraterion_search`          | read  | Hybrid retrieval over knowledge buckets             |
| `kraterion_list_buckets`    | read  |                                                      |
| `kraterion_list_objects`    | read  |                                                      |
| `kraterion_read_object`     | read  | 1 MiB cap                                            |
| `kraterion_write_object`    | write | 5 MiB cap; polls `S3Object.tx_digest` for receipt   |
| `kraterion_get_manifest`    | read  | Manifest archive + chunk metadata                    |

**Why hand-written JSON Schema for OpenAI's `tools[]` param.** Initial
implementation tried `zod-to-json-schema` but the package wasn't an
explicit dep and CLAUDE.md forbids installing new packages without
explicit user go-ahead during the session. With six tools the JSON
Schema bodies are <10 lines each; the duplication cost is far below
the dependency-management cost. Both schemas stay in sync via
proximity (next to each other in the tool's `.ts` file).

**Why one `AgentToolCall` sibling table, not a JSON array on
AgentInvocation.** Tool calls are real entities — we want to query
"every time the agent wrote to bucket X across all invocations" or
"agents that called write_object more than 10x last week." A JSON
column blocks those queries. The 1-N relation also gives clean
cascade-delete + audit timing fields per row.

**Iteration cap (`MAX_TOOL_ROUNDS = 5`).** Generous for the demo arc
(`search → read → write` = 3 rounds) and well short of OpenAI's
safety guidance. Past the cap we patch the invocation to
`status="failed"` with `error_detail="exceeded tool-call limit"`.

**Recovery from invalid arguments.** When the model emits malformed
JSON or arguments that fail the Zod schema, the `AgentToolCall` row
is written with `status="failed"` and the tool's `content` returned
to the model is `Error: <reason>`. The model can self-correct on
the next round — OpenAI's documented recovery pattern. Cheaper than
a hard abort.

**On-chain receipt capture.** `write_object` polls `S3Object` by
`(bucket_id, s3_key)` after the gateway PUT for up to 8s waiting on
the indexer to populate `tx_digest`. If the indexer hasn't caught up
within that window, the audit row keeps `tx_digest: null` and the
dashboard shows "indexing…" — the indexer eventually backfills
S3Object and the row stays consistent. The poll budget is generous
(indexer typically settles in 1-3s) and bounded.

**Ownership model — agent's sub_wallet is NOT the signer.** The
`write_object` flow reuses the same gateway-proxied path normal
`aws s3 cp` takes: the SigV4 signer is the project's auto-minted
AKIA key, the gateway encrypts via Seal, mints the SharedBlob via
sponsored Enoki txs. The agent's `sub_wallet` is *not* in the write
path — it only exists as an on-chain principal granted decryption
access via the bucket ACL ("Connect agent" flow). The audit chain
`AgentInvocation.api_key_id → AgentToolCall.tx_digest → S3Object.kraterion_bucket_object_id`
is off-chain but verifiable; the on-chain side only knows "the
gateway minted a blob for bucket Y." Demo narration should say:
*"The agent acted within the user's pre-funded sandbox; the write
is on-chain and attestable; the audit trail links the agent
identity to the specific Move tx."* Not: *"the agent signed the
tx."* Funding the sub-wallet + agent-signed PTBs is a clean
post-hackathon evolution.

**Deferred (post-hackathon backlog):**

- **MCP delegation to the shared registry.** The plan called for
  the MCP server to dispatch via `AgentToolRegistry`. The Anthropic
  MCP SDK's `server.registerTool` API has a different shape than
  the registry's `execute(name, args, ctx)` contract, so the clean
  delegation isn't a one-liner. The pragmatic call: leave MCP tool
  handlers as-is (they already share the same `BucketsService` /
  `KnowledgeService` / `PresignService` as the agent tools, so
  behavior is byte-equivalent). Refactor later when the duplication
  becomes painful.
- **HTTP webhook tools** — `AgentTool.tool_kind` already scaffolds
  the `"webhook"` discriminator; the handler-routing path slots in
  without a migration.
- **External MCP tool servers as tool sources** — Kraterion as an
  MCP *client* consuming third-party catalogs. Similar plug point
  via `tool_kind = "mcp"`.
- **Activity feed `agent_tool_call` event kind** — the chat panel
  already surfaces the trail inline; a historical activity feed is
  a polish item.

**Consequences:**

- The demo arc the proposal pitched is now live: ask the agent to
  summarize and save → the agent calls `search → write_object` →
  the chat panel renders both tool cards with a Suiscan link on
  the write → the new object appears in the bucket. End-to-end.
- The agent chat endpoint is now stateful across rounds — each
  tool round extends `extraMessages` with the assistant's
  `tool_calls` + the `tool` results, then re-invokes OpenAI. Past
  MAX_TOOL_ROUNDS, we hard-fail. Documented in `tool-runner.ts`.
- Auditability is the differentiator: every tool invocation lands
  in `AgentToolCall` with arguments, output, latency, and (for
  writes) the on-chain digest. No other AI platform on the Walrus
  track will have a per-tool-call on-chain receipt.

## 2026-05-15 — P6 ships: embeddable chat widget (script-tag + Shadow DOM + iframe)

**Status:** Shipped.

**Context.** The last untouched feature on the AI platform roadmap. P6
turns a configured agent into a one-line `<script>` snippet a customer
pastes on their site to get a floating chat widget powered by their
own Kraterion agent — the proposal called it "the cleanest evidence
that the platform's AI surface is real and not just an MCP toy."

**Distribution model — script + Shadow DOM launcher + iframe panel
(NOT an npm package).** Every major AI chat embed (Intercom Fin,
Inkeep, Chatbase, DO Gradient AI, Mendable, Crisp, Voiceflow) ships
this exact pattern. The npm-package route serves a different audience
— developers building chat *into* their React app, where Vercel AI
SDK already wins. Script + iframe wins because (a) it works on
Webflow / Wix / Squarespace / static HTML, (b) marketing teams can
install without a dev, (c) Shadow DOM isolates the launcher CSS, (d)
iframe isolates the panel JS, (e) we own the rendering surface and
can hotfix bugs without customers updating any dep.

**Token model — `kr_share_<env>_<36 chars>`, network-prefixed, hash-
stored.** Mirrors the unified bearer token shape (`kr_test_/kr_live_`)
so dashboards and devs read them at a glance:
- `kr_share_test_…` on testnet/devnet, `kr_share_live_…` on mainnet.
  Cross-network use → 401 (Stripe-style mode boundary).
- SHA-256 hash storage, cleartext returned once at mint, never
  retrievable. Same one-time-reveal pattern as bearer tokens.
- Scoped to **exactly one agent**, never to the project broadly. The
  share token isn't a key — it's a deployment-surface credential.

**Three-axis lockdown for anonymous traffic.** Anyone with the token
on the customer's page could exfiltrate it via DevTools — that's
inherent to a public website. We compensate at the API layer:
- **Origin allowlist** (`allowed_origins: string[]`) — the request's
  `Origin` header must match exactly. Lift the token and paste it
  on a different domain, the chat call 403s before reaching OpenAI.
- **Daily request cap** (`max_requests_per_day`) — rolled at UTC
  midnight via the `ShareTokenUsageDay` table.
- **Daily USD spend cap** (`max_spend_usd_micros_per_day`) — same
  table; computed per-turn as `(completion_tokens / 1e6) ×
  per-million-tokens-price`. Coarse but sufficient — a misbehaving
  widget can't drain the project's OpenAI budget.

**Why Prisma counters instead of Redis.** The control plane has
`ioredis` as a dep but doesn't actually use it (see `oauth.service`
comment, 2026-05-13). Introducing Redis for one feature is more
operational surface than this counter needs; atomic Prisma upserts
on `(share_token_id, day_utc)` give us free audit + atomic
increments. The shape moves to Redis with a daily flush job if P6
traffic ever justifies it; the application API doesn't change.

**Principal model — third kind on the union, not satisfied by
non-chat endpoints.** The Principal union gains `ShareTokenPrincipal`
alongside `SessionPrincipal` + `ApiKeyPrincipal`. New helper
`requireAccountPrincipal` narrows away share-token principals and is
used by every controller except the agent chat endpoint. Share-token
principals only satisfy `/v1/agents/:id/chat/completions`; any other
route they reach gets a `Forbidden`. Defends against future routes
accidentally accepting embed traffic without realizing it.

**iframe page lives at `apps/dashboard/src/app/embed/chat/[agentId]`.**
Sibling to the `(app)/` route group, so it inherits ONLY the root
layout — no `RequireAuth`, no `Sidebar`, no dashboard chrome. Reuses
`AgentChatPanel` with two new props (`authTokenOverride`, `hideHeader`)
so we don't fork the chat UI. The iframe is allowed to be framed from
any origin (`frame-ancestors *`) — the chat API's per-token
origin check is the real enforcement boundary.

**Loader at `apps/dashboard/public/embed/v1.js`** (~6 KB unminified).
Vanilla JS, no build step, closed Shadow DOM around the launcher
button. Iframe is lazy-mounted on first launcher click so the widget
costs nothing until a visitor clicks. Subsequent close/open reuse
the same iframe — preserves chat state across the same page session.

**Spend computation: completion tokens only.** Input tokens are
typically much cheaper than output and the retrieval block re-sent
every turn makes input cost a poor proxy for "what the agent did
this turn." Caps are a coarse spend protection, not a billing
source-of-truth. If/when we ever proxy through our own LLM key
(currently we don't — every token bills the user's stored OpenAI
key), this becomes the basis for the platform's own metering.

**Deferred from the proposal:**
- **`packages/ui-embed` as a published npm artifact.** The dashboard
  hosts both the loader and the iframe today — that's enough for the
  hackathon. Publishing to npm is post-submission packaging work.
- **Theming customization** (`data-theme`, `data-accent-color`). One
  brand palette only for v1; matches the design-system rules.
- **Pre-filled end-user identity** (signed JWT with end-user claims
  for in-app help / personalization). The share token is the only
  credential surfaced today.
- **Streaming size events / dynamic iframe resize.** Fixed 380×580 desktop
  / full-screen mobile.
- **Analytics / opens-counter / per-visitor session.** The
  `AgentInvocation.share_token_id` audit row is the only source of
  usage data today.

**Consequences:**

- The proposal's demo arc closes: *"upload your docs → enable knowledge
  → create an agent → paste a one-line snippet on your site → visitors
  chat against your bucket."* End-to-end with on-chain audit trail.
- Anonymous traffic now goes through `AuthGuard` like everything else;
  the share-token branch is a true peer of session + bearer, not a
  bolted-on shortcut.
- `AgentInvocation.share_token_id` joins `user_id` / `api_key_id` /
  `oauth_client_id` as principal discriminators. Activity queries can
  filter "embed-driven chats" cleanly.
- Cross-network share tokens are refused at resolution, same posture
  as bearer tokens. A token minted on testnet won't run against a
  mainnet deployment by accident.

---

## 2026-05-18 — Walrus storage_pool migration: Phase A baseline

**Status:** Accepted (Phase A complete)

**Context:** The current per-blob `SharedBlob` model is structurally wrong for
a real product (no DELETE, per-blob renewal gas, stranded WAL on early
delete). Walrus shipped a `StoragePool` + `PooledBlob` primitive in v3 of the
testnet deployment (Move source on the testnet branch since ~March 2026,
deployed on-chain at `0x849e95d2718938d66c37fb91df76d72f78526c1864c339bac415ce8ecda2d8cc`
as of testnet package version 3). The plan in
[/docs/storage-pool-migration.md](storage-pool-migration.md) requires a Phase A
calibration sprint before committing to the wrapper module + gateway refactor.

**Decision:** Proceed with the migration. Phase A confirmed three load-bearing
assumptions:

1. The testnet Walrus deployment has all 11 `storage_pool` entry points live
   on `walrus::system` (`create_storage_pool`, `register_pooled_blob`,
   `certify_pooled_blob`, `delete_pooled_blob`, `extend_storage_pool`,
   `increase_storage_pool_capacity`, `decrease_storage_pool_unused_capacity_by_percent`,
   `create_storage_pool_with_storage`, `increase_storage_pool_capacity_with_storage`,
   `decrease_storage_pool_capacity_by_size`, `burn_expired_pooled_blob`).
2. `Move.toml` pinned to a specific commit
   (`9c5590a81e29e1141b05a2481c677fe1e2b73b29` on the testnet branch) builds
   green and pulls `storage_pool.move` into the compiled dependency set.
3. End-to-end gas measurements for the pool lifecycle ops on testnet (full
   numbers in [/docs/walrus-calibration.md](walrus-calibration.md)):
   - `create_storage_pool`: 6.74M MIST net
   - `increase_storage_pool_capacity`: 2.66M MIST net
   - `extend_storage_pool`: 2.66M MIST net
   - `decrease_storage_pool_unused_capacity_by_percent`: 2.87M MIST net

   All operations are under 0.007 SUI (~$0.018 at SUI=$2.50). Confirms the
   Walrus docs' "size-independent, ~constant" claim for the management
   operations.

**Pinned constants** added to `packages/shared/src/constants.ts`:
`WALRUS_PACKAGE_PUBLISHED_AT_TESTNET` and `WALRUS_PACKAGE_VERSION_TESTNET`.
Needed because Sui RPC's `sui_getNormalizedMoveModule` does NOT follow the
upgrade chain — querying the original-id (`0xd84704c1...`) returns the v1
surface, which doesn't have `storage_pool`. For tx submission, Sui resolves
the upgrade chain automatically; for introspection (admin tooling,
calibration), use the published-at directly.

**Consequences:**

- Phase B (TS thin-wrappers) and Phase C (`pool_vault.move` + refactor of
  `kraterion.move`) are unblocked.
- The calibration script `apps/gateway/scripts/walrus-pool-baseline.ts` is
  the canonical reference for "is the pool primitive working on testnet
  today?" — run it before any Phase C work to confirm no upstream changes.
- `register_pooled_blob` / `certify_pooled_blob` / `delete_pooled_blob` /
  `burn_expired_pooled_blob` gas numbers deferred to Phase K (full E2E) when
  the wrapper module + relay-upload pipeline are wired.
- One pool now sits on testnet at
  `0x68b7b90c4b0bb877ef7ad52069c423dd674471c30ffafcccb6c0428556dda396`
  (deployer-owned, 2 MiB encoded capacity, 3 epochs ahead). Orphan — no
  way to call the package-internal `destroy` from outside. Expires
  naturally; cost is a rounding error.
