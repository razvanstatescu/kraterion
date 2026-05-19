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