/**
 * GetObject + HeadObject — the S3 read path.
 *
 * Flow (GetObject):
 *   1. SigV4 guard resolves identity + bucket + key (URL-style parser).
 *   2. Postgres: load bucket by (account, name, not deleted), load object
 *      by (bucket_id, s3_key, not deleted).
 *   3. App-layer access check: `bucket.api_access_granted` must be true.
 *      Mirrors the on-chain `api_decryption_addresses` list. The on-chain
 *      `seal_approve` would also reject, but the DB check saves us a
 *      Seal round-trip (and is updated synchronously by the dashboard's
 *      revoke action, so it's never stale by more than a tx confirm).
 *   4. Get-or-create the gateway's Seal SessionKey (Redis-cached, ~25min).
 *   5. Build a `seal_approve` PTB → BCS bytes (sender = gateway address;
 *      not submitted on-chain, dry-run only by Seal key servers).
 *   6. HTTP GET the encrypted bytes from the public Walrus aggregator.
 *      Aggregator transients translate to `ServiceUnavailable` (503) so
 *      boto3 auto-retries with backoff.
 *   7. `seal.decrypt(...)` → plaintext, asserted to match the stored
 *      plaintext size_bytes (a mismatch is silent corruption — log loudly
 *      and 500).
 *   8. Stream plaintext with canonical S3 response headers.
 *
 * HeadObject is the same flow minus the body fetch + decrypt — stops at
 * step 3 and returns headers only (size, type, etag, last-modified).
 *
 * Behavior of `Range:` and conditional headers:
 *   We advertise `Accept-Ranges: none`, which per RFC 7233 §3.1 means
 *   "MUST ignore Range." We also silently ignore `If-Match`,
 *   `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since` — RFC
 *   7232 permits ignoring conditionals on resources that don't support
 *   them. The earlier 501 behavior broke `aws s3 sync` (re-downloads on
 *   every run) and boto3's multipart-download fallback. Honoring
 *   `If-None-Match` → 304 is a Phase-6 follow-up.
 *
 * Decryption size cap:
 *   AES-GCM is non-streaming — the auth tag at the end of the ciphertext
 *   MUST be validated before any plaintext is released, so we have to
 *   buffer the entire blob in memory. We cap at `MAX_DECRYPT_BYTES` (2
 *   GiB) for v1; objects larger than that return `EntityTooLarge`.
 *   Chunked-frame Seal encryption (Iceberg-style) is post-hackathon.
 */

import { Controller, Get, Head, Logger, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ObjectBytesService, OBJECT_SELECT, type ObjectRow } from "./object-bytes.service.js";
import { S3Error } from "./s3-error.js";
import { requireKraterion, requireBucket, requireKey } from "./request-context.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";
import type { Prisma } from "@prisma/client";

const BUCKET_SELECT = {
  id: true,
  name: true,
  kraterion_bucket_object_id: true,
  api_access_granted: true,
} satisfies Prisma.BucketSelect;

type BucketRow = Prisma.BucketGetPayload<{ select: typeof BUCKET_SELECT }>;

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsReadController {
  private readonly logger = new Logger(ObjectsReadController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bytes: ObjectBytesService,
  ) {}

  @Get(":bucket/*")
  async getObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    const { bucketRow, objectRow } = await this.loadObject(ctx);
    await this.bytes.serve({ bucket: bucketRow, object: objectRow, reply });
  }

  @Head(":bucket/*")
  async headObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    const { objectRow } = await this.loadObject(ctx);
    this.bytes.head({ object: objectRow, reply });
  }

  private async loadObject(
    ctx: KraterionRequestContext,
  ): Promise<{ bucketRow: BucketRow; objectRow: ObjectRow }> {
    const bucketName = requireBucket(ctx);
    const key = requireKey(ctx);

    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: BUCKET_SELECT,
    });
    if (!bucketRow) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }
    if (!bucketRow.api_access_granted) {
      throw new S3Error(
        "KeyAccessRevoked",
        "The platform's access to decrypt this object has been revoked.",
      );
    }

    const objectRow = await this.prisma.s3Object.findFirst({
      where: { bucket_id: bucketRow.id, s3_key: key, deleted_at: null },
      select: OBJECT_SELECT,
    });
    if (!objectRow) {
      throw new S3Error("NoSuchKey", "The specified key does not exist.");
    }
    return { bucketRow, objectRow };
  }
}
