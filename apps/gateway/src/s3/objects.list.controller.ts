/**
 * `GET /:bucket` — ListObjectsV2.
 *
 * Phase-4 stub: 501. Phase 6 implements paginated listing with
 * prefix + delimiter semantics + ETag/size in the response.
 *
 * We deliberately don't validate the bucket here — every other request
 * shape that hits this route will already 501 with the same message,
 * so the extra Postgres lookup just burns a round-trip on a path that
 * always errors. (For comparison: `BucketsController` handles
 * HeadBucket and DeleteBucket, both of which legitimately return
 * NoSuchBucket — those routes do validate.)
 */

import { Controller, Get, UseGuards } from "@nestjs/common";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { S3Error } from "./s3-error.js";

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsListController {
  @Get(":bucket")
  listObjectsV2(): never {
    throw new S3Error(
      "NotImplemented",
      "ListObjectsV2 is not implemented in this phase. Coming in Phase 6.",
    );
  }
}
