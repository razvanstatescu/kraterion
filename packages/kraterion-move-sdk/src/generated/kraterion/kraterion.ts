/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Kraterion on-chain bucket: a user-owned, shared Sui object that gates who can
 * read and write its files. Funding for paid operations comes from a single
 * platform-managed `kraterion::reserve::PlatformReserve` — not from per-bucket
 * pools.
 * 
 * Invariants:
 * 
 * - Every KraterionBucket is a Sui shared object. The API surface only exposes
 *   creation paths that share atomically — no public function returns a
 *   KraterionBucket value, so no caller can ever end up with an unshared bucket.
 * - Authorization is enforced at the Move level via ctx.sender() checks.
 * - All files in a bucket share its encryption_mode; access policy is
 *   bucket-scoped, not file-scoped.
 * - Encryption is always on at the gateway. The bucket's mode controls who Seal
 *   will release shares to (see kraterion::access).
 * - Paid operations (register, extend) drain the platform reserve; both require
 *   platform whitelist. Register additionally requires bucket access.
 * - Permissionless paths stay open: anyone can use Walrus's native
 *   `system::register_blob` (paying themselves) or `shared_blob::extend` (draining
 *   the SharedBlob's own jar).
 * 
 * See /docs/implementation-plan.md §4 and the Move package design notes in
 * /docs/decisions.md.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/kraterion::kraterion';
export const KraterionBucket = new MoveStruct({ name: `${$moduleName}::KraterionBucket`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        name: bcs.vector(bcs.u8()),
        encryption_mode: bcs.u8(),
        api_decryption_addresses: bcs.vector(bcs.Address),
        created_epoch: bcs.u64()
    } });
