import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
  constructor(
    private readonly buckets: BucketsService,
    private readonly prisma: PrismaService,
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
    // Single follow-up query for the Knowledge-enabled set so the
    // dashboard can badge each row without an N+1. PK lookup, bounded
    // by page size — sub-millisecond.
    const ids = page.items.map((b) => b.id);
    const enabled = ids.length
      ? new Set(
          (
            await this.prisma.knowledgeBucketSettings.findMany({
              where: { bucket_id: { in: ids } },
              select: { bucket_id: true },
            })
          ).map((r) => r.bucket_id),
        )
      : new Set<string>();
    return {
      buckets: page.items.map((b) =>
        serializeBucket(b, { knowledgeEnabled: enabled.has(b.id) }),
      ),
      next_cursor: page.next_cursor,
    };
  }

  @Get(":bucketId")
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    const k = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
      select: { bucket_id: true },
    });
    return { bucket: serializeBucket(bucket, { knowledgeEnabled: !!k }) };
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
