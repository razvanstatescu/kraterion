/// Per-project Walrus storage pool wrapper.
///
/// Each `KraterionPoolVault` is a shared Sui object that wraps one
/// `walrus::storage_pool::StoragePool` and gates access via two policies:
///
///   1. **Platform side** — the gateway (and other authorized operators on
///      the reserve whitelist) can register, certify, delete blobs, extend
///      and resize the pool. WAL for fees is pulled from the singleton
///      `PlatformReserve`. Gas is sponsored by Enoki off-chain. Platform
///      wallets hold no funds.
///   2. **User side** — the address recorded as `created_by` (the
///      project-owning user) can `revoke_all` to flip `platform_authorized`
///      to false, which makes every platform-side mutation abort. Reads
///      keep working (no platform call required).
///
/// `take_pool` (self-custody escape — user reclaims the bare Walrus pool to
/// their own wallet) is intentionally deferred to v1.5 along with the cap
/// system. v1 has `revoke_all` only.
///
/// Vault creation is platform-signed (the gateway operator submits the tx,
/// pulling WAL from the reserve to fund the initial pool storage). The
/// user's address is recorded via the `intended_owner` parameter — the
/// off-chain control plane attests to the binding via the zkLogin auth chain
/// before allowing a vault-create call for a given user. This matches the
/// existing trust model for `KraterionBucket.api_decryption_addresses` and
/// `reserve.admin`.
///
/// All blobs in the pool share `pool.end_epoch` — there is no per-blob
/// lifetime. Renewal is one tx for the whole pool every ~2 years
/// (v1 manual via admin endpoint; Phase R automates it).
///
/// All `PooledBlob`s are registered with `deletable: true` so DELETE and
/// overwrite-DELETE can free pool capacity. The pool-level renewal promise
/// preserves the "permanent storage" guarantee at the vault level instead
/// of per blob.
///
/// See /docs/storage-pool-migration.md for the migration design.
module kraterion::pool_vault;

use kraterion::events;
use kraterion::reserve::{Self, PlatformReserve};
use walrus::storage_pool::StoragePool;
use walrus::system::{Self as walrus_system, System};

// === Errors ===

const ENotOwner: u64 = 0;
const ERevoked: u64 = 1;

// === Types ===

public struct KraterionPoolVault has key {
    id: UID,
    /// The Walrus storage pool we mediate access to. Stored as a field so
    /// our shared-object wrapper can gate every mutation via Move's
    /// reference rules — the pool is never exposed as an owned object.
    pool: StoragePool,
    /// Sui address of the user who owns the project this vault serves.
    /// Used by `revoke_all` to gate user-side mutations. Recorded at
    /// creation from the `intended_owner` parameter; the off-chain
    /// control plane is responsible for binding this to the zkLogin
    /// session that triggered the create call.
    created_by: address,
    /// Off-chain project identifier (typically a 16-byte UUID matching
    /// the Postgres `Project.id` row). Emitted with `VaultCreated` so the
    /// indexer can join the on-chain vault to its project without an
    /// out-of-band lookup. Opaque to Move; we don't enforce a length.
    project_id: vector<u8>,
    /// User's kill-switch. `true` at creation; `revoke_all` flips it to
    /// `false`. Every platform-side mutation asserts this is `true`
    /// before doing anything else.
    platform_authorized: bool,
}

// === Read-only accessors ===

public fun created_by(vault: &KraterionPoolVault): address {
    vault.created_by
}

public fun project_id(vault: &KraterionPoolVault): &vector<u8> {
    &vault.project_id
}

public fun platform_authorized(vault: &KraterionPoolVault): bool {
    vault.platform_authorized
}

public fun pool(vault: &KraterionPoolVault): &StoragePool {
    &vault.pool
}

public fun id(vault: &KraterionPoolVault): &UID {
    &vault.id
}

// === Vault creation (platform-side, gateway-signed) ===

