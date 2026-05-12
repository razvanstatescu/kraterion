import { Controller, Get, Logger, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SuiClientService } from "../sui/sui-client.service.js";
import { parseQuery } from "../validation/zod-pipe.js";
import { BucketsService } from "./buckets.service.js";
import {
  type ListBucketsQuery,
  type ListObjectsQuery,
  listBucketsQuerySchema,
  listObjectsQuerySchema,
} from "./dto.js";
import { serializeBucket, serializeObject } from "./serialize.js";

@Controller("v1/buckets")
@UseGuards(AuthGuard)
export class BucketsController {
  private readonly logger = new Logger(BucketsController.name);

  constructor(
    private readonly buckets: BucketsService,
    private readonly prisma: PrismaService,
    private readonly suiClient: SuiClientService,
  ) {}

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Query(parseQuery(listBucketsQuerySchema)) q: ListBucketsQuery,
  ) {
    const user = requireUser(req);
    const page = await this.buckets.listForAccount(user.accountId, {
      projectId: q.project_id,
      includeDeleted: q.include_deleted,
      limit: q.limit,
      cursor: q.cursor,
    });
    const ids = page.items.map((b) => b.id);

    // Two parallel follow-up queries:
    //   1. Knowledge-enabled set — PK lookup on KnowledgeBucketSettings,
    //      bounded by page size.
    //   2. Per-bucket object stats — single grouped query over S3Object,
    //      filtering on the same id set + `deleted_at IS NULL`. The
    //      `groupBy` returns one row per non-empty bucket; empty buckets
    //      fall through to `(0, 0n)` defaults below.
    const [enabledRows, stats] = ids.length
      ? await Promise.all([
          this.prisma.knowledgeBucketSettings.findMany({
            where: { bucket_id: { in: ids } },
            select: { bucket_id: true },
          }),
          this.prisma.s3Object.groupBy({
            by: ["bucket_id"],
            where: { bucket_id: { in: ids }, deleted_at: null },
            _count: { _all: true },
            _sum: { size_bytes: true },
          }),
        ])
      : [[], []];
    const enabled = new Set(enabledRows.map((r) => r.bucket_id));
    const statsByBucket = new Map(
      stats.map((s) => [
        s.bucket_id,
        { count: s._count._all, total: s._sum.size_bytes ?? 0n },
      ]),
    );
    return {
      buckets: page.items.map((b) => {
        const stat = statsByBucket.get(b.id);
        return serializeBucket(b, {
          knowledgeEnabled: enabled.has(b.id),
          objectCount: stat?.count ?? 0,
          sizeBytesTotal: stat?.total ?? 0n,
        });
      }),
      next_cursor: page.next_cursor,
    };
  }

  @Get(":bucketId")
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    const [k, stat, chain] = await Promise.all([
      this.prisma.knowledgeBucketSettings.findUnique({
        where: { bucket_id: bucketId },
        select: { bucket_id: true },
      }),
      this.prisma.s3Object.aggregate({
        where: { bucket_id: bucketId, deleted_at: null },
        _count: { _all: true },
        _sum: { size_bytes: true },
      }),
      this.readBucketChainFields(bucket.kraterion_bucket_object_id),
    ]);
    return {
      bucket: serializeBucket(bucket, {
        knowledgeEnabled: !!k,
        objectCount: stat._count._all,
        sizeBytesTotal: stat._sum.size_bytes ?? 0n,
        ...(chain.owner ? { ownerAddress: chain.owner } : {}),
        ...(chain.addresses ? { apiDecryptionAddresses: chain.addresses } : {}),
      }),
    };
  }

  /**
   * Reads `KraterionBucket.owner` and `api_decryption_addresses` off the
   * shared object. Returns undefined fields on RPC failure so the
   * dashboard's Ownership card just hides them rather than blowing up
   * the whole bucket page.
   *
   * One Sui RPC per `GET /v1/buckets/:id` request — bucket detail
   * page-load cadence. If usage grows, cache this by object id for a
   * few seconds in Redis.
   */
  private async readBucketChainFields(bucketObjectId: string): Promise<{
    owner?: string;
    addresses?: string[];
  }> {
    try {
      const obj = await this.suiClient.get().getObject({
        id: bucketObjectId,
        options: { showContent: true },
      });
      const fields = (
        obj.data?.content as { fields?: Record<string, unknown> } | undefined
      )?.fields;
      const owner = typeof fields?.["owner"] === "string"
        ? (fields["owner"] as string)
        : undefined;
      const addresses = Array.isArray(fields?.["api_decryption_addresses"])
        ? (fields["api_decryption_addresses"] as string[])
        : undefined;
      return {
        ...(owner ? { owner } : {}),
        ...(addresses ? { addresses } : {}),
      };
    } catch (err) {
      this.logger.debug(
        `readBucketChainFields(${bucketObjectId}) failed: ${(err as Error).message}`,
      );
      return {};
    }
  }

  @Get(":bucketId/objects")
  async listObjects(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Query(parseQuery(listObjectsQuerySchema)) q: ListObjectsQuery,
  ) {
    const user = requireUser(req);
    const page = await this.buckets.listObjects(user.accountId, bucketId, {
      prefix: q.prefix,
      includeDeleted: q.include_deleted,
      limit: q.limit,
      cursor: q.cursor,
    });
    return {
      objects: page.items.map(serializeObject),
      next_cursor: page.next_cursor,
    };
  }
}
