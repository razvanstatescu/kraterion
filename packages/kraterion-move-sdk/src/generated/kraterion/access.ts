/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Seal access policy for Kraterion buckets.
 * 
 * `seal_approve` is invoked by Seal's threshold key servers via dry_run when a
 * client requests decryption shares. The function aborts to deny access and
 * returns normally to approve.
 * 
 * The function branches on `bucket.encryption_mode`:
 * 
 * - PUBLIC mode: approve any caller (after verifying the id belongs to this bucket
 *   — a sanity check that prevents key reuse across buckets).
 * - PRIVATE mode: approve only the bucket owner OR an address in
 *   `api_decryption_addresses`.
 * 
 * Identity format passed by the Seal SDK:
 * `id = [bucket_uid_bytes (32) || object_uuid (16)]` (48 bytes).
 * 
 * The package-id prefix is bound by Seal at IBE construction time and is NOT part
 * of the bytes we receive here. We prefix-match `id[0..32]` against
 * `object::uid_to_bytes(&bucket.id)` to reject ids minted for other buckets.
 */

import { type Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
export interface SealApproveArguments {
    id: RawTransactionArgument<Array<number>>;
    bucket: RawTransactionArgument<string>;
}
export interface SealApproveOptions {
    package?: string;
    arguments: SealApproveArguments | [
        id: RawTransactionArgument<Array<number>>,
        bucket: RawTransactionArgument<string>
    ];
}
export function sealApprove(options: SealApproveOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        'vector<u8>',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["id", "bucket"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'seal_approve',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}