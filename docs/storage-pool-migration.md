# Kraterion — Storage Pool Migration Plan

**Status:** Draft v3 — foundation plan, not yet executed. Leaner v1 scope: owner-gated, no caps, no batching, with the WAL reserve.
**Author:** generated 2026-05-15, revised 2026-05-18 to cut non-essential complexity
**Scope:** Migrate Kraterion's Walrus integration from per-blob `SharedBlob` to per-project `StoragePool` + `PooledBlob`. Walrus integration only — **no billing work, no renewal worker in v1, no full cap system in v1**.
**Why this doc exists:** before billing can be designed (see [`/docs/monetization-and-billing.md`](monetization-and-billing.md)), the storage primitive needs to be the right shape and proven to work. This plan is the prerequisite.

---

## 0. TL;DR

Today every Kraterion S3 object is a Walrus `SharedBlob`, owned via a Kraterion Move policy, with its own `Storage` resource paid 53 epochs (~2 years) upfront in WAL. Per-blob renewal is expensive in gas; DELETE strands prepaid WAL; small files waste metadata. Walrus's `StoragePool` + `PooledBlob` primitive (added 2026-03-05, stable VERSION 1) solves all three: PUT increments a counter, DELETE decrements, renewal is one tx per pool every ~2 years, no fragmentation.

**v1 architecture (the lean version):**

- One **`KraterionPoolVault`** Move object per project (shared), holding a `walrus::storage_pool::StoragePool` inside it. Vault is created by the user (Enoki-sponsored zkLogin tx, one-time per project). User can `revoke_all()` or `take_pool()` to leave platform custody — on-chain enforceable.
- One **`PlatformReserve`** Move object (shared, global) extends our existing stub `reserve.move`. Holds bulk WAL. Vault entry functions debit it during PUT/extend/resize so operator wallets never need to hold WAL.
- **Authorization is an owner address**, not a capability system. Both the vault and the reserve store an `operator_address` field. Mutating entry functions assert `tx_sender == operator_address`. To rotate the operator wallet, the treasury wallet signs one `set_operator` tx on the reserve and the vaults read through it. (Cap system is the obvious v1.5 hardening — see §10.)
- **Two platform wallets, that's it.** One operator wallet (zero balance, Enoki-sponsored gas, KMS-held). One treasury wallet (holds bulk WAL, deposits to the reserve, signs rare rotations). No per-project wallets, no cap registry, no debit limits in Move yet.
- **No renewal worker in v1.** Pools created with `epochs_ahead = 53` (~2 years). Manual extend via admin endpoint if a beta pool gets close. Automated renewal is deferred Phase R.
- **No batched register/certify pipeline in v1.** Synchronous per-PUT register+certify. Adds gas per PUT but irrelevant at beta scale. Batched pipeline is deferred Phase J.
- **Hard reset at cutover.** No production users, no migration code, no co-existence. Publish a fresh testnet Move package, reset Postgres, rotate wallets, start clean.

**Engineering scope: ~3 weeks of one engineer.** Most of that is the TypeScript `PooledBlobClient` port from Rust (the `@mysten/walrus` TS SDK ships BCS + Move-call builders but no orchestration) and the gateway-write rewrite. The Move side is small (~250 lines across two modules). Schema is +3 tables, -2 columns.

**Critical pre-work: mainnet calibration sprint** — measure real gas costs, validate happy path. Walrus docs don't publish concrete numbers; we have to measure.

---

## 1. Where we are today (existing surface)

### 1.1 The current write path

`apps/gateway/src/s3/objects.write.controller.ts` (PUT) executes:

1. SigV4 verify → `request-context.ts`
2. Seal envelope encrypt via `@kraterion/seal-client`
3. Encode + upload ciphertext to Walrus via `packages/walrus-client` → `client.writeBlobToUploadRelay`
4. Build PTB calling `kraterion::register_blob_for_bucket` — registers Walrus blob + wraps as `SharedBlob` + records to user's `Bucket` + pays 53 epochs upfront
5. Wait for storage-node quorum
6. PTB calling `walrus::system::certify_blob`
7. Indexer's `object-created.handler.ts` writes `S3Object` row
8. Gateway `indexer-wait/` polls until row appears, returns 200

### 1.2 The current data model

- `S3Object`: `walrus_blob_id`, `shared_blob_object_id`, `storage_end_epoch`, `etag`, `seal_identity`, `size_bytes`
- `S3ObjectExtension`: per-object extend audit
- `SubWallet`: 5 roles (`publisher`, `renewal`, `api_decryption`, `knowledge_indexer`, `agent`)
- Events from `move/kraterion/sources/events.move`

### 1.3 The current Move package

- `kraterion.move` — bucket/object lifecycle, glue to SharedBlob
- `access.move` — `ApiAccessCap` pattern (user-revocable gateway access to buckets)
- `events.move` — every event the indexer subscribes to
- `reserve.move` — `PlatformReserve` stub (deferred/partial)

### 1.4 The TypeScript Walrus client

`packages/walrus-client/src/index.ts` — ~100 lines wrapping `@mysten/walrus`. Memoised SDK clients pointed at testnet, aggregator HTTP read, BCS utility.

### 1.5 What's not built

- Renewal worker — `apps/worker/src/renewal/` is a stub
- DELETE actually deleting — currently soft-mark only

---

## 2. Target architecture

### 2.1 What changes on-chain

