#[test_only]
module kraterion::kraterion_tests;

use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as ts, Scenario};
use wal::wal::WAL;
use kraterion::kraterion::{Self, KraterionBucket};
use kraterion::access;

// === Test addresses ===

const OWNER: address = @0xA11CE;
const API_ADDR: address = @0xA1;
const STRANGER: address = @0xBEEF;
const SECOND_API: address = @0xA2;

const PRIVATE: u8 = 0;
const PUBLIC_MODE: u8 = 1;

// === Helpers ===

fun mint_wal(amount: u64, scenario: &mut Scenario): Coin<WAL> {
    coin::mint_for_testing<WAL>(amount, ts::ctx(scenario))
}

/// Create + share a private bucket as OWNER. Returns the test scenario in
/// the next tx, ready for the bucket to be taken via `ts::take_shared`.
fun setup_private_bucket(scenario: &mut Scenario) {
    ts::next_tx(scenario, OWNER);
    kraterion::create_and_share_bucket(b"demo", PRIVATE, ts::ctx(scenario));
}

fun setup_public_bucket(scenario: &mut Scenario) {
    ts::next_tx(scenario, OWNER);
    kraterion::create_and_share_bucket(b"demo", PUBLIC_MODE, ts::ctx(scenario));
}

/// Build a 48-byte Seal identity that prefixes the given bucket's UID.
fun seal_id_for(bucket: &KraterionBucket): vector<u8> {
    let mut id = object::uid_to_bytes(kraterion::id(bucket));
    // Append a fake 16-byte object UUID — content doesn't matter, the
    // `assert_id_belongs_to_bucket` check only inspects the first 32 bytes.
    let mut i: u8 = 0;
    while (i < 16) {
        vector::push_back(&mut id, i);
        i = i + 1;
    };
    id
}

/// Build a 48-byte Seal identity that prefixes a DIFFERENT 32-byte sequence
/// (i.e. not this bucket's UID), used to exercise EWrongBucket.
fun seal_id_for_other_bucket(): vector<u8> {
    let mut id = vector::empty<u8>();
    let mut i: u8 = 0;
    while (i < 48) {
        vector::push_back(&mut id, 0xFFu8);
        i = i + 1;
    };
    id
}

// === Bucket lifecycle ===

#[test]
fun test_create_and_share_bucket_initial_state() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);
    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    assert!(kraterion::owner(&bucket) == OWNER);
    assert!(*kraterion::name(&bucket) == b"demo");
    assert!(kraterion::encryption_mode(&bucket) == PRIVATE);
    assert!(vector::is_empty(kraterion::api_addresses(&bucket)));
    assert!(kraterion::funding_pool_value(&bucket) == 0);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_create_grant_and_share_bucket_initial_state() {
    let mut scenario = ts::begin(OWNER);
    ts::next_tx(&mut scenario, OWNER);
    kraterion::create_grant_and_share_bucket(
        b"demo",
        API_ADDR,
        PRIVATE,
        ts::ctx(&mut scenario),
    );
    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    assert!(kraterion::owner(&bucket) == OWNER);
    let apis = kraterion::api_addresses(&bucket);
    assert!(vector::length(apis) == 1);
    assert!(*vector::borrow(apis, 0) == API_ADDR);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = kraterion::EUnknownEncryptionMode)]
fun test_create_with_invalid_mode_aborts() {
    let mut scenario = ts::begin(OWNER);
    ts::next_tx(&mut scenario, OWNER);
    kraterion::create_and_share_bucket(b"demo", 99u8, ts::ctx(&mut scenario));
    ts::end(scenario);
}

// === Funding ===

#[test]
fun test_fund_bucket_increases_pool() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    let coin = mint_wal(100, &mut scenario);
    kraterion::fund_bucket(&mut bucket, coin);
    assert!(kraterion::funding_pool_value(&bucket) == 100);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_anyone_can_fund_bucket() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    let coin = mint_wal(50, &mut scenario);
    kraterion::fund_bucket(&mut bucket, coin);
    assert!(kraterion::funding_pool_value(&bucket) == 50);
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === API access list ===

