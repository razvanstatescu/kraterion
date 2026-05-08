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
export const KraterionObjectCreated = new MoveStruct({ name: `${$moduleName}::KraterionObjectCreated`, fields: {
        bucket_id: bcs.Address,
        walrus_blob_object_id: bcs.Address,
        walrus_blob_id: bcs.u256(),
        s3_key: bcs.vector(bcs.u8()),
        content_type: bcs.vector(bcs.u8()),
        owner_address: bcs.Address,
        wrapped_by: bcs.Address,
        funded_amount: bcs.u64()
    } });
export const KraterionObjectExtended = new MoveStruct({ name: `${$moduleName}::KraterionObjectExtended`, fields: {
        shared_blob_id: bcs.Address,
        epochs_added: bcs.u32(),
        funder: bcs.Address
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