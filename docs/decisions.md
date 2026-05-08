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
