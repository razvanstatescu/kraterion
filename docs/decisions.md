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
