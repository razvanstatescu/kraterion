/**
 * `GET /:bucket` — ListObjectsV2.
 *
 * Phase-4 stub: validates the bucket exists and is owned by the caller,
 * then 501s. The real implementation lands in Phase 6 (paginated key
 * listing with prefix + delimiter semantics, ETag inclusion, etc).
 *
 * Validating the bucket first means callers get the canonical
 * `NoSuchBucket` 404 instead of `NotImplemented` for nonexistent
 * buckets — better UX and aligns with how AWS routes 404s before 501s.
 */

import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { S3Error } from "./s3-error.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsListController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":bucket")
  async listObjectsV2(@Req() req: FastifyRequest): Promise<never> {
    const ctx = requireKraterion(req);
    if (!ctx.bucket) {
      throw new S3Error("InvalidRequest", "Bucket name is required.");
    }
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        name: ctx.bucket,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: { id: true },
    });
    if (!bucket) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }
    throw new S3Error(
      "NotImplemented",
      "ListObjectsV2 is not implemented in this phase. Coming in Phase 6.",
    );
  }
}

function requireKraterion(req: FastifyRequest): KraterionRequestContext {
  const ctx = req.kraterion;
  if (!ctx) throw new S3Error("InternalError", "Request context not initialized.");
  return ctx;
}
