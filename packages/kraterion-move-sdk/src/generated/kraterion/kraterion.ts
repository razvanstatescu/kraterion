/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Kraterion on-chain bucket: a user-owned, shared Sui object that pools WAL
 * funding for SharedBlobs and gates who can read / write its files.
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
 * 
 * See /docs/implementation-plan.md §4 and the Move package design notes in
 * /docs/decisions.md.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as balance from './deps/sui/balance.js';
const $moduleName = '@local-pkg/kraterion::kraterion';
export const KraterionBucket = new MoveStruct({ name: `${$moduleName}::KraterionBucket`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        name: bcs.vector(bcs.u8()),
        funding_pool: balance.Balance,
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
export interface FundingPoolValueArguments {
    bucket: RawTransactionArgument<string>;
}
export interface FundingPoolValueOptions {
    package?: string;
    arguments: FundingPoolValueArguments | [
        bucket: RawTransactionArgument<string>
    ];
}
export function fundingPoolValue(options: FundingPoolValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'funding_pool_value',
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
export interface FundBucketArguments {
    bucket: RawTransactionArgument<string>;
    coin: RawTransactionArgument<string>;
}
export interface FundBucketOptions {
    package?: string;
    arguments: FundBucketArguments | [
        bucket: RawTransactionArgument<string>,
        coin: RawTransactionArgument<string>
    ];
}
/**
 * Anyone can top up a bucket's WAL pool. Mirrors Walrus's "anyone can fund a
 * SharedBlob" property at the bucket level — useful for the post-cancellation
 * persistence demo (others can keep your files alive).
 */
export function fundBucket(options: FundBucketOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["bucket", "coin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'fund_bucket',
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
export interface WrapInSharedBlobArguments {
    bucket: RawTransactionArgument<string>;
    blob: RawTransactionArgument<string>;
    s3Key: RawTransactionArgument<Array<number>>;
    contentType: RawTransactionArgument<Array<number>>;
    initialFundAmount: RawTransactionArgument<number | bigint>;
}
export interface WrapInSharedBlobOptions {
    package?: string;
    arguments: WrapInSharedBlobArguments | [
        bucket: RawTransactionArgument<string>,
        blob: RawTransactionArgument<string>,
        s3Key: RawTransactionArgument<Array<number>>,
        contentType: RawTransactionArgument<Array<number>>,
        initialFundAmount: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Wrap a Walrus Blob into a SharedBlob, drawing `initial_fund_amount` WAL from the
 * bucket's pool to seed its renewal jar. Authorized for owner OR any address in
 * `api_decryption_addresses` — the gateway uses its API keypair, the user uses
 * their wallet.
 *
 * Encryption is performed off-chain at the gateway; this function does not touch
 * the file bytes. Files are always Seal-encrypted; whether they're publicly
 * readable is decided by `bucket.encryption_mode` at decrypt time.
 */
export function wrapInSharedBlob(options: WrapInSharedBlobOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["bucket", "blob", "s3Key", "contentType", "initialFundAmount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'kraterion',
        function: 'wrap_in_shared_blob',
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
 * Renew a SharedBlob's storage by `epochs_ahead`. Anyone can call this — Walrus's
 * underlying `extend` is permissionless and uses the SharedBlob's own jar. Emits
 * `KraterionObjectExtended` for the indexer.
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