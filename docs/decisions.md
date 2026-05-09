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