- **One `KraterionPoolVault` per `Project`** (shared object), holding a `walrus::storage_pool::StoragePool` as a field. Created at first PUT by the user via Enoki-sponsored zkLogin tx.
- Each Kraterion `Bucket` is still a Move object owned by the user; its objects become `PooledBlob`s inside the vault's pool.
- **Authorization via `operator_address` field**, checked at entry-function boundary. Both vault and `PlatformReserve` store this. Treasury rotates it via `set_operator` when needed.
- **`PlatformReserve` (extended from stub)** holds bulk WAL on-chain. Vault entry fns debit it for write fees / extends / resizes.

### 2.2 What changes off-chain

| Concern | Today (SharedBlob) | Target (StoragePool, v1) |
|---|---|---|
| Per-PUT Sui txs | 2 (register PTB + certify PTB) | 2 (register_blob via vault + certify_blob via vault) |
| Register/certify batching | none | none in v1 (deferred to Phase J) |
| Renewal | Per-blob, would-have-been batched ~900/PTB | One tx per pool — **out of v1 scope**; pools created for max 53 epochs at creation, manual extend via admin |
| DELETE | Soft-mark only; SharedBlob can't be deleted | `delete_blob` via vault; counter decrements; capacity reusable |
| Capacity sizing | N/A | Manual via admin endpoint in v1; auto-grow is Phase J |
| Per-blob lifetime | Yes — 53 epochs from registration | No — all blobs in pool share `pool.end_epoch` |
| Operator wallet funds | Each project's `publisher` sub-wallet held SUI + WAL | Zero. WAL pulled from reserve, SUI sponsored by Enoki. |
| Wallet count | N (one per project) | 2 total (operator + treasury), regardless of customer count |

### 2.3 What doesn't change

- Seal envelope encryption
- User-owned bucket Move object
- API-access revocation (`ApiAccessCap`)
- S3 API surface
- Indexer architecture (gRPC checkpoint stream, dispatcher, handlers)
- Knowledge / agents layer

### 2.4 Critical architectural decisions

1. **Vault module + reserve, owner-gated, no caps in v1.** The Walrus `StoragePool` is stored inside a shared `KraterionPoolVault`. Mutating entry functions check `tx_sender == operator_address`. The `operator_address` lives on the `PlatformReserve` as the single source of truth — vault functions call `reserve::assert_operator(reserve, ctx)` instead of duplicating the check. To rotate the operator wallet, the treasury signs one `reserve::set_operator(new_addr)` tx; every vault picks it up automatically. **Caps come later** in v1.5 if/when we want fine-grained separation of duties (gateway vs renewer vs sizer) or daily debit limits.

2. **One pool per Project, not per Bucket.** A project can have many buckets; sharing one pool keeps slack overhead small. Per-bucket pools would waste WAL on small buckets.

3. **Hard reset at cutover. Pool-only, no legacy code paths.** When the migration is implemented and load-tested, we publish a fresh testnet Move package, `prisma migrate reset`, rotate sub-wallet seeds, start clean. No SharedBlob code path in v1. Justified because Kraterion has no production users; all on-chain state is throwaway testnet data. Logged in [`/docs/decisions.md`](decisions.md).

4. **No renewal worker in v1.** Pools created with `epochs_ahead = 53` (Walrus mainnet max, ~2 years). Full dev + beta runway before any pool risks expiry. Manual extend via admin endpoint covers edge cases. Full automated worker (Phase R) ships months later.

5. **No batched register/certify pipeline in v1.** Synchronous per-PUT register+certify, like today. Adds SUI gas per PUT (no amortization) but irrelevant at beta scale. Batching is Phase J; the gateway abstractions in v1 don't preclude adding it later.

6. **`PooledBlob.deletable = true` always.** Pool's `delete_pooled_blob` works; capacity is recyclable. The "permanent" guarantee of SharedBlob is preserved at the pool level (we promise to renew pools until project cancellation), not per-blob.

7. **No `PooledBlob → SharedBlob` promotion path.** Move has no such function; users who want permanent storage for a specific file use a future "Pin to permanent" feature that stores a separate `SharedBlob` copy (deferred).

8. **Walrus contracts pinned to VERSION 1 in `Move.toml`.** V2 migration is planned upstream; we don't want surprise breakage.

---

## 3. Critical pre-work: mainnet calibration

Two to three days before any production code. Gates the rest of the plan.

### 3.1 Measure real gas costs

Walrus docs say register/certify/extend are "size-independent, ~constant." They never publish numbers. We need:

- `pool_vault::register_blob` (wraps `register_pooled_blob`) gas at 1, 10, 100 blob sizes — same flow even though v1 doesn't batch
- `pool_vault::certify_blob` gas
- `pool_vault::create_vault` gas (one-time per project)
- `pool_vault::extend` gas at various pool sizes
- `pool_vault::delete_blob` gas
- `pool_vault::resize_grow` / `resize_shrink` gas
- `reserve::debit` gas (small, but composed into every PUT)

Procedure: run on **mainnet** (testnet gas profile differs), capture `effects.gasUsed` from `getTransactionBlock`. Document in `/docs/walrus-calibration.md` (new). Pin numbers in `packages/shared/src/walrus-constants.ts`.

### 3.2 Validate happy path end-to-end

