/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Per-project Walrus storage pool wrapper.
 * 
 * Each `KraterionPoolVault` is a shared Sui object that wraps one
 * `walrus::storage_pool::StoragePool` and gates access via two policies:
 * 
 * 1.  **Platform side** — the gateway (and other authorized operators on the
 *     reserve whitelist) can register, certify, delete blobs, extend and resize
 *     the pool. WAL for fees is pulled from the singleton `PlatformReserve`. Gas
 *     is sponsored by Enoki off-chain. Platform wallets hold no funds.
 * 2.  **User side** — the address recorded as `created_by` (the project-owning
 *     user) can `revoke_all` to flip `platform_authorized` to false, which makes
 *     every platform-side mutation abort. Reads keep working (no platform call
 *     required).
 * 
 * `take_pool` (self-custody escape — user reclaims the bare Walrus pool to their
 * own wallet) is intentionally deferred to v1.5 along with the cap system. v1 has
 * `revoke_all` only.
 * 
 * Vault creation is platform-signed (the gateway operator submits the tx, pulling
 * WAL from the reserve to fund the initial pool storage). The user's address is
 * recorded via the `intended_owner` parameter — the off-chain control plane
 * attests to the binding via the zkLogin auth chain before allowing a vault-create
 * call for a given user. This matches the existing trust model for
 * `KraterionBucket.api_decryption_addresses` and `reserve.admin`.
 * 
 * All blobs in the pool share `pool.end_epoch` — there is no per-blob lifetime.
 * Renewal is one tx for the whole pool every ~2 years (v1 manual via admin
 * endpoint; Phase R automates it).
 * 
 * All `PooledBlob`s are registered with `deletable: true` so DELETE and
 * overwrite-DELETE can free pool capacity. The pool-level renewal promise
 * preserves the "permanent storage" guarantee at the vault level instead of per
 * blob.
 * 
 * See /docs/storage-pool-migration.md for the migration design.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as storage_pool from './deps/walrus/storage_pool.js';
const $moduleName = '@local-pkg/kraterion::pool_vault';
export const KraterionPoolVault = new MoveStruct({ name: `${$moduleName}::KraterionPoolVault`, fields: {
        id: bcs.Address,
        /**
         * The Walrus storage pool we mediate access to. Stored as a field so our
         * shared-object wrapper can gate every mutation via Move's reference rules — the
         * pool is never exposed as an owned object.
         */
        pool: storage_pool.StoragePool,
        /**
         * Sui address of the user who owns the project this vault serves. Used by
         * `revoke_all` to gate user-side mutations. Recorded at creation from the
         * `intended_owner` parameter; the off-chain control plane is responsible for
         * binding this to the zkLogin session that triggered the create call.
         */
        created_by: bcs.Address,
        /**
         * Off-chain project identifier (typically a 16-byte UUID matching the Postgres
         * `Project.id` row). Emitted with `VaultCreated` so the indexer can join the
         * on-chain vault to its project without an out-of-band lookup. Opaque to Move; we
         * don't enforce a length.
         */
        project_id: bcs.vector(bcs.u8()),
        /**
         * User's kill-switch. `true` at creation; `revoke_all` flips it to `false`. Every
         * platform-side mutation asserts this is `true` before doing anything else.
         */
        platform_authorized: bcs.bool()
    } });
