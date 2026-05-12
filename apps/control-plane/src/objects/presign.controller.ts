import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { parseBody } from "../validation/zod-pipe.js";
import {
  type PrepareDownloadDto,
  type PrepareUploadDto,
  prepareDownloadSchema,
  prepareUploadSchema,
} from "./dto.js";
import { PresignService } from "./presign.service.js";

/**
 * Three sibling endpoints, all gated by the same authz check as
 * `GET /v1/buckets/:id` — the caller's account must own the bucket
 * (404 otherwise). All three return the same `SignedRequest` envelope.
 *
 * No revocation gate is implemented inside the controller; the service
 * checks `bucket.api_access_granted` and 403s if it's false, mirroring
 * the gateway's own SigV4 rejection.
 */
@Controller("v1/objects")
@UseGuards(AuthGuard)
export class PresignController {
  constructor(private readonly presign: PresignService) {}

  @Post("prepare-upload")
  @HttpCode(200)
  async prepareUpload(
    @Req() req: FastifyRequest,
    @Body(parseBody(prepareUploadSchema)) dto: PrepareUploadDto,
  ) {
    const user = requireUser(req);
    return this.presign.signUpload({
      accountId: user.accountId,
      bucketId: dto.bucket_id,
      key: dto.key,
      contentType: dto.content_type,
    });
  }

  @Post(":objectId/prepare-download")
  @HttpCode(200)
  async prepareDownload(
    @Req() req: FastifyRequest,
    @Param("objectId") objectId: string,
    @Body(parseBody(prepareDownloadSchema.optional().default({ share: false }))) dto: PrepareDownloadDto,
  ) {
    const user = requireUser(req);
    return this.presign.signDownload({
      accountId: user.accountId,
      objectId,
      share: dto.share,
    });
  }

  @Post(":objectId/prepare-delete")
  @HttpCode(200)
  async prepareDelete(
    @Req() req: FastifyRequest,
    @Param("objectId") objectId: string,
  ) {
    const user = requireUser(req);
    return this.presign.signDelete({ accountId: user.accountId, objectId });
  }
}