In a throwaway script (`scripts/walrus-pool-smoke.ts`):
1. Deposit WAL into `PlatformReserve` from treasury
2. Create a vault (100 MB pool, 10 epochs ahead) signed by a test "user" key
3. Register + certify 10 blobs of varied sizes (1 KB, 1 MB, 100 MB) — signed by operator, WAL debited from reserve
4. Read them back via aggregator
5. Delete 5 — verify `used_encoded_bytes` decreased
6. Extend pool by 5 epochs
7. Shrink unused capacity by 50% — returned Storage destroyed
8. Call `revoke_all` from the test "user" key — verify next register fails
9. Call `take_pool` — verify caller now owns a bare `StoragePool`

If any step fails: triage before proceeding.

### 3.3 Sanity-check the indexer event schema

Subscribe a throwaway indexer to mainnet, generate events, verify schema. Capture sample event payloads in test fixtures.

### 3.4 Exit criteria

- Calibration doc committed
- Constants pinned
- Smoke script runs end-to-end on mainnet
- Indexer schema verified
- Decision logged in [`/docs/decisions.md`](decisions.md): "go on pool migration"

If calibration reveals a blocker (gas too high, etc.), this plan returns to design with new numbers.

---

## 4. Phased implementation

Phases A, B, C can run in parallel by different people; D–H are sequential.

### Phase A — Calibration (3 days)

Per §3.

### Phase B — TypeScript pool client (1 week)

**Location:** expand `packages/walrus-client/src/`.

Add a `PooledBlobClient` class mirroring the Rust `SuiContractClient` pool methods. Internals use existing `@mysten/walrus` `WalrusClient` for the data path (encode, upload to relay) and the SDK's generated Move-call builders for PTB construction.

Functions to implement:

```ts
class PooledBlobClient {
  async createVault(
    projectMoveObjectId: string,
    reservedBytes: bigint,
    epochsAhead: number,
    operatorAddress: string,
    userSigner: Signer,              // user's zkLogin signs; Enoki sponsors gas
  ): Promise<{ vaultId: string; poolId: string; txDigest: string }>;

  async registerBlob(
    vaultId: string,
    blobMeta: BlobMetadata,
    operatorSigner: Signer,          // Enoki-sponsored
  ): Promise<{ pooledBlobObjectId: string; txDigest: string }>;

  async certifyBlob(
    vaultId: string,
    blobId: bigint,
    confirmation: ConfirmationCertificate,
    operatorSigner: Signer,
  ): Promise<{ txDigest: string }>;

  async deleteBlob(vaultId: string, blobId: bigint, operatorSigner: Signer): Promise<{ txDigest: string }>;

  async extendPool(vaultId: string, additionalEpochs: number, operatorSigner: Signer): Promise<{ txDigest: string }>;

  async resizeGrow(vaultId: string, additionalBytes: bigint, operatorSigner: Signer): Promise<{ txDigest: string }>;

  async resizeShrink(vaultId: string, percent: number, operatorSigner: Signer): Promise<{ storageObjectId: string; txDigest: string }>;

  async getVaultStatus(vaultId: string): Promise<VaultStatus>;
}
```

Implementation notes:
- Use the SDK's `storage_pool.ts` and `system.ts` generated builders directly. Don't reinvent BCS encoding.
- Reimplement price-computation from `crates/walrus-sui/src/client/transaction_builder/pooled_blob_ops.rs`. Note that v1 calls our vault wrapper, not Walrus's entry functions directly, so PTB shape includes the vault + reserve as inputs.
- `VaultStatus` reads via `suix_getObject` and parses the dynamic-field-stored `StoragePoolInnerV1` + our vault fields.
- Tests: mocked SuiClient unit tests; integration tests against testnet.

**Reference Rust implementation:** ~500 lines in `MystenLabs/walrus/crates/walrus-sui/src/client/pooled_blob_ops.rs` + `transaction_builder/pooled_blob_ops.rs`. Adapt — we route through our vault, so the shape is similar but the function targets are different.

Exit criteria: `pnpm test --filter @kraterion/walrus-client` passes; can `createVault` + register + certify + delete on testnet from a script.

### Phase C — Move package extension (1 week)

**Location:** `move/kraterion/sources/`. Two modules to write/extend.

**1. `reserve.move` — promote from stub.** Add to whatever exists today:

```move
struct PlatformReserve has key {
  id: UID,
  wal: Balance<WAL>,
  operator_address: address,    // single rotation point for all platform ops
  admin_address: address,       // treasury — can deposit, can set_operator
  version: u64,
}

// Debit — called by vault entry fns. Asserts sender is the operator.
public fun debit(reserve: &mut PlatformReserve, amount: u64, ctx: &mut TxContext): Coin<WAL> {
  assert_operator(reserve, ctx);
  coin::take(&mut reserve.wal, amount, ctx)
}

// Pure-check helper for entry fns that don't pull WAL but still need operator auth (certify, delete)
public fun assert_operator(reserve: &PlatformReserve, ctx: &TxContext) {
  assert!(tx_context::sender(ctx) == reserve.operator_address, ENotOperator);
}

// Admin: treasury signs
public fun deposit(reserve: &mut PlatformReserve, coin: Coin<WAL>) { ... }
public fun set_operator(reserve: &mut PlatformReserve, new: address, ctx: &mut TxContext) {
  assert!(tx_context::sender(ctx) == reserve.admin_address, ENotAdmin);
  reserve.operator_address = new;
}
public fun set_admin(reserve: &mut PlatformReserve, new: address, ctx: &mut TxContext) { ... }
```