/// Create a per-project storage pool, wrap it in a vault, and share the
/// vault. Funded from the platform reserve. Caller must be on the reserve
/// whitelist (the gateway operator, in practice).
///
/// `intended_owner` is the Sui address of the user this vault is for. It's
/// recorded as `vault.created_by` and gates `revoke_all`. The off-chain
/// control plane MUST attest to the user/owner binding before allowing
/// this call — it's the same trust pattern as `bucket.api_decryption_addresses`.
///
/// `project_id` is the off-chain Postgres `Project.id` UUID (16 bytes
/// typically). Opaque to Move; the indexer uses it for the off-chain join.
///
/// `payment_budget_frost` is over-pulled from the reserve; leftover is
/// returned. Walrus's `create_storage_pool` cost is roughly
/// `reserved_encoded_bytes × storage_price_per_unit_size × epochs_ahead`
/// FROST; budget at least 2× that.
public fun create_vault(
    reserve: &mut PlatformReserve,
    system: &mut System,
    reserved_encoded_capacity_bytes: u64,
    epochs_ahead: u32,
    payment_budget_frost: u64,
    intended_owner: address,
    project_id: vector<u8>,
    ctx: &mut TxContext,
) {
    reserve::assert_caller_authorized(reserve, ctx);

    let mut payment = reserve::pull_wal(reserve, payment_budget_frost, ctx);
    let pool = walrus_system::create_storage_pool(
        system,
        reserved_encoded_capacity_bytes,
        epochs_ahead,
        &mut payment,
        ctx,
    );
    // Return leftover WAL to the reserve.
    reserve::deposit_wal(reserve, payment);

    let start_epoch = walrus::storage_pool::start_epoch(&pool);
    let end_epoch = walrus::storage_pool::end_epoch(&pool);
    let pool_object_id = walrus::storage_pool::object_id(&pool);

    let vault = KraterionPoolVault {
        id: object::new(ctx),
        pool,
        created_by: intended_owner,
        project_id,
        platform_authorized: true,
    };
    let vault_id = object::id(&vault);
    let pid_copy = vault.project_id;
    transfer::share_object(vault);

    events::emit_vault_created(
        vault_id,
        pool_object_id,
        intended_owner,
        pid_copy,
        reserved_encoded_capacity_bytes,
        start_epoch,
        end_epoch,
    );
}

// === Platform blob operations (gateway-signed, drain the reserve) ===

/// Register a Walrus blob into this vault's pool. Pulls the write fee from
/// the platform reserve. Two checks:
///   1. `vault.platform_authorized` is true (user hasn't revoked).
///   2. Caller is on the reserve whitelist.
///
/// Recovers the new `PooledBlob` object ID via the pool's `blob_object_id`
/// accessor and emits it in `PooledBlobRegistered` so the gateway can
/// proceed with the upload-relay POST without an extra RPC roundtrip.
///
/// `payment_budget_frost` is over-pulled; leftover returns to the reserve.
/// Blobs registered here are always `deletable: true` so DELETE and
/// overwrite-DELETE can free pool capacity.
public fun register_blob(
    vault: &mut KraterionPoolVault,
    reserve: &mut PlatformReserve,
    system: &mut System,
    blob_id: u256,
    root_hash: u256,
    unencoded_size: u64,
    encoding_type: u8,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    seal_identity: vector<u8>,
    size_bytes: u64,
    etag_md5: vector<u8>,
    payment_budget_frost: u64,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    let mut payment = reserve::pull_wal(reserve, payment_budget_frost, ctx);
    walrus_system::register_pooled_blob(
        system,
        &mut vault.pool,
        blob_id,
        root_hash,
        unencoded_size,
        encoding_type,
        true, // deletable — required for capacity recycling
        &mut payment,
        ctx,
    );
    reserve::deposit_wal(reserve, payment);

    // Recover the newly-created PooledBlob's object ID for the event.
    // Walrus stores the PooledBlob inside the pool's internal ObjectTable
    // — there's no return value to capture, but `blob_object_id` reads
    // it out by blob_id key.
    let pooled_blob_object_id = walrus::storage_pool::blob_object_id(&vault.pool, blob_id);

    events::emit_pooled_blob_registered(
        object::id(vault),
        pooled_blob_object_id,
        blob_id,
        s3_key,
        content_type,
        vault.created_by,
        ctx.sender(),
        seal_identity,
        size_bytes,
        etag_md5,
    );
}

/// Certify a previously-registered pooled blob. No fee — only the platform
/// auth + revocation check.
public fun certify_blob(
    vault: &mut KraterionPoolVault,
    reserve: &PlatformReserve,
    system: &System,
    blob_id: u256,
    signature: vector<u8>,
    signers_bitmap: vector<u8>,
    message: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    walrus_system::certify_pooled_blob(
        system,
        &mut vault.pool,
        blob_id,
        signature,
        signers_bitmap,
        message,
    );

    let pooled_blob_object_id = walrus::storage_pool::blob_object_id(&vault.pool, blob_id);
    events::emit_pooled_blob_certified(
        object::id(vault),
        pooled_blob_object_id,
        blob_id,
        ctx.sender(),
    );
}

/// Delete a pooled blob and free its encoded-capacity back into the pool.
/// Called for both explicit S3 DELETE and for overwrite-DELETE (PUT to an
/// existing s3_key). No fee.
public fun delete_blob(
    vault: &mut KraterionPoolVault,
    reserve: &PlatformReserve,
    system: &System,
    blob_id: u256,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    // Capture the PooledBlob's object ID BEFORE deletion (it'll be gone
    // from the pool's table after `delete_pooled_blob`).
    let pooled_blob_object_id = walrus::storage_pool::blob_object_id(&vault.pool, blob_id);

    walrus_system::delete_pooled_blob(system, &mut vault.pool, blob_id);

    events::emit_pooled_blob_deleted(
        object::id(vault),
        pooled_blob_object_id,
        blob_id,
        ctx.sender(),
    );
}

