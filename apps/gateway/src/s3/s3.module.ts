import { Module } from "@nestjs/common";
import { BucketsController } from "./buckets.controller.js";
import { ObjectsReadController } from "./objects.read.controller.js";
import { ObjectsListController } from "./objects.list.controller.js";

/**
 * S3 surface area. Phase 3 added the bucket controller; Phase 4 adds
 * the read controller (GetObject + HeadObject) plus a 501 stub for
 * ListObjectsV2 that lives in its own controller — Phase 6 will make
 * that real.
 *
 * Phase 5 will add `ObjectsWriteController` (PutObject + DeleteObject)
 * alongside.
 */
@Module({
  controllers: [BucketsController, ObjectsReadController, ObjectsListController],
})
export class S3Module {}
