/// On-chain events emitted by the Kraterion package.
///
/// All events are read by the off-chain indexer (Postgres) to materialize the
/// authoritative view of buckets, objects, access lists, and visibility flips.
/// None of the events carry a `timestamp_ms`: the indexer reads the executed-at
/// timestamp from the transaction effects when ingesting the event, which is
/// authoritative and saves a `Clock` parameter on every entry function.
///
/// The visibility of these structs is `public(package)`-friendly via the
/// public emit helpers: only this package's modules call `emit_*`, but the
/// struct definitions are public so off-chain SDK consumers can decode them.
module kraterion::events;

use sui::event;

public struct KraterionBucketCreated has copy, drop {
    bucket_id: ID,
    owner: address,
    name: vector<u8>,
    encryption_mode: u8,
}

// `KraterionObjectCreated` and `KraterionObjectExtended` (the SharedBlob-
// era events) were removed at the storage-pool migration. The pool path
// emits `KraterionPooledBlobRegistered` / `KraterionPooledBlobCertified`
// / `KraterionPooledBlobDeleted` / `KraterionPoolExtended` instead — see
// the "Pool vault events" section below.

public struct ApiAccessGranted has copy, drop {
    bucket_id: ID,
    owner: address,
    granted_to: address,
}

public struct ApiAccessRevoked has copy, drop {
    bucket_id: ID,
    owner: address,
}

public struct BucketVisibilityChanged has copy, drop {
    bucket_id: ID,
    owner: address,
    old_mode: u8,
    new_mode: u8,
}

public struct ReserveCreated has copy, drop {
    reserve_id: ID,
    admin: address,
}

public struct ReserveCallerAuthorized has copy, drop {
    reserve_id: ID,
    admin: address,
    caller: address,
}

public struct ReserveCallerDeauthorized has copy, drop {
    reserve_id: ID,
    admin: address,
    caller: address,
}

public struct ReserveFunded has copy, drop {
    reserve_id: ID,
    amount: u64,
}

public struct ReserveWithdrawn has copy, drop {
    reserve_id: ID,
    admin: address,
    recipient: address,
    amount: u64,
}

// === Pool vault events (Phase C — storage pool migration) ===
//
// `KraterionVaultCreated` mirrors `KraterionBucketCreated`: tells the indexer
// "a new platform-managed storage pool exists, tied to this project".
//
// `KraterionPooledBlobRegistered` and `KraterionPooledBlobCertified` carry the
// same plaintext-side metadata `KraterionObjectCreated` did under the
// SharedBlob model (s3_key, content_type, seal_identity, size_bytes,
// etag_md5) so the indexer doesn't have to subscribe to Walrus's own
// events. `pooled_blob_object_id` is included so the gateway and indexer
// can address the blob without an extra `pool::blob_object_id` RPC.
//
// `KraterionPooledBlobDeleted` is emitted for both explicit S3 DELETE and
// for overwrite-DELETE (the second leg of an overwriting PUT).
//
// `KraterionPoolExtended` / `KraterionPoolResizedGrow` track lifecycle ops
// so the indexer's `StoragePool` row stays in sync with on-chain state.
// We do NOT emit a `Resized_shrink` event — the v1 admin endpoint can read
// the new `reserved_encoded_bytes` directly from the pool object after
// the shrink tx settles.

public struct KraterionVaultCreated has copy, drop {
    vault_id: ID,
    pool_id: ID,
    created_by: address,
    /// Off-chain Postgres `Project.id` UUID (typically 16 bytes). Indexer
    /// uses this to associate the on-chain vault with its project row.
    project_id: vector<u8>,
    reserved_encoded_capacity_bytes: u64,
    start_epoch: u32,
    end_epoch: u32,
}

public struct KraterionVaultRevoked has copy, drop {
    vault_id: ID,
    revoked_by: address,
}

public struct KraterionPooledBlobRegistered has copy, drop {
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    /// The user who owns the project (vault.created_by) — recorded so
    /// downstream tooling doesn't have to dereference the vault.
    owner_address: address,
    /// The address that signed the registration tx (gateway operator).
    registered_by: address,
    /// 48-byte Seal IBE identity. Same format as the SharedBlob-era event
    /// (`bucket_uid (32) || object_uuid (16)`); pool membership is
    /// orthogonal to encryption identity.
    seal_identity: vector<u8>,
    /// Plaintext size — what S3 GET reports as Content-Length.
    size_bytes: u64,
    /// 16-byte raw MD5 of plaintext. S3 ETag for non-multipart uploads.
    etag_md5: vector<u8>,
}

