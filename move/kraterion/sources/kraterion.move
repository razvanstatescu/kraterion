/// Kraterion on-chain bucket: a user-owned, shared Sui object that pools
/// WAL funding for SharedBlobs and gates who can read / write its files.
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
///
/// See /docs/implementation-plan.md §4 and the Move package design notes
/// in /docs/decisions.md.
module kraterion::kraterion;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::tx_context::epoch;
use wal::wal::WAL;
use walrus::blob::{Self, Blob};
use walrus::shared_blob::{Self, SharedBlob};
use walrus::system::System;
use kraterion::events;

// === Errors ===

const ENotOwner: u64 = 0;
const ENotAuthorized: u64 = 1;
const EInsufficientFunds: u64 = 2;
const EUnknownEncryptionMode: u64 = 3;

// === Constants ===

const ENCRYPTION_MODE_PRIVATE: u8 = 0;
const ENCRYPTION_MODE_PUBLIC: u8 = 1;

// === Types ===

public struct KraterionBucket has key {
    id: UID,
    owner: address,
    name: vector<u8>,
    funding_pool: Balance<WAL>,
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

public fun funding_pool_value(bucket: &KraterionBucket): u64 {
    balance::value(&bucket.funding_pool)
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
        funding_pool: balance::zero<WAL>(),
        encryption_mode,
        api_decryption_addresses: vector::empty<address>(),
        created_epoch: epoch(ctx),
    }
}

// === Funding ===

/// Anyone can top up a bucket's WAL pool. Mirrors Walrus's "anyone can fund a
/// SharedBlob" property at the bucket level — useful for the
/// post-cancellation persistence demo (others can keep your files alive).
public fun fund_bucket(bucket: &mut KraterionBucket, coin: Coin<WAL>) {
    balance::join(&mut bucket.funding_pool, coin::into_balance(coin));
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

// === SharedBlob lifecycle ===

/// Wrap a Walrus Blob into a SharedBlob, drawing `initial_fund_amount` WAL
/// from the bucket's pool to seed its renewal jar. Authorized for owner OR
/// any address in `api_decryption_addresses` — the gateway uses its API
/// keypair, the user uses their wallet.
///
/// Encryption is performed off-chain at the gateway; this function does not
/// touch the file bytes. Files are always Seal-encrypted; whether they're
/// publicly readable is decided by `bucket.encryption_mode` at decrypt time.
public fun wrap_in_shared_blob(
    bucket: &mut KraterionBucket,
    blob: Blob,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    initial_fund_amount: u64,
    ctx: &mut TxContext,
) {
    assert_caller_authorized(bucket, ctx);
    assert!(
        balance::value(&bucket.funding_pool) >= initial_fund_amount,
        EInsufficientFunds,
    );

    // Capture identifiers BEFORE moving `blob` into shared_blob::new_funded.
    let walrus_blob_object_id = object::id(&blob);
    let walrus_blob_id = blob::blob_id(&blob);

    let funds = coin::from_balance(
        balance::split(&mut bucket.funding_pool, initial_fund_amount),
        ctx,
    );

    // Walrus's new_funded shares the wrapped object internally — no return
    // value. The off-chain indexer joins the SharedBlob's ID to this event
    // by transaction digest (created-objects list ↔ event payload).
    shared_blob::new_funded(blob, funds, ctx);

    events::emit_object_created(
        object::id(bucket),
        walrus_blob_object_id,
        walrus_blob_id,
        s3_key,
        content_type,
        bucket.owner,
        ctx.sender(),
        initial_fund_amount,
    );
}

/// Renew a SharedBlob's storage by `epochs_ahead`. Anyone can call this —
/// Walrus's underlying `extend` is permissionless and uses the SharedBlob's
/// own jar. Emits `KraterionObjectExtended` for the indexer.
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

fun assert_caller_authorized(bucket: &KraterionBucket, ctx: &TxContext) {
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
