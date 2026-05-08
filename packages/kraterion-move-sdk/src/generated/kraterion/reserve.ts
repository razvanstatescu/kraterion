/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Platform-level WAL reserve.
 * 
 * A single shared object holds the WAL the platform spends on uploads
 * (register_blob) and renewals (extend_blob_from_reserve) on behalf of users. Two
 * access controls:
 * 
 * 1.  `admin` — the address that can authorize/deauthorize callers and withdraw
 *     funds. Set at creation; never changes (transfer_admin could be added later,
 *     deferred).
 * 2.  `authorized_callers` — a whitelist of addresses that can drain the reserve
 *     via `pull_wal`. The gateway sub-wallet (uploads) and the renewal worker
 *     sub-wallet (extensions) live on this list.
 * 
 * Anyone can fund the reserve (`fund`). Only the admin can withdraw or modify the
 * whitelist. Only authorized callers can pull WAL.
 * 
 * Permissionless paths stay open: any caller can use Walrus's native
 * `system::register_blob` (paying from their own wallet) or `shared_blob::extend`
 * (draining the SharedBlob's own jar). The reserve is just for operations the
 * platform funds on behalf of users.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as balance from './deps/sui/balance.js';
const $moduleName = '@local-pkg/kraterion::reserve';
export const PlatformReserve = new MoveStruct({ name: `${$moduleName}::PlatformReserve`, fields: {
        id: bcs.Address,
        admin: bcs.Address,
        authorized_callers: bcs.vector(bcs.Address),
        wal_balance: balance.Balance
    } });
export interface AuthorizeCallerArguments {
    reserve: RawTransactionArgument<string>;
    addr: RawTransactionArgument<string>;
}
export interface AuthorizeCallerOptions {
    package?: string;
    arguments: AuthorizeCallerArguments | [
        reserve: RawTransactionArgument<string>,
        addr: RawTransactionArgument<string>
    ];
}
/**
 * Add `addr` to the whitelist of callers that can drain the reserve. Idempotent.
 * Admin only.
 */
export function authorizeCaller(options: AuthorizeCallerOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "addr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'authorize_caller',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeauthorizeCallerArguments {
    reserve: RawTransactionArgument<string>;
    addr: RawTransactionArgument<string>;
}
export interface DeauthorizeCallerOptions {
    package?: string;
    arguments: DeauthorizeCallerArguments | [
        reserve: RawTransactionArgument<string>,
        addr: RawTransactionArgument<string>
    ];
}
/** Remove `addr` from the whitelist. Idempotent. Admin only. */
export function deauthorizeCaller(options: DeauthorizeCallerOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "addr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'deauthorize_caller',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithdrawArguments {
    reserve: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    recipient: RawTransactionArgument<string>;
}
export interface WithdrawOptions {
    package?: string;
    arguments: WithdrawArguments | [
        reserve: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Withdraw `amount` WAL to `recipient`. Admin only — this is the platform's way to
 * recover unused funds.
 */
export function withdraw(options: WithdrawOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        'u64',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "amount", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'withdraw',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FundArguments {
    reserve: RawTransactionArgument<string>;
    coin: RawTransactionArgument<string>;
}
export interface FundOptions {
    package?: string;
    arguments: FundArguments | [
        reserve: RawTransactionArgument<string>,
        coin: RawTransactionArgument<string>
    ];
}
/**
 * Top up the reserve. Anyone can fund it (matches Walrus's "anyone can fund a
 * SharedBlob" idiom). The platform cron-funds the reserve from its central
 * treasury; users could theoretically also contribute, though in practice only the
 * platform does.
 */
export function fund(options: FundOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reserve", "coin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'fund',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminArguments {
    reserve: RawTransactionArgument<string>;
}
export interface AdminOptions {
    package?: string;
    arguments: AdminArguments | [
        reserve: RawTransactionArgument<string>
    ];
}
export function admin(options: AdminOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reserve"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'admin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AuthorizedCallersArguments {
    reserve: RawTransactionArgument<string>;
}
export interface AuthorizedCallersOptions {
    package?: string;
    arguments: AuthorizedCallersArguments | [
        reserve: RawTransactionArgument<string>
    ];
}
export function authorizedCallers(options: AuthorizedCallersOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reserve"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'authorized_callers',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WalBalanceArguments {
    reserve: RawTransactionArgument<string>;
}
export interface WalBalanceOptions {
    package?: string;
    arguments: WalBalanceArguments | [
        reserve: RawTransactionArgument<string>
    ];
}
export function walBalance(options: WalBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reserve"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'wal_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IdArguments {
    reserve: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        reserve: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/kraterion';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reserve"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reserve',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}