public struct KraterionPooledBlobCertified has copy, drop {
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    certified_by: address,
}

public struct KraterionPooledBlobDeleted has copy, drop {
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    deleted_by: address,
}

public struct KraterionPoolExtended has copy, drop {
    vault_id: ID,
    extended_epochs: u32,
    new_end_epoch: u32,
    extended_by: address,
}

public struct KraterionPoolResizedGrow has copy, drop {
    vault_id: ID,
    additional_encoded_capacity_bytes: u64,
    new_reserved_encoded_capacity_bytes: u64,
    resized_by: address,
}

/// Emitted on a scheduled downsize-at-renewal. The off-chain
/// `decrease_storage_pool_unused_capacity_by_percent` returns a
/// `Storage` reservation receipt (pre-paid Walrus capacity); we
/// transfer it to `@0x0` to abandon it back to the network rather
/// than build inter-pool reuse logic. The receipt's pre-paid epochs
/// pass through without us reusing them — that's the accepted cost
/// of the model. See `/docs/decisions.md` "Pool lifetime tracks
/// billing cycle".
public struct KraterionPoolResizedShrink has copy, drop {
    vault_id: ID,
    /// Percent of unused capacity that was decreased — Walrus's
    /// `decrease_storage_pool_unused_capacity_by_percent` takes a
    /// `u8` 1..=100; we mirror.
    percent_shrunk: u8,
    new_reserved_encoded_capacity_bytes: u64,
    resized_by: address,
}

/// Anchors an agent session's execution trace on chain. The trace itself
/// lives in a Walrus PooledBlob (registered by the companion
/// `register_blob` call composed in the same PTB); this event ties the
/// blob to an off-chain session and commits the canonical-JSON hash so
/// readers can verify integrity without decrypting.
///
/// One session, one anchor: multi-turn conversations buffer in Postgres
/// during the session and flush as a single blob + single event when the
/// session goes idle (default 10 min) or hits a size/age cap. The tx
/// digest of the emitting transaction is the replay handle.
///
/// Open/close timestamps are intentionally NOT in this event — the
/// `AgentSession` Postgres row carries them, and they're inside the
/// trace blob itself.
public struct KraterionSessionAnchored has copy, drop {
    vault_id: ID,
    /// PooledBlob object id resolved from the pool at emit time. Same
    /// value the companion `KraterionPooledBlobRegistered` event carries
    /// for the same blob_id.
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    /// 48-byte Seal IBE identity. `bucket_uid (32) || session_uuid (16)`
    /// — mirrors the standard pattern so the existing `seal_approve`
    /// policy gates decryption without a new entry.
    seal_identity: vector<u8>,
    /// 32-byte SHA-256 of the canonical-JSON, plaintext trace bytes
    /// (recursively sorted keys, before Seal encryption and gzip).
    trace_hash: vector<u8>,
    /// 16-byte AgentSession UUID. Off-chain join key into the
    /// `AgentSession` Postgres row.
    session_id: vector<u8>,
    /// 16-byte KraterionAgent UUID.
    agent_id: vector<u8>,
    /// Number of distinct chat completions rolled into this session.
    invocation_count: u32,
    /// The address that signed the anchor tx (gateway operator).
    anchored_by: address,
}

public(package) fun emit_bucket_created(
    bucket_id: ID,
    owner: address,
    name: vector<u8>,
    encryption_mode: u8,
) {
    event::emit(KraterionBucketCreated { bucket_id, owner, name, encryption_mode });
}

// `emit_object_created` and `emit_object_extended` removed at the
// storage-pool migration. Use `emit_pooled_blob_registered` /
// `emit_pooled_blob_certified` / `emit_pooled_blob_deleted` /
// `emit_pool_extended` (defined further down) instead.

public(package) fun emit_api_access_granted(
    bucket_id: ID,
    owner: address,
    granted_to: address,
) {
    event::emit(ApiAccessGranted { bucket_id, owner, granted_to });
}

public(package) fun emit_api_access_revoked(bucket_id: ID, owner: address) {
    event::emit(ApiAccessRevoked { bucket_id, owner });
}

public(package) fun emit_bucket_visibility_changed(
    bucket_id: ID,
    owner: address,
    old_mode: u8,
    new_mode: u8,
) {
    event::emit(BucketVisibilityChanged { bucket_id, owner, old_mode, new_mode });
}

