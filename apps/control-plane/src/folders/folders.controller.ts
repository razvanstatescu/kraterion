import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountPrincipal } from "../auth/request-context.js";
import { parseBody, parseQuery } from "../validation/zod-pipe.js";
import {
  type CreateFolderDto,
  type FolderPreviewQuery,
  type ListFoldersQuery,
  type PurgeFolderDto,
  createFolderSchema,
  folderPreviewQuerySchema,
  listFoldersQuerySchema,
  purgeFolderSchema,
} from "./dto.js";
import { FoldersService } from "./folders.service.js";

@Controller("v1/buckets/:bucketId/folders")
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Query(parseQuery(listFoldersQuerySchema)) q: ListFoldersQuery,
  ) {
    const user = requireAccountPrincipal(req);
    const rows = await this.folders.list(user.accountId, bucketId, { prefix: q.prefix });
    return {
      folders: rows.map((r) => ({
        id: r.id,
        bucket_id: r.bucket_id,
        prefix: r.prefix,
        created_at: r.created_at.toISOString(),
      })),
    };
  }

  @Post()
  @HttpCode(200)
  async create(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(createFolderSchema)) dto: CreateFolderDto,
  ) {
    const user = requireAccountPrincipal(req);
    const row = await this.folders.create({
      accountId: user.accountId,
      bucketId,
      parentPrefix: dto.parent_prefix,
      name: dto.name,
    });
    return {
      folder: {
        id: row.id,
        bucket_id: row.bucket_id,
        prefix: row.prefix,
        created_at: row.created_at.toISOString(),
      },
    };
  }

  @Delete(":markerId")
  @HttpCode(204)
  async remove(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Param("markerId") markerId: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.folders.deleteById(user.accountId, bucketId, markerId);
  }

  @Get("preview")
  async preview(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Query(parseQuery(folderPreviewQuerySchema)) q: FolderPreviewQuery,
  ) {
    const user = requireAccountPrincipal(req);
    return this.folders.previewPurge({
      accountId: user.accountId,
      bucketId,
      prefix: q.prefix,
    });
  }

  @Post("purge")
  @HttpCode(200)
  async purge(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(purgeFolderSchema)) dto: PurgeFolderDto,
  ) {
    const user = requireAccountPrincipal(req);
    return this.folders.purge({
      accountId: user.accountId,
      bucketId,
      prefix: dto.prefix,
    });
  }
}
