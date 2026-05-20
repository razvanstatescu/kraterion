/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * On-chain events emitted by the Kraterion package.
 * 
 * All events are read by the off-chain indexer (Postgres) to materialize the
 * authoritative view of buckets, objects, access lists, and visibility flips. None
 * of the events carry a `timestamp_ms`: the indexer reads the executed-at
 * timestamp from the transaction effects when ingesting the event, which is
 * authoritative and saves a `Clock` parameter on every entry function.
 * 
 * The visibility of these structs is `public(package)`-friendly via the public
 * emit helpers: only this package's modules call `emit_*`, but the struct
 * definitions are public so off-chain SDK consumers can decode them.
 */

import { MoveStruct } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = '@local-pkg/kraterion::events';
export const KraterionBucketCreated = new MoveStruct({ name: `${$moduleName}::KraterionBucketCreated`, fields: {
        bucket_id: bcs.Address,
        owner: bcs.Address,
        name: bcs.vector(bcs.u8()),
        encryption_mode: bcs.u8()
    } });
export const ApiAccessGranted = new MoveStruct({ name: `${$moduleName}::ApiAccessGranted`, fields: {
        bucket_id: bcs.Address,
        owner: bcs.Address,
        granted_to: bcs.Address
    } });
export const ApiAccessRevoked = new MoveStruct({ name: `${$moduleName}::ApiAccessRevoked`, fields: {
        bucket_id: bcs.Address,
        owner: bcs.Address
    } });
export const BucketVisibilityChanged = new MoveStruct({ name: `${$moduleName}::BucketVisibilityChanged`, fields: {
        bucket_id: bcs.Address,
        owner: bcs.Address,
        old_mode: bcs.u8(),
        new_mode: bcs.u8()
    } });
export const ReserveCreated = new MoveStruct({ name: `${$moduleName}::ReserveCreated`, fields: {
        reserve_id: bcs.Address,
        admin: bcs.Address
    } });
export const ReserveCallerAuthorized = new MoveStruct({ name: `${$moduleName}::ReserveCallerAuthorized`, fields: {
        reserve_id: bcs.Address,
        admin: bcs.Address,
        caller: bcs.Address
    } });
export const ReserveCallerDeauthorized = new MoveStruct({ name: `${$moduleName}::ReserveCallerDeauthorized`, fields: {
        reserve_id: bcs.Address,
        admin: bcs.Address,
        caller: bcs.Address
    } });
export const ReserveFunded = new MoveStruct({ name: `${$moduleName}::ReserveFunded`, fields: {
        reserve_id: bcs.Address,
        amount: bcs.u64()
    } });
export const ReserveWithdrawn = new MoveStruct({ name: `${$moduleName}::ReserveWithdrawn`, fields: {
        reserve_id: bcs.Address,
        admin: bcs.Address,
        recipient: bcs.Address,
        amount: bcs.u64()
    } });
export const KraterionVaultCreated = new MoveStruct({ name: `${$moduleName}::KraterionVaultCreated`, fields: {
        vault_id: bcs.Address,
        pool_id: bcs.Address,
        created_by: bcs.Address,
        /**
         * Off-chain Postgres `Project.id` UUID (typically 16 bytes). Indexer uses this to
         * associate the on-chain vault with its project row.
         */
        project_id: bcs.vector(bcs.u8()),
        reserved_encoded_capacity_bytes: bcs.u64(),
        start_epoch: bcs.u32(),
        end_epoch: bcs.u32()
    } });
export const KraterionVaultRevoked = new MoveStruct({ name: `${$moduleName}::KraterionVaultRevoked`, fields: {
        vault_id: bcs.Address,
        revoked_by: bcs.Address
    } });
export const KraterionPooledBlobRegistered = new MoveStruct({ name: `${$moduleName}::KraterionPooledBlobRegistered`, fields: {
        vault_id: bcs.Address,
        pooled_blob_object_id: bcs.Address,
        walrus_blob_id: bcs.u256(),
        s3_key: bcs.vector(bcs.u8()),
        content_type: bcs.vector(bcs.u8()),
        /**
         * The user who owns the project (vault.created_by) — recorded so downstream
         * tooling doesn't have to dereference the vault.
         */
        owner_address: bcs.Address,
        /** The address that signed the registration tx (gateway operator). */
        registered_by: bcs.Address,
        /**
         * 48-byte Seal IBE identity. Same format as the SharedBlob-era event
         * (`bucket_uid (32) || object_uuid (16)`); pool membership is orthogonal to
         * encryption identity.
         */
        seal_identity: bcs.vector(bcs.u8()),
        /** Plaintext size — what S3 GET reports as Content-Length. */
        size_bytes: bcs.u64(),
        /** 16-byte raw MD5 of plaintext. S3 ETag for non-multipart uploads. */
        etag_md5: bcs.vector(bcs.u8())
    } });
export const KraterionPooledBlobCertified = new MoveStruct({ name: `${$moduleName}::KraterionPooledBlobCertified`, fields: {
        vault_id: bcs.Address,
        pooled_blob_object_id: bcs.Address,
        walrus_blob_id: bcs.u256(),
        certified_by: bcs.Address
    } });
export const KraterionPooledBlobDeleted = new MoveStruct({ name: `${$moduleName}::KraterionPooledBlobDeleted`, fields: {
        vault_id: bcs.Address,
        pooled_blob_object_id: bcs.Address,
        walrus_blob_id: bcs.u256(),
        deleted_by: bcs.Address
    } });
export const KraterionPoolExtended = new MoveStruct({ name: `${$moduleName}::KraterionPoolExtended`, fields: {
        vault_id: bcs.Address,
        extended_epochs: bcs.u32(),
        new_end_epoch: bcs.u32(),
        extended_by: bcs.Address
    } });
export const KraterionPoolResizedGrow = new MoveStruct({ name: `${$moduleName}::KraterionPoolResizedGrow`, fields: {
        vault_id: bcs.Address,
        additional_encoded_capacity_bytes: bcs.u64(),
        new_reserved_encoded_capacity_bytes: bcs.u64(),
        resized_by: bcs.Address
    } });
export const KraterionPoolResizedShrink = new MoveStruct({ name: `${$moduleName}::KraterionPoolResizedShrink`, fields: {
        vault_id: bcs.Address,
        /**
         * Percent of unused capacity that was decreased — Walrus's
         * `decrease_storage_pool_unused_capacity_by_percent` takes a `u8` 1..=100; we
         * mirror.
         */
        percent_shrunk: bcs.u8(),
        new_reserved_encoded_capacity_bytes: bcs.u64(),
        resized_by: bcs.Address
    } });