**2. `pool_vault.move` — new module.**

```move
struct KraterionPoolVault has key {
  id: UID,
  project_id: ID,
  pool: StoragePool,                // Walrus pool stored inside us
  revoked_by_user: bool,
}

// Created by user via Enoki-sponsored zkLogin tx at project setup.
// reserve is debited for the initial pool storage cost.
public fun create_vault(
  project: &Project,
  system: &mut System,
  reserve: &mut PlatformReserve,
  initial_capacity_bytes: u64,
  epochs_ahead: u32,
  ctx: &mut TxContext,
) {
  let storage_cost = compute_pool_cost(initial_capacity_bytes, epochs_ahead);
  let payment = reserve::debit(reserve, storage_cost, ctx);
  let pool = system::create_storage_pool(system, initial_capacity_bytes, epochs_ahead, &mut payment, ctx);
  coin::destroy_zero(payment);
  transfer::share_object(KraterionPoolVault {
    id: object::new(ctx), project_id: object::id(project), pool, revoked_by_user: false,
  });
}

// Platform entry fns. Each checks: not user-revoked, sender is operator (via reserve).
// Fee operations also debit reserve.
public fun register_blob(
  vault: &mut KraterionPoolVault,
  reserve: &mut PlatformReserve,
  system: &mut System,
  blob_id: u256, root_hash: u256, unencoded_size: u64, encoding_type: u8, deletable: bool,
  ctx: &mut TxContext,
) {
  assert!(!vault.revoked_by_user, EUserRevoked);
  let write_fee = compute_write_fee(unencoded_size, encoding_type);
  let payment = reserve::debit(reserve, write_fee, ctx);   // also asserts operator
  system::register_pooled_blob(system, &mut vault.pool, blob_id, root_hash, unencoded_size, encoding_type, deletable, &mut payment, ctx);
  coin::destroy_zero(payment);
}

public fun certify_blob(vault: &mut KraterionPoolVault, reserve: &PlatformReserve, system: &mut System, blob_id, signature, signers_bitmap, message, ctx) {
  assert!(!vault.revoked_by_user, EUserRevoked);
  reserve::assert_operator(reserve, ctx);                  // no fee, just auth
  system::certify_pooled_blob(system, &mut vault.pool, blob_id, signature, signers_bitmap, message);
}

public fun delete_blob(vault: &mut KraterionPoolVault, reserve: &PlatformReserve, system: &System, blob_id, ctx) { ... }

public fun extend(vault: &mut KraterionPoolVault, reserve: &mut PlatformReserve, system: &mut System, epochs: u32, ctx) { ... }

public fun resize_grow(vault: &mut KraterionPoolVault, reserve: &mut PlatformReserve, system: &mut System, additional_bytes: u64, ctx) { ... }

public fun resize_shrink(vault: &mut KraterionPoolVault, reserve: &PlatformReserve, system: &mut System, percent: u8, ctx): Storage {
  reserve::assert_operator(reserve, ctx);
  // returned Storage handed to caller (or transferred to admin); v1: just transfer to admin_address
  ...
}

// User-only — project ownership check
public fun revoke_all(vault: &mut KraterionPoolVault, project: &Project, ctx: &mut TxContext) {
  assert_project_owner(project, ctx);
  vault.revoked_by_user = true;
}

public fun take_pool(vault: KraterionPoolVault, project: &Project, ctx: &mut TxContext): StoragePool {
  assert_project_owner(project, ctx);
  let KraterionPoolVault { id, pool, .. } = vault;
  object::delete(id);
  pool                                                     // user receives the bare StoragePool to self-custody
}
```

**Events** in `events.move`:
- `KraterionVaultCreated(project_id, vault_id, pool_id, reserved_bytes)`
- `KraterionVaultUserRevoked(vault_id)`
- `KraterionReserveDeposited(reserve_id, amount, by)` / `KraterionReserveDebited(reserve_id, amount, by)`
- `KraterionReserveOperatorRotated(reserve_id, old, new)`

Pool blob register/certify/delete/extend events come from Walrus directly — we don't double-emit.

Generated TypeScript bindings rebuild automatically via Turbo (see [`/CLAUDE.md`](../CLAUDE.md)).

Exit criteria: `sui move test` green with coverage for happy paths + every assertion error + user-revoke + take_pool + operator rotation; `pnpm typecheck` green.

### Phase D — Schema migration (2 days)

**Location:** `prisma/schema.prisma`.

New tables:

```prisma
model StoragePool {
  // Mirrors KraterionPoolVault on-chain
  id                      String   @id @default(cuid())
  project_id              String   @unique
  vault_object_id         String   @unique   // KraterionPoolVault Sui ObjectID (shared)
  pool_object_id          String   @unique   // walrus::storage_pool::StoragePool ObjectID (held inside vault)
  reserved_encoded_bytes  BigInt
  used_encoded_bytes      BigInt   @default(0)
  blob_count              Int      @default(0)
  start_epoch             Int
  end_epoch               Int
  user_revoked            Boolean  @default(false)
  status                  String   @default("active")  // active | expired | destroyed | user_revoked
  created_at              DateTime @default(now())
  last_extended_at        DateTime?
  last_resized_at         DateTime?
  last_synced_at          DateTime @default(now())

  project                 Project  @relation(fields: [project_id], references: [id])
  pooled_blobs            PooledBlob[]
  pool_extensions         StoragePoolExtension[]

  @@index([end_epoch])
  @@index([status])
}

model PooledBlob {
  id                      String   @id @default(cuid())
  storage_pool_id         String
  s3_object_id            String   @unique
  walrus_blob_id          String                          // u256 as decimal string
  pooled_blob_object_id   String   @unique                // Sui ObjectID
  encoded_size_bytes      BigInt
  registered_epoch        Int
  certified_epoch         Int?
  status                  String   @default("registered") // registered | certified | deleted
  registered_at           DateTime @default(now())
  certified_at            DateTime?
  deleted_at              DateTime?

  storage_pool            StoragePool @relation(fields: [storage_pool_id], references: [id])
  s3_object               S3Object    @relation(fields: [s3_object_id], references: [id])

  @@index([storage_pool_id, status])
  @@index([walrus_blob_id])
}

model StoragePoolExtension {
  // Audit log for pool extensions and resizes
  id                  String   @id @default(cuid())
  storage_pool_id     String
  kind                String                              // 'extend' | 'resize_grow' | 'resize_shrink'
  prev_end_epoch      Int?
  new_end_epoch       Int?
  prev_reserved_bytes BigInt?
  new_reserved_bytes  BigInt?
  wal_cost_frost      BigInt   @default(0)
  tx_digest           String
  occurred_at         DateTime @default(now())
  storage_pool        StoragePool @relation(fields: [storage_pool_id], references: [id])
  @@index([storage_pool_id, occurred_at])
}
```

Modifications to existing tables:

- `S3Object`:
  - **Remove** `shared_blob_object_id`, `storage_end_epoch`
  - **Add** `pooled_blob_id String? @unique` (FK → `PooledBlob.id`)
  - **Add** `encoded_size_bytes BigInt` for accurate pool accounting

