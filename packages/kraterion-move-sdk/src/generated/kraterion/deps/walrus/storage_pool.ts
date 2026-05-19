/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Pooled storage model: one `StoragePool` object reserves capacity for a given
 * epoch range, and multiple blobs can be registered against it. When a blob is
 * deleted, its capacity is freed back into the pool for reuse.
 */

import { MoveStruct } from '../../../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = 'walrus::storage_pool';
export const StoragePool = new MoveStruct({ name: `${$moduleName}::StoragePool`, fields: {
        id: bcs.Address,
        version: bcs.u64()
    } });