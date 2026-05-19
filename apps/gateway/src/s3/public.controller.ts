/**
 * Public-read object route — unauthenticated GET / HEAD of files in
 * buckets where `encryption_mode = "public-read"`. The dashboard's
 * "Copy public URL" button surfaces these; embed them in `<img src>`,
 * paste them in a tweet, link them from a README.
 *
 * URL shape: `GET /public/:bucket/<key-with-slashes>`. Path-style only
 * (virtual-hosted-style is post-hackathon for the rest of the gateway too).
 *
 * Authorization model:
 *   - No SigV4 guard. Anyone can GET.
 *   - The bucket MUST be `encryption_mode = "public-read"`. Private buckets
 *     return `NoSuchBucket` — same shape S3 uses to avoid leaking
 *     existence-but-not-permission to scanners.
 *   - The bucket MUST have `api_access_granted = true`. Revoking API access
 *     freezes both private + public reads through the gateway (Seal would
 *     reject anyway via `seal_approve` returning to no caller after revoke;
 *     the DB check just saves the Seal round-trip).
 *
 * Cryptographic story:
 *   Move's `seal_approve` is mode-aware (`access.move:30-50`). For public
 *   buckets it short-circuits to `return` for any caller, so the gateway's
 *   own sub-wallet session key gets a share from Seal regardless of who's
 *   hitting the HTTP route. The encrypted blob on Walrus is the same bytes
 *   either way — only the Seal policy differs.
 */

import { Controller, Get, Head, Logger, Param, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { MeterClassNone } from "../billing/meter-class.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ObjectBytesService, OBJECT_SELECT } from "./object-bytes.service.js";
import { S3Error } from "./s3-error.js";

const PUBLIC_BUCKET_SELECT = {
  id: true,
  name: true,
  kraterion_bucket_object_id: true,
  encryption_mode: true,
  api_access_granted: true,
} satisfies Prisma.BucketSelect;

@Controller("public")
export class PublicObjectsController {
  private readonly logger = new Logger(PublicObjectsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bytes: ObjectBytesService,
  ) {}

  // Public routes are anonymous — no `req.kraterion`, so the global
  // UsageInterceptor short-circuits anyway. We still tag them
  // `MeterClassNone` to keep the "untagged handler" warning quiet.
  // Egress billing for public reads will hook into the
  // `share_token_egress_bytes` / future `public_egress_bytes` meter in
  // a later phase, where we'll resolve the bucket → project at
  // controller level before metering.
  @Get(":bucket/*")
  @MeterClassNone()
  async getObject(
    @Param("bucket") bucketName: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const { bucket, object } = await this.load(bucketName, this.extractKey(req.url, bucketName));
    await this.bytes.serve({
      bucket,
      object,
      reply,
      options: { cacheable: true, publicCors: true },
    });
  }

  @Head(":bucket/*")
  @MeterClassNone()
  async headObject(
    @Param("bucket") bucketName: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const { object } = await this.load(bucketName, this.extractKey(req.url, bucketName));
    this.bytes.head({
      object,
      reply,
      options: { cacheable: true, publicCors: true },
    });
  }

  /**
   * The wildcard `:bucket/*` syntax doesn't bind the splat in Fastify
   * route params, so we recover the object key from the raw URL after
   * the bucket segment. URL-decode each segment but preserve `/`
   * separators (S3 keys are slash-significant).
   */
  private extractKey(rawUrl: string, bucketName: string): string {
    const pathOnly = rawUrl.split("?")[0] ?? "";
    const prefix = `/public/${encodeURIComponent(bucketName)}/`;
    const altPrefix = `/public/${bucketName}/`; // bucket names are S3-safe; both forms work
    let suffix: string | null = null;
    if (pathOnly.startsWith(prefix)) suffix = pathOnly.slice(prefix.length);
    else if (pathOnly.startsWith(altPrefix)) suffix = pathOnly.slice(altPrefix.length);
    if (!suffix) {
      throw new S3Error("NoSuchKey", "The specified key does not exist.");
    }
    try {
      return suffix
        .split("/")
        .map((seg) => decodeURIComponent(seg))
        .join("/");
    } catch {
      throw new S3Error("InvalidArgument", "Object key is not valid URL-encoded UTF-8.");
    }
  }

  private async load(
    bucketName: string,
    key: string,
  ): Promise<{
    bucket: Prisma.BucketGetPayload<{ select: typeof PUBLIC_BUCKET_SELECT }>;
    object: Prisma.S3ObjectGetPayload<{ select: typeof OBJECT_SELECT }>;
  }> {
    const bucket = await this.prisma.bucket.findFirst({
      where: { name: bucketName, deleted_at: null },
      select: PUBLIC_BUCKET_SELECT,
    });

    // 404 in three cases — bucket missing, bucket private, API revoked.
    // All look identical to a third-party caller; we don't leak which.
    if (!bucket || bucket.encryption_mode !== "public-read" || !bucket.api_access_granted) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }

    const object = await this.prisma.s3Object.findFirst({
      where: { bucket_id: bucket.id, s3_key: key, deleted_at: null },
      select: OBJECT_SELECT,
    });
    if (!object) {
      throw new S3Error("NoSuchKey", "The specified key does not exist.");
    }
    return { bucket, object };
  }
}
