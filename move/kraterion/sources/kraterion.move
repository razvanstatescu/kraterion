/// Kraterion on-chain bucket: a user-owned, shared Sui object that gates
/// who can read and write its files. Funding for paid operations comes
/// from a single platform-managed `kraterion::reserve::PlatformReserve` —
/// not from per-bucket pools.
///
/// Invariants:
///   - Every KraterionBucket is a Sui shared object. The API surface only
///     exposes creation paths that share atomically — no public function
///     returns a KraterionBucket value, so no caller can ever end up with
///     an unshared bucket.
///   - Authorization is enforced at the Move level via ctx.sender() checks.
///   - All files in a bucket share its encryption_mode; access policy is
///     bucket-scoped, not file-scoped.
///   - Encryption is always on at the gateway. The bucket's mode controls
///     who Seal will release shares to (see kraterion::access).
///   - Paid operations (register, extend) drain the platform reserve; both
///     require platform whitelist. Register additionally requires bucket
///     access.
///   - Permissionless paths stay open: anyone can use Walrus's native
///     `system::register_blob` (paying themselves) or
///     `shared_blob::extend` (draining the SharedBlob's own jar).
///
/// See /docs/implementation-plan.md §4 and the Move package design notes
/// in /docs/decisions.md.
module kraterion::kraterion;

use sui::tx_context::epoch;
use walrus::blob::{Self, Blob};
use walrus::shared_blob::{Self, SharedBlob};
use walrus::storage_resource::Storage;
use walrus::system::{Self as walrus_system, System};
use kraterion::events;
use kraterion::reserve::{Self, PlatformReserve};

// === Errors ===

const ENotOwner: u64 = 0;
const ENotAuthorized: u64 = 1;
const EUnknownEncryptionMode: u64 = 2;

// === Constants ===

const ENCRYPTION_MODE_PRIVATE: u8 = 0;
const ENCRYPTION_MODE_PUBLIC: u8 = 1;

// === Types ===

public struct KraterionBucket has key {
    id: UID,
    owner: address,
    name: vector<u8>,
    encryption_mode: u8,
    api_decryption_addresses: vector<address>,
    created_epoch: u64,
}

// === Mode constants — exposed as functions so other modules can refer to
// them without depending on a concrete value. ===

public fun encryption_mode_private(): u8 { ENCRYPTION_MODE_PRIVATE }
public fun encryption_mode_public(): u8 { ENCRYPTION_MODE_PUBLIC }

// === Read-only accessors ===

public fun owner(bucket: &KraterionBucket): address {
    bucket.owner
}

public fun name(bucket: &KraterionBucket): &vector<u8> {
    &bucket.name
}

public fun encryption_mode(bucket: &KraterionBucket): u8 {
    bucket.encryption_mode
}

public fun api_addresses(bucket: &KraterionBucket): &vector<address> {
    &bucket.api_decryption_addresses
}

public fun id(bucket: &KraterionBucket): &UID {
    &bucket.id
}

// === Constructors (always share atomically) ===

/// Create a bucket and share it. Sender becomes owner; api_decryption_addresses
/// is empty. Use `grant_api_access` afterwards before the gateway can write.
public fun create_and_share_bucket(
    name: vector<u8>,
    encryption_mode: u8,
    ctx: &mut TxContext,
) {
    assert_known_mode(encryption_mode);
    let bucket = new_bucket(name, encryption_mode, ctx);
    let bucket_id = object::id(&bucket);
    let owner = bucket.owner;
    let bucket_name = bucket.name;
    let mode = bucket.encryption_mode;
    transfer::share_object(bucket);
    events::emit_bucket_created(bucket_id, owner, bucket_name, mode);
}

/// Canonical control-plane path: create + grant API + share atomically. The
/// signer (the user via zkLogin) becomes owner; `api_addr` is added to the
/// authorized list before the bucket is shared, so the gateway can wrap
/// blobs into the bucket from the moment it's published.
public fun create_grant_and_share_bucket(
    name: vector<u8>,
    api_addr: address,
    encryption_mode: u8,
    ctx: &mut TxContext,
) {
    assert_known_mode(encryption_mode);
    let mut bucket = new_bucket(name, encryption_mode, ctx);
    bucket.api_decryption_addresses.push_back(api_addr);
    let bucket_id = object::id(&bucket);
    let owner = bucket.owner;
    let bucket_name = bucket.name;
    let mode = bucket.encryption_mode;
    transfer::share_object(bucket);
    events::emit_bucket_created(bucket_id, owner, bucket_name, mode);
    events::emit_api_access_granted(bucket_id, owner, api_addr);
}

