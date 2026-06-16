# Runbook

Solved problems, gotchas, and "if you see X, do Y" entries. **Grep here first**
when something breaks — there's a real chance you (or another Claude session)
already fixed it once.

**When to add an entry:** after solving any non-trivial bug, infra hiccup, or
dependency-version footgun that took more than ~10 minutes to figure out.
Even if the fix feels obvious in hindsight, the *symptom* is what future-you
will search for.

**Format:** symptom (what you see), cause (what's actually wrong), fix (the
exact action), date observed, where (component/file). Symptoms should be
greppable — paste the actual error string.

---

## Template

```markdown
## Symptom: <one line, paste the actual error string if there is one>

**Cause:** what is actually wrong, root cause not workaround.

**Fix:** the concrete steps. Commands, file paths, line numbers.

**Observed:** YYYY-MM-DD in <component / file / area>.

**Notes:** (optional) related decisions, gotchas, links.
```

---

## Symptom: dashboard "verify chunk" shows `This chunk's indexing manifest hasn't been archived on chain yet. Re-run the search in ~30 seconds, or re-upload to force a fresh archive.` — search/retrieval works, but the on-chain manifest link is missing.

**Cause:** The document indexed fine (chunks are committed and searchable),
but the *separate, best-effort* K5 step that archives the chunk-manifest as an
on-chain Walrus PooledBlob failed and was swallowed by design
(`apps/worker/src/embeddings/manifest-archive.ts` — the `try/catch` around
`tryArchiveOnChain` only logs a `manifest-archive: <id> failed: …` warn and
leaves `KnowledgeManifest.manifest_walrus_blob_id` null). `/search` LEFT-JOINs
the manifest, sees the null blob id, and the dashboard shows the message
(`VerifyChunk.tsx`). The failure reason is **only in the worker log** — it is
not persisted to `error_detail`. Common reasons:
- `relay POST failed after 3 attempts` → transient testnet relay flake.
- `register_blob reverted: …EInsufficientCapacity` → the on-chain pool is full.
  Note each knowledge doc writes **two** PooledBlobs (source + manifest), and
  every blob pays a ~64 MB encoded floor, so manifests roughly halve effective
  pool capacity.
- `no StoragePool found …` / `certify_blob reverted …` → config/auth.

Not the cause: the background-loaded indexer keypair being unready — the same
keypair decrypts the source at `embeddings.processor.ts:112` *before* indexing,
so if chunks exist, the keypair was loaded.

**Fix:**
- Transient: it now self-heals. `ManifestArchiveSweeperService`
  (`apps/worker/src/embeddings/manifest-archive-sweeper.service.ts`) re-attempts
  stuck `indexed`+null manifests every 120s with Redis-backed exponential
  backoff, a per-manifest lock, and a give-up cap (8 attempts) so a persistent
  failure doesn't burn indexer-wallet gas. Look for `manifest-archive-sweeper:
  healed <id>`.
- Persistent (`giving up on <id> after 8 attempts` in the log): the underlying
  write is doomed — almost always pool capacity. Free/raise pool capacity, then
  re-run `pnpm -F @kraterion/worker exec tsx scripts/backfill-manifest-archive.ts --manifest-id <id>`.

**Observed:** 2026-06-16 on the DigitalOcean worker instance; pipeline in
`apps/worker/src/embeddings/` and `apps/control-plane/src/knowledge/`.

**Notes:** See decisions.md 2026-06-16 "Manifest archive self-heals via a
backoff sweeper." Backoff/attempt state lives in Redis
(`kraterion:manifest-archive:{attempts,next,lock}:<id>`), so flushing Redis
resets it (a doomed manifest may get re-attempted once more — harmless).

---

## Symptom: embed widget returns `Forbidden` / `"This share token isn't authorized for the request origin."` with `details.origin` equal to the **dashboard** host (e.g. `https://app.kraterion.com`), even though the snippet is on a different site.

**Cause:** The embed loader (`apps/dashboard/public/embed/v1.js`) mounts an
iframe served from the dashboard host, and *all* chat traffic flows from inside
that iframe. So the browser stamps the chat request's `Origin` header with the
iframe's own origin (the dashboard host) — never the embedding page's origin.
The control plane was gating the share token's `allowed_origins` allowlist on
that `Origin` header, so it could only ever match the dashboard host, and the
allowlist couldn't distinguish embedding sites at all.

**Fix:** Gate on the *host page* origin, derived from a browser-stamped source
the embedder can't forge, and forwarded to the API in a header:
- Iframe (`apps/dashboard/src/app/embed/chat/[agentId]/page.tsx`) resolves the
  host origin from `window.location.ancestorOrigins.item(0)` (Chromium/WebKit),
  falling back to the `event.origin` of a `kraterion:hello` postMessage the
  loader sends on iframe load (Firefox, which lacks `ancestorOrigins`).
- `AgentChatPanel` forwards it as `X-Kraterion-Embed-Origin` on the chat fetch.
- The share-token branch in `agents.controller.ts` reads that header (not
  `req.headers.origin`) and checks it against `allowedOrigins`.
So: the token's `allowed_origins` must list the **embedding site** (e.g.
`https://kraterion.com`), *not* the dashboard host. CORS already reflects
arbitrary request headers (no `allowedHeaders` override in `main.ts`), so the
custom header passes preflight with no change. Residual: a raw API caller that
already holds the token can set the header to any allowlisted value — the gate
is a browser-enforced control, not a defense against a leaked token.

**Observed:** 2026-06-15 in `apps/dashboard` (embed loader + iframe page) and
`apps/control-plane` (`src/agents/agents.controller.ts`).

**Notes:** See decisions.md 2026-06-15 "Embed origin allowlist checks the host
page, not the iframe."

---

## Symptom: `prisma migrate dev` fails with `ERROR: column "content_tsv" of relation "KnowledgeChunk" is a generated column` / `HINT: Use ALTER TABLE ... ALTER COLUMN ... DROP EXPRESSION instead.`

**Cause:** Prisma's migration generator emits spurious operations
against generated columns it doesn't fully understand. Every time
the schema diffs against the live DB, the generated SQL includes
`DROP INDEX KnowledgeChunk_content_tsv_gin`,
`DROP INDEX KnowledgeChunk_embedding_hnsw`, and
`ALTER TABLE "KnowledgeChunk" ALTER COLUMN "content_tsv" DROP
DEFAULT` — none of which are valid for the `GENERATED ALWAYS AS
... STORED` column that K1 introduced. The migration aborts with
SQLSTATE 42601 (`syntax error / column is a generated column`)
even when the actual change you wanted has nothing to do with
`KnowledgeChunk`.

**Fix:** edit the generated migration SQL by hand before applying.

```bash
# 1. Run prisma migrate dev — it'll write the migration directory
#    and then fail to apply it.
pnpm db:migrate --name <your_migration_name>

# 2. Edit the SQL to keep ONLY the AlterTable / CreateTable lines
#    that match the schema change you actually intended. Strip every
#    `DROP INDEX KnowledgeChunk_*` and the `ALTER COLUMN
#    "content_tsv" DROP DEFAULT` line.
$EDITOR prisma/migrations/<TIMESTAMP>_<your_name>/migration.sql

# 3. Tell Prisma the failed attempt was rolled back, then redeploy.
pnpm exec prisma migrate resolve --schema prisma/schema.prisma \
  --rolled-back <TIMESTAMP>_<your_name>
pnpm exec prisma migrate deploy --schema prisma/schema.prisma

# 4. Regenerate the client.
pnpm db:generate
```

**Observed:** 2026-06-03, while adding
`Account.onboarding_dismissed_at` (migration
`20260603092350_onboarding_dismissed_at`). Also surfaced earlier
during P9 Feature 1 (`p9_replayable_agent_sessions` migration). The
same hand-edit fix applies every time — it's a Prisma 5.x quirk
with pg generated columns, not a one-off bug.

**Notes:** the underlying decision to use a generated
`content_tsv tsvector` column is documented in
[decisions.md](decisions.md#) under the K1 hybrid-retrieval entry —
the column is load-bearing for BM25 and we don't want to drop it.
This runbook entry is purely about the recurring migration friction
the design causes.

---

## Symptom: `EADDRINUSE: address already in use :::3001` when starting the dashboard

**Cause:** A stale `next-server` process from a previous (Next.js 15-era)
website experiment was still listening. Survived the rename of
`kraterion-website` → `apps/landing` and the dashboard's port choice of 3001.

**Fix:**
```bash
lsof -i :3001 -sTCP:LISTEN          # find the PID
kill <PID>                          # SIGTERM is enough; -9 only if it ignores
```
If a brew-managed service brings it back, `brew services list | grep next` and
stop it from there.

**Observed:** 2026-05-07, port-conflict during initial monorepo setup.

**Notes:** Not Kraterion code — pure host-environment leftover. Kept here
because the symptom is generic and likely to recur during dev.

---

## Symptom: `sui client publish --dry-run` prints just `Error` with no detail

**Cause:** Sui CLI is older than the testnet server's protocol version. As of
2026-05-08, testnet runs server 1.71.x at protocol 123, while a Homebrew
install can lag (we saw 1.63.1 / protocol 106). The CLI prints
`[warning] CLI's protocol version is X, but the active network's protocol
version is Y` early in the run, but the dry-run RPC fails with no body.

**Fix:**
```bash
brew upgrade sui                 # match the server
sui --version                    # verify ≥ 1.71
sui client publish --dry-run --gas-budget 200000000 .
```
After upgrade, dry-run prints the full tx-effects table and exits cleanly.

**Observed:** 2026-05-08, first testnet publish of the Kraterion Move package.

**Notes:** A real publish (not `--dry-run`) may also fail under version skew.
Always upgrade the CLI before any deploy.

---

## Symptom: `sui move build` fails with `unpublished dependencies: Walrus, WAL`

**Cause:** Walrus's `contracts/walrus/Move.toml` carries placeholder
addresses (`walrus = "0x0"`, `wal = "0x0"`). The `contracts/` subtree is
the *source* of Walrus, not the *deployed* version. The `testnet-contracts/`
subtree of the Walrus repo holds the source paired with `Move.lock` files
that carry the real testnet deployment IDs.

**Fix:** in our `move/kraterion/Move.toml`, point Walrus at
`testnet-contracts/walrus` AND override the addresses explicitly:

```toml
[dependencies]
Walrus = { git = "https://github.com/MystenLabs/walrus.git", subdir = "testnet-contracts/walrus", rev = "testnet" }

