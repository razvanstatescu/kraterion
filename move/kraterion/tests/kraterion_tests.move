#[test_only]
module kraterion::kraterion_tests;

use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as ts, Scenario};
use wal::wal::WAL;
use kraterion::kraterion::{Self, KraterionBucket};
use kraterion::access;
use kraterion::reserve::{Self, PlatformReserve};

// === Test addresses ===

const ADMIN: address = @0xAD;
const OWNER: address = @0xA11CE;
const API_ADDR: address = @0xA1;
const STRANGER: address = @0xBEEF;
const SECOND_API: address = @0xA2;
const WORKER: address = @0xC1;

const PRIVATE: u8 = 0;
const PUBLIC_MODE: u8 = 1;

// === Helpers ===

fun mint_wal(amount: u64, scenario: &mut Scenario): Coin<WAL> {
    coin::mint_for_testing<WAL>(amount, ts::ctx(scenario))
}

/// Create + share a private bucket as OWNER.
fun setup_private_bucket(scenario: &mut Scenario) {
    ts::next_tx(scenario, OWNER);
    kraterion::create_and_share_bucket(b"demo", PRIVATE, ts::ctx(scenario));
}

fun setup_public_bucket(scenario: &mut Scenario) {
    ts::next_tx(scenario, OWNER);
    kraterion::create_and_share_bucket(b"demo", PUBLIC_MODE, ts::ctx(scenario));
}

/// Create + share a reserve as ADMIN.
fun setup_reserve(scenario: &mut Scenario) {
    ts::next_tx(scenario, ADMIN);
    reserve::init_for_testing(ts::ctx(scenario));
}

/// Build a 48-byte Seal identity that prefixes the given bucket's UID.
fun seal_id_for(bucket: &KraterionBucket): vector<u8> {
    let mut id = object::uid_to_bytes(kraterion::id(bucket));
    let mut i: u8 = 0;
    while (i < 16) {
        vector::push_back(&mut id, i);
        i = i + 1;
    };
    id
}

/// Build a 48-byte Seal identity that prefixes a DIFFERENT 32-byte sequence.
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

#[test]
#[expected_failure(abort_code = access::EAccessDenied)]
fun test_flip_to_private_then_seal_approve_denies() {
    let mut scenario = ts::begin(OWNER);
    setup_public_bucket(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id = seal_id_for(&bucket);
    access::seal_approve(id, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    ts::next_tx(&mut scenario, OWNER);
    let mut bucket = ts::take_shared<KraterionBucket>(&scenario);
    kraterion::set_bucket_visibility(&mut bucket, PRIVATE, ts::ctx(&mut scenario));
    ts::return_shared(bucket);

    ts::next_tx(&mut scenario, STRANGER);
    let bucket = ts::take_shared<KraterionBucket>(&scenario);
    let id2 = seal_id_for(&bucket);
    access::seal_approve(id2, &bucket, ts::ctx(&mut scenario));
    ts::return_shared(bucket);
    ts::end(scenario);
}

// === Reserve lifecycle ===

#[test]
fun test_create_and_share_reserve_initial_state() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let r = ts::take_shared<PlatformReserve>(&scenario);
    assert!(reserve::admin(&r) == ADMIN);
    assert!(vector::is_empty(reserve::authorized_callers(&r)));
    assert!(reserve::wal_balance(&r) == 0);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_authorize_caller_appends() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    let callers = reserve::authorized_callers(&r);
    assert!(vector::length(callers) == 1);
    assert!(*vector::borrow(callers, 0) == API_ADDR);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_authorize_is_idempotent() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    assert!(vector::length(reserve::authorized_callers(&r)) == 1);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_deauthorize_removes() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    reserve::authorize_caller(&mut r, WORKER, ts::ctx(&mut scenario));
    reserve::deauthorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    let callers = reserve::authorized_callers(&r);
    assert!(vector::length(callers) == 1);
    assert!(*vector::borrow(callers, 0) == WORKER);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = reserve::ENotAdmin)]
fun test_authorize_aborts_for_non_admin() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = reserve::ENotAdmin)]
fun test_deauthorize_aborts_for_non_admin() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::authorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    ts::return_shared(r);

    ts::next_tx(&mut scenario, STRANGER);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::deauthorize_caller(&mut r, API_ADDR, ts::ctx(&mut scenario));
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_fund_reserve_increases_balance() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    let coin = mint_wal(1000, &mut scenario);
    reserve::fund(&mut r, coin);
    assert!(reserve::wal_balance(&r) == 1000);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_anyone_can_fund_reserve() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, STRANGER);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    let coin = mint_wal(500, &mut scenario);
    reserve::fund(&mut r, coin);
    assert!(reserve::wal_balance(&r) == 500);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
fun test_withdraw_decreases_balance() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    let coin = mint_wal(1000, &mut scenario);
    reserve::fund(&mut r, coin);
    reserve::withdraw(&mut r, 300, ADMIN, ts::ctx(&mut scenario));
    assert!(reserve::wal_balance(&r) == 700);
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = reserve::ENotAdmin)]
fun test_withdraw_aborts_for_non_admin() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    let coin = mint_wal(1000, &mut scenario);
    reserve::fund(&mut r, coin);
    ts::return_shared(r);

    ts::next_tx(&mut scenario, STRANGER);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::withdraw(&mut r, 100, STRANGER, ts::ctx(&mut scenario));
    ts::return_shared(r);
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = reserve::EInsufficientReserve)]
fun test_withdraw_aborts_when_underfunded() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);

    ts::next_tx(&mut scenario, ADMIN);
    let mut r = ts::take_shared<PlatformReserve>(&scenario);
    reserve::withdraw(&mut r, 100, ADMIN, ts::ctx(&mut scenario));
    ts::return_shared(r);
    ts::end(scenario);
}

