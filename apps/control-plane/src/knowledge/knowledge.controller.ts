import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseBody } from "../validation/zod-pipe.js";

/**
 * K1 stub for `KnowledgeBucketSettings` CRUD.
 *
 * Just enough to let us flip Knowledge on/off for a bucket during
 * smoke-testing. K2 will:
 *   1. Trigger the on-chain `grant_api_access` for the
 *      `knowledge_indexer` address when enabling (so Seal approves
 *      worker decrypts).
 *   2. Trigger `enqueueBucket` on the worker to backfill existing
 *      objects.
 *   3. Ship `/search` and `/ask` siblings on the same controller.
 *
 * For K1, the enable POST just writes the row. The bootstrap script
 * pre-grants `knowledge_indexer` access to the test bucket so the
 * smoke test works without the on-chain step. See
 * `docs/ai-features-plan.md` §6.3 for the K2 wiring.
 */
const enableKnowledgeSchema = z.object({
  enabled: z.boolean(),
  embedding_model: z.string().optional(),
  embedding_dimensions: z.number().int().positive().max(3072).optional(),
  chunk_tokens: z.number().int().positive().max(8192).optional(),
  chunk_overlap_tokens: z.number().int().nonnegative().max(2048).optional(),
});
type EnableKnowledgeDto = z.infer<typeof enableKnowledgeSchema>;

@Controller("v1/buckets/:bucketId/knowledge")
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
  ) {}

  @Get()
  async get(@Req() req: FastifyRequest, @Param("bucketId") bucketId: string) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);
    const row = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucketId },
    });
    return {
      enabled: !!row,
      settings: row
        ? {
            embedding_model: row.embedding_model,
            embedding_dimensions: row.embedding_dimensions,
            chunk_tokens: row.chunk_tokens,
            chunk_overlap_tokens: row.chunk_overlap_tokens,
            updated_at: row.updated_at.toISOString(),
          }
        : null,
    };
  }

  @Post()
  @HttpCode(200)
  async upsert(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(enableKnowledgeSchema)) dto: EnableKnowledgeDto,
  ) {
    const user = requireUser(req);
    await this.buckets.getOwned(user.accountId, bucketId);

    if (!dto.enabled) {
      // Cascade: drop chunks + settings. Manifests stay as audit per
      // `docs/ai-features-plan.md` §2.3 lifecycle table.
      const [chunks] = await this.prisma.$transaction([
        this.prisma.knowledgeChunk.deleteMany({ where: { bucket_id: bucketId } }),
        this.prisma.knowledgeBucketSettings.deleteMany({ where: { bucket_id: bucketId } }),
      ]);
      return { enabled: false, chunks_deleted: chunks.count };
    }

    const data = {
      bucket_id: bucketId,
      ...(dto.embedding_model ? { embedding_model: dto.embedding_model } : {}),
      ...(dto.embedding_dimensions ? { embedding_dimensions: dto.embedding_dimensions } : {}),
      ...(dto.chunk_tokens ? { chunk_tokens: dto.chunk_tokens } : {}),
      ...(dto.chunk_overlap_tokens !== undefined
        ? { chunk_overlap_tokens: dto.chunk_overlap_tokens }
        : {}),
    };
    const row = await this.prisma.knowledgeBucketSettings.upsert({
      where: { bucket_id: bucketId },
      create: data,
      update: data,
    });
    return {
      enabled: true,
      settings: {
        embedding_model: row.embedding_model,
        embedding_dimensions: row.embedding_dimensions,
        chunk_tokens: row.chunk_tokens,
        chunk_overlap_tokens: row.chunk_overlap_tokens,
        updated_at: row.updated_at.toISOString(),
      },
    };
  }
}