export interface EncryptionModePrivateOptions {
    package?: string;
    arguments?: [
    ];
}
export function encryptionModePrivate(options: EncryptionModePrivateOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'encryption_mode_private',
    });
}
export interface EncryptionModePublicOptions {
    package?: string;
    arguments?: [
    ];
}
export function encryptionModePublic(options: EncryptionModePublicOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'encryption_mode_public',
    });
}
export interface OwnerArguments {
    bucket: RawTransactionArgument<string>;
}
export interface OwnerOptions {
    package?: string;
    arguments: OwnerArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function owner(options: OwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameArguments {
    bucket: RawTransactionArgument<string>;
}
export interface NameOptions {
    package?: string;
    arguments: NameArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function name(options: NameOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EncryptionModeArguments {
    bucket: RawTransactionArgument<string>;
}
export interface EncryptionModeOptions {
    package?: string;
    arguments: EncryptionModeArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function encryptionMode(options: EncryptionModeOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'encryption_mode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ApiAddressesArguments {
    bucket: RawTransactionArgument<string>;
}
export interface ApiAddressesOptions {
    package?: string;
    arguments: ApiAddressesArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function apiAddresses(options: ApiAddressesOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'api_addresses',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IdArguments {
    bucket: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateAndShareBucketArguments {
    name: RawTransactionArgument<Array<number>>;
    encryptionMode: RawTransactionArgument<number>;
}
export interface CreateAndShareBucketOptions {
    package?: string;
    arguments: CreateAndShareBucketArguments | [
        name: RawTransactionArgument<Array<number>>,
        encryptionMode: RawTransactionArgument<number>
    ];
}
/**
 * Create a bucket and share it. Sender becomes owner; api_decryption_addresses is
 * empty. Use `grant_api_access` afterwards before the gateway can write.
 */
export function createAndShareBucket(options: CreateAndShareBucketOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        'vector<u8>',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "encryptionMode"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'create_and_share_bucket',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateGrantAndShareBucketArguments {
    name: RawTransactionArgument<Array<number>>;
    apiAddr: RawTransactionArgument<string>;
    encryptionMode: RawTransactionArgument<number>;
}
export interface CreateGrantAndShareBucketOptions {
    package?: string;
    arguments: CreateGrantAndShareBucketArguments | [
        name: RawTransactionArgument<Array<number>>,
        apiAddr: RawTransactionArgument<string>,
        encryptionMode: RawTransactionArgument<number>
    ];
}
/**
 * Canonical control-plane path: create + grant API + share atomically. The signer
 * (the user via zkLogin) becomes owner; `api_addr` is added to the authorized list
 * before the bucket is shared, so the gateway can wrap blobs into the bucket from
 * the moment it's published.
 */
export function createGrantAndShareBucket(options: CreateGrantAndShareBucketOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        'vector<u8>',
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "apiAddr", "encryptionMode"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'create_grant_and_share_bucket',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GrantApiAccessArguments {
    bucket: RawTransactionArgument<string>;
    apiAddr: RawTransactionArgument<string>;
}
export interface GrantApiAccessOptions {
    package?: string;
    arguments: GrantApiAccessArguments | [
        bucket: RawTransactionArgument<string>,
        apiAddr: RawTransactionArgument<string>
    ];
}
/**
 * Add `api_addr` to the bucket's API decryption list. Idempotent: if the address
 * is already present, this is a no-op (event still emitted so the indexer can be
 * permissive about duplicate grants).
 */
export function grantApiAccess(options: GrantApiAccessOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["bucket", "apiAddr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'grant_api_access',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeAllApiAccessArguments {
    bucket: RawTransactionArgument<string>;
}
export interface RevokeAllApiAccessOptions {
    package?: string;
    arguments: RevokeAllApiAccessArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
/**
 * Clear the bucket's API decryption list. After this, the gateway can neither read
 * (Seal denies) nor write (wrap denies) into this bucket. Only the owner retains
 * access.
 */
export function revokeAllApiAccess(options: RevokeAllApiAccessOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'revoke_all_api_access',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetBucketVisibilityArguments {
    bucket: RawTransactionArgument<string>;
    encryptionMode: RawTransactionArgument<number>;
}
export interface SetBucketVisibilityOptions {
    package?: string;
    arguments: SetBucketVisibilityArguments | [
        bucket: RawTransactionArgument<string>,
        encryptionMode: RawTransactionArgument<number>
    ];
}
/**
 * Owner-only flip between PRIVATE and PUBLIC. Affects all files in the bucket
 * immediately because the bucket's mode is what `seal_approve` reads — no
 * re-upload needed. Idempotent: if the new mode equals the current mode, no event
 * is emitted.
 */
export function setBucketVisibility(options: SetBucketVisibilityOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["bucket", "encryptionMode"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'set_bucket_visibility',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegisterBlobForBucketArguments {
    reserve: RawTransactionArgument<string>;
    bucket: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    paymentAmount: RawTransactionArgument<number | bigint>;
    storageAmount: RawTransactionArgument<number | bigint>;
    epochsAhead: RawTransactionArgument<number>;
    blobId: RawTransactionArgument<number | bigint>;
    rootHash: RawTransactionArgument<number | bigint>;
    size: RawTransactionArgument<number | bigint>;
    encodingType: RawTransactionArgument<number>;
}
export interface RegisterBlobForBucketOptions {
    package?: string;
    arguments: RegisterBlobForBucketArguments | [
        reserve: RawTransactionArgument<string>,
        bucket: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        paymentAmount: RawTransactionArgument<number | bigint>,
        storageAmount: RawTransactionArgument<number | bigint>,
        epochsAhead: RawTransactionArgument<number>,
        blobId: RawTransactionArgument<number | bigint>,
        rootHash: RawTransactionArgument<number | bigint>,
        size: RawTransactionArgument<number | bigint>,
        encodingType: RawTransactionArgument<number>
    ];
}
/**
 * Register a Walrus blob for a specific bucket, paying from the platform reserve.
 * Two access checks:
 *
 * 1.  caller is on the reserve whitelist (admin or authorized_callers)
 * 2.  caller is authorized for the bucket (owner or api_decryption_addresses)
 *
 * Pulls `payment_amount` WAL from the reserve, uses it for both the storage
 * reservation and the registration write payment, and returns any leftover to the
 * reserve. Returns the new `Blob` so the same PTB can compose it further (e.g.
 * immediately go to upload-relay or chain into wrap).
 *
 * Caller-supplied parameters mirror Walrus's `reserve_space` + `register_blob`
 * flow:
 *
 * - `storage_amount`: encoded blob size (post-RS encoding) in bytes
 * - `epochs_ahead`: number of Walrus epochs to keep the blob alive
 * - `blob_id`, `root_hash`, `size`, `encoding_type`: blob metadata the SDK
 *   computes off-chain during local encoding
 * - `payment_amount`: budget pulled from reserve. Should over-estimate storage +
 *   write cost; leftover is returned automatically.
 */
export function registerBlobForBucket(options: RegisterBlobForBucketOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        'u64',
        'u32',
        'u256',
        'u256',
        'u64',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "bucket", "system", "paymentAmount", "storageAmount", "epochsAhead", "blobId", "rootHash", "size", "encodingType"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'register_blob_for_bucket',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WrapInSharedBlobArguments {
    bucket: RawTransactionArgument<string>;
    blob: RawTransactionArgument<string>;
    s3Key: RawTransactionArgument<Array<number>>;
    contentType: RawTransactionArgument<Array<number>>;
    sealIdentity: RawTransactionArgument<Array<number>>;
    sizeBytes: RawTransactionArgument<number | bigint>;
}
export interface WrapInSharedBlobOptions {
    package?: string;
    arguments: WrapInSharedBlobArguments | [
        bucket: RawTransactionArgument<string>,
        blob: RawTransactionArgument<string>,
        s3Key: RawTransactionArgument<Array<number>>,
        contentType: RawTransactionArgument<Array<number>>,
        sealIdentity: RawTransactionArgument<Array<number>>,
        sizeBytes: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Wrap an already-certified Walrus Blob into a SharedBlob attached to this bucket.
 * The SharedBlob is created with an **empty jar** — we don't pre- fund storage
 * extensions. Callers can extend later via either:
 *
 * - `extend_blob_from_reserve` (paid by platform, whitelist-gated), or
 * - `walrus::shared_blob::extend` (drains the SharedBlob's own jar, anyone can
 *   fund it via `walrus::shared_blob::fund`).
 *
 * `seal_identity` is the 48-byte IBE identity the gateway minted at PutObject time
 * (`bucket_object_id (32) || object_uuid (16)`); it gets included in the emitted
 * event so the off-chain indexer can populate `S3Object.seal_identity` without an
 * out-of-band channel.
 *
 * `size_bytes` is the PLAINTEXT byte count, not the Walrus blob's (encrypted) size
 * — that latter value is on the inner Blob and would need a separate getter to
 * surface. Plaintext size is what S3 GET reports as `Content-Length`, so we
 * capture it here authoritatively for the indexer.
 *
 * `storage_end_epoch` is read from the inner Blob's `Storage` resource (no extra
 * arg needed) and emitted with the event so the renewal worker can scan by it
 * without round-tripping through `getObject`.
 *
 * Emits `KraterionObjectCreated`. Authorization: caller must be authorized for the
 * bucket (owner or api_decryption_addresses).
 */
export function wrapInSharedBlob(options: WrapInSharedBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["bucket", "blob", "s3Key", "contentType", "sealIdentity", "sizeBytes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'wrap_in_shared_blob',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ExtendBlobFromReserveArguments {
    reserve: RawTransactionArgument<string>;
    shared: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    paymentAmount: RawTransactionArgument<number | bigint>;
    epochs: RawTransactionArgument<number>;
}
export interface ExtendBlobFromReserveOptions {
    package?: string;
    arguments: ExtendBlobFromReserveArguments | [
        reserve: RawTransactionArgument<string>,
        shared: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        paymentAmount: RawTransactionArgument<number | bigint>,
        epochs: RawTransactionArgument<number>
    ];
}
/**
 * Extend a SharedBlob's storage by `epochs` epochs, paying from the platform
 * reserve. Whitelist-gated only — no bucket access check, because extending an
 * already-existing SharedBlob doesn't create or modify a bucket. The renewal
 * worker uses this on its hourly scan loop.
 *
 * `payment_amount` is pulled from the reserve and added to the SharedBlob's jar;
 * `walrus::shared_blob::extend` then drains the jar to extend storage. Any
 * leftover stays in the jar (acts as a tiny per-blob cushion).
 */
export function extendBlobFromReserve(options: ExtendBlobFromReserveOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        'u32'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "shared", "system", "paymentAmount", "epochs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'extend_blob_from_reserve',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ExtendSharedBlobArguments {
    shared: RawTransactionArgument<string>;
    system: RawTransactionArgument<string>;
    epochsAhead: RawTransactionArgument<number>;
}
export interface ExtendSharedBlobOptions {
    package?: string;
    arguments: ExtendSharedBlobArguments | [
        shared: RawTransactionArgument<string>,
        system: RawTransactionArgument<string>,
        epochsAhead: RawTransactionArgument<number>
    ];
}
/**
 * Permissionless extend: drains the SharedBlob's own jar, no platform involvement.
 * Anyone can call. Provided so users can self-renew a blob after they've called
 * `walrus::shared_blob::fund(shared, coin)` from their own wallet — useful for the
 * cancellation-persistence demo.
 */
export function extendSharedBlob(options: ExtendSharedBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        'u32'
    ] satisfies (string | null)[];
    const parameterNames = ["shared", "system", "epochsAhead"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'extend_shared_blob',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}