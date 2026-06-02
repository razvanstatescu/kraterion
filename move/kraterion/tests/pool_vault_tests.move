/// Tests for `kraterion::pool_vault`.
///
/// Coverage focus:
///   - Vault creation (happy path + reserve-auth abort).
///   - Accessor correctness (created_by, project_id, platform_authorized).
///   - User-side `revoke_all` (happy path + non-owner abort + idempotency).
///   - Post-revoke platform-side aborts.
///   - Lifecycle ops (`extend`, `resize_grow`) advance pool state.
///
/// Blob-level operations (`register_blob`, `certify_blob`, `delete_blob`)
/// require valid storage-node committee signatures and are exercised
/// end-to-end in Phase K via the gateway PUT pipeline against a live
/// Walrus testnet. The Move-level tests here cover the vault wrapper's
/// auth & state-machine logic; the blob mechanics are Walrus's own.
///
/// `walrus::system::System` has only the `key` ability — it cannot be
/// shared or `public_transfer`'d from our test module. So tests hold it
/// as a local `mut` binding that persists across `ts::next_tx` calls
/// (test-scenario tx boundaries only affect *shared* objects), and
/// `System::destroy_for_testing` cleans it up at the end. This is the
/// pattern Walrus's own tests use.
#[test_only]
module kraterion::pool_vault_tests;

use sui::coin;
use sui::test_scenario::{Self as ts, Scenario};
use wal::wal::WAL;
use walrus::system::{Self as walrus_system, System};
use kraterion::pool_vault::{Self, KraterionPoolVault};
use kraterion::reserve::{Self, PlatformReserve};

// === Test addresses ===

const ADMIN: address = @0xAD;
const GATEWAY: address = @0xCA7E;
const USER: address = @0xA11CE;
const STRANGER: address = @0xBEEF;

// === Test fixtures ===

const POOL_CAPACITY_BYTES: u64 = 1_048_576; // 1 MiB encoded
const POOL_EPOCHS_AHEAD: u32 = 2;
const POOL_FUND_BUDGET_FROST: u64 = 1_000_000_000; // 1 WAL, way over actual cost
const RESERVE_TOPUP_FROST: u64 = 10_000_000_000; // 10 WAL

// === Helpers ===

fun setup_reserve(scenario: &mut Scenario) {
    ts::next_tx(scenario, ADMIN);
    reserve::init_for_testing(ts::ctx(scenario));
}

fun authorize_and_fund_reserve(scenario: &mut Scenario, caller: address, fund_amount: u64) {
    ts::next_tx(scenario, ADMIN);
    let mut reserve = ts::take_shared<PlatformReserve>(scenario);
    reserve::authorize_caller(&mut reserve, caller, ts::ctx(scenario));
    let funding = coin::mint_for_testing<WAL>(fund_amount, ts::ctx(scenario));
    reserve::fund(&mut reserve, funding);
    ts::return_shared(reserve);
}

fun fund_reserve_only(scenario: &mut Scenario, fund_amount: u64) {
    ts::next_tx(scenario, ADMIN);
    let mut reserve = ts::take_shared<PlatformReserve>(scenario);
    let funding = coin::mint_for_testing<WAL>(fund_amount, ts::ctx(scenario));
    reserve::fund(&mut reserve, funding);
    ts::return_shared(reserve);
}

/// Drive `pool_vault::create_vault` from `caller`, using the provided
/// (locally-held) System. Caller must be on the reserve whitelist.
fun do_create_vault(
    scenario: &mut Scenario,
    system: &mut System,
    caller: address,
    intended_owner: address,
    project_id: vector<u8>,
) {
    ts::next_tx(scenario, caller);
    let mut reserve = ts::take_shared<PlatformReserve>(scenario);
    pool_vault::create_vault(
        &mut reserve,
        system,
        POOL_CAPACITY_BYTES,
        POOL_EPOCHS_AHEAD,
        POOL_FUND_BUDGET_FROST,
        intended_owner,
        project_id,
        ts::ctx(scenario),
    );
    ts::return_shared(reserve);
}

// === Vault creation ===

#[test]
fun test_create_vault_happy_path() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));

    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-001");

    ts::next_tx(&mut scenario, ADMIN);
    let vault = ts::take_shared<KraterionPoolVault>(&scenario);
    assert!(pool_vault::created_by(&vault) == USER);
    assert!(*pool_vault::project_id(&vault) == b"project-001");
    assert!(pool_vault::platform_authorized(&vault) == true);
    // Pool inside vault has the requested capacity.
    let inner_pool = pool_vault::pool(&vault);
    assert!(walrus::storage_pool::reserved_encoded_capacity_bytes(inner_pool) == POOL_CAPACITY_BYTES);
    assert!(walrus::storage_pool::used_encoded_bytes(inner_pool) == 0);
    assert!(walrus::storage_pool::blob_count(inner_pool) == 0);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = ::kraterion::reserve::ENotAuthorized)]
fun test_create_vault_aborts_when_caller_not_on_whitelist() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    fund_reserve_only(&mut scenario, RESERVE_TOPUP_FROST);
    // Note: deliberately NO `authorize_caller(STRANGER)`.

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));

    do_create_vault(&mut scenario, &mut system, STRANGER, USER, b"project-002");

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

// === revoke_all ===

