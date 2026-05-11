import { Module } from "@nestjs/common";
import { BucketsController } from "./buckets.controller.js";
import { ObjectBytesService } from "./object-bytes.service.js";
import { ObjectsReadController } from "./objects.read.controller.js";
import { ObjectsListController } from "./objects.list.controller.js";
import { ObjectsWriteController } from "./objects.write.controller.js";
import { PublicObjectsController } from "./public.controller.js";

/**
 * S3 surface area:
 *   - `BucketsController` — ListBuckets, HeadBucket, CreateBucket(=501),
 *     DeleteBucket.
 *   - `ObjectsReadController` — GetObject, HeadObject (SigV4-authed).
 *   - `ObjectsWriteController` — PutObject, DeleteObject.
 *   - `ObjectsListController` — ListObjectsV2 (501 stub; Phase 6).
 *   - `PublicObjectsController` — unauthenticated `GET /public/:bucket/*`
 *     for buckets in `encryption_mode = "public-read"`.
 *   - `ObjectBytesService` — shared Seal+Walrus decrypt-and-serve
 *     pipeline used by both Read and Public controllers.
 */
@Module({
  controllers: [
    BucketsController,
    ObjectsReadController,
    ObjectsWriteController,
    ObjectsListController,
    PublicObjectsController,
  ],
  providers: [ObjectBytesService],
})
export class S3Module {}