// === Pool lifecycle operations (gateway-signed) ===

/// Extend the pool's end_epoch by `extended_epochs`. Funded from the reserve.
/// In v1 this is called manually via the admin endpoint when a pool is
/// approaching expiry. Phase R automates it.
public fun extend(
    vault: &mut KraterionPoolVault,
    reserve: &mut PlatformReserve,
    system: &mut System,
    extended_epochs: u32,
    payment_budget_frost: u64,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    let mut payment = reserve::pull_wal(reserve, payment_budget_frost, ctx);
    walrus_system::extend_storage_pool(
        system,
        &mut vault.pool,
        extended_epochs,
        &mut payment,
    );
    reserve::deposit_wal(reserve, payment);

    let new_end_epoch = walrus::storage_pool::end_epoch(&vault.pool);
    events::emit_pool_extended(
        object::id(vault),
        extended_epochs,
        new_end_epoch,
        ctx.sender(),
    );
}

/// Shrink the pool's reserved capacity by `percent` of its **unused**
/// portion. Called by the pool-renewal worker when a customer has a
/// `PendingStorageDowngrade` past its effective_at — we shrink first,
/// then extend at the new smaller size in the same tx batch (or the
/// next renewal tick).
///
/// `percent` must be 1..=100. Walrus's
/// `decrease_storage_pool_unused_capacity_by_percent` returns the
/// freed reservation as a `Storage` object — pre-paid Walrus capacity
/// that can in theory be reused for another pool, but we don't have
/// the inter-pool reuse logic and don't want to build it. So we
/// transfer the `Storage` to `@0x0` and accept that the pre-paid
/// portion is abandoned to the network. The trade-off is documented
/// in `/docs/decisions.md` ("Pool lifetime tracks billing cycle") —
/// short pool lifetimes mean the abandoned slice is at most one
/// billing cycle's worth of WAL, far less than the previous "pay for
/// 2 years of unused capacity" gap.
///
/// Aborts:
///   - `ERevoked` if the user has revoked platform authorization.
///   - Caller must be on the reserve whitelist.
///   - Walrus aborts if `percent == 0` or the computed extract size
///     rounds to zero (e.g. nothing is unused).
public fun resize_shrink(
    vault: &mut KraterionPoolVault,
    reserve: &mut PlatformReserve,
    system: &mut System,
    percent: u8,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    let freed_storage = walrus_system::decrease_storage_pool_unused_capacity_by_percent(
        system,
        &mut vault.pool,
        percent,
        ctx,
    );

    walrus::storage_resource::destroy(freed_storage);

    let new_reserved_bytes = walrus::storage_pool::reserved_encoded_capacity_bytes(&vault.pool);
    events::emit_pool_resized_shrink(
        object::id(vault),
        percent,
        new_reserved_bytes,
        ctx.sender(),
    );
}

/// Grow the pool's reserved capacity by `additional_bytes`. Funded from the
/// reserve. v1: called manually via the admin endpoint when usage
/// approaches capacity. Phase J adds a reactive autoscaler.
public fun resize_grow(
    vault: &mut KraterionPoolVault,
    reserve: &mut PlatformReserve,
    system: &mut System,
    additional_encoded_capacity_bytes: u64,
    payment_budget_frost: u64,
    ctx: &mut TxContext,
) {
    assert!(vault.platform_authorized, ERevoked);
    reserve::assert_caller_authorized(reserve, ctx);

    let mut payment = reserve::pull_wal(reserve, payment_budget_frost, ctx);
    walrus_system::increase_storage_pool_capacity(
        system,
        &mut vault.pool,
        additional_encoded_capacity_bytes,
        &mut payment,
    );
    reserve::deposit_wal(reserve, payment);

    let new_reserved_bytes = walrus::storage_pool::reserved_encoded_capacity_bytes(&vault.pool);
    events::emit_pool_resized_grow(
        object::id(vault),
        additional_encoded_capacity_bytes,
        new_reserved_bytes,
        ctx.sender(),
    );
}

// === User-only operations ===

/// User-side kill switch. After this returns, every platform-side mutation
/// (`register_blob`, `certify_blob`, `delete_blob`, `extend`, `resize_grow`)
/// aborts with `ERevoked`. Reads (S3 GET path) continue working — they don't
/// touch the pool. Blobs already stored stay readable until the pool's
/// `end_epoch` passes; with no renewal possible they will eventually expire.
///
/// One-way in v1. v1.5 will add `take_pool` so users can self-custody after
/// revoking, plus an "unrevoke" path if they change their mind before the
/// pool expires.
///
/// Caller must be `vault.created_by`.
public fun revoke_all(vault: &mut KraterionPoolVault, ctx: &TxContext) {
    assert!(ctx.sender() == vault.created_by, ENotOwner);
    if (vault.platform_authorized) {
        vault.platform_authorized = false;
        events::emit_vault_revoked(object::id(vault), vault.created_by);
    }
}