- `SubWallet`:
  - **Remove** `publisher` and `renewal` roles from the enum (they belonged to the per-project model that's gone)
  - **Add** `pool_operator` role (the single operator wallet) and `pool_treasury` role (the single treasury) — both global, not project-scoped
  - Remaining account-scoped roles (`api_decryption`, `knowledge_indexer`, `agent`) stay

No `PlatformReserve` / `PlatformCap` / `PlatformWallet` / `PlatformLedger` tables in v1. Reserve state is read on-chain by admin endpoints when needed; the two operator/treasury wallets are env-var-addressed; cap rotation history lives in `decisions.md` until v1.5.

Because we hard-reset at cutover:

```bash
pnpm prisma migrate reset
pnpm prisma migrate dev --name p7_storage_pools
```

### Phase E — Gateway write path (1 week)

**Location:** `apps/gateway/src/s3/objects.write.controller.ts` + new `apps/gateway/src/s3/pool-upload.service.ts`.

Refactor the PUT flow, keeping it synchronous (no in-process batching in v1):

1. **Encode + relay-upload** stays the same.
2. **Bootstrap path** — if the project has no `StoragePool` row, the gateway returns 409 with a guidance payload directing the dashboard to surface a one-time "preparing your project" flow. The dashboard calls a control-plane endpoint that builds an Enoki-sponsored PTB calling `kraterion::pool_vault::create_vault(...)` from the user's zkLogin address. The user's signature is required exactly here, once per project. Once the indexer writes the `StoragePool` row, PUT is retryable.
3. **Capacity check** — if `reserved - used < incoming_total`, the gateway calls a control-plane endpoint that triggers `pool_vault::resize_grow` via the operator wallet (Enoki-sponsored, WAL from reserve). Wait for indexer ack, then continue.
4. **Build register PTB.** Inputs: the project's `KraterionPoolVault` (shared, from `StoragePool.vault_object_id`), the global `PlatformReserve` (shared, from env config), Walrus `System` (shared). Signed by the operator wallet content; Enoki signs gas.
5. **Write `PooledBlob` row with `status='registered'`**, placeholder `S3Object` row.
6. **Wait for storage-node quorum certificates** (existing flow).
7. **Build certify PTB.** Inputs: vault + reserve (read-only here) + System. Signed by operator, Enoki sponsors gas. Update `PooledBlob.status='certified'`.
8. **Return 200** once indexer-wait confirms (existing pattern).

No batching means SUI gas is roughly 2× what a batched flow would cost. Acceptable at beta scale (tens to hundreds of PUTs/day). When traffic warrants Phase J, the synchronous endpoint becomes a thin wrapper over a batched queue without changing the API contract.

**Treasury check before each PUT:** read `PlatformReserve.wal_balance` from on-chain (cached, 60s TTL). Abort with 503 if below 30-day projection threshold. Alert ops.

### Phase F — Gateway read path (2 days)

**Location:** `apps/gateway/src/s3/objects.read.controller.ts` + `object-bytes.service.ts`.

Mostly unchanged. `readBlobByBlobId` works against the aggregator regardless of whether the blob is in a pool or SharedBlob. One change: add `X-Kraterion-Storage-Kind: pooled` HEAD response header for operational debugging.

Decryption (Seal session, key resolution) unchanged. PooledBlobs use the same `seal_identity` scheme as SharedBlobs.

### Phase G — Gateway delete path (2 days)

**Location:** `apps/gateway/src/s3/objects.write.controller.ts` (DELETE handler).

Today: soft-mark only. For pool blobs:

1. Mark `S3Object.status='delete_pending'`, `PooledBlob.status='delete_pending'`.
2. Build a `pool_vault::delete_blob` PTB. Inputs: vault, reserve (read-only for auth), Walrus System. Operator-signed, Enoki-sponsored.
3. On success: `S3Object.status='deleted'`, `PooledBlob.status='deleted'`, indexer event confirms.
4. On failure: retry queue; alert on repeated failure.

### Phase H — Indexer event handlers (3 days)

**Location:** `apps/worker/src/indexer/handlers/`.

Add 7 new handlers (5 for Walrus events, 2 for our vault events):

- `kraterion-vault-created.handler.ts` — on `KraterionVaultCreated`, insert `StoragePool` row
- `kraterion-vault-user-revoked.handler.ts` — on `KraterionVaultUserRevoked`, set `user_revoked=true, status='user_revoked'`
- `pooled-blob-registered.handler.ts` — on `walrus::events::PooledBlobRegistered` filtered to vaults we know, update `PooledBlob.status='registered'`
- `pooled-blob-certified.handler.ts` — on `PooledBlobCertified`, update `PooledBlob.status='certified'`, `S3Object.status='active'`. This is what `indexer-wait/` waits for.
- `pooled-blob-deleted.handler.ts` — on `PooledBlobDeleted`, finalise delete state
- `storage-pool-extended.handler.ts` — on `StoragePoolExtended`, update `StoragePool.end_epoch`, write `StoragePoolExtension` row
- `kraterion-reserve-debited.handler.ts` — on `KraterionReserveDebited`, log for ops dashboards (no row write — fire-and-forget)

Capacity changes don't have dedicated Walrus events; we write capacity to DB from the gateway/control-plane code when we initiate them (we know).

Wire into `dispatcher.service.ts`. Add subscriptions in `run-loop.ts`.

### Phase I — Operational tooling (2 days)

**Location:** `apps/control-plane/src/admin/` (new module).

Admin-only endpoints (auth-gated):

- `GET /admin/pools` — list all pools, status, used/reserved, end_epoch
- `GET /admin/pools/:id` — full state, recent extension history
- `POST /admin/pools/:id/extend?epochs=N` — manual extend via operator wallet
- `POST /admin/pools/:id/resize?delta_bytes=N` — manual resize
- `GET /admin/reserve` — `PlatformReserve` balance (read on-chain)
- `POST /admin/reserve/rotate-operator` — emits the `set_operator` tx via treasury wallet
- `POST /admin/reserve/deposit?amount_frost=N` — emits a deposit tx (also via treasury)

Plus a CLI: `pnpm kraterion-pool <subcommand>` in `scripts/` for one-offs.

### Phase J — Batching pipeline (DEFERRED, not v1)

When traffic warrants amortising per-PUT SUI gas. Wraps Phase E's synchronous endpoints in a 200ms batching queue. No schema change; gateway internals only.

### Phase K — End-to-end testing + load test (3 days)

**Location:** `apps/worker/test/`, new `scripts/load-test/`.

- Integration tests: vault create → register → certify → delete → extend → resize → revoke → take_pool
- Smoke test: 1000 PUTs against a single project, 200 DELETEs, verify pool state matches DB
- Load test: 1000 PUTs at sustained throughput (smaller than original 10k because no batching in v1), measure latency + gas burn rate vs calibration estimates
- Chaos test: kill the gateway mid-PUT, verify the PUT either completes or fails cleanly with no orphan rows
- Hard-reset rehearsal: full reset + reseed + smoke against a staging deployment

Exit criteria for the migration overall: load test passes, no orphan rows DB vs on-chain, 24h continuous run with zero flakes.

---

## 5. Cutover — hard reset

We're in active development with no production users. The cleanest path is a full reset. Steps, after Phase K exits green:

1. **Publish a fresh testnet Move package.** `scripts/setup-testnet.sh --force` with the new sources from Phase C. Capture new package ID in `Published.toml`. Old package becomes unreferenced.
2. **Drop the database.** `pnpm prisma migrate reset --force` against testnet Postgres. All `Account`, `Project`, `Bucket`, `S3Object`, `SubWallet`, `ApiKey`, `KraterionAgent` rows go.
3. **Rotate sub-wallet seeds.** New `SubWallet` rows on first use, new keys, new addresses. Old sub-wallets' SUI/WAL balances abandoned (testnet — no economic loss).
4. **Deploy two platform wallets.** New operator + treasury keypairs, persisted as `SubWallet(role='pool_operator')` and `SubWallet(role='pool_treasury')` rows. Operator address loaded into env vars and into the freshly-created `PlatformReserve.operator_address` on first treasury-signed init tx.
5. **Initial reserve deposit.** Treasury signs a `reserve::deposit` tx with enough WAL for ~30 days of projected dev/beta usage.
6. **Reseed dev fixtures.** Re-run `scripts/setup-testnet.sh` for at least one dev account/project/bucket so devs can exercise the new system.
7. **Verify indexer cursor.** `IndexerCursor` rows empty post-reset; indexer starts fresh against the new package's events.
8. **Run the smoke test against the reset deployment.** Same script from Phase A — must round-trip via the pool path.
9. **Delete legacy code in a follow-up commit.** Anything referencing `SharedBlob`, `shared_blob_object_id`, `register_blob_for_bucket`, old register/extend handlers. Hackathon code preserved in git history.

Logged in [`/docs/decisions.md`](decisions.md) as a single dated entry.

**No rollback path.** If Phase K passes but a regression appears post-cutover: fix forward, not revert.

---

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Walrus releases `StoragePool` v2 with breaking changes | Migration breaks | Pin `Move.toml` to V1; subscribe to MystenLabs/walrus releases; allocate 1 week for v2 migration when it ships |
| TS SDK pool support proves insufficient | Need more low-level Sui RPC | Phase B includes a deep port of the Rust impl; allocated 1 week, may take less if SDK is enough |
| Gas costs exceed calibration estimates by 5× | Storage pricing model becomes loss-making | Phase A is gating; if numbers fail we redesign before any code is written |
| Operator wallet key compromised | Attacker can drain `PlatformReserve` until rotation | (1) Enoki rate-limits sponsored tx per move-call target; (2) treasury can rotate operator in one tx; (3) reserve balance bounded by 30-day projection per §4.5 of [`/docs/monetization-and-billing.md`](monetization-and-billing.md). **v1.5 hardens with `ReserveDebitCap.daily_limit_frost` on-chain.** |
| Treasury wallet key compromised | Attacker mints unlimited debit access, drains reserve | Cold/multisig key in production; testnet uses single key with limited float. Logged in `decisions.md` as a v1 risk we accept on testnet. |
| User revokes mid-PUT batch | In-flight register fails | Revoke check in entry fn aborts cleanly; gateway returns 503 for any subsequent PUT; dashboard surfaces the state. Read path keeps working. |
| Indexer falls behind | `PooledBlob.status` stuck in `registered`, gateway 504s | Existing `indexer-wait/` polling has a timeout fallback — no new mitigation needed |
| Beta pool nears end_epoch before Phase R ships | Blobs in that pool would expire | Pools created with `epochs_ahead=53` give ~2-year runway. Alert when any pool's `end_epoch − current < 12`. Manual extend via admin endpoint covers gaps until Phase R. |
| Synchronous PUT path is slow at scale | Higher gas cost / higher 99p latency | Phase J adds batching when needed; v1 abstractions don't preclude it |
| Reserve runs dry mid-operation | PUT/extend/resize fails with `EInsufficientBalance` | Treasury monitors balance daily; tops up before reaching 30-day projection floor |

---

## 7. Out of scope

- **Billing system** — owned by [`/docs/monetization-and-billing.md`](monetization-and-billing.md). This doc deliberately doesn't touch pricing, meters, or Stripe.
- **Quilt small-file batching** — margin optimisation for sub-64 KiB files. Not needed for the foundation.
- **Per-bucket storage classes** — future enhancement after billing.
- **Cross-project pool sharing** — defeats the user-ownership model; explicitly not planned.
- **Snapshot / PITR** — Walrus doesn't natively support this; needs separate design.

---

## 8. Implementation timeline

Sequenced for one engineer, ~3 weeks of focused work. Phases B and C run in parallel.

| Week | Work | Exit |
|---|---|---|
| 1 (Mon–Wed) | A — Mainnet calibration | Numbers pinned, smoke script green |
| 1 (Thu–Fri) + 2 (early) | B — TypeScript pool client | `pnpm test @kraterion/walrus-client` green |
| 1–2 (parallel) | C — Move package extension (vault + reserve, owner-gated) | `sui move test` green |
| 2 (mid) | D — Schema migration (clean rewrite) | `prisma migrate reset && migrate dev` clean |
| 2 (late) + 3 (early) | E — Gateway write path (synchronous, no batching) | Pool PUT round-trips against testnet |
| 3 (early) | F + G — Read + delete paths | Round-trips clean |
| 3 (mid) | H — Indexer handlers | All 7 new events handled, dispatcher wired |
| 3 (mid) | I — Operational tooling | Admin endpoints + CLI green |
| 3 (late) | K — E2E + load tests + hard-reset rehearsal | Green |
| Deferred | J — Batched register/certify pipeline | Ship when PUT volume warrants it |
| Deferred | R — Automated pool renewal worker | Ship before any v1 pool reaches end_epoch < 12 |

**Total: 3 weeks** if everything goes smoothly; budget 5 weeks for unknowns (TS SDK port + Move auth wiring through reserve).

---

## 9. Open questions

To resolve before or during Phase A.

1. **Initial pool size for new projects.** 10 GB? 50 GB? Larger = less resize friction; higher reserve drain for inactive users. Lean: 10 GB matches the billing free-band.
2. **Vault creation — user-signed or proxied?** Lean is user-signed via Enoki-sponsored zkLogin at project setup. Preserves on-chain ownership story. Alternative: server-side proxy creation that immediately transfers ownership metadata — simpler but worse story. Decide in Phase A.
3. **What happens on `revoke_all`?** Gateway loses ability to PUT/DELETE/extend/resize. Reads still work. UX: warning before revoke; "migrating to self-custody?" prompt; option to call `take_pool()` as next step.
4. **`Move.toml` pin — by published-package-id or git commit?** Published-package-id cleaner but only works post-V2 deploy. Git commit pin fragile. Lean: published-package-id once V1 is mainnet-stable.
5. **`seal_identity` format for PooledBlob.** Today `[bucket_uid (32) || object_uuid (16)]`. Should be unchanged. Confirm in Phase A.
6. **`PlatformReserve.admin_address` for treasury on testnet.** Single Kraterion-held key for now? Sui native multisig from day one? Lean: single key on testnet, multisig before mainnet.
7. **Phase R trigger.** Any pool reaches `end_epoch − current < 12` epochs (~6 months). Document this watch criterion in the runbook.

---

## 10. v1.5 hardening (deferred)

Items intentionally NOT in v1, layered in later when product needs them. Each is additive — no v1 rework when added.

### 10.1 Capability system (replaces owner-address auth)

Replace `operator_address` + `assert_operator` with a cap-based pattern:

- `PlatformGatewayCap`, `PlatformRenewCap`, `PlatformSizerCap` — three separate caps for separation of duties
- `ReserveAdminCap` mints them; freely transferable
- Vault entry fns take `&PlatformGatewayCap` etc. instead of relying on reserve's sender check
- Enables multiple holder wallets per cap kind (sharding/HA), independent rotation per kind, audit trail

**Why deferred:** owner-address auth is functionally sufficient; caps are operational hygiene. Adds ~150 lines Move + a `PlatformCap` audit table. Ship when we want HA across multiple operator wallets or have a real separation-of-duties policy.

### 10.2 `ReserveDebitCap` with daily limits

Today's reserve has no on-chain rate limit. Compromised operator key can drain it up to the reserve balance (~30-day float). Defense in depth via:

- Per-purpose debit caps (`write_fee`, `extend`, `resize_grow`, `vault_create`)
- Each cap has `daily_limit_frost`, `spent_today_frost`, `last_reset_epoch`
- Vault entry fns pull WAL via the matching cap; abort if limit hit

**Why deferred:** Enoki's per-target rate-limits already bound damage off-chain. On-chain limits add belt-and-suspenders.

### 10.3 `PlatformLedger` audit table

Off-chain mirror of every `KraterionReserveDebited` / cap-mint / rotation event. Powers reconciliation dashboards.

**Why deferred:** v1 reads on-chain events directly via the admin endpoints. Add the table when ops needs SQL-queryable history.

### 10.4 Batched register/certify (Phase J)

Already in the v1 plan as deferred. Adds in-process 200ms batch windows that amortise SUI gas across N PUTs.

**Why deferred:** beta-scale volume doesn't need it.

### 10.5 Automated renewal worker (Phase R)

Already in the v1 plan as deferred. Daily cron sweeping pools approaching `end_epoch`.

**Why deferred:** pools last ~2 years from creation; manual extend covers v1.

### 10.6 Capacity autoscaler

Reactive auto-grow when pool fills past 80%; periodic auto-shrink when pool slack persists. Today both are manual via the admin endpoint.

**Why deferred:** customer count is small enough to operate manually.

---

## 11. References

### Walrus pool primitive (verified against source)

- [`MystenLabs/walrus/contracts/walrus/sources/system/storage_pool.move`](https://github.com/MystenLabs/walrus/blob/main/contracts/walrus/sources/system/storage_pool.move) — 566 lines, VERSION 1
- [`MystenLabs/walrus/contracts/walrus/sources/system/system.move`](https://github.com/MystenLabs/walrus/blob/main/contracts/walrus/sources/system/system.move) — pool entry points lines 213–355
- [`MystenLabs/walrus/contracts/walrus/sources/system/events.move`](https://github.com/MystenLabs/walrus/blob/main/contracts/walrus/sources/system/events.move) — pool events lines 137–179
- [`MystenLabs/walrus/contracts/walrus/tests/system/storage_pool_tests.move`](https://github.com/MystenLabs/walrus/blob/main/contracts/walrus/tests/system/storage_pool_tests.move) — canonical PTB reference
- [`MystenLabs/walrus/crates/walrus-sui/src/client/pooled_blob_ops.rs`](https://github.com/MystenLabs/walrus/blob/main/crates/walrus-sui/src/client/pooled_blob_ops.rs) — Rust reference to port
- [`MystenLabs/walrus/crates/walrus-sui/src/client/transaction_builder/pooled_blob_ops.rs`](https://github.com/MystenLabs/walrus/blob/main/crates/walrus-sui/src/client/transaction_builder/pooled_blob_ops.rs) — PTB builders

### TypeScript SDK status

- `@mysten/walrus/dist/contracts/walrus/storage_pool.ts` — BCS codecs + Move-call builders (✓)
- `@mysten/walrus/dist/contracts/walrus/system.ts` — pool entry-point builders (✓)
- `@mysten/walrus/dist/client.ts` — **no** high-level pool methods (✗ — port from Rust)

### Kraterion internal docs

- [`/docs/implementation-plan.md`](implementation-plan.md) — master spec
- [`/docs/monetization-and-billing.md`](monetization-and-billing.md) — billing v3 (becomes v4 after this migration ships)
- [`/docs/decisions.md`](decisions.md) — log every non-obvious decision from this plan
- [`/docs/runbook.md`](runbook.md) — append entries for pool-specific debugging gotchas
- [`/CLAUDE.md`](../CLAUDE.md) — Move/TS bindings sync mechanics

### Walrus contract pinning

Set in `move/kraterion/Move.toml`:

```toml
[dependencies]
Walrus = { git = "https://github.com/MystenLabs/walrus.git", subdir = "contracts/walrus", rev = "<commit pinned to V1 stable>" }
```

Confirm commit during Phase A.

---

**End of plan.**

When Phase K passes, [`/docs/monetization-and-billing.md`](monetization-and-billing.md) gets a v4 rewrite around the proven primitive — and not before.
