/// Seal access policy for Kraterion buckets.
///
/// `seal_approve` is invoked by Seal's threshold key servers via dry_run when
/// a client requests decryption shares. The function aborts to deny access
/// and returns normally to approve.
///
/// The function branches on `bucket.encryption_mode`:
///   - PUBLIC mode: approve any caller (after verifying the id belongs to
///     this bucket — a sanity check that prevents key reuse across buckets).
///   - PRIVATE mode: approve only the bucket owner OR an address in
///     `api_decryption_addresses`.
///
/// Identity format passed by the Seal SDK:
///   `id = [bucket_uid_bytes (32) || object_uuid (16)]` (48 bytes).
///
/// The package-id prefix is bound by Seal at IBE construction time and is
/// NOT part of the bytes we receive here. We prefix-match `id[0..32]`
/// against `object::uid_to_bytes(&bucket.id)` to reject ids minted for
/// other buckets.
module kraterion::access;

use kraterion::kraterion::{Self, KraterionBucket};

const EAccessDenied: u64 = 0;
const EWrongBucket: u64 = 1;
const EUnknownEncryptionMode: u64 = 2;

const BUCKET_UID_BYTES: u64 = 32;

entry fun seal_approve(
    id: vector<u8>,
    bucket: &KraterionBucket,
    ctx: &TxContext,
) {
    assert_id_belongs_to_bucket(&id, bucket);

    let mode = kraterion::encryption_mode(bucket);
    if (mode == kraterion::encryption_mode_public()) {
        // Public bucket: anyone may decrypt.
        return
    };
    if (mode == kraterion::encryption_mode_private()) {
        let caller = ctx.sender();
        let is_owner = caller == kraterion::owner(bucket);
        let is_api = vector::contains(kraterion::api_addresses(bucket), &caller);
        assert!(is_owner || is_api, EAccessDenied);
        return
    };
    abort EUnknownEncryptionMode
}

/// Verify that the first 32 bytes of `id` match the bucket's UID bytes.
/// Aborts with `EWrongBucket` if `id` is shorter than 32 bytes or the
/// prefix doesn't match.
fun assert_id_belongs_to_bucket(id: &vector<u8>, bucket: &KraterionBucket) {
    assert!(vector::length(id) >= BUCKET_UID_BYTES, EWrongBucket);
    let bucket_bytes = object::uid_to_bytes(kraterion::id(bucket));

    let mut i = 0;
    while (i < BUCKET_UID_BYTES) {
        assert!(*vector::borrow(id, i) == *vector::borrow(&bucket_bytes, i), EWrongBucket);
        i = i + 1;
    };
}
