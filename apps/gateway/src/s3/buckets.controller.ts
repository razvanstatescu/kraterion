/**
 * S3 bucket endpoints — ListBuckets, HeadBucket, DeleteBucket, and a
 * CreateBucket stub that returns `NotImplemented`.
 *
 * All routes are SigV4-protected via `Sigv4Guard` (applied at the
 * controller level). The guard populates `req.kraterion` with the
 * resolved identity + URL-style-parsed bucket name.
 *
 * Path-style only in this phase: `boto3` with
 * `endpoint_url=http://localhost:4002` defaults to path-style.
 * Virtual-hosted-style is a Phase-7 polish item.
 */

import {
  Controller,
  Delete,
  Get,
  Head,
  Header,
  HttpCode,
  Logger,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { S3Error } from "./s3-error.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";

@UseGuards(Sigv4Guard)
@Controller()
export class BucketsController {
  private readonly logger = new Logger(BucketsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /` — ListBuckets. Returns every non-deleted bucket the
   * caller's account owns, in canonical XML.
   */
  @Get()
  @Header("Content-Type", "application/xml")
  async listBuckets(@Req() req: FastifyRequest): Promise<string> {
    const ctx = requireKraterion(req);
    if (ctx.bucket) {
      // GET on `/<bucket>` covers many sub-actions (location,
      // versioning, lifecycle, etc); not implemented this phase.
      throw new S3Error("NotImplemented", "GET on a bucket is not implemented in this phase.");
    }
    const buckets = await this.prisma.bucket.findMany({
      where: {
        project: { account_id: ctx.identity.accountId },
        deleted_at: null,
      },
      orderBy: { created_at: "asc" },
      select: { name: true, created_at: true },
    });

    return renderListAllMyBucketsResult({
      ownerId: ctx.identity.accountId,
      buckets: buckets.map((b) => ({
        name: b.name,
        creationDate: b.created_at.toISOString(),
      })),
    });
  }

  /**
   * `HEAD /:bucket` — HeadBucket. 200 if owned + not deleted; 404
   * `NoSuchBucket` otherwise. No body.
   */
  @Head(":bucket")
  @HttpCode(200)
  async headBucket(@Req() req: FastifyRequest): Promise<void> {
    const ctx = requireKraterion(req);
    const name = requireBucket(ctx);
    const row = await this.prisma.bucket.findFirst({
      where: {
        name,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: { id: true },
    });
    if (!row) throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
  }

  /**
   * `PUT /:bucket` — CreateBucket. **Always 501** in this phase: bucket
   * creation requires the user's zkLogin signature (the on-chain
   * `KraterionBucket.owner` field is set to `ctx.sender()` at create
   * time, so the user must sign). That flow lives in the dashboard,
   * not the S3 API. Test buckets are spun up via
   * `scripts/bootstrap-gateway.ts`.
   */
  @Put(":bucket")
  createBucket(): never {
    throw new S3Error(
      "NotImplemented",
      "CreateBucket is not supported via the S3 API. Create buckets in the Kraterion dashboard.",
    );
  }

  /**
   * `DELETE /:bucket` — DeleteBucket. Soft delete; rejects if there
   * are still non-deleted objects (canonical AWS behavior is to
   * require an empty bucket).
   *
   * The on-chain `KraterionBucket` shared object is NOT cleaned up —
   * it persists with whatever WAL it has. Our DB row records that
   * it's no longer addressable from the S3 surface. (Reactivating a
   * deleted bucket isn't supported in v1.)
   */
  @Delete(":bucket")
  @HttpCode(204)
  async deleteBucket(@Req() req: FastifyRequest): Promise<void> {
    const ctx = requireKraterion(req);
    const name = requireBucket(ctx);
    const row = await this.prisma.bucket.findFirst({
      where: {
        name,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: { id: true, _count: { select: { objects: { where: { deleted_at: null } } } } },
    });
    if (!row) throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    if (row._count.objects > 0) {
      throw new S3Error("BucketNotEmpty", "The bucket you tried to delete is not empty.");
    }
    await this.prisma.bucket.update({
      where: { id: row.id },
      data: { deleted_at: new Date() },
    });
    this.logger.log(`bucket soft-deleted: ${name} (account=${ctx.identity.accountId})`);
  }
}

function requireKraterion(req: FastifyRequest): KraterionRequestContext {
  const ctx = req.kraterion;
  if (!ctx) throw new S3Error("InternalError", "Request context not initialized.");
  return ctx;
}

function requireBucket(ctx: KraterionRequestContext): string {
  if (!ctx.bucket) throw new S3Error("InvalidRequest", "Bucket name is required.");
  return ctx.bucket;
}

function renderListAllMyBucketsResult(data: {
  ownerId: string;
  buckets: { name: string; creationDate: string }[];
}): string {
  const owner = `<Owner><ID>${esc(data.ownerId)}</ID><DisplayName>${esc(data.ownerId)}</DisplayName></Owner>`;
  const buckets =
    data.buckets.length === 0
      ? "<Buckets/>"
      : "<Buckets>" +
        data.buckets
          .map(
            (b) =>
              `<Bucket><Name>${esc(b.name)}</Name><CreationDate>${esc(b.creationDate)}</CreationDate></Bucket>`,
          )
          .join("") +
        "</Buckets>";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${owner}${buckets}</ListAllMyBucketsResult>`
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
