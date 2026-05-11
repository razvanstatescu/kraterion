/**
 * Shared decrypt-and-serve pipeline used by the authenticated GetObject
 * path and the unauthenticated public-read GetObject path.
 *
 * Inputs: a resolved `BucketRow` + `ObjectRow` (the caller does its own
 * authz). Output: writes the canonical S3 read response — Seal-decrypted
 * plaintext with the right `Content-Type`, `Content-Length`, `ETag`,
 * `Last-Modified`, etc.
 *
 * The decrypt path is identical for both routes because Move's
 * `seal_approve` is mode-aware: for `encryption_mode_public` it
 * returns to any caller, so the gateway's own sub-wallet's session key
 * can decrypt regardless of who's hitting the gateway HTTP route. The
 * difference between authed/public is purely *who's allowed to ask the
 * gateway* — once we get past that gate, the cryptographic flow is
 * the same.
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { access } from "@kraterion/kraterion-move-sdk";
import { KRATERION_PACKAGE_ID } from "@kraterion/shared";
import { getOrCreateSessionKey, getSealClient } from "@kraterion/seal-client";
import { getSuiClient, readBlobByBlobId } from "@kraterion/walrus-client";
import type { Prisma } from "@prisma/client";
import { GatewayKeypairService } from "../auth/gateway-keypair.service.js";
import { REDIS } from "../redis/redis.module.js";
import { S3Error } from "./s3-error.js";

export const MAX_DECRYPT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

export const OBJECT_SELECT = {
  id: true,
  s3_key: true,
  size_bytes: true,
  content_type: true,
  etag: true,
  walrus_blob_id: true,
  seal_identity: true,
  uploaded_at: true,
} satisfies Prisma.S3ObjectSelect;

export type ObjectRow = Prisma.S3ObjectGetPayload<{ select: typeof OBJECT_SELECT }>;

interface BucketLike {
  kraterion_bucket_object_id: string;
  name: string;
}

interface ServeOptions {
  /** When true (public-read route), emit a cache header browsers honor. */
  cacheable?: boolean;
  /** When true, override CORS to allow any origin — public links must
   *  work from `<img src>` on third-party pages and JS fetch from anywhere. */
  publicCors?: boolean;
}

@Injectable()
export class ObjectBytesService {
  private readonly logger = new Logger(ObjectBytesService.name);

  constructor(
    private readonly gatewayKeypair: GatewayKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Decrypt the object's bytes and send them in the response. Caller
   * has already done authz (ownership, public-read check, etc.); this
   * method only handles the Seal+Walrus pipeline + the HTTP response.
   */
  async serve(args: {
    bucket: BucketLike;
    object: ObjectRow;
    reply: FastifyReply;
    options?: ServeOptions;
  }): Promise<void> {
    const { bucket, object, reply } = args;
    const options = args.options ?? {};

    if (Number(object.size_bytes) > MAX_DECRYPT_BYTES) {
      throw new S3Error(
        "EntityTooLarge",
        `This gateway version caps decrypt at ${MAX_DECRYPT_BYTES} bytes; ` +
          `chunked Seal envelopes for larger objects are post-hackathon.`,
      );
    }

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
          id: Array.from(object.seal_identity),
          bucket: bucket.kraterion_bucket_object_id,
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
      encrypted = await readBlobByBlobId(object.walrus_blob_id);
    } catch (e) {
      this.logger.warn(
        `walrus aggregator failed (blob=${object.walrus_blob_id}): ${(e as Error).message}`,
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
      const msg = (e as Error).message;
      this.logger.warn(
        `seal.decrypt rejected (bucket=${bucket.name} key=${object.s3_key}): ${msg}`,
      );
      throw new S3Error(
        "KeyAccessRevoked",
        "The platform's access to decrypt this object has been revoked.",
      );
    }

    const expectedSize = Number(object.size_bytes);
    if (plaintext.byteLength !== expectedSize) {
      this.logger.error(
        `plaintext size mismatch: expected=${expectedSize} actual=${plaintext.byteLength} ` +
          `bucket=${bucket.name} key=${object.s3_key} blob=${object.walrus_blob_id}`,
      );
      throw new S3Error("InternalError", "We encountered an internal error. Please try again.");
    }

    this.setReadHeaders(reply, object, plaintext.byteLength, options);
    void reply.status(200).send(Buffer.from(plaintext));
  }

  /**
   * Same as `serve` but doesn't actually fetch/decrypt — for HEAD. We
   * still apply the size check + public/private cache hints so the
   * response is consistent with what GET would do.
   */
  head(args: {
    object: ObjectRow;
    reply: FastifyReply;
    options?: ServeOptions;
  }): void {
    this.setReadHeaders(args.reply, args.object, Number(args.object.size_bytes), args.options ?? {});
    void args.reply.status(200).send();
  }

  private setReadHeaders(
    reply: FastifyReply,
    row: ObjectRow,
    byteLength: number,
    options: ServeOptions,
  ): void {
    const requestId = randomUUID();
    void reply.header("Content-Type", row.content_type ?? "application/octet-stream");
    void reply.header("Content-Length", String(byteLength));
    // S3 wraps ETags in quotes per RFC 7232 §2.3.
    void reply.header("ETag", `"${row.etag}"`);
    // RFC 7231 IMF-fixdate.
    void reply.header("Last-Modified", row.uploaded_at.toUTCString());
    // No partial reads — AES-GCM auth-tag-at-end forbids it.
    void reply.header("Accept-Ranges", "none");
    // SSE marker (the actual cipher is Seal IBE → AES-GCM-256).
    void reply.header("x-amz-server-side-encryption", "AES256");
    void reply.header("x-amz-request-id", requestId);
    void reply.header("x-amz-id-2", requestId);

    if (options.cacheable) {
      // Public-read files are immutable per (bucket, key) version. The
      // `version` query param is the dashboard-recommended cache buster
      // when content changes; without it, 5-minute browser cache.
      void reply.header("Cache-Control", "public, max-age=300, immutable");
    } else {
      // Authenticated reads — keep them out of intermediary caches.
      void reply.header("Cache-Control", "private, no-store");
    }

    if (options.publicCors) {
      // `<img src>` doesn't need this, but JS `fetch()` from third-party
      // origins does. Override `@fastify/cors`'s allowlist for this route.
      void reply.header("Access-Control-Allow-Origin", "*");
      void reply.header("Access-Control-Expose-Headers", "ETag, Content-Type, Content-Length, Last-Modified");
    }
  }
}