public(package) fun emit_reserve_created(reserve_id: ID, admin: address) {
    event::emit(ReserveCreated { reserve_id, admin });
}

public(package) fun emit_reserve_caller_authorized(
    reserve_id: ID,
    admin: address,
    caller: address,
) {
    event::emit(ReserveCallerAuthorized { reserve_id, admin, caller });
}

public(package) fun emit_reserve_caller_deauthorized(
    reserve_id: ID,
    admin: address,
    caller: address,
) {
    event::emit(ReserveCallerDeauthorized { reserve_id, admin, caller });
}

public(package) fun emit_reserve_funded(reserve_id: ID, amount: u64) {
    event::emit(ReserveFunded { reserve_id, amount });
}

public(package) fun emit_reserve_withdrawn(
    reserve_id: ID,
    admin: address,
    recipient: address,
    amount: u64,
) {
    event::emit(ReserveWithdrawn { reserve_id, admin, recipient, amount });
}

// === Pool vault emit helpers ===

public(package) fun emit_vault_created(
    vault_id: ID,
    pool_id: ID,
    created_by: address,
    project_id: vector<u8>,
    reserved_encoded_capacity_bytes: u64,
    start_epoch: u32,
    end_epoch: u32,
) {
    event::emit(KraterionVaultCreated {
        vault_id,
        pool_id,
        created_by,
        project_id,
        reserved_encoded_capacity_bytes,
        start_epoch,
        end_epoch,
    });
}

public(package) fun emit_vault_revoked(vault_id: ID, revoked_by: address) {
    event::emit(KraterionVaultRevoked { vault_id, revoked_by });
}

public(package) fun emit_pooled_blob_registered(
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    owner_address: address,
    registered_by: address,
    seal_identity: vector<u8>,
    size_bytes: u64,
    etag_md5: vector<u8>,
) {
    event::emit(KraterionPooledBlobRegistered {
        vault_id,
        pooled_blob_object_id,
        walrus_blob_id,
        s3_key,
        content_type,
        owner_address,
        registered_by,
        seal_identity,
        size_bytes,
        etag_md5,
    });
}

public(package) fun emit_pooled_blob_certified(
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    certified_by: address,
) {
    event::emit(KraterionPooledBlobCertified {
        vault_id,
        pooled_blob_object_id,
        walrus_blob_id,
        certified_by,
    });
}

public(package) fun emit_pooled_blob_deleted(
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    deleted_by: address,
) {
    event::emit(KraterionPooledBlobDeleted {
        vault_id,
        pooled_blob_object_id,
        walrus_blob_id,
        deleted_by,
    });
}

public(package) fun emit_pool_extended(
    vault_id: ID,
    extended_epochs: u32,
    new_end_epoch: u32,
    extended_by: address,
) {
    event::emit(KraterionPoolExtended {
        vault_id,
        extended_epochs,
        new_end_epoch,
        extended_by,
    });
}

public(package) fun emit_pool_resized_grow(
    vault_id: ID,
    additional_encoded_capacity_bytes: u64,
    new_reserved_encoded_capacity_bytes: u64,
    resized_by: address,
) {
    event::emit(KraterionPoolResizedGrow {
        vault_id,
        additional_encoded_capacity_bytes,
        new_reserved_encoded_capacity_bytes,
        resized_by,
    });
}

public(package) fun emit_pool_resized_shrink(
    vault_id: ID,
    percent_shrunk: u8,
    new_reserved_encoded_capacity_bytes: u64,
    resized_by: address,
) {
    event::emit(KraterionPoolResizedShrink {
        vault_id,
        percent_shrunk,
        new_reserved_encoded_capacity_bytes,
        resized_by,
    });
}

public(package) fun emit_session_anchored(
    vault_id: ID,
    pooled_blob_object_id: ID,
    walrus_blob_id: u256,
    seal_identity: vector<u8>,
    trace_hash: vector<u8>,
    session_id: vector<u8>,
    agent_id: vector<u8>,
    invocation_count: u32,
    anchored_by: address,
) {
    event::emit(KraterionSessionAnchored {
        vault_id,
        pooled_blob_object_id,
        walrus_blob_id,
        seal_identity,
        trace_hash,
        session_id,
        agent_id,
        invocation_count,
        anchored_by,
    });
}