#[test]
fun test_revoke_all_flips_platform_authorized() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-003");

    // Initially authorized.
    ts::next_tx(&mut scenario, ADMIN);
    {
        let vault = ts::take_shared<KraterionPoolVault>(&scenario);
        assert!(pool_vault::platform_authorized(&vault) == true);
        ts::return_shared(vault);
    };

    // USER revokes.
    ts::next_tx(&mut scenario, USER);
    {
        let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
        pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
        assert!(pool_vault::platform_authorized(&vault) == false);
        ts::return_shared(vault);
    };

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = ::kraterion::pool_vault::ENotOwner)]
fun test_revoke_all_aborts_for_non_owner() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-004");

    // STRANGER tries to revoke.
    ts::next_tx(&mut scenario, STRANGER);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test]
fun test_revoke_all_is_idempotent() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-005");

    ts::next_tx(&mut scenario, USER);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
    assert!(pool_vault::platform_authorized(&vault) == false);
    pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
    assert!(pool_vault::platform_authorized(&vault) == false);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

// === Post-revoke platform-side aborts ===

#[test, expected_failure(abort_code = ::kraterion::pool_vault::ERevoked)]
fun test_extend_aborts_after_revoke() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-006");

    ts::next_tx(&mut scenario, USER);
    {
        let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
        pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::next_tx(&mut scenario, GATEWAY);
    let mut reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::extend(
        &mut vault,
        &mut reserve,
        &mut system,
        1,
        POOL_FUND_BUDGET_FROST,
        ts::ctx(&mut scenario),
    );
    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = ::kraterion::reserve::ENotAuthorized)]
fun test_extend_aborts_when_caller_not_on_whitelist() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-007");

    ts::next_tx(&mut scenario, STRANGER);
    let mut reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::extend(
        &mut vault,
        &mut reserve,
        &mut system,
        1,
        POOL_FUND_BUDGET_FROST,
        ts::ctx(&mut scenario),
    );
    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test]
fun test_extend_happy_path_advances_end_epoch() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-008");

    ts::next_tx(&mut scenario, GATEWAY);
    let mut reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);

    let end_before = walrus::storage_pool::end_epoch(pool_vault::pool(&vault));
    pool_vault::extend(
        &mut vault,
        &mut reserve,
        &mut system,
        3,
        POOL_FUND_BUDGET_FROST,
        ts::ctx(&mut scenario),
    );
    let end_after = walrus::storage_pool::end_epoch(pool_vault::pool(&vault));
    assert!(end_after == end_before + 3);

    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

// === anchor_session ===
//
// Happy-path requires a registered PooledBlob (needs committee signatures),
// covered end-to-end via the worker session-archive pipeline against live
// Walrus testnet. The Move-level tests here cover the auth & revocation
// gates only — both asserts fire before the `blob_object_id` lookup so we
// can pass any `blob_id` value.

#[test, expected_failure(abort_code = ::kraterion::pool_vault::ERevoked)]
fun test_anchor_session_aborts_after_revoke() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-010");

    ts::next_tx(&mut scenario, USER);
    {
        let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
        pool_vault::revoke_all(&mut vault, ts::ctx(&mut scenario));
        ts::return_shared(vault);
    };

    ts::next_tx(&mut scenario, GATEWAY);
    let reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::anchor_session(
        &mut vault,
        &reserve,
        0u256,
        b"seal_identity_48_bytes_placeholder_..............",
        b"trace_hash_32_bytes_placeholder_",
        b"session_uuid_16b",
        b"agent_uuid_16__b",
        3u32,
        ts::ctx(&mut scenario),
    );
    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = ::kraterion::reserve::ENotAuthorized)]
fun test_anchor_session_aborts_when_caller_not_on_whitelist() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-011");

    ts::next_tx(&mut scenario, STRANGER);
    let reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);
    pool_vault::anchor_session(
        &mut vault,
        &reserve,
        0u256,
        b"seal_identity_48_bytes_placeholder_..............",
        b"trace_hash_32_bytes_placeholder_",
        b"session_uuid_16b",
        b"agent_uuid_16__b",
        3u32,
        ts::ctx(&mut scenario),
    );
    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}

#[test]
fun test_resize_grow_happy_path_increases_reserved_capacity() {
    let mut scenario = ts::begin(ADMIN);
    setup_reserve(&mut scenario);
    authorize_and_fund_reserve(&mut scenario, GATEWAY, RESERVE_TOPUP_FROST);

    ts::next_tx(&mut scenario, ADMIN);
    let mut system = walrus_system::new_for_testing(ts::ctx(&mut scenario));
    do_create_vault(&mut scenario, &mut system, GATEWAY, USER, b"project-009");

    ts::next_tx(&mut scenario, GATEWAY);
    let mut reserve = ts::take_shared<PlatformReserve>(&scenario);
    let mut vault = ts::take_shared<KraterionPoolVault>(&scenario);

    let cap_before = walrus::storage_pool::reserved_encoded_capacity_bytes(pool_vault::pool(&vault));
    pool_vault::resize_grow(
        &mut vault,
        &mut reserve,
        &mut system,
        POOL_CAPACITY_BYTES,
        POOL_FUND_BUDGET_FROST,
        ts::ctx(&mut scenario),
    );
    let cap_after = walrus::storage_pool::reserved_encoded_capacity_bytes(pool_vault::pool(&vault));
    assert!(cap_after == cap_before + POOL_CAPACITY_BYTES);

    ts::return_shared(reserve);
    ts::return_shared(vault);

    walrus_system::destroy_for_testing(system);
    ts::end(scenario);
}