[addresses]
walrus = "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66"
wal    = "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a"
```

Verify those addresses against `testnet-contracts/{walrus,wal}/Move.lock`'s
`original-published-id` fields; pick the entry whose `chain-id = "4c78adac"`
(current Sui testnet).

**Observed:** 2026-05-08, while wiring up the deploy script.

---

## Symptom: `tsc` reports `Module '"@mysten/sui/client"' has no exported member 'SuiClient'` or `'getFullnodeUrl'`

**Cause:** `@mysten/sui` was renamed in 2.x. The classes moved out of
`@mysten/sui/client` (which now only exports the abstract `BaseClient` and
friends) into a JSON-RPC-specific subpath.

**Fix:** Update imports:
```ts
// before (1.x)
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// after (2.x)
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
const client = new SuiJsonRpcClient({
  network: "testnet",
  url: getJsonRpcFullnodeUrl("testnet"),
});
```
The constructor now also requires `network`. The on-the-wire RPC method
names (`queryEvents`, `getNormalizedMoveModulesByPackage`, …) are unchanged.

**Observed:** 2026-05-08, when bumping `@mysten/sui` from 1.20 → 2.16 to
satisfy `@mysten/codegen` 0.10.

**Notes:** `@mysten/codegen` ≥ 0.10 requires `@mysten/sui` ≥ 2.x. Don't try
to keep the old version side-by-side; codegen output references types that
don't exist in 1.x.

---

## Symptom: `register_blob` aborts with code 3 (`EResourceSize`) — "the reserved storage's size doesn't fit the actual blob"

**Cause:** Walrus's `system::reserve_space(storage_amount, ...)` expects the
**encoded** blob length (post-RS2 encoding), not the raw plaintext
length. RS2 expansion is dramatic — a 354-byte plaintext on a
1000-shard committee encodes to ~66 MB. Passing the unencoded length
means the storage allocation is way too small, and the subsequent
`register_blob(... size, ...)` aborts when it tries to fit.

**Fix:** compute encoded length before calling
`kraterion::register_blob_for_bucket`. The Walrus SDK has the formula
internally but doesn't export it; we re-implemented it in
`packages/walrus-client/src/index.ts` as `getEncodedBlobLength(size, nShards)`
plus `getCommitteeShardCount()` to fetch `n_shards` from
`client.systemState()`. Pass the result as `storageAmount`; pass the
plaintext length as `size`.

**Observed:** 2026-05-08, first smoke-test run.

---

## Symptom: upload to Mysten testnet relay returns `400 The query parameters are missing the transaction ID or the nonce, but the proxy requires them to check the tip payment.`

**Cause:** Mysten's public testnet upload-relay requires a tip. The SDK's
`UploadRelayClient.writeBlob` only includes `tx_id` and `nonce` in the
query string when `requiresTip: true` is set internally, which only
happens if `WalrusClient.uploadRelay.sendTip` is configured. Without
`sendTip`, the relay rejects with this 400.

**Fix:** Configure `sendTip: { max: <budget> }` on the WalrusClient at
construction (we use `{ max: 10_000_000 }` ≈ 0.01 WAL). The high-level
`writeBlobToUploadRelay` then auto-passes `requiresTip: true`.

**Observed:** 2026-05-08.

---

## Symptom: upload to relay returns `401 the auth package is missing from the first input slot of the PTB`

**Cause:** When a tip is required, the relay verifies the on-chain tip
payment by parsing the registration PTB. It expects the **auth payload**
(produced by `walrus.addAuthPayload({ size, blobDigest, nonce })`) to
be **input slot #0** of the PTB. `tx.add(walrus.sendUploadRelayTip(...))`
inserts that input wherever the call appears in the command list — if
it runs after `kraterion::register_blob_for_bucket(...)`, the bucket
object/u64 inputs get lower slot numbers and the auth payload lands
later.

**Fix:** Add `walrus.sendUploadRelayTip(...)` to the PTB **first**, before
any other call that creates inputs:
```ts
tx.add(walrus.sendUploadRelayTip({ size, blobDigest, nonce })); // FIRST
const blobArg = tx.add(kraterion.registerBlobForBucket({ ... }));
tx.transferObjects([blobArg], gatewayAddress);
```

**Observed:** 2026-05-08.

---

## Symptom: Seal SDK errors with `Invalid TTL N, must be between 1 and 30`

**Cause:** `@mysten/seal@1.1.x` caps SessionKey TTL at 30 minutes (the
plan §7.4 said "1 hour" — that was based on `@mysten/seal@0.6` semantics,
which Mysten tightened in 1.0+).

**Fix:** Use `ttlMin ≤ 30`. We use 25 to leave 5 min skew margin under
the cap. Redis cache TTL matches.

**Observed:** 2026-05-08.

---

## Symptom: `JSON.stringify(sessionKey.export())` throws `This object is not serializable`

**Cause:** `@mysten/seal@1.1.x`'s `SessionKey.export()` returns an object
with a `toJSON` property explicitly set to `() => { throw ... }`. This
is intentional — the export contains the SessionKey's secret key, and
Mysten doesn't want clients accidentally `JSON.stringify`-ing it. They
expect IndexedDB-style per-field storage.

**Fix:** Pluck the fields manually before serializing. Our
`packages/seal-client/src/index.ts::getOrCreateSessionKey` does this. The
secret material in `serializable.sessionKey` is no more sensitive than
the gateway's keypair seed already in Postgres; Redis on the trusted
gateway host is an acceptable storage tier for our threat model.

**Observed:** 2026-05-08.

---

## Symptom: passing a Walrus blobId string directly into a `u256` Move arg throws `Cannot convert <string> to a BigInt`

**Cause:** Walrus exposes blob IDs as 43-char URL-safe-base64 strings
(e.g. `OsJnX9NVNj9lqoknZyinXFWgzDSQ5YnJ6iZLOGOjnvg`). `BigInt(...)` on
that string fails because it's not a numeric literal. The Walrus SDK
has `blobIdToInt` to convert, but it's not exposed in
`@mysten/walrus`'s public exports.

**Fix:** Inline the conversion. Our
`packages/walrus-client/src/index.ts::blobIdStringToU256` and
`rootHashBytesToU256` re-implement the SDK's internal helpers via
`bcs.u256()` from `@mysten/sui/bcs`.

**Observed:** 2026-05-08.

---

## Symptom: `reserve.fund` (or any `Coin<WAL>`-taking move call) aborts with `CommandArgumentError { kind: TypeMismatch }` when the deployer "has WAL"

**Cause:** Several unrelated `*::wal::WAL` coin types float around Sui
testnet (faucet artifacts from packages that namespace-clash with
Walrus). `sui client balance` displays them all under the same `WAL`
symbol. A `findCoin(coinType.endsWith("::wal::WAL"))` filter happily
returns one of these decoys, and the runtime rejects it because
Walrus's `fund(reserve, coin: Coin<WAL>)` expects the canonical type
`${WAL_PACKAGE_ID}::wal::WAL` only.

**Fix:** Always match the EXACT coin type. The canonical testnet WAL is
`0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL`,
exposed as `WAL_COIN_TYPE` in `@kraterion/shared`. Use
`coin.coinType === WAL_COIN_TYPE`, not regex tail-matching.

**Observed:** 2026-05-08, first run of `bootstrap-gateway.ts` against
the deployer wallet. The deployer had 13 different `*::wal::WAL`
coins; the wrong one was picked first.

---

## Symptom: codegen's `tx.add(kraterion.foo({ arguments: { name: new TextEncoder().encode("…") } }))` fails to typecheck

**Cause:** Generated PTB helpers type `vector<u8>` arguments as
`RawTransactionArgument<number[]>`. `TextEncoder.encode` returns
`Uint8Array<ArrayBuffer>`, not `number[]` — TS's structural check rejects
the missing array-method shape (`pop`, `push`, `concat`, …).

**Fix:** Convert with `Array.from(...)`:
```ts
arguments: { name: Array.from(new TextEncoder().encode("uploads")) }
```
At runtime the SDK accepts both, but TS only sees `number[]`.

**Observed:** 2026-05-08, first usage of generated bindings in a vitest
smoke test.

---

## Symptom: `sui client publish` fails with `Your package is already published. You have to manually remove the publication entry to publish again.`

**Cause:** Sui 1.71+ tracks published versions in
`move/kraterion/Published.toml`. Once a package has been published to a
given environment, the CLI refuses to re-publish to that environment
unless the entry is removed.

**Fix:** to deploy a new package version on testnet (e.g., after a
breaking ABI change), edit `move/kraterion/Published.toml` and delete the
`[published.testnet]` block, then re-run `scripts/setup-testnet.sh
--force`. The new entry is auto-written by `sui client publish` on
success.

For *upgrades* (preserving the package ID and the UpgradeCap), use
`sui client upgrade` instead — the existing `Published.toml` entry is
expected and required.

**Observed:** 2026-05-08, while smoke-testing the pre-publish dry-run path.

---

## Symptom: `pnpm db:migrate -- --name init` hangs and never completes; `prisma migrate dev` waits for input

**Cause:** pnpm's `--` separator gets passed to the underlying script,
turning the command into `prisma migrate dev --schema … -- --name init`.
Prisma sees `--` as the end-of-args sentinel and ignores `--name init`,
falling back to its interactive prompt for a migration name. The script
appears to hang because Prisma is waiting for stdin.

**Fix:** invoke prisma directly via `pnpm exec` and place all flags
inline:
```bash
pnpm exec prisma migrate dev --schema prisma/schema.prisma --name init
```
Or run it with the script wrapper but no `--`:
```bash
pnpm db:migrate --name init
```
(works on pnpm 9.x; older pnpm requires the explicit `pnpm exec` form).

**Observed:** 2026-05-08, applying the initial Prisma migration to the
local Postgres in docker compose.

---

## Symptom: `prisma generate` fails with `Error: Command failed with exit code 1: pnpm add @prisma/client@5.22.0 --silent`

**Cause:** `prisma generate` auto-tries to install `@prisma/client` if it
isn't found in the same `package.json` as `prisma`. In a pnpm workspace,
the root `package.json` had only `prisma` (devDep) but not `@prisma/client`,
so Prisma's auto-install kicked in and pnpm rejected the package addition.

**Fix:** add `@prisma/client` as a devDep to the workspace root:
```bash
pnpm add -D -w @prisma/client@5.22.0
```
Note the `-w` flag — without it, pnpm complains that you're at the
workspace root and need to specify a target package.

**Observed:** 2026-05-08, after the initial migration succeeded but
before the post-migrate generate step.

---

## Symptom: re-publishing the Kraterion package orphans the previous `PlatformReserve`

**Cause:** The reserve is created by the package's `init(ctx)` function,
which fires exactly once at publish. A re-publish (after clearing
`Published.toml`) spawns a brand-new reserve at a new object ID. The
old reserve is still on-chain — shared, with whatever admin/whitelist/
WAL state it had — but `KRATERION_RESERVE_ID` in `constants.ts` now
points at the new one, so apps will only see the new one.

**Fix:** before re-publishing, withdraw any WAL still in the old
reserve to the deployer wallet. Walrus testnet WAL has no value, so on
testnet the safer cleanup is just "ignore the orphan." On mainnet (post-
hackathon) the procedure should be:
1. Use the *old* `KRATERION_RESERVE_ID` to call `withdraw(amount,
   recipient)` from the admin keypair.
2. Confirm the old reserve's `wal_balance == 0`.
3. Clear `Published.toml`'s `[published.testnet]` (or relevant env)
   entry.
4. Run `setup-testnet.sh --force`.
5. Re-fund the new reserve from the platform treasury.
6. Re-authorize the gateway and worker sub-wallets on the new reserve.

**Observed:** 2026-05-08, after refactoring the contract to use
`init`-spawned reserve. Logged here for the first mainnet upgrade.

**Notes:** A future improvement would be to use `sui client upgrade`
(preserves the package ID and the reserve object) instead of fresh
publishes whenever the ABI is backward-compatible.

---

## Orphan blob count amplifies on relay flake during PutObject

**Symptom:** `docs/progress.md` testnet log notes 2-3 `ORPHAN BLOB (relay
POST failed)` entries per failed boto3 PUT, even though the test
ultimately passed. Suiscan shows multiple `Blob` objects owned by the
gateway address with no SharedBlob wrapper (you'll see them as "owned"
not "shared").

**Cause:** PutObject's pipeline is PTB 1 (`register_blob_for_bucket`)
→ relay POST → PTB 2 (`certify_blob` + `wrap_in_shared_blob`). When
the relay returns 5xx (Mysten testnet's relay flakes occasionally),
the gateway:

1. Logs `ORPHAN BLOB (relay POST failed)` with the registered Blob's
   objectId.
2. Returns `ServiceUnavailable` (503) to the client.
3. Boto3 auto-retries the PUT under its default retry policy.
4. The retry runs the *full* pipeline including PTB 1 — registering a
   *brand new* Blob with a fresh `(blobId, rootHash)` derived from a
   fresh `objectUuid` + new ciphertext.

So one boto3 call that retries 3× before succeeding leaves 2 orphan
Blobs and 1 successful SharedBlob.

**Fix (post-hackathon):** Add a `pending_upload` table keyed on
`(bucket_id, s3_key, request_id)`. On each request, before PTB 1, look
up by `(bucket_id, s3_key)` for a row in state `registered` or
`relayed` younger than 10 minutes — if present, resume from the
existing Blob instead of registering a new one. The reaper sweeps
rows older than 10 min in non-`committed` state.

**Workaround for now:** Watch for orphan log lines in the gateway
output during heavy PUT activity. Manual cleanup via `sui client
call --package $KRATERION --module reserve_or_blob_admin ...` is
possible but not scripted yet.

**First seen:** 2026-05-08 during Phase-5 boto3 conformance run.

---

## After redeploying the Move package, smoke test fails with `Transaction resolution failed: CommandArgumentError { arg_idx: 1, kind: TypeMismatch } in command 2`

**Symptom:** Smoke test (or boto3 PutObject) fails at PTB 1 with the
above error referencing command 2 (the `register_blob_for_bucket`
Move call) and arg index 1 (the `bucket` argument).

**Cause:** The Bucket row in Postgres carries
`kraterion_bucket_object_id` of an on-chain bucket created BEFORE the
redeploy. That bucket's type is the OLD package's
`{old_pkg}::kraterion::KraterionBucket`. The new
`register_blob_for_bucket` expects the NEW package's bucket type.
Sui's chain-side type checker rejects the cross-package mismatch.

**Common origin of the stale Bucket row:** the bootstrap script ran
BEFORE `@kraterion/shared`'s `dist/` was rebuilt with the new
constants. Since workspace packages export from `dist/`, bootstrap
read the OLD `KRATERION_PACKAGE_ID` and called the OLD package's
`createGrantAndShareBucket`.

**Fix:**

1. Re-build the shared package after `setup-testnet.sh`:
   ```bash
   pnpm -F @kraterion/shared build
   pnpm -F @kraterion/kraterion-move-sdk build
   ```
2. Truncate `Bucket`, `S3Object`, `Account`, `Project`, `ApiKey`,
   `SubWallet` (or just `Bucket`/`S3Object` if you want to reuse the
   account). The on-chain artifacts under the OLD package are now
   orphaned; we don't reuse them.
3. Re-run `pnpm -F @kraterion/gateway bootstrap`. It will create a
   fresh gateway sub-wallet, fund + authorize on the new reserve,
   and create a new test bucket whose type matches the new package.
4. Retry smoke / boto3.

**Prevention:** make `setup-testnet.sh` also build `@kraterion/shared`
and `@kraterion/kraterion-move-sdk` AFTER updating constants, so
downstream consumers see fresh dist immediately. Tracked as a future
runbook chore.

**First seen:** 2026-05-08 during Phase 0 of indexer plan (Move event
surgery). The error is specifically deterministic, not a transient
flake — repeats every smoke run until the stale Bucket row is purged.

---

## Indexer worker hits 429s during backfill against public testnet

**Symptom:** `apps/worker` logs:
`subscribe loop error code=UNAVAILABLE attempt=N retry-in=...ms: 429 Too Many Requests`
in a steady stream during the initial backfill, with cursor
advancing in 200-checkpoint bursts before each backoff.

**Cause:** Public Sui testnet RPC is capped at 10 rps. The indexer's
backfill (`run-loop.ts:backfillRange`) fires `getCheckpoint` calls
in parallel; without a rate gate, even a moderate concurrency
overshoots the cap.

**Fix:** the rate gate is already in place
(`BACKFILL_MIN_INTERVAL_MS = 125ms`, `BACKFILL_CONCURRENCY = 2` =
~8 rps). If you're STILL seeing 429s:
- Check `INDEXER_BACKFILL_INTERVAL_MS` env override — too low?
- Confirm you're on the public `fullnode.testnet.sui.io:443`. A
  paid endpoint (Shinami, Triton, BlockVision, GetBlock) has
  higher limits; bump the interval down (e.g. 50ms = 20 rps).
- Other workloads on the same host hammering the same fullnode?

**Detail on correctness during 429 churn:** the 429 surfaces as
`RpcError { code: 'UNAVAILABLE' }`. The run-loop's catch block
treats this as a retryable transport error: cursor is never advanced
past an unprocessed checkpoint, the in-flight backfill calls share
the run-loop's abort signal so they cancel together, and the next
subscribe-and-resume reads the persisted cursor. Worst case is a
slow backfill, never a lost event.

**First seen:** 2026-05-08 during Phase 1 of indexer build, public
testnet at concurrency=4 with no rate gate.

---

## Indexer DLQ entries with `Zod parse: Required field missing` and empty `payload = {}`

**Symptom:** `IndexerDeadLetter` rows for `KraterionObjectCreated`
events show `payload: {}` and a Zod validation error like:
```
[{"code":"invalid_type","expected":"object","received":"undefined",
"path":["bucket_id"],"message":"Required"}, …]
```
even though the SAME tx, when fetched via `sui client tx-block` or
`getTransaction`, shows the event payload populated correctly.

**Cause:** The live `subscribeCheckpoints` stream does NOT populate
`event.json` — only `event.contents` (raw BCS bytes). The
pre-decoded `json` representation is added by Sui's indexer layer,
which backs `getCheckpoint` and `getTransaction` only. If your
run-loop walks `subscribeCheckpoints` checkpoints inline, you get
empty `event.json` and Zod fails.

**Fix:** This is fixed in `run-loop.ts:processSubscribeResponse` —
the live stream is used as a heartbeat (read `cursor` only), and
each cursor triggers a `getCheckpoint(cursor)` unary fetch for the
fully-decoded payload. If you ever see this symptom, check that
`processSubscribeResponse` is calling `fetchCheckpoint(opts.client,
msg.cursor, …)` instead of walking `msg.checkpoint` directly.

**Documented in:** `docs/decisions.md` "subscribeCheckpoints doesn't
populate event.json".

**First seen:** 2026-05-08 during Phase 2/3 of indexer plan.

---

## Indexer's `waitForS3Object` 503s during long backfills (PutObject
fails repeatedly with `ServiceUnavailable`)

**Symptom:** Boto3 `put_object` against the gateway returns
`ServiceUnavailable` even though the smoke test runs the full PTB
pipeline successfully on chain. The gateway logs show the wait poll
hitting 15s timeout. The worker is running but its cursor is far
behind live tip.

**Cause:** `apps/gateway/src/indexer-wait/wait-for-row.ts` polls
Postgres for the indexer-written `S3Object` row with a 15s default
timeout. When the indexer is mid-backfill (large
`indexer_lag_seconds` metric), the new event sits behind thousands
of older events in the queue — the row doesn't appear in time.
boto3 retries 4× by default; each retry runs a fresh PTB pipeline,
creating an orphan SharedBlob each time, before giving up.

**Fix:** during dev/testing, wait for the indexer to catch up
before exercising PutObject. Two options:

1. **Wait passively:** poll `curl http://localhost:4003/metrics |
   grep indexer_lag_seconds` until it's < 30. With public testnet
   at 8 rps and ~10k checkpoints to backfill, this takes ~20 min.
2. **Skip the backfill:** seed the cursor near live tip with the
   `seed-cursor` helper (manually-applied; see
   `apps/worker/src/indexer/cli/reset-cursor.ts` for the inverse).
   In production, the cursor is always within seconds of tip.

**Production behavior:** in steady state, the indexer is within
seconds of live tip and `waitForS3Object` returns within ~15s
(checkpoint finality + ~1 unary RPC + DB write). The 4-retry
amplification is a dev-only failure mode.

**First seen:** 2026-05-08 during Phase 2/3 verification.

---

## Indexer dev tools — `INDEXER_INITIAL_CHECKPOINT` + `indexer:fast-forward`

Two operational tools for keeping dev iteration fast on the indexer
worker. Both relate to the cursor's start point on a fresh worker
boot.

### `INDEXER_INITIAL_CHECKPOINT` (env)

The cursor used when no `IndexerCursor` row exists in Postgres. Set
automatically by `scripts/setup-testnet.sh` to the package publish
checkpoint after every redeploy — the worker then backfills only
this package's history (a few hundred to a few thousand checkpoints
on testnet, ~5–20 min at 8 rps).

If the env var is unset and no cursor row exists, the worker
defaults to checkpoint 0 (full chain replay) — almost certainly
wrong. Always set it via `setup-testnet.sh` or by hand to the
package publish checkpoint.

### `pnpm -F @kraterion/worker indexer:fast-forward [--back N] [--source ID]`

Seeds the cursor at `live_tip - N` (default 50). Use this when:
- You've already exercised the bucket-create flow and the
  corresponding rows exist in Postgres.
- You want to skip the backfill and enter live-stream mode
  immediately.
- You're iterating on a new handler and don't care about historical
  events for older keys.

**Production warning:** running this skips events between the
existing cursor and the seeded position. Domain rows that should
have been derived from those events will be missing. Only safe in
dev or after manually verifying the gap is empty.

`indexer:reset` does the inverse — drops the cursor row so the
worker re-derives state from `INDEXER_INITIAL_CHECKPOINT`.

### Recommended dev flow after a Move package redeploy

```
scripts/setup-testnet.sh --force         # writes new pkg/reserve IDs + INDEXER_INITIAL_CHECKPOINT
pnpm -F @kraterion/shared build           # ship dist with new IDs
pnpm -F @kraterion/kraterion-move-sdk build
psql ... TRUNCATE \"S3Object\", \"Bucket\", \"Account\", ...  # clean slate
pnpm -F @kraterion/gateway bootstrap      # new test bucket on chain (no DB write)
pnpm -F @kraterion/worker dev             # backfill from publish-checkpoint, ~5–10 min on testnet
# (optional, if iterating fast and don't care about historical state:)
pnpm -F @kraterion/worker indexer:fast-forward
pnpm -F @kraterion/gateway dev            # gateway up; PutObject works in steady state
```

---

---

## Symptom: Standalone tsx scripts under `apps/*/scripts/` see `process.env.ENOKI_PRIVATE_KEY` as undefined even though the Nest app boots fine

**Cause:** `import "dotenv/config"` resolves `path.resolve(process.cwd(), '.env')` and stops there. There is no `.env` inside `apps/control-plane/` (or any other app dir) — the only one is at the workspace root `/Users/.../kraterion/.env`. The Nest apps only "see" it because `@prisma/client` runs an upward-walking dotenv loader during its own initialization, which happens before our Nest providers spin up. Standalone scripts that don't import `@prisma/client` get nothing.

**Fix:** Load the workspace root explicitly at the top of the script. The pattern in `apps/control-plane/scripts/enoki-live-smoke.ts`:

```ts
import { config as dotenvConfig } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });
```

Three `..` because `apps/<app>/scripts/<file>.ts` is 3 levels deep.

**Observed:** 2026-05-09 in `apps/control-plane/scripts/enoki-live-smoke.ts`.

**Notes:** Don't try to "fix" this by adding per-app `.env` files — that splits the source of truth and leads to drift. Single workspace-root `.env` + explicit path resolution in standalone scripts is the right shape.

---

## Symptom: `SyntaxError: The requested module '@mysten/sui/client' does not provide an export named 'SuiClient'`

**Cause:** `@mysten/sui` 2.16.x splits the JSON-RPC client into a separate `/jsonRpc` subpath. The old top-level `SuiClient` import was removed; the v2.x equivalent is `SuiJsonRpcClient` from `@mysten/sui/jsonRpc`.

**Fix:**

```ts
// before:
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
const sui = new SuiClient({ url: getFullnodeUrl("testnet") });

// after:
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
const sui = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });
```

The exports list in the package's `dist/jsonRpc/index.d.mts` is the authoritative reference.

**Observed:** 2026-05-09 in `apps/control-plane/scripts/enoki-live-smoke.ts`.

**Notes:** `@kraterion/walrus-client` already exposes a memoized `getSuiClient()` that returns a `SuiJsonRpcClient` — prefer that import path over instantiating from scratch. The smoke script uses the raw constructor only because it lives outside the dependency graph that imports the wrapper.

---

## Symptom: `Module '"lucide-react"' has no exported member 'Bucket'`

**Cause:** Lucide's icon library doesn't ship a literal `Bucket` icon. The closest shape-wise is `Container`. Easy miss because the design system talks in product nouns ("bucket") while Lucide's exports are named after the SVG shapes.

**Fix:** Alias the Lucide export to our internal name at import time, register it in the `Icon` component's typed registry under `"bucket"`:

```ts
// apps/dashboard/src/components/ui/Icon.tsx
import { Container as BucketIcon } from "lucide-react";

const REGISTRY = {
  bucket: BucketIcon,
  // ...
};
```

Callers stay clean — `<Icon name="bucket" />` works everywhere, and if Lucide ever ships a real `Bucket` we swap the import without touching call sites.

**Observed:** 2026-05-09 in `apps/dashboard/src/components/ui/Icon.tsx`.

**Notes:** When in doubt about Lucide names, grep its `.d.ts`: `grep -oE "(Database|Container|Archive)([A-Z][a-z]+)?" node_modules/.pnpm/lucide-react@*/node_modules/lucide-react/dist/lucide-react.d.ts | sort -u`.

---

## Symptom: dApp Kit `SuiClientProvider` rejects networks with `Type '{ url: any; }' is not assignable to type 'SuiJsonRpcClient | NetworkConfig'`

**Cause:** `@mysten/dapp-kit@1.0.6`'s `NetworkConfig` is `SuiJsonRpcClientOptions & { variables?: T }`. `SuiJsonRpcClientOptions` itself requires **both** `url` and `network` (from `@mysten/sui@2.16.x` — `network` is what tags the `SuiClientTypes.Network` everything else dispatches on). The Enoki / dApp Kit docs example often elides this, so it's easy to copy `{ url: getJsonRpcFullnodeUrl("testnet") }` and miss it.

**Fix:**

```ts
// apps/dashboard/src/app/providers.tsx
const NETWORKS = {
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" as const },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" as const },
  devnet:  { url: getJsonRpcFullnodeUrl("devnet"),  network: "devnet"  as const },
};
```

The `as const` is what lets the union narrow to `SuiClientTypes.Network`.

**Observed:** 2026-05-09 in `apps/dashboard/src/app/providers.tsx`.

**Notes:** Source of truth is `apps/dashboard/node_modules/.pnpm/@mysten+sui@2.16.2_typescript@5.9.3/node_modules/@mysten/sui/src/jsonRpc/client.ts:SuiJsonRpcClientOptions`. If we ever upgrade to the `@mysten/dapp-kit-core` / `dapp-kit-react` split, the `createDAppKit({ networks })` shape changes — re-check then.

---

## Symptom: `[bootstrap] fatal PrismaClientInitializationError: Can't reach database server at localhost:5432`

