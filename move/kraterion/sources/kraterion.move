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

// Walrus blob / shared_blob / storage_resource / system imports and
// the `PlatformReserve` import were removed at the storage-pool
// migration — paid blob operations now live in `kraterion::pool_vault`.
// This module is now bucket-lifecycle-only (create, share, grant /
// revoke API access, visibility flip).
use sui::tx_context::epoch;
use kraterion::events;

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

// Paid blob operations live in `kraterion::pool_vault`. The legacy
// SharedBlob entries (`register_blob_for_bucket`, `wrap_in_shared_blob`,
// `extend_blob_from_reserve`, `extend_shared_blob`) were removed at the
// storage-pool cutover. They emitted `KraterionObjectCreated` and
// `KraterionObjectExtended` events; those events are gone too — the
// pool path emits `KraterionPooledBlobRegistered` / `*Certified` /
// `*Deleted` / `KraterionPoolExtended` instead.

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
