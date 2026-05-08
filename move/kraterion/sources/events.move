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

public struct KraterionObjectCreated has copy, drop {
    bucket_id: ID,
    walrus_blob_object_id: ID,
    walrus_blob_id: u256,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    owner_address: address,
    wrapped_by: address,
    // 48-byte Seal IBE identity = bucket_object_id (32) || object_uuid (16).
    // Gateway-minted at PutObject time; the indexer needs it to populate
    // S3Object.seal_identity (which seal_approve checks at GET time).
    // Cannot be derived from on-chain state; must come via the event.
    seal_identity: vector<u8>,
    // Plaintext byte count of the original object body. The gateway knows
    // this at PutObject time; included here so the indexer can populate
    // S3Object.size_bytes (S3 GET's Content-Length) without an extra
    // chain query.
    size_bytes: u64,
    // Walrus storage end epoch (current_epoch + epochs_ahead). Gateway
    // computes this from systemState before PutObject; included so the
    // indexer's renewal worker can scan by storage_end_epoch without
    // round-tripping through getObject(SharedBlob).
    storage_end_epoch: u32,
    // 16-byte raw MD5 of the PLAINTEXT body. This is the S3 spec's
    // `ETag` value for non-multipart uploads — boto3 verifies it
    // against client-side MD5 in `aws s3 sync` and friends. The
    // gateway computes it pre-encryption; chain has no other way to
    // derive plaintext-MD5 (the Walrus blob is the encrypted bytes).
    etag_md5: vector<u8>,
    // Note: `shared_blob_object_id` is intentionally omitted — walrus's
    // `shared_blob::new` consumes the Blob and shares without returning
    // the SharedBlob, so we cannot read its ID inside this Move
    // function. The indexer recovers it from `tx.effects.changed_objects`
    // in the same checkpoint payload (one created object of type
    // `walrus::shared_blob::SharedBlob` per emit).
}

public struct KraterionObjectExtended has copy, drop {
    shared_blob_id: ID,
    epochs_added: u32,
    funder: address,
}

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

public(package) fun emit_bucket_created(
    bucket_id: ID,
    owner: address,
    name: vector<u8>,
    encryption_mode: u8,
) {
    event::emit(KraterionBucketCreated { bucket_id, owner, name, encryption_mode });
}

public(package) fun emit_object_created(
    bucket_id: ID,
    walrus_blob_object_id: ID,
    walrus_blob_id: u256,
    s3_key: vector<u8>,
    content_type: vector<u8>,
    owner_address: address,
    wrapped_by: address,
    seal_identity: vector<u8>,
    size_bytes: u64,
    storage_end_epoch: u32,
    etag_md5: vector<u8>,
) {
    event::emit(KraterionObjectCreated {
        bucket_id,
        walrus_blob_object_id,
        walrus_blob_id,
        s3_key,
        content_type,
        owner_address,
        wrapped_by,
        seal_identity,
        size_bytes,
        storage_end_epoch,
        etag_md5,
    });
}

public(package) fun emit_object_extended(
    shared_blob_id: ID,
    epochs_added: u32,
    funder: address,
) {
    event::emit(KraterionObjectExtended { shared_blob_id, epochs_added, funder });
}

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
