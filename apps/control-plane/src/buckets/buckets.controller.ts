import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
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
  constructor(private readonly buckets: BucketsService) {}

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
    return {
      buckets: page.items.map(serializeBucket),
      next_cursor: page.next_cursor,
    };
  }

  @Get(":bucketId")
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    const bucket = await this.buckets.getOwned(user.accountId, bucketId);
    return { bucket: serializeBucket(bucket) };
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