**Cause:** Postgres isn't running. The control-plane (and gateway, indexer, anything else that boots `@prisma/client`) hard-fails at `onModuleInit` if it can't open a connection. Most commonly this means Docker Desktop is closed or the `infra/compose/docker-compose.yml` stack hasn't been brought up after a reboot.

**Fix:**

```bash
# Start Docker Desktop, then:
docker compose -f infra/compose/docker-compose.yml up -d
```

That brings up `postgres:16-alpine` (5432) and `valkey/valkey:8-alpine` (6379). Schema is auto-applied via Prisma migrations on the first run.

Verify with:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
# or, on the host:
lsof -iTCP:5432 -sTCP:LISTEN
```

**Observed:** 2026-05-11 during Phase B dashboard live verification.

**Notes:** Don't try to install Postgres directly on macOS as a "lighter" alternative — the compose stack's volume names and credentials are baked into `.env`'s `DATABASE_URL` and a sibling install would force a divergence. If Docker Desktop is undesirable, OrbStack runs the same compose file with less overhead. Either way, the goal is `lsof -iTCP:5432 -sTCP:LISTEN` returning a row.

---

## Symptom: `POST /v1/auth/zklogin` returns `InvalidArgument: JWT is missing the 'email' claim` after a successful Enoki Google sign-in

**Cause:** Enoki's `registerEnokiWallets` defaults the OAuth scope to `"openid"` only (see `@mysten/enoki@1.0.7/dist/wallet/wallet.mjs:271`). Google omits the `email` (and `name`) claims from the resulting ID token unless those scopes are requested explicitly. Our control-plane decodes the JWT and requires `email` so it can upsert `Account.email`.

**Fix:** Pass `extraParams: { scope: "email profile" }` to the Google provider config:

```tsx
// apps/dashboard/src/app/providers.tsx
const { unregister } = registerEnokiWallets({
  apiKey: publicKey,
  providers: {
    google: {
      clientId: googleClientId,
      extraParams: { scope: "email profile" },
    },
  },
  client,
  network,
});
```

The Enoki SDK already prepends `"openid"`, so the final scope sent to Google is `"openid email profile"`.

**Observed:** 2026-05-11 during Phase B dashboard live verification.

**Notes:** If a user already consented to the old scopes, Google caches the consent and won't re-prompt. Revoke the app at <https://myaccount.google.com/permissions> to force a re-consent, or test with a fresh Google account.

---

## Symptom: New bucket created via dashboard succeeds on-chain but never appears in `GET /v1/buckets`

**Cause:** The worker (indexer) isn't running. `apps/worker` is a separate Node process from the control-plane — it subscribes to the Sui gRPC checkpoint stream and writes `Bucket` / `S3Object` rows into Postgres when it sees `KraterionBucketCreated` / `KraterionObjectCreated` events. The CP reads from Postgres; it never reads from Sui directly. So if the worker is down, the dashboard list will not reflect on-chain creates regardless of how many minutes you wait.

**Symptoms to verify the diagnosis:**

```bash
# 1. Is the worker process up?
lsof -i:4003 || echo "worker not running"

