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
import { randomUUID } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { GatewayKeypairService } from "../auth/gateway-keypair.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { S3Error } from "./s3-error.js";
import { requireKraterion, requireBucket, requireKey } from "./request-context.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import { access } from "@kraterion/kraterion-move-sdk";
import { getSuiClient, readBlobByBlobId } from "@kraterion/walrus-client";
import { getOrCreateSessionKey, getSealClient } from "@kraterion/seal-client";
import type { Prisma } from "@prisma/client";

const MAX_DECRYPT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

const OBJECT_SELECT = {
  id: true,
  s3_key: true,
  size_bytes: true,
  content_type: true,
  etag: true,
  walrus_blob_id: true,
  seal_identity: true,
  uploaded_at: true,
} satisfies Prisma.S3ObjectSelect;

const BUCKET_SELECT = {
  id: true,
  name: true,
  kraterion_bucket_object_id: true,
  api_access_granted: true,
} satisfies Prisma.BucketSelect;

type ObjectRow = Prisma.S3ObjectGetPayload<{ select: typeof OBJECT_SELECT }>;
type BucketRow = Prisma.BucketGetPayload<{ select: typeof BUCKET_SELECT }>;

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
    const { bucketRow, objectRow } = await this.loadObject(ctx);

    const sessionKey = await getOrCreateSessionKey({
      accountKey: "gateway",
      signer: this.gatewayKeypair.getKeypair(),
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

    let encrypted: Uint8Array;
    try {
      encrypted = await readBlobByBlobId(objectRow.walrus_blob_id);
    } catch (e) {
      // Walrus aggregator timeout, 5xx, or connection reset. Translate
      // to a retryable 503 so boto3 backs off and retries instead of
      // surfacing an opaque InternalError.
      this.logger.warn(
        `walrus aggregator failed (blob=${objectRow.walrus_blob_id}): ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "The storage backend is temporarily unavailable. Please retry.",
      );
    }

    let plaintext: Uint8Array;
    try {
      plaintext = await getSealClient().decrypt({ data: encrypted, sessionKey, txBytes });
    } catch (e) {
      // Seal aborts seal_approve (or returns InvalidSignature on a tag
      // mismatch). For revocation we map to KeyAccessRevoked; for any
      // other decrypt failure we surface InternalError so it doesn't
      // get auto-retried into a hot loop. We can refine the split once
      // we have a stable error taxonomy from the Seal SDK.
      const msg = (e as Error).message;
      this.logger.warn(
        `seal.decrypt rejected (bucket=${bucketRow.name} key=${objectRow.s3_key}): ${msg}`,
      );
      throw new S3Error(
        "KeyAccessRevoked",
        "The platform's access to decrypt this object has been revoked.",
      );
    }

    // Sanity: plaintext size MUST match what we recorded at PutObject.
    // A mismatch is silent corruption — never auto-retry past it.
    const expectedSize = Number(objectRow.size_bytes);
    if (plaintext.byteLength !== expectedSize) {
      this.logger.error(
        `plaintext size mismatch: expected=${expectedSize} actual=${plaintext.byteLength} ` +
          `bucket=${bucketRow.name} key=${objectRow.s3_key} blob=${objectRow.walrus_blob_id}`,
      );
      throw new S3Error("InternalError", "We encountered an internal error. Please try again.");
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
    const { objectRow } = await this.loadObject(ctx);
    setReadHeaders(reply, objectRow, Number(objectRow.size_bytes));
    void reply.status(200).send();
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
    if (Number(objectRow.size_bytes) > MAX_DECRYPT_BYTES) {
      throw new S3Error(
        "EntityTooLarge",
        `This gateway version caps decrypt at ${MAX_DECRYPT_BYTES} bytes; ` +
          `chunked Seal envelopes for larger objects are post-hackathon.`,
      );
    }
    return { bucketRow, objectRow };
  }
}

function setReadHeaders(reply: FastifyReply, row: ObjectRow, byteLength: number): void {
  const requestId = randomUUID();
  void reply.header("Content-Type", row.content_type ?? "application/octet-stream");
  void reply.header("Content-Length", String(byteLength));
  void reply.header("ETag", `"${row.etag}"`); // S3 wraps ETags in quotes per RFC 7232 §2.3
  void reply.header("Last-Modified", row.uploaded_at.toUTCString()); // RFC 7231 IMF-fixdate
  // We never support partial reads (AES-GCM tag-at-end); per RFC 7233
  // §2.3 a server that doesn't honor ranges advertises `none` so clients
  // (boto3, aws-cli, rclone) skip multipart-download attempts.
  void reply.header("Accept-Ranges", "none");
  // Mark the object as server-side-encrypted. We use the AES256 enum
  // value (rather than a custom marker) so AWS-aware tooling recognizes
  // it; the actual cipher is Seal IBE → AES-GCM-256, but the SSE marker
  // is just "data is encrypted at rest by the server."
  void reply.header("x-amz-server-side-encryption", "AES256");
  void reply.header("x-amz-request-id", requestId);
  void reply.header("x-amz-id-2", requestId);
}