#[test]
fun test_grant_api_access_appends() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    let apis = kraterion::api_addresses(&bucket);
    assert!(vector::length(apis) == 1);
    assert!(*vector::borrow(apis, 0) == API_ADDR);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_grant_is_idempotent() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    assert!(vector::length(kraterion::api_addresses(&bucket)) == 1);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_revoke_clears_list() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    kraterion::grant_api_access(&mut bucket, SECOND_API, ts::ctx(&mut scenario));
    kraterion::revoke_all_api_access(&mut bucket, ts::ctx(&mut scenario));
    assert!(vector::is_empty(kraterion::api_addresses(&bucket)));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = kraterion::ENotOwner)]
fun test_grant_aborts_for_non_owner() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = kraterion::ENotOwner)]
fun test_revoke_aborts_for_non_owner() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::revoke_all_api_access(&mut bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === Visibility flip ===

#[test]
fun test_set_visibility_owner_succeeds() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::set_bucket_visibility(&mut bucket, PUBLIC_MODE, ts::ctx(&mut scenario));
    assert!(kraterion::encryption_mode(&bucket) == PUBLIC_MODE);
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = kraterion::ENotOwner)]
fun test_set_visibility_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::set_bucket_visibility(&mut bucket, PUBLIC_MODE, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = kraterion::EUnknownEncryptionMode)]
fun test_set_visibility_unknown_mode_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::set_bucket_visibility(&mut bucket, 99u8, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_set_visibility_idempotent_no_event() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    // Already PRIVATE; flipping to PRIVATE should be a no-op.
    kraterion::set_bucket_visibility(&mut bucket, PRIVATE, ts::ctx(&mut scenario));
    let effects = ts::next_tx(&mut scenario, OWNER);
    assert!(ts::num_user_events(&effects) == 0);
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === Seal access — private mode ===

#[test]
fun test_seal_approve_private_owner_passes() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_seal_approve_private_api_address_passes() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    ts::next_tx(&mut scenario, API_ADDR);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = access::EAccessDenied)]
fun test_seal_approve_private_random_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = access::EAccessDenied)]
fun test_seal_approve_private_after_revoke_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::grant_api_access(&mut bucket, API_ADDR, ts::ctx(&mut scenario));
    kraterion::revoke_all_api_access(&mut bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    ts::next_tx(&mut scenario, API_ADDR);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = access::EWrongBucket)]
fun test_seal_approve_wrong_bucket_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for_other_bucket();
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = access::EWrongBucket)]
fun test_seal_approve_short_id_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_private_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = b"too short";
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === Seal access — public mode ===

#[test]
fun test_seal_approve_public_owner_passes() {
    let mut scenario = ts::begin(OWNER);
    setup_public_bucket(&mut scenario);

    ts::next_tx(&mut scenario, OWNER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
fun test_seal_approve_public_random_passes() {
    let mut scenario = ts::begin(OWNER);
    setup_public_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = access::EWrongBucket)]
fun test_seal_approve_public_wrong_bucket_aborts() {
    let mut scenario = ts::begin(OWNER);
    setup_public_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for_other_bucket();
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === End-to-end: flip public→private revokes random callers ===

#[test]
#[expected_failure(abort_code = access::EAccessDenied)]
fun test_flip_to_private_then_seal_approve_denies() {
    let mut scenario = ts::begin(OWNER);
    setup_public_bucket(&mut scenario);

    // Stranger could decrypt while public.
    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    // Owner flips bucket private.
    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::set_bucket_visibility(&mut bucket, PRIVATE, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    // Stranger can no longer decrypt — aborts with EAccessDenied.
    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id2 = seal_id_for(&bucket);
    access::seal_approve(id2, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}
