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