# 2. Is the IndexerCursor row advancing? (compare `updated_at` to now.)
PGPASSWORD=kraterion psql -h localhost -U kraterion -d kraterion -c \
  "SELECT source_id, last_checkpoint_seq, updated_at FROM \"IndexerCursor\";"

# 3. Did your tx actually succeed on-chain? (find its checkpoint via the Sui RPC.)
curl -fsS https://fullnode.testnet.sui.io:443 -H 'content-type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"suix_queryTransactionBlocks","params":[{"filter":{"FromAddress":"<YOUR_SUI_ADDR>"},"options":{"showInput":true,"showEffects":true}},null,5,true]}' \
  | jq '.result.data[] | {digest, checkpoint, status: .effects.status, fn: (.transaction.data.transaction.transactions[0].MoveCall.function // "n/a")}'
```

**Fix:**

```bash
# Start the worker.
PORT=4003 node apps/worker/dist/main.js
# Or: pnpm -F @kraterion/worker start
```

If the worker has been down for days, its cursor is far behind testnet's live tip and will backfill hundreds of thousands of checkpoints. Two options:

- **Backfill everything (correct, but slow):** let it run. Throttle is ~8 rps per `BACKFILL_MIN_INTERVAL_MS`. Several hours for a multi-day gap.
- **Fast-forward to live (skips events in the gap):** `pnpm -F @kraterion/worker indexer:fast-forward --back 50` seeds the cursor at `live_tip - 50`. Any on-chain action in the skipped window is lost to the indexer; only safe in dev or when you've manually confirmed the gap is empty.

**If you fast-forwarded and your tx was in the skipped window** (this is what bit us 2026-05-11), look up the tx's exact checkpoint via the Sui RPC, then rewind the cursor manually:

```bash
PGPASSWORD=kraterion psql -h localhost -U kraterion -d kraterion -c \
  "UPDATE \"IndexerCursor\" SET last_checkpoint_seq = <YOUR_TX_CHECKPOINT - 1>, last_tx_digest = NULL, last_event_seq = NULL WHERE source_id = 'kraterion-mainpipeline-v1';"
