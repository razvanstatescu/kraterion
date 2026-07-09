# Kraterion — Sui JSON-RPC → gRPC / GraphQL Migration Plan

**Status:** **EXECUTED 2026-07-09.** All production code (5 apps + 3 packages),
tests, the move-sdk, and all 6 ops scripts migrated to gRPC/GraphQL. Full
monorepo `pnpm typecheck` + `pnpm test` green. Backend paths live-verified
against local testnet (see §Execution log). One residual: dashboard interactive
sign+sponsor needs a manual browser+wallet pass; ops scripts migrated
mechanically but not run (they do real on-chain writes).
**Author:** generated 2026-07-09 (Claude), from a full codebase inventory + the
Mysten migration guides.
**Scope:** Migrate every Kraterion server-side (and browser) Sui data-access call
off the deprecated JSON-RPC transport onto the gRPC Core API (default) and
GraphQL (where gRPC has no equivalent). Sui only — Walrus/Seal SDK usage is
affected transitively but needs no rewrite of its own logic.
**Why this doc exists:** Sui deactivated the **public testnet JSON-RPC endpoint
the week of 2026-07-06** ([migration notice](https://docs.sui.io/develop/accessing-data/json-rpc-migration)).
Our testnet deployment reads/writes chain through `https://fullnode.testnet.sui.io:443`
over JSON-RPC, so most on-chain paths are now failing. Mainnet public JSON-RPC
follows the week of 2026-07-20 — so whatever we do here must also be the mainnet
answer.

---

## 0. TL;DR

- **We are NOT stuck on an old SDK.** Every workspace is already on
  `@mysten/sui@^2.16.2`, the v2 line that ships `SuiGrpcClient`
  (`@mysten/sui/grpc`), `SuiGraphQLClient` (`@mysten/sui/graphql`), and the
  transport-agnostic **Core API** (`client.core.*`). This is a **transport swap
  inside the installed SDK**, not a major-version upgrade. No new dependency is
  required for the core work (the worker already pulls `@grpc/grpc-js` +
  `@protobuf-ts/grpc-transport` for its streaming client).
- **The worker indexer is already migrated.** It uses `SuiGrpcClient` +
  `subscriptionService.subscribeCheckpoints` — a working in-repo reference for
  the gRPC client, including the Node keepalive transport. Nothing there uses
  JSON-RPC.
- **The blast radius is one shared factory.** `getSuiClient()` in
  [`packages/walrus-client/src/index.ts:36`](../packages/walrus-client/src/index.ts#L36)
  returns a `SuiJsonRpcClient` and is the RPC client for control-plane, gateway,
  and worker jobs. Seal has a second, parallel factory
  (`getSuiClientForSeal()`). Swap those two constructors and most call sites
  follow — **if** their methods and response shapes still line up. They mostly
  don't line up 1:1 (see §5).
- **Walrus & Seal already accept the new client.** `WalrusClient` wants
  `suiClient: ClientWithCoreApi`; `SealClient` wants
  `SealCompatibleClient = ClientWithExtensions<{ core: CoreClient }>`. A
  `SuiGrpcClient` satisfies both. **No Walrus/Seal code changes needed** beyond
  the client we hand them.
- **The real work is three kinds of change**, in increasing pain:
  1. **Client construction** (2 factories + a few inline clients + dashboard).
  2. **Method renames** on the Core API (`getDynamicFields`→`listDynamicFields`,
     `getLatestSuiSystemState`→`getCurrentSystemState`, `queryEvents`→GraphQL,
     etc.).
  3. **Response-shape breaks** — the big one. Core `getObject`/`getDynamicField`
     return **BCS-encoded content**, not the JSON `{ dataType, fields }` blob our
     helpers read today. Every place that does `res.data.content.fields[...]`
     must be rewritten to parse BCS (via our generated move-sdk BCS types) or
     opt into `include: { json: true }`. And `signAndExecuteTransaction`'s
     `options.showEffects` → `include.effects`, with a changed result shape.
- **Recommended target:** gRPC (`SuiGrpcClient`) as the default transport
  everywhere, matching the worker. GraphQL only for the two things gRPC can't
  do: historical `queryEvents` (test-only today) and any future filtered
  transaction/event history queries.
- **Estimated effort:** ~2–4 focused days. Most of it is the BCS response-shape
  rewrites in `walrus-client` + validating the gas-pool and archive
  `signAndExecuteTransaction` paths against real testnet.

---

## 1. Root cause & current impact

Sui is retiring JSON-RPC across the network:

| Network | Public JSON-RPC deactivation |
|---|---|
| **Testnet** | **week of 2026-07-06** ← we are past this |
| Mainnet | week of 2026-07-20 |

Full sunset target is July 2026. There is **no implicit fallback** — a request
to the old endpoint just fails.

Kraterion points both server-side Sui clients at
`SUI_TESTNET_RPC = "https://fullnode.testnet.sui.io:443"`
([`packages/shared/src/constants.ts:11`](../packages/shared/src/constants.ts#L11))
over JSON-RPC. As of the testnet deactivation, the following are broken or
degrading:

- **Gateway S3 GET** — object-bytes decrypt pipeline resolves shared-object
  versions via `tx.build({ client })`, which calls the RPC.
- **Gateway/control-plane writes** — the Redis gas-coin pool's
  `signAndExecuteTransaction` / `getObject` / `getCoins`.
- **Control-plane per-request reads** — `getObject` in buckets, agents,
  knowledge, prepare.
- **Worker archive jobs** — manifest/session archive `signAndExecuteTransaction`.
- **Billing** — pool-renewal `getLatestSuiSystemState`.
- **Walrus/Seal** — both wrap `getSuiClient()`, so their on-chain reads fail too.

**Not affected:** the worker **indexer** (already gRPC), Walrus blob **reads**
(direct HTTP to the aggregator, not RPC — see
[`readBlobByBlobId`](../packages/walrus-client/src/index.ts#L76)), and the Seal
key-server HTTP calls.

---

## 2. Decision: gRPC as the default transport, GraphQL only where needed

Mysten's guidance: **`SuiGrpcClient` for most operations, `SuiGraphQLClient` for
complex/historical queries** (filtered transaction & event history). The Core
API (`client.core.*`) is identical across both, so most of our code is
transport-agnostic once it targets `client.core`.

**We standardize on `SuiGrpcClient`** because:

- The worker already runs it in production with a hardened Node transport — one
  pattern, one thing to operate.
- Same host/port as today (`fullnode.testnet.sui.io:443`) — no new infra, no new
  provider account for the migration itself (see §9 on rate limits for
  production).
- gRPC is the recommended path for backend/low-latency point lookups, which is
  99% of what we do (get object, get coins, execute tx).

**GraphQL is needed only for:**

- `queryEvents` — used in `kraterion-move-sdk` **tests only** today
  ([`src/index.test.ts:72`](../packages/kraterion-move-sdk/src/index.test.ts#L72)).
  Runtime event ingestion is already the gRPC checkpoint stream in the indexer.
- Any future "list a user's historical transactions/events with filters" feature
  (none in the current hot paths).

So GraphQL is a **small, deferred** piece; the migration is overwhelmingly gRPC.

> **Decisions-doc entry to add on execution:** "2026-07-XX — Adopt Sui gRPC Core
> API as default transport, GraphQL for historical queries. JSON-RPC deprecated
> by Sui." (append to `/docs/decisions.md` in the existing format.)

---

## 3. Current surface inventory

Two server-side JSON-RPC client singletons + dapp-kit in the browser. No legacy
`@mysten/sui.js`, no `getFullnodeUrl`, no WebSocket `subscribeEvent/Transaction`
anywhere.

| Client | Where | Transport today | Consumers |
|---|---|---|---|
| `getSuiClient()` | [`walrus-client/src/index.ts:36`](../packages/walrus-client/src/index.ts#L36) | `SuiJsonRpcClient` | control-plane, gateway, worker jobs, `WalrusClient`, gas-pool |
| `getSuiClientForSeal()` | `seal-client/src/index.ts:41` | `SuiJsonRpcClient` (separate singleton) | `SealClient`, `SessionKey` |
| `createSuiGrpcClient()` | [`worker/src/indexer/sui-grpc.client.provider.ts:40`](../apps/worker/src/indexer/sui-grpc.client.provider.ts#L40) | **`SuiGrpcClient`** ✅ | indexer only |
| dapp-kit `useSuiClient()` | dashboard `providers.tsx` | `SuiJsonRpcClient` (wrapped) | browser reads, `waitForTransaction`, browser Seal |

**JSON-RPC methods actually called** (source only; ops scripts folded in):

| Method | Sites (representative) | Category |
|---|---|---|
| `getObject` | walrus-client reads, control-plane buckets/agents/knowledge/prepare/admin, gas-pool | **response-shape break** |
| `getDynamicFields` / `getDynamicFieldObject` | `readPoolUsedEncodedBytes` (walrus-client) | rename + **shape break** |
| `getCoins` | gas-pool, ops scripts | rename→`listCoins` + shape |
| `getBalance` | ops scripts | shape tweak |
| `getLatestSuiSystemState` | billing pool-renewal | rename→`getCurrentSystemState` + shape |
| `signAndExecuteTransaction` | gas-pool, archive jobs, ops scripts, dashboard sponsor | **survives**, option/result-shape change |
| `waitForTransaction` | dashboard sponsor, ops scripts | survives, include-shape change |
| `queryEvents` | move-sdk **tests only** | **→ GraphQL** |
| `getNormalizedMoveModulesByPackage` | move-sdk **tests only** | →`getMoveFunction`/`movePackageService` |

Full call-site list lives in the inventory that seeded this doc; the hot paths
are: gas-pool (every server signing flow), object-bytes `tx.build` (every S3
GET), control-plane per-request `getObject`, and indexer `getCheckpoint`
(already gRPC).

---

## 4. SDK compatibility — verified against installed versions

Checked the actual `.d.mts` of the pinned packages, not just the docs:

- `@mysten/sui@2.16.2` exports `./grpc`, `./graphql`, `./jsonRpc`, `./client`
  (Core types). `SuiGrpcClient` exposes both `client.core.*` (transport-agnostic)
  and native `ledgerService` / `stateService` / `movePackageService` /
  `subscriptionService` / `transactionExecutionService` / `nameService`.
- `@mysten/walrus@1.1.6`: `WalrusClientConfig.suiClient: ClientWithCoreApi`.
  → **accepts `SuiGrpcClient`.**
- `@mysten/seal@1.1.3`: `SealCompatibleClient = ClientWithExtensions<{ core: CoreClient }>`.
  → **accepts `SuiGrpcClient`.**

**Conclusion:** we can hand a `SuiGrpcClient` to both `WalrusClient` and
`SealClient` with zero changes inside those wrappers. The only thing that changes
in `walrus-client` / `seal-client` is the client we construct and the handful of
raw `getObject`/`getDynamicField` reads we do ourselves (§5.3).

**Core API surface available on the shared client** (from `client/core.d.mts`):
`getObject`, `getObjects`, `listOwnedObjects`, `listCoins`, `listBalances`,
`getBalance`, `getDynamicField`, `getDynamicObjectField`, `listDynamicFields`,
`getCoinMetadata`, `getCurrentSystemState`, `getReferenceGasPrice`,
`getProtocolConfig`, `getMoveFunction`, `getTransaction`, `simulateTransaction`,
`executeTransaction`, `signAndExecuteTransaction`, `waitForTransaction`,
`getChainIdentifier`, `verifyZkLoginSignature`. **No** `queryEvents`,
`getDynamicFieldObject`, `getCoins`, or `getLatestSuiSystemState` — those are the
renames/removals below.

---

## 5. The three categories of change

### 5.1 Client construction (mechanical)

Replace the JSON-RPC constructor. For **unary** workloads (control-plane,
gateway, seal — no long-lived streams) the simple constructor is fine: the
default `SuiGrpcClient` uses a `GrpcWebFetchTransport` (gRPC-**Web**, fetch-based)
and **I verified live that it works against the public testnet fullnode** — a
`core.getReferenceGasPrice()` returned `{ referenceGasPrice: "1000" }` in ~300ms
and `core.getCurrentSystemState()` returned epoch `1155`. **Only the indexer
needs the `@grpc/grpc-js` keepalive transport** (already has it) because it holds
a `subscribeCheckpoints` stream open; the unary services must **not** copy that.

```ts
// packages/walrus-client/src/index.ts
// OLD
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
_suiClient = new SuiJsonRpcClient({ network: "testnet", url: SUI_TESTNET_RPC });

// NEW
import { SuiGrpcClient } from "@mysten/sui/grpc";
_suiClient = new SuiGrpcClient({ network: "testnet", baseUrl: SUI_TESTNET_GRPC });
```

- `url` → `baseUrl`. Same host is fine (`https://fullnode.testnet.sui.io:443`);
  add a `SUI_TESTNET_GRPC` constant (can alias the same value) so the naming is
  honest.
- Type annotations `SuiJsonRpcClient` → `SuiGrpcClient` (or better,
  `ClientWithCoreApi` where we only touch `.core`, to stay transport-agnostic).
- Same edit in `getSuiClientForSeal()`. **Consider collapsing the two singletons
  into one** while we're here — there's no reason for control-plane to hold two
  Sui clients.
- Dashboard: dapp-kit's `SuiClientProvider` must be pointed at a gRPC/GraphQL
  client. Verify the pinned `@mysten/dapp-kit@1.0.6` supports a gRPC client in
  `createNetworkConfig`; if not, this is the one place we may need a dapp-kit
  bump (confirm before assuming — see §10, Open Questions).

### 5.2 Method renames (mechanical, but shape-sensitive)

| JSON-RPC (today) | Core API / service (target) | Notes |
|---|---|---|
| `getDynamicFields({parentId, limit})` | `core.listDynamicFields({parentId, limit})` | result `.data` → `.dynamicFields`, entries reshaped |
| `getDynamicFieldObject({parentId, name})` | `core.getDynamicField({parentId, name})` | name is `{type, bcs}`; value is BCS |
| `getCoins({owner, coinType})` | `core.listCoins({owner, coinType})` | result `.data` → `.objects` (`Coin[]` with `balance`) |
| `getLatestSuiSystemState()` | `core.getCurrentSystemState()` | `sys.epoch` → `sys.systemState.epoch` |
| `getBalance({owner, coinType})` | `core.getBalance({owner, coinType})` | field names reshaped |
| `queryEvents({query, ...})` | **GraphQL** `events(filter:{...})` | test-only today |
| `getNormalizedMoveModulesByPackage(pkg)` | `core.getMoveFunction(...)` / `movePackageService.getPackage(pkg)` | test-only today |
| `signAndExecuteTransaction({...options})` | `core.signAndExecuteTransaction({...include})` | see 5.3 |
| `waitForTransaction({digest})` | `core.waitForTransaction({digest})` | include-shape change |

Concrete example (billing pool-renewal,
[`pool-renewal.processor.ts:169`](../apps/control-plane/src/billing/pool-renewal.processor.ts#L169)):

```ts
// OLD
const sys = await getSuiClient().getLatestSuiSystemState();
return Number(sys.epoch);
// NEW
const { systemState } = await getSuiClient().core.getCurrentSystemState();
return Number(systemState.epoch);
```

### 5.3 Response-shape breaks (the actual work)

This is where a naive "swap the client and fix red squiggles" fails silently at
runtime. Two families:

**(a) Object/dynamic-field content is now BCS, not JSON.**
Core `getObject` returns:

```ts
interface GetObjectResponse { object: {
  objectId; version; digest; owner; type;
  content: Uint8Array;              // BCS-encoded Move struct — when include:{content:true}
  json:    Record<string,unknown>;  // when include:{json:true} — "shape MAY vary across APIs"
} }
```

There is **no `res.data.content.dataType === "moveObject"` / `content.fields`**
anymore. Every helper that reads fields off an object must change. Affected:

- [`readPooledBlobRegisteredEpoch`](../packages/walrus-client/src/index.ts#L316),
  [`readPooledBlobEpochs`](../packages/walrus-client/src/index.ts#L338),
  [`readPoolUsedEncodedBytes`](../packages/walrus-client/src/index.ts#L275) —
  all read `.fields[...]` off a JSON moveObject today.
- Control-plane per-request `getObject` reads (buckets/agents/knowledge/prepare/
  admin) — audit each for whether it reads fields or just existence/owner.

**Do NOT hand-roll BCS schemas.** There's a first-class, generated helper for
exactly this — and kraterion already uses it. Three tiers, best first:

1. **Generated `MoveStruct` bindings (the idiomatic v2 way; already in this
   repo).** `@mysten/codegen` emits a `MoveStruct` per Move struct — see
   [`generated/kraterion/deps/walrus/storage_pool.ts`](../packages/kraterion-move-sdk/src/generated/kraterion/deps/walrus/storage_pool.ts)
   and the `MoveStruct` base in
   [`generated/utils/index.ts:161`](../packages/kraterion-move-sdk/src/generated/utils/index.ts#L161).
   Each generated struct gives you:
   - `Struct.get({ client, objectId, ... })` — **fetches _and_ BCS-parses in one
     call.** Internally it does `client.core.getObjects({ include: { content: true } })`
     then `this.parse(obj.content)`, returning the object plus a typed
     `.json`. So `readPooledBlobEpochs` becomes roughly:
     ```ts
     const { json } = await PooledBlob.get({ client: getSuiClient(), objectId });
     // json.registered_epoch: number; json.certified_epoch: Option<number> (real Option, not { vec: [] })
     ```
   - `Struct.getMany({ client, objectIds })` — batched version.
   - `Struct.parse(bytes)` — parse raw BCS bytes you already have (e.g. a dynamic
     field's `value.bcs`).

   This is correct and stable across gRPC/GraphQL/JSON-RPC, and it deletes the
   brittle hand-rolled `{ vec: [...] }` `Option` decoding and the `.fields[...]`
   casts we do today.

   **Coverage gap to close first:** codegen currently emits only the outer
   `StoragePool` shell (`{ id, version }`) — **not** `StoragePoolInnerV1` (the
   versioned dynamic-field struct holding `used_encoded_bytes`) nor Walrus's
   `PooledBlob` (holding `registered_epoch` / `certified_epoch`). Those are
   Walrus-internal types our Move package doesn't reference directly, so the
   generator skips them. **Action:** add those Walrus modules to the codegen
   input so `StoragePoolInnerV1` and `PooledBlob` are generated, then use
   `.parse()` / `.get()`. This is a codegen-config change, not hand-written BCS.
   (Note: `@mysten/walrus@1.1.6` ships its own generated contract bindings under
   `dist/contracts/walrus/*`, but they're not exported via its `package.json`
   and that version has no `storage_pool`/`pooled_blob` module — so we can't lean
   on the Walrus SDK's exports here; our own codegen is the right lever.)

2. **`include: { json: true }`** and read `res.object.json[...]`. The client
   decodes BCS→JSON for you — closest drop-in for the old `content.fields`. Fast
   to write, but the SDK **explicitly warns the JSON shape can differ across
   transports** (`u64` as string vs number, nested struct/Option naming).
   Acceptable for throwaway/ops paths; **not** for the walrus-client reads that
   feed the indexer's authoritative pool accounting — use tier 1 there.

3. **`@mysten/sui/bcs` `bcs.struct(...)`** — hand-define only the handful of
   fields you read. Escape hatch when you don't want to regenerate a whole
   module for one field. Last resort; tier 1 is preferred.

**Recommendation:** tier 1 for the walrus-client pool/blob reads (extend codegen
+ `.get()`/`.parse()`), tier 2 for loose ops-script reads where a value's exact
numeric type doesn't matter.

`getDynamicField` similarly returns `{ dynamicField: { value: { type, bcs }, ... } }`
— the value is `{ type, bcs }`, so `readPoolUsedEncodedBytes` parses the inner
struct's BCS. `listDynamicFields` returns `{ dynamicFields: DynamicFieldEntry[] }`
where each entry has `name: { type, bcs }` (not `{ type, value }`) — the
"find the first u64 key" logic must compare `entry.name.type === "u64"` and, if
it needs the value, decode `name.bcs`.

**(b) Transaction execution result shape.**
`signAndExecuteTransaction` survives on the Core API (verified: present on both
`core` and the gRPC client). The exact shapes, read off the installed
`client/types.d.mts` (no longer a guess):

- Options move from `options: { showEffects, showEvents, showObjectChanges }` to
  `include: { effects, events, objectChanges }`. You must pass
  `include: { effects: true }` to get effects at all.
- The result is a **discriminated union** on `$kind`, and status is a boolean:
  ```ts
  const res = await client.core.signAndExecuteTransaction({
    transaction: tx, signer, include: { effects: true },
  });
  const txr = res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
  if (!txr.effects.status.success) throw new Error("tx failed");
  const digest = txr.digest;
  ```
  So today's `r1.effects?.status?.status !== "success"` becomes
  `!txr.effects.status.success` after unwrapping `$kind`. (This is exactly the
  pattern the SDK's own `ParallelTransactionExecutor` uses internally.)

Affected: gas-pool
([`gas-pool.ts:212`](../packages/walrus-client/src/gas-pool.ts#L212),
[`:460`](../packages/walrus-client/src/gas-pool.ts#L460)), archive jobs
([`manifest-archive.ts:284`](../apps/worker/src/embeddings/manifest-archive.ts#L284)
`r1.effects?.status?.status !== "success"`, `:360`;
`session-archive.ts:389,463`), dashboard sponsor, and all ops scripts.

> **Note on `object-bytes` (verified):** its injected client is typed `any`
> ([`src/index.ts:46`](../packages/object-bytes/src/index.ts#L46)) and it only
> uses the client to `tx.build({ client, onlyTransactionKind: true })`. I
> confirmed in the installed SDK that the builder's resolver
> (`transactions/resolve.mjs:256`) resolves object versions via
> `client.core.getObjects(...)`, and the executors route through `client.core.*`
> — i.e. the whole build/resolve path is transport-agnostic. So **object-bytes,
> and every other `tx.build({ client })` site (prepare, runs, dashboard seal),
> needs no change** beyond receiving the new client. Good candidate to tighten
> the `any` to `ClientWithCoreApi` while we're here.

---

## 6. Execution plan (phased, ordered by risk-reduction)

Do this in dependency order so each phase is independently testable against live
testnet. **Do not** attempt a big-bang.

### Phase 0 — Prep & constants (30 min)
- Add `SUI_TESTNET_GRPC` (and later `SUI_TESTNET_GRAPHQL`) to
  `packages/shared/src/constants.ts`. gRPC host = `https://fullnode.testnet.sui.io:443`
  (same as today; confirm gRPC is served there — the indexer already proves it
  is). Keep `SUI_TESTNET_RPC` until every consumer is off it, then delete.
- GraphQL testnet host is `https://graphql.testnet.sui.io/graphql` (confirmed).
  Add as `SUI_TESTNET_GRAPHQL` — only needed for the test-only `queryEvents`.

### Phase 1 — `walrus-client` factory + its own reads (½–1 day, highest value)
This unblocks control-plane, gateway, worker, Walrus, and gas-pool in one shot.
1. Switch `getSuiClient()` to `SuiGrpcClient`.
2. Extend codegen to emit `StoragePoolInnerV1` + `PooledBlob` MoveStructs, then
   rewrite `readPooledBlobRegisteredEpoch`, `readPooledBlobEpochs`,
   `readPoolUsedEncodedBytes` using the generated `MoveStruct.get()` / `.parse()`
   helpers (§5.3 tier 1) over `core.getObject`/`core.getDynamicField`/
   `core.listDynamicFields`. **No hand-written BCS.**
3. Rewrite gas-pool: `getCoins`→`listCoins`, `getObject` shape,
   `signAndExecuteTransaction` include/result shape.
4. Test: run a gateway PUT + GET end-to-end against testnet (exercises Walrus
   register/certify PTB via gas-pool, and object-bytes decrypt).

### Phase 2 — `seal-client` factory (30 min)
- Switch `getSuiClientForSeal()` to `SuiGrpcClient` (or reuse the walrus-client
  singleton). Seal internals need nothing else.
- Test: a decrypt that fetches keys + builds the seal_approve PTB.

### Phase 3 — control-plane per-request reads (½ day)
- `SuiClientService` now wraps a `SuiGrpcClient`. Audit each `getObject` call
  (buckets/agents/knowledge/prepare/admin): most only check existence/owner/type
  — those are trivial shape fixes; any that read `.fields` get BCS parsing.
- `getLatestSuiSystemState`→`getCurrentSystemState` in pool-renewal.
- `tx.build({ client })` resolver paths (prepare, runs) — client swap only.
- Test: prepare-upload, presign, a Move admin call.

### Phase 4 — worker archive jobs (¼ day)
- `signAndExecuteTransaction` shape in manifest-archive & session-archive.
- Test: trigger a manifest/session archive job on testnet.

### Phase 5 — dashboard (browser) (~¼–½ day, **no dapp-kit upgrade needed**)
**Investigated: dapp-kit 2.x is _not_ required.** `@mysten/dapp-kit@1.0.6` types
are JSON-RPC-shaped (`useSuiClient(): SuiJsonRpcClient`, `createClient` returns
`SuiJsonRpcClient`), but I traced what the dashboard actually uses at runtime and
none of it needs JSON-RPC-specific surface:

- `SuiClientProvider` exposes a **`createClient` override** — we return a
  `SuiGrpcClient` from it (one `as unknown as SuiJsonRpcClient` cast at that
  boundary). `useSuiClient()` then yields the gRPC client everywhere.
- `useSignTransaction` (1.0.6) touches the client for exactly one thing:
  `transaction.toJSON({ client })` — transaction **resolution**, which runs
  through `client.core.*` (transport-agnostic, already verified). Signing is
  delegated to `@mysten/wallet-standard`. **No JSON-RPC-only call in the path.**
- `useSignPersonalMessage` uses only `network`, never the client.
- `useConnectWallet` / `useCurrentWallet` / `useWallets` / `useCurrentAccount` /
  `useAutoConnectWallet` / `useDisconnectWallet` touch no client.
- The dashboard's **only** direct call on `useSuiClient()` is
  `.waitForTransaction` (sponsor.ts) — which exists **top-level on
  `SuiGrpcClient`** (verified in `grpc/client.d.mts`, alongside `getObject` /
  `executeTransaction` / `signAndExecuteTransaction`).
- The dashboard does **not** use the JSON-RPC-typed `useSuiClientQuery` /
  `useSuiClientMutation` hooks, so the `SuiRpcMethods` method-map typing never
  bites.

**Work:** point the provider's `createClient` at a `SuiGrpcClient`
(`baseUrl: SUI_TESTNET_GRPC`); cast at the boundary; fix `seal.ts` `tx.build`
(client instance only — transport-agnostic) and any `waitForTransaction` /
response-shape reads in `sponsor.ts` / `Inspector.tsx`. No dependency bump, no
supply-chain approval.

**When v2 _would_ be forced (fallback, not expected):** only if end-to-end
testing surfaces a dapp-kit **internal** path calling a JSON-RPC-only method
during connect/sign — none is visible in the hooks the dashboard uses. If that
happens, the escape hatch is `@mysten/dapp-kit@2.x` (new instance-based
`createDAppKit({ createClient: () => new SuiGrpcClient(...) })` API) — a
major-version bump needing approval + a provider/hook refactor. Treat as
contingency; **validate the sign+sponsor flow end-to-end before concluding
either way.**

**Sequencing:** server-side (Phases 1–4) is fully independent — ship those first
to restore the API, then do this.

### Phase 6 — ops scripts + move-sdk tests (¼ day, lowest priority)
- `apps/gateway/scripts/*`, `apps/control-plane/scripts/enoki-live-smoke.ts`:
  same signAndExecute/getObject/getCoins/getBalance shape fixes. These aren't hot
  paths; fix as encountered.
- move-sdk tests: `queryEvents`→GraphQL `events`,
  `getNormalizedMoveModulesByPackage`→`movePackageService.getPackage` /
  `core.getMoveFunction`. Add a tiny `SuiGraphQLClient` here — this is the only
  GraphQL we need day one.

### Phase 7 — cleanup
- Delete `SUI_TESTNET_RPC` and any `SuiJsonRpcClient` / `@mysten/sui/jsonRpc`
  imports. Grep for `jsonRpc` to confirm zero remaining.
- Append `/docs/progress.md` (`[migration]` tag), `/docs/decisions.md`, and a
  `/docs/runbook.md` entry keyed on the actual failing error strings we saw.

---

## 7. Endpoint & configuration changes

- **gRPC:** `https://fullnode.testnet.sui.io:443` — same host as JSON-RPC today.
  Env override already exists for the worker (`SUI_GRPC_HOST`); extend the same
  env convention to the other services.
- **GraphQL:** `https://graphql.testnet.sui.io/graphql` (confirmed).
- **Production (mainnet) note — do this before mainnet cutover, not now:** the
  public `fullnode.*.sui.io` endpoints are **development-grade and rate-limited**.
  Mysten documents the public gRPC limit as **100 requests / 30 seconds**
  (~3.3 rps) — tighter than the worker's current self-cap assumption; re-check the
  indexer's concurrency cap against this. For production traffic we will need a
  **dedicated RPC provider** offering gRPC + GraphQL (Triton, Chainstack, Ankr,
  GetBlock all advertise Sui gRPC ahead of the July 2026 sunset) or self-hosted.
  Track as a separate infra task; out of scope for restoring testnet.

---

## 8. Risks & gotchas

- **Silent BCS mis-reads (highest risk).** If we take the `json:true` shortcut on
  the walrus-client pool reads, `u64` values may come back as `number` vs
  `string` and Option fields may reshape — the indexer's pool accounting would
  drift without erroring. **Use BCS parsing on those paths.** Add an assertion
  test that a known PooledBlob decodes to the expected epochs.
- **`signAndExecuteTransaction` result status.** Getting the new status field
  wrong means we'd treat a failed tx as success (or vice-versa). Verify against
  the `TransactionResult` type and a real failing tx (e.g. intentionally
  under-budget gas) before shipping the gas-pool change.
- **gRPC-Web vs native gRPC in Node.** The simple `SuiGrpcClient({ baseUrl })`
  uses a fetch-based gRPC-Web transport — fine for unary calls in control-plane/
  gateway. Do **not** copy the worker's `@grpc/grpc-js` keepalive transport to
  the unary services; it's only needed for the long-lived checkpoint stream, and
  dragging it in adds a native dep to every service.
- **dapp-kit browser (investigated — no upgrade needed, one residual test).**
  `@mysten/dapp-kit@1.0.6` is JSON-RPC-*typed*, but the dashboard's actual usage
  works with a `SuiGrpcClient` injected via the provider's `createClient`
  override (see Phase 5). The **one residual risk** is a dapp-kit *internal*
  path calling a JSON-RPC-only method during connect/sign — not visible in the
  hooks used, but **must be confirmed by an end-to-end sign+sponsor test**. Only
  if that fails do we need the `@mysten/dapp-kit@2.x` bump (which would require
  supply-chain approval). No bump is planned.
- **Two Sui client singletons.** control-plane holds both `getSuiClient()` and
  `getSuiClientForSeal()`. Migrate both; ideally collapse to one.
- **Regenerated bindings.** No Move source changes here, so the move-sdk
  generation step is untouched — but run `pnpm typecheck` at the root after each
  phase; the generated `utils/index.ts` already imports `ClientWithCoreApi` from
  `@mysten/sui/client`, so the codegen is transport-agnostic and should just
  compile.
- **`getDynamicFields` pagination cursor.** Cursors are not portable from
  JSON-RPC — don't persist any old cursor across the switch (we don't appear to).
- **No `queryEvents` on gRPC.** Anything that reaches for historical event
  queries must go through GraphQL. Today that's test-only; keep it that way for
  hot paths (use the indexer's DB instead).

---

## 9. Testing & validation

Migrate-then-prove, per phase, against **live testnet** (there's no staging
chain):

1. **Typecheck gate:** `pnpm typecheck` at root after every phase. The Core API
   types are strict enough that most shape breaks surface here — but **not** the
   BCS-content ones (content is `Uint8Array`, so the compiler won't catch a wrong
   parse).
2. **Gateway round-trip:** PUT an object → GET it back decrypted. Exercises
   gas-pool signing, Walrus register/certify, object-bytes decrypt, Seal. This is
   the single best smoke test — if it passes, Phases 1–2 are good.
3. **Control-plane:** create bucket, prepare-upload, presign, one admin Move
   call.
4. **Worker:** trigger a manifest archive + a session archive job; confirm the
   two PTBs land and status parses correctly.
5. **Billing:** run one pool-renewal tick; confirm `getCurrentSystemState` epoch
   read.
6. **Indexer:** unchanged, but confirm it still ingests (regression guard).
7. Add a unit test that decodes a fixture PooledBlob's BCS content to the
   expected `{registered, certified}` epochs — guards the highest-risk change.

The existing ops scripts (`smoke-pool-roundtrip.ts`, `walrus-pool-baseline.ts`)
are good manual validators once ported.

---

## 10. Open questions (resolve before/while executing)

1. **dapp-kit (answered):** no v2 upgrade needed — inject a `SuiGrpcClient` via
   the 1.0.6 `SuiClientProvider` `createClient` override (Phase 5). Only residual
   open item: **run the sign+sponsor flow end-to-end** to confirm no dapp-kit
   internal JSON-RPC-only call; v2 is the contingency if that test fails.
2. **GraphQL testnet host (answered):** `https://graphql.testnet.sui.io/graphql`
   (only needed for the test-only `queryEvents`; not on any hot path).
3. **BCS parsing (answered):** use the generated `MoveStruct` `.get()`/`.parse()`
   helpers (§5.3, tier 1), **not** hand-rolled BCS. Coverage gap confirmed:
   codegen emits only the outer `StoragePool` shell today — extend the codegen
   input to also generate `StoragePoolInnerV1` and `PooledBlob` before rewriting
   `readPoolUsedEncodedBytes` / `readPooledBlob*`.
4. **`signAndExecuteTransaction` result (answered):** unwrap the `$kind`
   discriminated union, then `txr.effects.status.success` (boolean); pass
   `include: { effects: true }`. See §5.3(b).
5. **Collapse the two client singletons?** (walrus-client + seal-client) — yes if
   no reason not to.
6. **Production RPC provider** for mainnet (separate infra task, before
   2026-07-20 mainnet sunset; public gRPC is 100 req/30s).

### Verified during research (were assumptions, now facts)
- ✅ Default gRPC-Web `SuiGrpcClient` **works live** against
  `fullnode.testnet.sui.io:443` for unary calls — simple constructor is enough
  for control-plane/gateway/seal; grpc-js is worker-stream-only.
- ✅ `tx.build({ client })` / the transaction resolver is transport-agnostic
  (`client.core.getObjects`) — no change needed at any build site.
- ✅ `signAndExecuteTransaction` option/result shapes (§5.3b).
- ✅ Walrus/Seal accept the gRPC client (§4).
- ✅ Codegen coverage gap for `StoragePoolInnerV1` / `PooledBlob` (§5.3, #3).
- ✅ dapp-kit 1.0.6 works via `createClient` override — **no v2 upgrade needed**;
  its wallet/sign hooks don't call JSON-RPC-only methods (Phase 5).
- ✅ GraphQL testnet host: `https://graphql.testnet.sui.io/graphql`.

---

## Appendix — sources

- [JSON-RPC Migration (Sui docs)](https://docs.sui.io/develop/accessing-data/json-rpc-migration)
- [TS SDK: Migrating from JSON-RPC](https://sdk.mystenlabs.com/sui/migrations/sui-2.0/json-rpc-migration)
- [TS SDK: Sui Clients (Core API / ClientWithCoreApi)](https://sdk.mystenlabs.com/sui/clients)
- [gRPC Overview (Sui docs)](https://docs.sui.io/concepts/data-access/grpc-overview)
- [GraphQL for Sui RPC](https://docs.sui.io/develop/accessing-data/graphql/graphql-rpc)
- Installed type sources verified in-repo:
  `@mysten/sui@2.16.2` (`dist/client/core.d.mts`, `dist/client/types.d.mts`,
  `dist/grpc/client.d.mts`), `@mysten/walrus@1.1.6` (`dist/types.d.mts`),
  `@mysten/seal@1.1.3` (`dist/types.d.mts`).
- In-repo reference implementation: `apps/worker/src/indexer/` (already on gRPC).
</content>
</invoke>
