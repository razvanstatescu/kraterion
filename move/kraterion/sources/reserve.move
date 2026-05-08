/// Platform-level WAL reserve.
///
/// A single shared object holds the WAL the platform spends on uploads
/// (register_blob) and renewals (extend_blob_from_reserve) on behalf of
/// users. Two access controls:
///
///   1. `admin` — the address that can authorize/deauthorize callers and
///      withdraw funds. Set at creation; never changes (transfer_admin
///      could be added later, deferred).
///   2. `authorized_callers` — a whitelist of addresses that can drain the
///      reserve via `pull_wal`. The gateway sub-wallet (uploads) and the
///      renewal worker sub-wallet (extensions) live on this list.
///
/// Anyone can fund the reserve (`fund`). Only the admin can withdraw or
/// modify the whitelist. Only authorized callers can pull WAL.
///
/// Permissionless paths stay open: any caller can use Walrus's native
/// `system::register_blob` (paying from their own wallet) or
/// `shared_blob::extend` (draining the SharedBlob's own jar). The reserve
/// is just for operations the platform funds on behalf of users.
module kraterion::reserve;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use wal::wal::WAL;
use kraterion::events;

// === Errors ===

const ENotAdmin: u64 = 0;
const ENotAuthorized: u64 = 1;
const EInsufficientReserve: u64 = 2;

// === Types ===

public struct PlatformReserve has key {
    id: UID,
    admin: address,
    authorized_callers: vector<address>,
    wal_balance: Balance<WAL>,
}

// === Constructor ===

/// Sui's `init` is called exactly once at package publish time, with the
/// deployer's address as `ctx.sender()`. We create and share the singleton
/// `PlatformReserve` here so the package is operational the moment it's
/// published — no follow-up tx needed to bootstrap.
///
/// The reserve starts with an empty whitelist and zero WAL. The platform
/// admin (the deployer) is responsible for:
///   1. Calling `authorize_caller` to whitelist the gateway and renewal
///      worker sub-wallets.
///   2. Calling `fund` to seed the reserve with WAL from the platform
///      treasury.
fun init(ctx: &mut TxContext) {
    create_and_share_reserve(ctx);
}

/// Internal: build the reserve object and share it. Centralized so tests
/// can drive the same construction path that `init` uses at publish time.
fun create_and_share_reserve(ctx: &mut TxContext) {
    let reserve = PlatformReserve {
        id: object::new(ctx),
        admin: ctx.sender(),
        authorized_callers: vector::empty<address>(),
        wal_balance: balance::zero<WAL>(),
    };
    let reserve_id = object::id(&reserve);
    let admin = reserve.admin;
    transfer::share_object(reserve);
    events::emit_reserve_created(reserve_id, admin);
}

#[test_only]
/// Test-only mirror of `init`. The Move test framework doesn't run package
/// init functions automatically, so tests call this to spawn the reserve
/// before exercising any reserve-touching code.
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

// === Admin operations ===

/// Add `addr` to the whitelist of callers that can drain the reserve.
/// Idempotent. Admin only.
public fun authorize_caller(reserve: &mut PlatformReserve, addr: address, ctx: &TxContext) {
    assert!(ctx.sender() == reserve.admin, ENotAdmin);
    if (!vector::contains(&reserve.authorized_callers, &addr)) {
        reserve.authorized_callers.push_back(addr);
    };
    events::emit_reserve_caller_authorized(object::id(reserve), reserve.admin, addr);
}

/// Remove `addr` from the whitelist. Idempotent. Admin only.
public fun deauthorize_caller(reserve: &mut PlatformReserve, addr: address, ctx: &TxContext) {
    assert!(ctx.sender() == reserve.admin, ENotAdmin);
    let (found, i) = vector::index_of(&reserve.authorized_callers, &addr);
    if (found) {
        reserve.authorized_callers.remove(i);
    };
    events::emit_reserve_caller_deauthorized(object::id(reserve), reserve.admin, addr);
}

/// Withdraw `amount` WAL to `recipient`. Admin only — this is the platform's
/// way to recover unused funds.
public fun withdraw(
    reserve: &mut PlatformReserve,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == reserve.admin, ENotAdmin);
    assert!(balance::value(&reserve.wal_balance) >= amount, EInsufficientReserve);
    let coin = coin::from_balance(balance::split(&mut reserve.wal_balance, amount), ctx);
    transfer::public_transfer(coin, recipient);
    events::emit_reserve_withdrawn(object::id(reserve), reserve.admin, recipient, amount);
}

// === Public funding ===

/// Top up the reserve. Anyone can fund it (matches Walrus's "anyone can
/// fund a SharedBlob" idiom). The platform cron-funds the reserve from
/// its central treasury; users could theoretically also contribute, though
/// in practice only the platform does.
public fun fund(reserve: &mut PlatformReserve, coin: Coin<WAL>) {
    let amount = coin::value(&coin);
    balance::join(&mut reserve.wal_balance, coin::into_balance(coin));
    events::emit_reserve_funded(object::id(reserve), amount);
}

// === Internal helpers used by other modules in this package ===

/// Pull `amount` WAL out of the reserve. Caller must be on the whitelist
/// (or be the admin). Aborts with `EInsufficientReserve` if the reserve
/// doesn't have enough WAL.
public(package) fun pull_wal(
    reserve: &mut PlatformReserve,
    amount: u64,
    ctx: &mut TxContext,
): Coin<WAL> {
    assert_caller_authorized(reserve, ctx);
    assert!(balance::value(&reserve.wal_balance) >= amount, EInsufficientReserve);
    coin::from_balance(balance::split(&mut reserve.wal_balance, amount), ctx)
}

/// Return leftover WAL to the reserve. Used by paid operations after they
/// over-pull and partially spend (e.g. register_blob_for_bucket pulls a
/// budget, spends what's actually needed for storage, deposits the rest).
public(package) fun deposit_wal(reserve: &mut PlatformReserve, coin: Coin<WAL>) {
    balance::join(&mut reserve.wal_balance, coin::into_balance(coin));
}

/// Whitelist check. Public for tests and for adjacent modules in this
/// package; users would normally not call this directly.
public(package) fun assert_caller_authorized(reserve: &PlatformReserve, ctx: &TxContext) {
    let caller = ctx.sender();
    let is_admin = caller == reserve.admin;
    let is_authorized = vector::contains(&reserve.authorized_callers, &caller);
    assert!(is_admin || is_authorized, ENotAuthorized);
}

// === Read-only accessors ===

public fun admin(reserve: &PlatformReserve): address {
    reserve.admin
}

public fun authorized_callers(reserve: &PlatformReserve): &vector<address> {
    &reserve.authorized_callers
}

public fun wal_balance(reserve: &PlatformReserve): u64 {
    balance::value(&reserve.wal_balance)
}

public fun id(reserve: &PlatformReserve): &UID {
    &reserve.id
}