# Restart the worker.
```

**Observed:** 2026-05-11 during Phase D dashboard live verification.

**Notes:** The dev startup order is **postgres + redis (compose) → worker (indexer) → control-plane → dashboard**. The worker is the silent piece — nothing in the dashboard tells you it's down. Long term, a dashboard banner driven by `/health/ready` checking indexer lag would surface this; tracked for Phase G polish.

---

## Symptom: PutObject to gateway 503 `ORPHAN BLOB (relay POST failed): 500 internal client error`

**Cause:** The Walrus testnet public upload-relay is flaky. The gateway successfully (1) verified the SigV4 signature, (2) encrypted the body with Seal, (3) called Walrus's `register_blob` on-chain — but the subsequent HTTP POST to the public upload-relay returned 500. The blob is "orphaned" on-chain: a `Blob` Sui object exists, but no bytes were uploaded to storage nodes. The gateway logs the orphan id so it can be GC'd or retried later.

This is upstream infra noise, not a bug in our code. Verified during Phase E live verification on 2026-05-11.

**Fix:** Retry the upload. Empirically the next attempt 5 s later usually succeeds. If retries keep failing for minutes, check the Walrus testnet status — `https://walrus.site` and any Mysten Labs announcements. There's not much we can do about it from our side.

**Notes for the dashboard:** the dashboard's `uploadWithProgress` surfaces the gateway's XML error verbatim in the upload-queue panel; users see "Gateway returned 503: …ServiceUnavailable…". Auto-retry is a future polish (one retry with backoff would mask most of these). For now the panel exposes a dismiss button and the user can re-drop the file.

---

## Symptom: Public link for a file with a space in the name returns `NoSuchKey`, gateway log shows `%2520` in the path

**Cause:** Next.js 16 surfaces catch-all `[...key]` route params already URL-encoded when the key contains reserved characters (spaces, parens, etc.). The dashboard's `/public/[bucket]/[...key]/page.tsx` was doing `encodeURIComponent(seg)` unconditionally — the existing `%20` got re-encoded to `%2520`. The gateway decoded that once, got `%20` as a literal substring, and Postgres returned no matching object.

**Fix:** Normalize each path segment with decode-then-encode in the dashboard's redirect handler. `decodeURIComponent` is idempotent over already-decoded input (no `%XX` to undo), so this works whether Next gave us the encoded or decoded form:

```ts
function normalizeSegment(seg: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(seg); }
  catch { decoded = seg; }  // malformed %XY in input → pass through
  return encodeURIComponent(decoded);
}
```

Apply to both `bucket` and every entry in `key[]` before constructing the gateway URL.

**Observed:** 2026-05-11, dashboard public-link redirect with file `opengraph-image (2).png`.

**Notes:** This is one of those Next.js App Router behaviors that quietly differs from Pages Router and from Next 13/14. Worth a quick sanity test on any other dynamic route that builds URLs from `params` — if it touches `encodeURIComponent`, it's at risk of double-encoding.

---

## Migrating from `OPENAI_API_KEY` env var to per-project credentials

**Background:** P0 (2026-05-13) removed the process-wide `OPENAI_API_KEY` env var. Worker ingestion, CP `/search`, CP `/ask`, and the MCP `kraterion_ask` tool all now read the key from `ProviderCredential` via `ProviderCredentialService.useDecrypted(projectId, "openai", fn)`. No env-var fallback.

**Steps for an existing developer:**

1. Apply migrations: `npx prisma migrate deploy` (one new migration: `20260512235959_add_provider_credentials`).
2. Boot the control plane + dashboard. Sign in, go to `/keys`, click the **AI providers** tab.
3. Click **Add OpenAI key**, paste the value that used to live in `OPENAI_API_KEY`. The CP pings `/v1/models` and rejects invalid keys before persisting.
4. The variable can be removed from `.env` — nothing reads it any more. Worker, CP, and MCP all fetch the key fresh per call via the new service.

**If indexing fails with `error_detail = "openai_credential_missing"`:** the project has no active OpenAI credential. Configure it on `/keys?tab=providers`, then re-enable Knowledge (or call `POST /v1/buckets/:id/knowledge/backfill`) on each affected bucket.


---

## Symptom: Knowledge "Index status" shows `Indexed N of M` with N > M (e.g. "Indexed 8 of 3")

**Cause:** `KnowledgeManifest` rows are retained for audit across every enable/disable cycle and re-index pass — that's intentional (the on-chain verifiability trail relies on it). The `GET /v1/buckets/:id/knowledge` summary was grouping the full manifest table by status without deduping to the latest version per object, so each historical re-indexing pass added another row to the `indexed` / `skipped` / `failed` counters.

There was also a related bug: workers write `status='indexing'` for in-flight rows, but the summary expected `pending` and silently dropped `indexing` rows from every counter.

**Fix:** Start the join from `S3Object` (the source of truth for "current objects in this bucket") and use a `LEFT JOIN LATERAL ... LIMIT 1` to pull the latest manifest per object. The result row count is then an exact arithmetic identity with `total_objects` — `indexed + pending + failed + skipped > total_objects` becomes impossible by construction. `COALESCE(m.status, 'pending')` puts objects with no manifest yet (just uploaded, worker not started) under the "Pending" counter instead of dropping them. Also zero all counters when Knowledge is currently off, and remap worker-side `indexing` → wire-side `pending`. See [`knowledge.controller.ts`](apps/control-plane/src/knowledge/knowledge.controller.ts) `get()`.

An earlier attempt at this fix used `SELECT DISTINCT ON (m.s3_object_id) … FROM "KnowledgeManifest" m INNER JOIN "S3Object" o ON o.id = m.s3_object_id`, theoretically equivalent but in practice still showed `N > total_objects` on a bucket that had been through many enable/disable cycles. The `S3Object`-first formulation is harder to get wrong; prefer it.

**Observed:** 2026-05-13 on the bucket Knowledge tab after enabling/disabling Knowledge multiple times on the same bucket.

**Notes:** If you ever introduce a new manifest status (`degraded`, `partial`, etc.), update both the worker write site and the `countableKeys` set in [`knowledge.controller.ts`](apps/control-plane/src/knowledge/knowledge.controller.ts) `get()` — otherwise it'll silently disappear from the summary.


---

## Symptom: Knowledge `/search` returns chunks from a deleted file, or from the pre-overwrite version of a file

**Cause:** Two pre-existing chunk leaks in the Knowledge data path:

1. **Re-upload of the same S3 key.** The worker opens a new `KnowledgeManifest` at `version + 1` for the object, but its persist transaction was wiping chunks scoped to the *new* `manifest_id` (a no-op on a freshly-opened manifest). Chunks from the prior manifest version survived, and `/search` reads `KnowledgeChunk` filtered only by `bucket_id` — no version filter — so both old and new chunks for the same object would surface.

2. **`DELETE` via the gateway.** The handler set `S3Object.deleted_at` but never touched `KnowledgeChunk`. The search query also didn't filter on the joined `S3Object`'s `deleted_at`, so chunks from soft-deleted files kept appearing in results.

**Fix:**

- **Worker** ([`apps/worker/src/embeddings/embeddings.processor.ts`](apps/worker/src/embeddings/embeddings.processor.ts)) — persist transaction now does `deleteMany({ where: { s3_object_id: object.id } })` before inserting the new chunks. Covers both the retry case and the re-upload case in one statement, since chunks for every manifest version of the object get cleared. The audit-trail manifests stay; only their chunks evaporate.
- **Gateway** ([`apps/gateway/src/s3/objects.write.controller.ts`](apps/gateway/src/s3/objects.write.controller.ts) `deleteObject`) — resolves the target row first, then wraps `knowledgeChunk.deleteMany` + `s3Object.update(deleted_at=now())` in one Prisma `$transaction`. Atomic: either both writes land or neither does.
- **Search** ([`apps/control-plane/src/knowledge/knowledge.service.ts`](apps/control-plane/src/knowledge/knowledge.service.ts)) — outer join with `S3Object` now carries `AND s.deleted_at IS NULL`. Belt-and-suspenders for any code path that ever forgets to clean up.

**Observed:** 2026-05-13, while verifying the manifest-count summary fix.

**Notes:** The existing `/reindex` and disable flows already wipe chunks scoped by `bucket_id`, so they didn't have this leak. The defensive search filter means any *future* code path that creates orphan chunks (a dev script, an aborted backfill, etc.) won't pollute results until the cleanup lands.


---

## Symptom: `POST /v1/buckets/:id/knowledge/ask` returns 404 / older dashboard build asks for a "default chat model"

**Cause:** `/ask` was removed in P3 (2026-05-13) and replaced by
`POST /v1/agents/:id/chat/completions` (OpenAI Chat Completions wire
format). The bucket-scoped `default_llm_model` column was dropped at
the same time; chat model selection moved to the per-agent layer.

**Fix:** create or pick an agent attached to the bucket, then call
its chat endpoint. Dashboard: `/agents` → New agent → attach the
bucket → use the Chat tab. API: `POST /v1/agents/:id/chat/completions`
with an OpenAI Chat Completions payload. MCP: switch from
`kraterion_ask({bucket, query, ...})` to
`kraterion_invoke_agent({agent_id, input, model?})`.

**Observed:** 2026-05-13, during the P3 migration. Live consumers
should not hit this — the migration is part of a single round; the
dashboard updated alongside.

**Notes:** See `decisions.md` 2026-05-13 ("P3 ships…") for the
full migration shape. The Move-call grant flow for the agent's
sub-wallet is a follow-up; today the agent's address is visible on
the agent's Connect tab but the on-chain grant is deferred.


---

## Symptom: agent's chat answers work, but its sub-wallet doesn't show up in a bucket's `api_decryption_addresses` on chain

**Cause:** Granting the agent on-chain is an **explicit user action**, separate from creating the agent and attaching buckets. Creating an agent provisions the sub-wallet + DB row only; the on-chain grant flows through a sponsored Move call the user fires from the dashboard's Connect tab (or directly via `POST /v1/buckets/:id/prepare-grant-agent { agent_id }`).

This is intentional — sponsored txes need the user to sign, so we can't auto-fire at agent create time. The user might also want to attach an agent to a bucket *without* granting on-chain decryption (e.g. for testing).

**Fix:** open the agent detail page → Connect tab → click **Grant** for each "Not granted" bucket. Each click fires one sponsored tx. The status pill flips to "Granted" once the grants query refetches (~30s staleTime, or instantly after the tx confirms — we invalidate the query on success).

**Observed:** 2026-05-13, design intent.

**Notes:** Per-address revoke uses the `revoke_all + grant(survivors)` pattern from `prepare-revoke-indexer` — reads the bucket's current `api_decryption_addresses` from chain at PTB build time so it never accidentally drops a wallet that was granted outside our dashboard. See `decisions.md` 2026-05-13 ("Agent sub-wallet goes fully on-chain…").


## Symptom: `401 Unauthorized` calling `/v1/...` with a `kr_live_…` or `kr_test_…` token that was working yesterday

**Cause:** Network mismatch between the token's prefix and the control
plane's `SUI_NETWORK`. The bearer guard rejects `kr_live_` on a testnet
deployment and `kr_test_` on a mainnet deployment — same property as
Stripe's `sk_live_/sk_test_` mode boundary. The response is a uniform
401 (no leaky discriminator); check your env, not your token.

