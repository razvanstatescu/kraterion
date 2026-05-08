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
 *   7. `seal.decrypt(...)` → plaintext.
 *   8. Stream plaintext with canonical S3 response headers.
 *
 * HeadObject is the same flow minus the body fetch + decrypt — stops at
 * step 3 and returns headers only (size, type, etag, last-modified).
 *
 * NOT in this phase:
 *   - Range requests (`Range: bytes=...`) — 501 via the catch-all check
 *   - Conditional gets (`If-Match` etc) — 501 via the catch-all check
 *   - The `/public/:bucket/:key` unauthenticated route — Phase 7
 *
 * The route patterns are explicit:
 *   GET / → ListBuckets (BucketsController)
 *   GET /:bucket → ListObjectsV2 (ObjectsListController, 501 in Phase 4)
 *   GET /:bucket/* → GetObject (this controller)
 *   HEAD /:bucket → HeadBucket (BucketsController)
 *   HEAD /:bucket/* → HeadObject (this controller)
 *
 * The `*` matches everything after the bucket — including slashes and
 * percent-encoded bytes — and the URL-style parser populates
 * `req.kraterion.key` with the decoded value, so this controller never
 * touches `req.params['*']` directly.
 */

import {
  Controller,
  Get,
  Head,
  Inject,
  Logger,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { Transaction } from "@mysten/sui/transactions";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { GatewayKeypairService } from "../auth/gateway-keypair.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { S3Error } from "./s3-error.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import { access } from "@kraterion/kraterion-move-sdk";
import {
  getSuiClient,
  readBlobByBlobId,
} from "@kraterion/walrus-client";
import {
  getOrCreateSessionKey,
  getSealClient,
} from "@kraterion/seal-client";

interface ObjectRow {
  id: string;
  s3_key: string;
  size_bytes: bigint;
  content_type: string | null;
  etag: string;
  walrus_blob_id: string;
  seal_identity: Buffer;
  uploaded_at: Date;
}

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsReadController {
  private readonly logger = new Logger(ObjectsReadController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayKeypair: GatewayKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get(":bucket/*")
  async getObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    rejectUnsupportedReadHeaders(req);
    const { bucketRow, objectRow } = await this.loadObject(ctx);

    const sealClient = getSealClient();
    const signer = this.gatewayKeypair.getKeypair();
    const sessionKey = await getOrCreateSessionKey({
      accountKey: "gateway",
      signer,
      redis: this.redis,
    });

    const sealTx = new Transaction();
    sealTx.add(
      access.sealApprove({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          id: Array.from(objectRow.seal_identity),
          bucket: bucketRow.kraterion_bucket_object_id,
        },
      }),
    );
    sealTx.setSender(this.gatewayKeypair.getAddress());
    const txBytes = await sealTx.build({
      client: getSuiClient(),
      onlyTransactionKind: true,
    });

    const encrypted = await readBlobByBlobId(objectRow.walrus_blob_id);
    let plaintext: Uint8Array;
    try {
      plaintext = await sealClient.decrypt({ data: encrypted, sessionKey, txBytes });
    } catch (e) {
      // Seal aborts seal_approve when access is revoked. Translate to
      // a canonical S3 error so boto3 surfaces it cleanly.
      this.logger.warn(
        `seal.decrypt rejected (bucket=${bucketRow.name} key=${objectRow.s3_key}): ${(e as Error).message}`,
      );
      throw new S3Error(
        "KeyAccessRevoked",
        "The platform's access to decrypt this object has been revoked.",
      );
    }

    setReadHeaders(reply, objectRow, plaintext.byteLength);
    void reply.status(200).send(Buffer.from(plaintext));
  }

  @Head(":bucket/*")
  async headObject(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const ctx = requireKraterion(req);
    rejectUnsupportedReadHeaders(req);
    const { objectRow } = await this.loadObject(ctx);
    // Plaintext size lives on the row (S3 spec — Content-Length and ETag
    // are on the plaintext, not the encrypted Walrus blob).
    setReadHeaders(reply, objectRow, Number(objectRow.size_bytes));
    void reply.status(200).send();
  }

  private async loadObject(ctx: KraterionRequestContext) {
    if (!ctx.bucket) {
      throw new S3Error("InvalidRequest", "Bucket name is required.");
    }
    if (!ctx.key) {
      throw new S3Error("InvalidRequest", "Object key is required.");
    }
    const bucketRow = await this.prisma.bucket.findFirst({
      where: {
        name: ctx.bucket,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: {
        id: true,
        name: true,
        kraterion_bucket_object_id: true,
        api_access_granted: true,
      },
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
      where: { bucket_id: bucketRow.id, s3_key: ctx.key, deleted_at: null },
      select: {
        id: true,
        s3_key: true,
        size_bytes: true,
        content_type: true,
        etag: true,
        walrus_blob_id: true,
        seal_identity: true,
        uploaded_at: true,
      },
    });
    if (!objectRow) {
      throw new S3Error("NoSuchKey", "The specified key does not exist.");
    }
    return { bucketRow, objectRow: objectRow as ObjectRow };
  }
}

function requireKraterion(req: FastifyRequest): KraterionRequestContext {
  const ctx = req.kraterion;
  if (!ctx) throw new S3Error("InternalError", "Request context not initialized.");
  return ctx;
}

function rejectUnsupportedReadHeaders(req: FastifyRequest): void {
  const h = req.headers;
  if (h["range"]) {
    throw new S3Error("NotImplemented", "Range requests are not supported in this phase.");
  }
  if (h["if-match"] || h["if-none-match"] || h["if-modified-since"] || h["if-unmodified-since"]) {
    throw new S3Error("NotImplemented", "Conditional requests are not supported in this phase.");
  }
}

function setReadHeaders(reply: FastifyReply, row: ObjectRow, byteLength: number): void {
  void reply.header("Content-Type", row.content_type ?? "application/octet-stream");
  void reply.header("Content-Length", String(byteLength));
  // S3 quotes the ETag.
  void reply.header("ETag", `"${row.etag}"`);
  void reply.header("Last-Modified", row.uploaded_at.toUTCString());
  // We don't support accept-ranges in v1, but boto3 logs a warning if it
  // sees a 200 with no `Accept-Ranges`; explicitly say "none".
  void reply.header("Accept-Ranges", "none");
}

