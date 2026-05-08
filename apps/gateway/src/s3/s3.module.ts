import { Module } from "@nestjs/common";
import { BucketsController } from "./buckets.controller.js";
import { ObjectsReadController } from "./objects.read.controller.js";
import { ObjectsListController } from "./objects.list.controller.js";
import { ObjectsWriteController } from "./objects.write.controller.js";

/**
 * S3 surface area:
 *   - `BucketsController` — ListBuckets, HeadBucket, CreateBucket(=501),
 *     DeleteBucket.
 *   - `ObjectsReadController` — GetObject, HeadObject.
 *   - `ObjectsWriteController` — PutObject, DeleteObject.
 *   - `ObjectsListController` — ListObjectsV2 (501 stub; Phase 6).
 */
@Module({
  controllers: [
    BucketsController,
    ObjectsReadController,
    ObjectsWriteController,
    ObjectsListController,
  ],
})
export class S3Module {}
