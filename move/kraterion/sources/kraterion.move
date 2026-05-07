/// Kraterion on-chain package.
///
/// Will host:
///   - `KraterionBucket` shared object with `api_decryption_addresses`
///   - `seal_approve_private` for Seal access control
///   - `grant_api_access`, `revoke_all_api_access` admin entrypoints
///
/// See /docs/implementation-plan.md §4 for the full module spec.
module kraterion::kraterion;