/// Internal constructor. Returns an owned bucket; callers in this module
/// MUST share it before returning. Not exposed publicly so external callers
/// cannot end up with an unshared bucket.
fun new_bucket(
    name: vector<u8>,
    encryption_mode: u8,
    ctx: &mut TxContext,
): KraterionBucket {
    KraterionBucket {
        id: object::new(ctx),
        owner: ctx.sender(),
        name,
        encryption_mode,
        api_decryption_addresses: vector::empty<address>(),
        created_epoch: epoch(ctx),
    }
}

// === Access list management (owner-only) ===

/// Add `api_addr` to the bucket's API decryption list. Idempotent: if the
/// address is already present, this is a no-op (event still emitted so the
/// indexer can be permissive about duplicate grants).
public fun grant_api_access(
    bucket: &mut KraterionBucket,
    api_addr: address,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == bucket.owner, ENotOwner);
    if (!vector::contains(&bucket.api_decryption_addresses, &api_addr)) {
        bucket.api_decryption_addresses.push_back(api_addr);
    };
    events::emit_api_access_granted(object::id(bucket), bucket.owner, api_addr);
}

/// Clear the bucket's API decryption list. After this, the gateway can
/// neither read (Seal denies) nor write (wrap denies) into this bucket.
/// Only the owner retains access.
public fun revoke_all_api_access(
    bucket: &mut KraterionBucket,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == bucket.owner, ENotOwner);
    bucket.api_decryption_addresses = vector::empty<address>();
    events::emit_api_access_revoked(object::id(bucket), bucket.owner);
}

/// Owner-only flip between PRIVATE and PUBLIC. Affects all files in the
/// bucket immediately because the bucket's mode is what `seal_approve` reads
/// — no re-upload needed. Idempotent: if the new mode equals the current
/// mode, no event is emitted.
public fun set_bucket_visibility(
    bucket: &mut KraterionBucket,
    encryption_mode: u8,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == bucket.owner, ENotOwner);
    assert_known_mode(encryption_mode);
    if (bucket.encryption_mode != encryption_mode) {
        let old_mode = bucket.encryption_mode;
        bucket.encryption_mode = encryption_mode;
        events::emit_bucket_visibility_changed(
            object::id(bucket),
            bucket.owner,
            old_mode,
            encryption_mode,
        );
    }
}

// === Paid blob operations (drain the platform reserve) ===

/// Register a Walrus blob for a specific bucket, paying from the platform
/// reserve. Two access checks:
///   1. caller is on the reserve whitelist (admin or authorized_callers)
///   2. caller is authorized for the bucket (owner or api_decryption_addresses)
///
/// Pulls `payment_amount` WAL from the reserve, uses it for both the storage
/// reservation and the registration write payment, and returns any leftover
/// to the reserve. Returns the new `Blob` so the same PTB can compose it
/// further (e.g. immediately go to upload-relay or chain into wrap).
///
/// Caller-supplied parameters mirror Walrus's `reserve_space` +
/// `register_blob` flow:
///   - `storage_amount`: encoded blob size (post-RS encoding) in bytes
///   - `epochs_ahead`: number of Walrus epochs to keep the blob alive
///   - `blob_id`, `root_hash`, `size`, `encoding_type`: blob metadata the
///     SDK computes off-chain during local encoding
///   - `payment_amount`: budget pulled from reserve. Should over-estimate
///     storage + write cost; leftover is returned automatically.
public fun register_blob_for_bucket(
    reserve: &mut PlatformReserve,
    bucket: &KraterionBucket,
    system: &mut System,
    payment_amount: u64,
    storage_amount: u64,
    epochs_ahead: u32,
    blob_id: u256,
    root_hash: u256,
    size: u64,
    encoding_type: u8,
    ctx: &mut TxContext,
): Blob {
    // Check 1: caller must be authorized to spend the reserve.
    reserve::assert_caller_authorized(reserve, ctx);
    // Check 2: caller must be authorized to write into this bucket.
    assert_caller_authorized_for_bucket(bucket, ctx);

    let mut payment = reserve::pull_wal(reserve, payment_amount, ctx);
    let storage: Storage = walrus_system::reserve_space(
        system,
        storage_amount,
        epochs_ahead,
        &mut payment,
        ctx,
    );
    let new_blob = walrus_system::register_blob(
        system,
        storage,
        blob_id,
        root_hash,
        size,
        encoding_type,
        false, // deletable: kraterion blobs are non-deletable; lifecycle is via SharedBlob
        &mut payment,
        ctx,
    );

    // Return any leftover to the reserve.
    reserve::deposit_wal(reserve, payment);

    new_blob
}