**Fix:**

1. `echo $SUI_NETWORK` on the control-plane host (defaults to `testnet`
   when unset, which means the server expects `kr_test_…`).
2. Match the token to the env: tokens minted while the server was on
   `SUI_NETWORK=mainnet` are `kr_live_…`; everything else is `kr_test_…`.
3. If the env changed legitimately (a real testnet → mainnet promotion),
   re-mint a fresh token from the dashboard's **API tokens** tab. The
   new token's prefix will match the current env automatically.

**Observed:** 2026-05-13, control-plane.

**Notes:** The dashboard's create-token dialog shows a "Testnet" /
"Mainnet" pill so the user can verify the prefix they're about to
receive. The decision rationale lives in `docs/decisions.md`
2026-05-13 "Unified bearer API tokens…".

## Symptom: `MCP server returned 401` after upgrading; the existing `Authorization: Bearer <AKIA>:<secret>` worked before

**Cause:** The MCP `<AKIA>:<secret>` colon-format (K3a) was retired on
2026-05-13. MCP servers now accept exactly two credentials: a unified
`kr_live_…` / `kr_test_…` bearer token, or an OAuth 2.1 JWT
(`kraterion.mcp+jwt`). The colon-format was off-pattern (looked like
HTTP Basic auth, leaked the S3 shape onto a non-S3 surface) and is
gone.

**Fix:**

1. Mint a bearer token from the dashboard's **API tokens** tab.
2. Update the client config — for Claude Desktop:
   ```json
   {
     "mcpServers": {
       "kraterion": {
         "url": "https://<host>/mcp",
         "headers": { "Authorization": "Bearer kr_test_…" }
       }
     }
   }
   ```