export interface CreatedByArguments {
    vault: RawTransactionArgument<string>;
}
export interface CreatedByOptions {
    package?: string;
    arguments: CreatedByArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function createdBy(options: CreatedByOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'created_by',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProjectIdArguments {
    vault: RawTransactionArgument<string>;
}
export interface ProjectIdOptions {
    package?: string;
    arguments: ProjectIdArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function projectId(options: ProjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'project_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlatformAuthorizedArguments {
    vault: RawTransactionArgument<string>;
}
export interface PlatformAuthorizedOptions {
    package?: string;
    arguments: PlatformAuthorizedArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function platformAuthorized(options: PlatformAuthorizedOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'platform_authorized',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PoolArguments {
    vault: RawTransactionArgument<string>;
}
export interface PoolOptions {
    package?: string;
    arguments: PoolArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function pool(options: PoolOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'pool',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IdArguments {
    vault: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateVaultArguments {
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    reservedEncodedCapacityBytes: RawTransactionArgument<number | bigint>;
    epochsAhead: RawTransactionArgument<number>;
    paymentBudgetFrost: RawTransactionArgument<number | bigint>;
    intendedOwner: RawTransactionArgument<string>;
    projectId: RawTransactionArgument<Array<number>>;
}
export interface CreateVaultOptions {
    package?: string;
    arguments: CreateVaultArguments | [
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        reservedEncodedCapacityBytes: RawTransactionArgument<number | bigint>,
        epochsAhead: RawTransactionArgument<number>,
        paymentBudgetFrost: RawTransactionArgument<number | bigint>,
        intendedOwner: RawTransactionArgument<string>,
        projectId: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Create a per-project storage pool, wrap it in a vault, and share the vault.
 * Funded from the platform reserve. Caller must be on the reserve whitelist (the
 * gateway operator, in practice).
 *
 * `intended_owner` is the Sui address of the user this vault is for. It's recorded
 * as `vault.created_by` and gates `revoke_all`. The off-chain control plane MUST
 * attest to the user/owner binding before allowing this call — it's the same trust
 * pattern as `bucket.api_decryption_addresses`.
 *
 * `project_id` is the off-chain Postgres `Project.id` UUID (16 bytes typically).
 * Opaque to Move; the indexer uses it for the off-chain join.
 *
 * `payment_budget_frost` is over-pulled from the reserve; leftover is returned.
 * Walrus's `create_storage_pool` cost is roughly
 * `reserved_encoded_bytes × storage_price_per_unit_size × epochs_ahead` FROST;
 * budget at least 2× that.
 */
export function createVault(options: CreateVaultOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'u32',
        'u64',
        'address',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "system", "reservedEncodedCapacityBytes", "epochsAhead", "paymentBudgetFrost", "intendedOwner", "projectId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'create_vault',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegisterBlobArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    blobId: RawTransactionArgument<number | bigint>;
    rootHash: RawTransactionArgument<number | bigint>;
    unencodedSize: RawTransactionArgument<number | bigint>;
    encodingType: RawTransactionArgument<number>;
    s3Key: RawTransactionArgument<Array<number>>;
    contentType: RawTransactionArgument<Array<number>>;
    sealIdentity: RawTransactionArgument<Array<number>>;
    sizeBytes: RawTransactionArgument<number | bigint>;
    etagMd5: RawTransactionArgument<Array<number>>;
    paymentBudgetFrost: RawTransactionArgument<number | bigint>;
}
export interface RegisterBlobOptions {
    package?: string;
    arguments: RegisterBlobArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        blobId: RawTransactionArgument<number | bigint>,
        rootHash: RawTransactionArgument<number | bigint>,
        unencodedSize: RawTransactionArgument<number | bigint>,
        encodingType: RawTransactionArgument<number>,
        s3Key: RawTransactionArgument<Array<number>>,
        contentType: RawTransactionArgument<Array<number>>,
        sealIdentity: RawTransactionArgument<Array<number>>,
        sizeBytes: RawTransactionArgument<number | bigint>,
        etagMd5: RawTransactionArgument<Array<number>>,
        paymentBudgetFrost: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Register a Walrus blob into this vault's pool. Pulls the write fee from the
 * platform reserve. Two checks:
 *
 * 1.  `vault.platform_authorized` is true (user hasn't revoked).
 * 2.  Caller is on the reserve whitelist.
 *
 * Recovers the new `PooledBlob` object ID via the pool's `blob_object_id` accessor
 * and emits it in `PooledBlobRegistered` so the gateway can proceed with the
 * upload-relay POST without an extra RPC roundtrip.
 *
 * `payment_budget_frost` is over-pulled; leftover returns to the reserve. Blobs
 * registered here are always `deletable: true` so DELETE and overwrite-DELETE can
 * free pool capacity.
 */
export function registerBlob(options: RegisterBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u256',
        'u256',
        'u64',
        'u8',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u64',
        'vector<u8>',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "blobId", "rootHash", "unencodedSize", "encodingType", "s3Key", "contentType", "sealIdentity", "sizeBytes", "etagMd5", "paymentBudgetFrost"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'register_blob',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CertifyBlobArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    blobId: RawTransactionArgument<number | bigint>;
    signature: RawTransactionArgument<Array<number>>;
    signersBitmap: RawTransactionArgument<Array<number>>;
    message: RawTransactionArgument<Array<number>>;
}
export interface CertifyBlobOptions {
    package?: string;
    arguments: CertifyBlobArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        blobId: RawTransactionArgument<number | bigint>,
        signature: RawTransactionArgument<Array<number>>,
        signersBitmap: RawTransactionArgument<Array<number>>,
        message: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Certify a previously-registered pooled blob. No fee — only the platform auth +
 * revocation check.
 */
export function certifyBlob(options: CertifyBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u256',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "blobId", "signature", "signersBitmap", "message"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'certify_blob',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeleteBlobArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    blobId: RawTransactionArgument<number | bigint>;
}
export interface DeleteBlobOptions {
    package?: string;
    arguments: DeleteBlobArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        blobId: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Delete a pooled blob and free its encoded-capacity back into the pool. Called
 * for both explicit S3 DELETE and for overwrite-DELETE (PUT to an existing
 * s3_key). No fee.
 */
export function deleteBlob(options: DeleteBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u256'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "blobId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'delete_blob',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ExtendArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    extendedEpochs: RawTransactionArgument<number>;
    paymentBudgetFrost: RawTransactionArgument<number | bigint>;
}
export interface ExtendOptions {
    package?: string;
    arguments: ExtendArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        extendedEpochs: RawTransactionArgument<number>,
        paymentBudgetFrost: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Extend the pool's end_epoch by `extended_epochs`. Funded from the reserve. In v1
 * this is called manually via the admin endpoint when a pool is approaching
 * expiry. Phase R automates it.
 */
export function extend(options: ExtendOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u32',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "extendedEpochs", "paymentBudgetFrost"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'extend',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ResizeShrinkArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    percent: RawTransactionArgument<number>;
}
export interface ResizeShrinkOptions {
    package?: string;
    arguments: ResizeShrinkArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        percent: RawTransactionArgument<number>
    ];
}
/**
 * Shrink the pool's reserved capacity by `percent` of its **unused** portion.
 * Called by the pool-renewal worker when a customer has a
 * `PendingStorageDowngrade` past its effective_at — we shrink first, then extend
 * at the new smaller size in the same tx batch (or the next renewal tick).
 *
 * `percent` must be 1..=100. Walrus's
 * `decrease_storage_pool_unused_capacity_by_percent` returns the freed reservation
 * as a `Storage` object — pre-paid Walrus capacity that can in theory be reused
 * for another pool, but we don't have the inter-pool reuse logic and don't want to
 * build it. So we transfer the `Storage` to `@0x0` and accept that the pre-paid
 * portion is abandoned to the network. The trade-off is documented in
 * `/docs/decisions.md` ("Pool lifetime tracks billing cycle") — short pool
 * lifetimes mean the abandoned slice is at most one billing cycle's worth of WAL,
 * far less than the previous "pay for 2 years of unused capacity" gap.
 *
 * Aborts:
 *
 * - `ERevoked` if the user has revoked platform authorization.
 * - Caller must be on the reserve whitelist.
 * - Walrus aborts if `percent == 0` or the computed extract size rounds to zero
 *   (e.g. nothing is unused).
 */
export function resizeShrink(options: ResizeShrinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "percent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'resize_shrink',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ResizeGrowArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    additionalEncodedCapacityBytes: RawTransactionArgument<number | bigint>;
    paymentBudgetFrost: RawTransactionArgument<number | bigint>;
}
export interface ResizeGrowOptions {
    package?: string;
    arguments: ResizeGrowArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        additionalEncodedCapacityBytes: RawTransactionArgument<number | bigint>,
        paymentBudgetFrost: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Grow the pool's reserved capacity by `additional_bytes`. Funded from the
 * reserve. v1: called manually via the admin endpoint when usage approaches
 * capacity. Phase J adds a reactive autoscaler.
 */
export function resizeGrow(options: ResizeGrowOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "system", "additionalEncodedCapacityBytes", "paymentBudgetFrost"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'resize_grow',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AnchorSessionArguments {
    vault: RawTransactionArgument<string>;
    reserve: RawTransactionArgument<string>;
    blobId: RawTransactionArgument<number | bigint>;
    sealIdentity: RawTransactionArgument<Array<number>>;
    traceHash: RawTransactionArgument<Array<number>>;
    sessionId: RawTransactionArgument<Array<number>>;
    agentId: RawTransactionArgument<Array<number>>;
    invocationCount: RawTransactionArgument<number>;
}
export interface AnchorSessionOptions {
    package?: string;
    arguments: AnchorSessionArguments | [
        vault: RawTransactionArgument<string>,
        reserve: RawTransactionArgument<string>,
        blobId: RawTransactionArgument<number | bigint>,
        sealIdentity: RawTransactionArgument<Array<number>>,
        traceHash: RawTransactionArgument<Array<number>>,
        sessionId: RawTransactionArgument<Array<number>>,
        agentId: RawTransactionArgument<Array<number>>,
        invocationCount: RawTransactionArgument<number>
    ];
}
/**
 * Emit a `KraterionSessionAnchored` event linking a Walrus PooledBlob (already
 * registered in this vault by the companion `register_blob` call composed earlier
 * in the same PTB) to an off-chain agent session. Pure event emission — no Walrus
 * capacity ops, no reserve drain.
 *
 * Single transaction emits two events the indexer consumes:
 *
 * 1.  `KraterionPooledBlobRegistered` from `register_blob` — drives the
 *     `PooledBlob` Postgres row (just like S3 PUT or K5 manifest archive).
 * 2.  `KraterionSessionAnchored` from this call — drives the `AgentSessionTrace`
 *     row. Its tx digest is the replay handle.
 *
 * `blob_id` is the same u256 passed to `register_blob`. We resolve the
 * PooledBlob's on-chain object ID here via `walrus::storage_pool::blob_object_id`
 * rather than asking the gateway to pass it through — Walrus already guarantees
 * deterministic resolution.
 *
 * `trace_hash` is the 32-byte SHA-256 of the canonical-JSON, plaintext trace
 * before Seal encryption + gzip. Off-chain replay verifies this hash after
 * decrypting; mismatch means the platform tampered.
 *
 * Same trust gates as the blob ops: `platform_authorized` must be true and caller
 * must be on the reserve whitelist. After user revocation, new sessions cannot be
 * anchored, but blobs from prior sessions stay readable (Seal policy gates decrypt
 * independently).
 */
export function anchorSession(options: AnchorSessionOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        'u256',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u32'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "reserve", "blobId", "sealIdentity", "traceHash", "sessionId", "agentId", "invocationCount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'anchor_session',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeAllArguments {
    vault: RawTransactionArgument<string>;
}
export interface RevokeAllOptions {
    package?: string;
    arguments: RevokeAllArguments | [
        vault: RawTransactionArgument<string>
    ];
}
/**
 * User-side kill switch. After this returns, every platform-side mutation
 * (`register_blob`, `certify_blob`, `delete_blob`, `extend`, `resize_grow`) aborts
 * with `ERevoked`. Reads (S3 GET path) continue working — they don't touch the
 * pool. Blobs already stored stay readable until the pool's `end_epoch` passes;
 * with no renewal possible they will eventually expire.
 *
 * One-way in v1. v1.5 will add `take_pool` so users can self-custody after
 * revoking, plus an "unrevoke" path if they change their mind before the pool
 * expires.
 *
 * Caller must be `vault.created_by`.
 */
export function revokeAll(options: RevokeAllOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'pool_vault',
        function: 'revoke_all',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}