/// Wrap an already-certified Walrus Blob into a SharedBlob attached to this
/// bucket. The SharedBlob is created with an **empty jar** — we don't pre-
/// fund storage extensions. Callers can extend later via either:
///   - `extend_blob_from_reserve` (paid by platform, whitelist-gated), or
///   - `walrus::shared_blob::extend` (drains the SharedBlob's own jar,
///     anyone can fund it via `walrus::shared_blob::fund`).
///
/// `seal_identity` is the 48-byte IBE identity the gateway minted at
/// PutObject time (`bucket_object_id (32) || object_uuid (16)`); it gets
/// included in the emitted event so the off-chain indexer can populate
/// `S3Object.seal_identity` without an out-of-band channel.
///
/// `size_bytes` is the PLAINTEXT byte count, not the Walrus blob's
/// (encrypted) size — that latter value is on the inner Blob and would
/// need a separate getter to surface. Plaintext size is what S3 GET
/// reports as `Content-Length`, so we capture it here authoritatively
/// for the indexer.
///
/// `storage_end_epoch` is read from the inner Blob's `Storage` resource
/// (no extra arg needed) and emitted with the event so the renewal
/// worker can scan by it without round-tripping through `getObject`.
///
/// Emits `KraterionObjectCreated`. Authorization: caller must be authorized
/// for the bucket (owner or api_decryption_addresses).
public fun wrap_in_shared_blob(
    bucket: &mut KraterionBucket,
    blob: Blob,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    seal_identity: vector<u8>,
    size_bytes: u64,
    ctx: &mut TxContext,
) {
    assert_caller_authorized_for_bucket(bucket, ctx);

    // Capture identifiers BEFORE moving `blob` into shared_blob::new.
    let walrus_blob_object_id = object::id(&blob);
    let walrus_blob_id = blob::blob_id(&blob);
    let storage_end_epoch = blob::end_epoch(&blob);

    // shared_blob::new shares the wrapped object internally with an empty
    // jar — no return. The off-chain indexer joins the SharedBlob's ID to
    // this event by transaction digest (created-objects list ↔ event payload).
    shared_blob::new(blob, ctx);

    events::emit_object_created(
        object::id(bucket),
        walrus_blob_object_id,
        walrus_blob_id,
        s3_key,
        content_type,
        bucket.owner,
        ctx.sender(),
        seal_identity,
        size_bytes,
        storage_end_epoch,
    );
}

/// Extend a SharedBlob's storage by `epochs` epochs, paying from the
/// platform reserve. Whitelist-gated only — no bucket access check, because
/// extending an already-existing SharedBlob doesn't create or modify a
/// bucket. The renewal worker uses this on its hourly scan loop.
///
/// `payment_amount` is pulled from the reserve and added to the SharedBlob's
/// jar; `walrus::shared_blob::extend` then drains the jar to extend storage.
/// Any leftover stays in the jar (acts as a tiny per-blob cushion).
public fun extend_blob_from_reserve(
    reserve: &mut PlatformReserve,
    shared: &mut SharedBlob,
    system: &mut System,
    payment_amount: u64,
    epochs: u32,
    ctx: &mut TxContext,
) {
    let payment = reserve::pull_wal(reserve, payment_amount, ctx);
    shared_blob::fund(shared, payment);

    let shared_blob_id = object::id(shared);
    shared_blob::extend(shared, system, epochs, ctx);

    events::emit_object_extended(shared_blob_id, epochs, ctx.sender());
}

/// Permissionless extend: drains the SharedBlob's own jar, no platform
/// involvement. Anyone can call. Provided so users can self-renew a blob
/// after they've called `walrus::shared_blob::fund(shared, coin)` from
/// their own wallet — useful for the cancellation-persistence demo.
public fun extend_shared_blob(
    shared: &mut SharedBlob,
    system: &mut System,
    epochs_ahead: u32,
    ctx: &mut TxContext,
) {
    let shared_blob_id = object::id(shared);
    shared_blob::extend(shared, system, epochs_ahead, ctx);
    events::emit_object_extended(shared_blob_id, epochs_ahead, ctx.sender());
}

// === Internal helpers ===

/// Bucket access policy: caller must be the owner or an address on
/// `api_decryption_addresses`. Public so `kraterion::access::seal_approve`
/// can reuse the same predicate for the read side.
public(package) fun assert_caller_authorized_for_bucket(
    bucket: &KraterionBucket,
    ctx: &TxContext,
) {
    let caller = ctx.sender();
    let is_owner = caller == bucket.owner;
    let is_api = vector::contains(&bucket.api_decryption_addresses, &caller);
    assert!(is_owner || is_api, ENotAuthorized);
}

fun assert_known_mode(mode: u8) {
    assert!(
        mode == ENCRYPTION_MODE_PRIVATE || mode == ENCRYPTION_MODE_PUBLIC,
        EUnknownEncryptionMode,
    );
}