3. For zero-config (Claude Desktop / Cursor's "Add MCP server" flow),
   use OAuth instead — paste only the MCP URL; the client picks up the
   discovery + consent flow from the 401 response.

**Observed:** 2026-05-13, control-plane MCP guard.

**Notes:** S3 AKIA keys still work on the gateway (SigV4 mandates them);
they were never accepted as bearer on the control plane and the failure
mode is unchanged for that path.

---

## Symptom: "Session expired" banner shows on the login page after a clean sign-out

**Cause:** `useCpSession` only listened for the cross-tab `storage` event,
which (by spec) does not fire in the tab that called `localStorage.setItem`
/ `removeItem`. So after `useSignOut` cleared the CP JWT and redirected to
`/login`, the still-mounted `RequireAuth` re-rendered with a *stale-cached*
`session` object. Its second effect saw `(session && !isConnected &&
autoConnectStatus === "attempted")` — the exact signature of a stale Enoki
session — and overwrote the navigation with `/login?reason=stale`, which
triggers the banner.

**Fix:** Make `sessionStorage.write/clear` dispatch a same-tab
`CustomEvent("kraterion:cp_session_change")`, and have `useCpSession`
subscribe to it in addition to `storage`. Now same-tab consumers update
synchronously when the session is mutated, so `RequireAuth` sees
`!session` and bails out of the stale path. See
[apps/dashboard/src/lib/api.ts](../apps/dashboard/src/lib/api.ts) and
[apps/dashboard/src/lib/auth.ts](../apps/dashboard/src/lib/auth.ts).

**Observed:** 2026-05-14, dashboard sign-out flow.

**Notes:** Standard `localStorage` gotcha. Any future hook that derives
state from localStorage and is mutated within the same tab needs the same
custom-event pattern (or a Zustand/Jotai store, but that's overkill here).

---

## Symptom: indexer worker OOMs after a few hours; preceded by `MaxListenersExceededWarning: Possible EventTarget memory leak detected. 65 abort listeners added to [AbortSignal]`

**Cause:** `@protobuf-ts/grpc-transport@2.11.1` attaches a permanent
listener on every gRPC call's abort signal (`opt.abort.addEventListener('abort', …)`
at lines 43-46 / 76-79 / 129-132 / 149-152 of its `grpc-transport.js`)
and **never removes it**. The original `run-loop.ts` passed a single
iteration-scoped `AbortController.signal` to every `getCheckpoint`
during backfill, so each call left a closure pinned on that signal
holding a reference to the underlying `gCall`. Over a 100k+
checkpoint initial backfill (or a few hours of live streaming),
the closures accumulate past the V8 4 GB heap ceiling and the worker
dies with `FATAL ERROR: Ineffective mark-compacts near heap limit`.
The pre-fix code papered over the symptom with
`setMaxListeners(64, ac.signal)`, which silences the warning but
does not stop the underlying leak.

**Fix:** introduce an `AbortPool` in
[apps/worker/src/indexer/run-loop.ts](../apps/worker/src/indexer/run-loop.ts)
that keeps exactly ONE listener on the long-lived parent signal and
hands out fresh per-call `AbortController`s. Each gRPC call gets its
own child signal; when the call returns, the controller is dropped
from the inflight set and GC'd along with the leaked closure. The
parent signal aborting walks the inflight set and cancels everything.
All `fetchCheckpoint` / subscribe callsites in the run loop now go
through `pool.run(...)` or `pool.acquire()`. Memory now stays flat
at ~190 MB through long backfills instead of climbing toward 4 GB.

**Observed:** 2026-05-14, worker OOM at ~3 hours uptime mid-backfill.

**Notes:** Bug is in `@protobuf-ts/grpc-transport` and would recur on
any new gRPC callsite that reuses a long-lived abort signal across
many calls. **Rule of thumb:** never pass the same `AbortSignal` to
more than a handful of `client.*Service.*(..., { abort: signal })`
calls. Use the `AbortPool` helper or create per-call controllers
manually. Worth revisiting if/when protobuf-ts patches the leak.

---

## Symptom: `sui_getNormalizedMoveModule(<walrus_original_id>, "storage_pool")` returns `No module found with module name storage_pool`

**Cause:** Sui RPC's `sui_getNormalizedMoveModule` / `sui_getNormalizedMoveModulesByPackage`
do NOT follow the package upgrade chain. They return the surface of the
SPECIFIC package version you query by ID. Walrus on testnet is at v3 (which
ships `storage_pool`), but the `walrus` address in our `move/kraterion/Move.toml`
`[addresses]` block is the v1 original-id `0xd84704c1...` — that's the
right value for type identity in Move source, but the wrong one for RPC
introspection.

**Fix:** For introspection (admin tooling, calibration scripts, debugging),
query the **current published-at** address directly. Use the constant
`WALRUS_PACKAGE_PUBLISHED_AT_TESTNET` from
[packages/shared/src/constants.ts](../packages/shared/src/constants.ts).
For actual tx submission, Sui resolves the upgrade chain automatically when
you build a `moveCall` against the original-id — both work, but published-at
is more explicit.

To find the current published-at: query the System object's `package_id`
field via `sui_getObject` with `showContent: true` on
`WALRUS_SYSTEM_OBJECT_ID`. Or read it from
`https://raw.githubusercontent.com/MystenLabs/walrus/main/testnet-contracts/walrus/Published.toml`.

**Observed:** 2026-05-18 during Phase A storage-pool calibration.

**Notes:** Same applies to mainnet — original-id and published-at diverge
once a package is upgraded. Pin both in `constants.ts` when you start
caring about mainnet. Bumping the pinned `Move.toml` commit will usually
mean the published-at changes too — re-run the calibration script
(`pnpm -F @kraterion/gateway exec tsx scripts/walrus-pool-baseline.ts`)
to confirm storage_pool is still live and gas hasn't drifted.

---

## Procedure: storage-pool migration hard reset

**When to run:** at the cutover from the SharedBlob model to the
storage-pool model, and any time you want to redeploy the Kraterion
Move package against a fresh database in development.

**One-shot script:** `scripts/hard-reset.sh` (`--yes-i-know` to skip
interactive confirm). The script gates on `sui client envs` being
`testnet` or `localnet` — refuses to run against mainnet.

**Manual procedure** (if the script fails partway):

1. Stop services (gateway, control-plane, worker, dashboard) so they
   release Postgres connections — `migrate reset` will block on active
   sessions otherwise.

2. **DB reset.** From repo root:
   ```bash
   pnpm prisma migrate reset --force
   ```
   Drops + recreates every table, replays every migration from
   `prisma/migrations/`, including
   `20260518100000_p7_storage_pools/`.

3. **Republish Move package.**
   ```bash
   scripts/setup-testnet.sh --force
   ```
   Publishes a fresh Kraterion Move package, extracts the new
   `KRATERION_PACKAGE_ID` + `KRATERION_UPGRADE_CAP_ID` + the new
   `PlatformReserve` object ID, writes them to
   `packages/shared/src/constants.ts`.

4. **Gateway bootstrap.**
   ```bash
   pnpm -F @kraterion/gateway bootstrap
   ```
   Generates new sub-wallets (`api_decryption`, `knowledge_indexer`),
   authorizes them on the new reserve via
   `reserve::authorize_caller`, deposits initial WAL into the reserve.

5. **Verify.** Optional smoke against the new package:
   ```bash
   pnpm -F @kraterion/gateway smoke:baseline   # bare-Walrus pool ops
   pnpm -F @kraterion/gateway smoke            # full encrypt+pool round-trip
   ```

6. **Restart services** (`pnpm dev` at repo root or per-app).

**Things that DON'T need manual cleanup:**

- The old Kraterion package is now orphaned on testnet but doesn't
  cost anything ongoing — its `SharedBlob`s expire at their original
  `end_epoch` and the package itself is just a record on chain.
- The old reserve still holds whatever WAL was in it. If you want to
  recover the WAL, sign a `reserve::withdraw` tx against the OLD
  `KRATERION_RESERVE_ID` from `git log -p packages/shared/src/constants.ts`
  before the constants update — done as the original deployer who has
  the `admin` field.
- The old sub-wallets (mnemonics in the now-dropped `SubWallet` rows)
  still have any SUI they held. Same recovery pattern if you wrote the
  KMS-wrapped seeds to backup before reset (we didn't, in testnet —
  abandoned).

**Recovery from a partial reset:**

If step 2 succeeds but step 3 fails, the DB is empty but constants.ts
still points at the OLD package. Re-run from step 3. The setup script
is idempotent and refuses to re-publish unless `--force` is set —
which is what hard-reset.sh passes.

If step 3 succeeds but step 4 fails, the new package is published and
constants are updated, but there's no gateway wallet yet. Re-run
step 4 manually:
```bash
pnpm -F @kraterion/gateway bootstrap
```

**Observed:** 2026-05-18 during storage-pool migration Phase K.

---

## Howto: Test the inline Stripe Elements billing flow end-to-end

**When to use this:** verifying B5 (`/billing` page) after any change to the
billing module, the dashboard PaymentMethod card, the Stripe webhook
handlers, or the `setup-intent` endpoint.

**Prerequisites:**
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`)
- Stripe CLI authenticated to the **test mode** account
  (`stripe login` once, picks up the right account by default)
- `.env` carries `STRIPE_MODE=test`, `STRIPE_SECRET_KEY=sk_test_…`,
  `STRIPE_WEBHOOK_SECRET=whsec_…` (the value `stripe listen` prints)
- `apps/dashboard/.env.local` carries
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`

**Three terminals:**

```bash
# Terminal 1 — full stack
pnpm dev

# Terminal 2 — webhook forwarder (forwards ALL events, no allow-list needed)
stripe listen --forward-to localhost:4001/webhooks/stripe
# ↑ writes a new whsec_… to stdout on first run. Copy that into
#   .env STRIPE_WEBHOOK_SECRET (only changes when you restart `stripe listen`).

# Terminal 3 — sandbox bootstrap (optional; the dashboard can do this itself
# now via /billing → Add card)
pnpm -F @kraterion/control-plane exec tsx scripts/probe-billing-bootstrap.ts <projectId>
```

**Flow to exercise:**

1. Open `http://localhost:3001/billing` on a project with no payment method.
   The PaymentMethodCard shows the "Add a payment method to start using
   Kraterion" banner + an **Add card** button.
2. Click **Add card**. `InlineCardForm` mounts:
   - calls `POST /v1/billing/setup-intent` (creates a Stripe Customer if
     none exists, returns a `client_secret`)
   - mounts `<Elements>` + `<PaymentElement />` with our design tokens
3. Enter the test card: `4242 4242 4242 4242 / 12 28 / 123 / 12345`.
   Click **Save card**.
4. Stripe processes `confirmSetup`. With this PAN there's no 3DS challenge,
   so we stay on `/billing`. Terminal 2 (`stripe listen`) logs the
   `setup_intent.succeeded` event and forwards it.
5. CP webhook handler:
   - reads `metadata.project_id`
   - resolves the SetupIntent's `payment_method`
   - calls `setDefaultPaymentMethod(...)` on the Customer
   - calls `ensureSubscription(...)` — creates the 7-item subscription
     (1 licensed storage @ qty=10 + 6 metered)
   - patches `BillingAccount.has_payment_method = true`, `status = 'active'`
6. After ~2 s the dashboard refetches `useBillingAccount`. The card swaps
   from the form to "Card on file" with a "Manage in Stripe" link.

**Sanity checks:**

- `psql -c "SELECT has_payment_method, status, default_payment_method
  FROM \"BillingAccount\" WHERE project_id = '<projectId>';"` →
  `(t, active, pm_…)`.
- Stripe test-mode dashboard → Customers → your project name → check the
  default payment method is on file and a subscription with 7 line items
  is `active`.
- Hit `GET /v1/billing/invoices/:projectId` — should return an empty array
  (no usage yet means no draft invoice).

**Other test cards** (Stripe's full list at
https://docs.stripe.com/testing#cards):
- `4000 0027 6000 3184` — 3DS required (verifies `redirect: 'if_required'`
  redirects + returns correctly via the `return_url`)
- `4000 0000 0000 9995` — insufficient funds (verifies error path)
- `4000 0000 0000 0002` — generic decline

**Resetting between tests:**
```bash
# Sandbox-only — wipes the BillingAccount row, deletes the Stripe Customer
# and subscription, lets you start fresh on the same project id.
pnpm -F @kraterion/control-plane exec tsx scripts/probe-billing-reset.ts <projectId>
```
(If that script doesn't exist yet, run the equivalent manually:
`DELETE FROM "BillingAccount" WHERE project_id = '<id>';` plus a Stripe
dashboard delete of the corresponding Customer.)

**Observed:** 2026-05-19 during B5 implementation.

**Notes:**
- `stripe listen` prints a NEW `whsec_…` every time it starts. Either keep
  the same terminal open across sessions, or update `STRIPE_WEBHOOK_SECRET`
  in `.env` each restart (and restart the control-plane after).
- The `setup_intent.succeeded` and `checkout.session.completed` handlers
  share the same downstream logic — testing one validates most of the
  other.
- If the card form spins forever showing "Loading secure card form…",
  check the browser console for a `loadStripe` error — most often the
  publishable key is missing from `.env.local`.

---

## Symptom: dashboard `/billing` shows "Loading secure card form…" forever

**Cause:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is missing from
`apps/dashboard/.env.local`. The lazy accessor `env.getStripePublishableKey()`
throws on first read; `InlineCardForm` catches it and stores the error in
state but the spinner already rendered first.

**Fix:**
```bash
# Add the test publishable key to .env.local
echo "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…" >> apps/dashboard/.env.local
# Restart the dashboard so Next.js re-reads the env
```
The key is the test publishable key from
https://dashboard.stripe.com/test/apikeys. Safe to commit to `.env.local`
locally — it's the *public* half of the key pair, designed to ship in
client bundles.

**Observed:** 2026-05-19 during B5 wiring.

**Notes:** Same accessor pattern as `NEXT_PUBLIC_ENOKI_PUBLIC_KEY` —
deliberately lazy so a missing key doesn't blow up routes that don't need
Stripe.

---

## Symptom: Stripe webhook never fires for `setup_intent.succeeded`

**Cause:** Either (a) `stripe listen` was started against the wrong Stripe
account or with an event-type filter that excluded SetupIntent events, or
(b) the configured webhook endpoint in the Stripe dashboard has a curated
allow-list that doesn't include `setup_intent.*`.

**Fix:**
```bash
# Local dev — listen forwards everything by default:
stripe listen --forward-to localhost:4001/webhooks/stripe

# Verify by triggering a synthetic event:
stripe trigger setup_intent.succeeded
# Terminal 1 (control-plane) should log:
#   StripeWebhookController handler succeeded for evt_…
#   BillingService set default payment method pm_… on customer cus_…
#   BillingService created subscription sub_… for project=…
```
If using a deployed webhook endpoint, edit it in the Stripe dashboard
(Developers → Webhooks → click the endpoint → Listen to events): add
`setup_intent.succeeded` to the allow-list.

**Observed:** 2026-05-19 — anticipated during B5 testing.

**Notes:** The handler is idempotent (`StripeWebhookEvent.id` PK + service-
layer upserts) so re-sending the same event with `stripe events resend
evt_…` is safe.

---

## Howto: Reset a project's Stripe billing state for sandbox testing

**When to use this:** repeated end-to-end tests of the inline Stripe
Elements flow + subscription bootstrap. Without a reset, the project
stays attached to its existing Stripe customer + subscription and
re-running "Add card" hits the "Card on file" path.

**Command:**

```bash
pnpm -F @kraterion/control-plane exec tsx \
  scripts/probe-billing-reset.ts <projectId>
```

**What it wipes (sandbox / test-mode only):**

- Stripe: every Subscription on the project's Customer, the Customer
  itself, any draft invoices in the way.
- Postgres: `BillingAccount` + every `MeterEvent`, `UsageDaily`,
  `BYOKDailySpend`, `PendingStorageDowngrade` for the project.

**What it doesn't touch:**

- The Stripe Product / Price / Meter catalog (project-independent —
  use `pnpm stripe:sync` to rebuild that).
- `StripeWebhookEvent` rows (kept for the audit trail).
- `S3Object`, `Bucket`, `Agent`, knowledge data — project stays
  usable post-reset.

**Refuses to run if:**

- `STRIPE_MODE` is not `test`.
- The secret key doesn't start with `sk_test_`.

After the reset, open `/billing` in the dashboard — the PaymentMethod
card renders the empty "Add card" state.

**Observed:** 2026-05-19 alongside the B1–B5 closeout pass.

---

## Howto: Verify the new B4 processors are alive in dev

After starting the control-plane (`pnpm dev`), the logs should show
each processor announcing itself once at boot:

```
[Nest] LOG  ReconciliationProcessor reconciliation armed (tick=86400000ms, …)
[Nest] LOG  CostFloorProcessor cost-floor armed (tick=86400000ms, alert_below=25%)
[Nest] LOG  SoftAlertEvaluator soft-alert evaluator armed (tick=300000ms)
[Nest] LOG  AlertDeliveryProcessor alert-delivery armed (tick=30000ms)
[Nest] LOG  ShareTokenEgressRollupProcessor share-token-egress rollup armed …
[Nest] LOG  UsageEventTtlProcessor usage-event TTL armed (retention=35d, …)
[Nest] LOG  WebhookEventTtlProcessor webhook-event TTL armed (retention=90d, …)
```

If any line is missing, check `apps/control-plane/src/billing/billing.module.ts`
— the provider must be in the `providers` array AND `NestJS` must
have instantiated the class (a missing import in another module that
depends on it is the usual cause).

**Force a single tick** for diagnostics: every processor exposes a
`tick()` method. Call it from the `ts-node` REPL or write a probe
script:

```ts
const ctx = await NestFactory.createApplicationContext(AppModule);
const proc = ctx.get(ReconciliationProcessor);
await proc.tick();
await ctx.close();
```

**Observed:** 2026-05-19 during the B4 closeout.

---

## Symptom: cost-floor processor logs `CoinGecko 429` or times out

**Cause:** CoinGecko's free Simple Price endpoint is rate-limited to
~30 req/min per IP. With a daily cron we're far under that, but a
restart loop during development can exhaust the limit.

**Fix:** none needed in production. The processor falls back to the
hardcoded baselines (`WAL = $1`, `SUI = $2.50`) when the fetch fails
and still writes a `CostFloorSnapshot` row with `oracle_sources.error`
set. The headroom calculation uses the baseline, so a 429 just means
"today's snapshot is approximate".

If a real production deployment needs reliable WAL/SUI prices:

1. Add `COINGECKO_API_KEY` and switch to the Demo / Pro endpoint at
   `pro-api.coingecko.com` (higher rate limits).
2. Or implement the Pyth Hermes fetch (commented in the file
   header). Pyth has the right Sui-native feed for SUI; WAL/USD is
   not yet on Pyth as of this writing.

**Observed:** 2026-05-19 (anticipated, not yet hit in dev).

---

## Howto: Redeploy Move with `pool_vault::resize_shrink` (Stage 2 of the pool-lifetime change)

**When to use this:** to activate the on-chain shrink path that
matches the new pool-lifetime model (`PoolRenewalProcessor` plus
`decisions.md` 2026-05-19 "Pool lifetime tracks billing cycle").
Until this redeploy, the renewal worker only extends pools — never
shrinks. Downsized projects still see the right Stripe quantity but
keep the full on-chain reservation until the next renewal cycle.

**Pre-flight:**

1. Move source builds clean:
   ```bash
   cd move/kraterion && sui move test
   ```
   Expect: `Test result: OK. Total tests: 42; passed: 42`.

2. TS bindings include `resizeShrink`:
   ```bash
   grep -n "resizeShrink\|resize_shrink" \
     packages/kraterion-move-sdk/src/generated/kraterion/pool_vault.ts
   ```
   Expect two matches (the export, the moveCall string).

3. Typecheck across the workspace is green:
   ```bash
   pnpm typecheck
   ```

**Deploy:**

```bash
# Publishes the new Move package, updates Published.toml + the TS
# package-id constants, regenerates bindings.
scripts/setup-testnet.sh --force
```

After the script finishes, take a quick look at the new
`KRATERION_PACKAGE_ID` in `packages/shared/src/constants.ts` and
sanity-check that `Published.toml` advanced.

**Activate the shrink path:**

```bash
# Control-plane reads this at boot. Add it to .env, then restart.
echo "KRATERION_ENABLE_POOL_SHRINK=true" >> .env
```

Restart the control-plane. On next `PoolRenewalProcessor` tick, any
project with a `PendingStorageDowngrade` past its `effective_at`
gets shrunk first, then extended at the new smaller size.

**Verify it ran:**

After a renewal tick, look for the shrink log line:
```
shrunk pool=0x… project=… N% of unused (target G GB) tx=0x…
```

And check the `PendingStorageDowngrade` row advanced:
```sql
SELECT status, applied_at, resize_shrink_tx_digest
FROM "PendingStorageDowngrade"
WHERE project_id = '<projectId>';
```

Expect `status='applied'`, `applied_at` set, `resize_shrink_tx_digest`
populated.

**If the shrink reverts:** Walrus aborts if `percent == 0` or if the
computed extract size rounds to zero (e.g. the pool has nothing
unused). The worker logs the abort and skips that pool; the
`PendingStorageDowngrade` row stays `scheduled`. The Stripe quantity
has already dropped (storage-downgrade processor ran at the period
boundary), so this becomes a "manual reconciliation" item — either
wait for the customer to free space and re-run, or accept the residual.

**Observed:** 2026-05-19 — Stage 2 wired but not yet redeployed.

---

## Symptom: Pools are not getting renewed; PoolRenewalProcessor says `subscription not active; skipping`

**Cause:** The renewal worker intentionally refuses to extend pools
for subscriptions that are:

- `BillingAccount.status != 'active'` (cancelled, suspended, past_due
  with no payment method), OR
- Stripe subscription has no `active` or `trialing` item with the
  `storage_v1` price, OR
- Subscription has `cancel_at_period_end = true`.

This is by design — pools for non-paying customers decay naturally
over the remaining ~1 cycle.

**Fix (if you actually want to renew):**

1. Confirm the customer is paying (Stripe dashboard → Customers →
   subscription status).
2. If they re-subscribed: `BillingAccount.status` should already be
   `active` (the `customer.subscription.updated` webhook flips it).
   If it's not, manually:
   ```sql
   UPDATE "BillingAccount" SET status = 'active'
   WHERE project_id = '<projectId>';
   ```
   Then trigger a renewal tick via the admin REPL.
3. If they didn't re-subscribe: leave the pool alone. It will decay.
   The customer can still read existing blobs through end_epoch.

**Observed:** 2026-05-19 — anticipated, not yet hit in dev.

## Symptom: `doctl apps create` → `400 ... GitHub user not authenticated`

**Cause:** App Platform's `github:` source needs the DO↔GitHub OAuth link,
which can only be established in the browser (control panel). The CLI/API
cannot create the link, so `apps create` with a `github:` source fails even
though another app in the account already uses GitHub.

**Fix:** if the repo is public, use a generic `git` source instead — no OAuth
needed:
```yaml
git:
  repo_clone_url: https://github.com/<owner>/<repo>.git
  branch: main
```
Trade-off: generic `git` sources don't auto-deploy on push — ship with
`doctl apps create-deployment <app-id>`. To restore push-to-deploy, link
GitHub in the UI and switch back to `github:` + `deploy_on_push: true`.

**Observed:** 2026-06-11 deploying to DigitalOcean App Platform (.do/app.yaml).

## Symptom: `doctl apps spec validate` → `databases.engine: REDIS must be a production database`

**Cause:** App Platform dev (free, inline) databases don't exist for Redis —
only Postgres/MySQL get a dev tier. Also, production DBs are NOT provisioned
from the app spec: you reference an existing managed cluster by `cluster_name`
(error `database cluster (X) was not found` if it doesn't exist).

**Fix:** pre-create the clusters, then attach. Redis uses the `valkey` engine
now (`doctl databases options slugs --engine redis` returns nothing):
```
doctl databases create kraterion-db    --engine pg     --version 16 --size db-s-1vcpu-1gb --num-nodes 1 --region nyc3
doctl databases create kraterion-redis --engine valkey --version 8  --size db-s-1vcpu-1gb --num-nodes 1 --region nyc3
```
In the spec: `production: true` + `cluster_name: kraterion-db` (engine PG) and
`engine: VALKEY` + `cluster_name: kraterion-redis`. The `${db.*}`/`${redis.*}`
bindables resolve from the attachment. pgvector works on the managed PG (the
`CREATE EXTENSION IF NOT EXISTS vector` migration succeeds).

**Observed:** 2026-06-11 deploying to DigitalOcean App Platform.

## Symptom: gateway crash-loops at boot — `fatal Error: No gateway api_decryption SubWallet found. Run \`pnpm -F @kraterion/gateway bootstrap\``

**Cause:** a fresh production DB has no `api_decryption` SubWallet row;
`GatewayKeypairService.onModuleInit` fails fast. The bootstrap is a one-time
on-chain provisioning step and needs the local Sui CLI deployer keystore, so
it can't run inside the container.

**Fix:** run the bootstrap from a machine with the funded testnet deployer,
pointing at the prod DB **with the production `KEY_WRAPPING_MASTER_KEY`** (the
wrapped seed must unwrap in the deployed gateway — mismatched key →
"address mismatch"):
```
set -a; source .env.bootstrap; set +a   # DATABASE_URL=<prod>, KEY_WRAPPING_MASTER_KEY=<prod>, SUI_*
pnpm -F @kraterion/gateway bootstrap
```
If it fails on reserve WAL funding with "Deployer has only N MIST of ...wal::WAL;
need M": top up the *correct* WAL coin type with `walrus get-wal --amount <SUI_MIST>`
(the big "WAL Token" coins in a wallet may be a different token type). Bootstrap
is idempotent — re-run to finish. Then `doctl apps create-deployment <id>`.

**Observed:** 2026-06-11 first hosted gateway boot.

## Symptom: worker indexer loops `subscribe loop error code=NOT_FOUND ... Checkpoint 0 not found`, `backfilling 3471xxxxx checkpoints (0..)`

**Cause:** `INDEXER_INITIAL_CHECKPOINT` unset → the indexer starts from
checkpoint 0, but testnet fullnodes prune old checkpoints, so the subscription
never finds them.

**Fix:** set `INDEXER_INITIAL_CHECKPOINT` on the worker to a recent checkpoint
— at/just-before the first event you care about (e.g. the bootstrap bucket's
creation checkpoint, from `sui client tx-block <digest> --json`). Backfill from
there is small and the bucket's DB row gets written.

**Observed:** 2026-06-11 hosted worker (apps/worker indexer).

## Symptom: deployed Next.js app calls `http://localhost:4001` (or other dev default) despite NEXT_PUBLIC_* env vars being set in Vercel/prod

**Cause:** the code read the var dynamically — `process.env[name]` with a
variable key (e.g. a `function optional(name) { return process.env[name] ?? fallback }`
helper). Next.js only inlines `NEXT_PUBLIC_*` into the **client** bundle for
**static literal** member accesses (`process.env.NEXT_PUBLIC_FOO`). A dynamic
`process.env[name]` is left untouched; in the browser `process.env` is empty,
so it resolves to `undefined` and silently uses the fallback. Works in dev only
because the fallback happens to be the dev URL.

**Fix:** access each var as a static literal and pass the *value* into helpers:
```ts
function optional(value: string | undefined, fallback: string) { return value ?? fallback; }
controlPlaneUrl: optional(process.env.NEXT_PUBLIC_CONTROL_PLANE_URL, "http://localhost:4001"),
```
Verify: build with the prod value and grep `.next/static` for the expected host
(it should appear; the dev fallback string should be tree-shaken out).

**Observed:** 2026-06-11 in apps/dashboard/src/lib/env.ts (Vercel deploy).

---

## Symptom: deploy fails with "remaining connection slots are reserved for roles with the SUPERUSER attribute" / DeployContainerExitNonZero

**Cause:** The DO managed Postgres is the smallest plan (`db-s-1vcpu-1gb`,
`max_connections≈25`, a few reserved for DO's superuser). Three NestJS
services (control-plane, gateway, worker) each opened an **uncapped** Prisma
pool (`DATABASE_URL` had no `connection_limit`), so at load they collectively
held ~all ~22 non-superuser slots. On a rolling deploy the *previous*
instances keep running until the new ones are healthy — but the new instances
crash at boot because (a) `PrismaService.onModuleInit` did a fatal `$connect`
and (b) the keypair services (`GatewayKeypairService` / `OperatorKeypairService`
/ `KnowledgeIndexerKeypairService`) did `await prisma.subWallet.findFirst()` in
`onModuleInit` — and there was no free slot. New instances can't boot to let
the old ones drain → deadlock; the automatic rollback (also new instances)
fails the same way. `doadmin` is NOT a Postgres superuser, so you can't even
connect to terminate idle sessions, and DO **clamps `instance_count: 0` back to
1**, so you can't scale-to-zero to release them either. The PRE_DEPLOY
`prisma migrate deploy` job hit the same wall first.

**Fix:** Two parts.
1. **Cap the pools** — append `&connection_limit=4&pool_timeout=20`
   (control-plane) / `&connection_limit=5&pool_timeout=20` (gateway, worker) to
   each service's `DATABASE_URL` in the DO app spec (`doctl apps spec get` →
   edit → `doctl apps update --spec`; the URL already has `?sslmode=require`).
2. **Make boot DB-free** so a rolling deploy never needs a slot during the
   old→new overlap: `PrismaService.onModuleInit` `$connect` is now non-fatal
   (try/catch, lazy on first query), and the keypair services load in the
   **background** with retry (`onModuleInit` returns immediately, exposes
   `whenReady()`); the gas-pool services `await keypair.whenReady()` before
   init instead of calling `getKeypair()` eagerly. `/health` has no DB ping, so
   new instances go healthy with zero connections, DO drains the old ones,
   slots free, then keypairs + Prisma connect. This is the durable fix — rolling
   deploys now work on the tight connection budget without manual intervention.

**Observed:** 2026-06-15 in the DigitalOcean deploy of control-plane / gateway /
worker (apps/*/src/prisma/prisma.service.ts, apps/*/src/**/*keypair*.service.ts,
apps/*/src/sui/gas-pool.service.ts, .do app spec).

**Notes:** Don't scale the DB to "fix" this — the cap + DB-free boot is the right
shape and free. If you ever genuinely need more steady-state connections, add a
DO connection pool (PgBouncer, transaction mode) and split migrations onto a
direct `directUrl`; the app's interactive `$transaction` + `pg_advisory_xact_lock`
usage is transaction-scoped and pooler-safe.
