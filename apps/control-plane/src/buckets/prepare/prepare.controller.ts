import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../../auth/auth.guard.js";
import { requireUser } from "../../auth/request-context.js";
import { parseBody } from "../../validation/zod-pipe.js";
import {
  type PrepareAgentDto,
  type PrepareCreateDto,
  type PrepareGrantApiDto,
  type PrepareVisibilityDto,
  prepareAgentSchema,
  prepareCreateSchema,
  prepareGrantApiSchema,
  prepareVisibilitySchema,
} from "./dto.js";
import { PrepareTxService } from "./prepare.service.js";

@Controller("v1/buckets")
@UseGuards(AuthGuard)
export class PrepareTxController {
  constructor(private readonly prepare: PrepareTxService) {}

  @Post("prepare-create")
  @HttpCode(200)
  async prepareCreate(
    @Req() req: FastifyRequest,
    @Body(parseBody(prepareCreateSchema)) dto: PrepareCreateDto,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareCreate(user.accountId, user.suiAddress, {
      projectId: dto.project_id,
      name: dto.name,
      encryptionMode: dto.encryption_mode,
      grantApiAccess: dto.grant_api_access,
      apiAddrOverride: dto.api_addr_override,
    });
  }

  @Post(":bucketId/prepare-grant-api")
  @HttpCode(200)
  async prepareGrantApi(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(prepareGrantApiSchema)) dto: PrepareGrantApiDto,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareGrantApi(user.accountId, user.suiAddress, bucketId, {
      apiAddrOverride: dto.api_addr_override,
    });
  }

  @Post(":bucketId/prepare-revoke-all")
  @HttpCode(200)
  async prepareRevokeAll(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareRevokeAll(user.accountId, user.suiAddress, bucketId);
  }

  @Post(":bucketId/prepare-grant-agent")
  @HttpCode(200)
  async prepareGrantAgent(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(prepareAgentSchema)) dto: PrepareAgentDto,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareGrantAgent(user.accountId, user.suiAddress, bucketId, {
      agentId: dto.agent_id,
    });
  }

  @Post(":bucketId/prepare-revoke-agent")
  @HttpCode(200)
  async prepareRevokeAgent(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(prepareAgentSchema)) dto: PrepareAgentDto,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareRevokeAgent(user.accountId, user.suiAddress, bucketId, {
      agentId: dto.agent_id,
    });
  }

  @Post(":bucketId/prepare-revoke-indexer")
  @HttpCode(200)
  async prepareRevokeIndexer(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareRevokeIndexer(user.accountId, user.suiAddress, bucketId);
  }

  @Post(":bucketId/prepare-visibility")
  @HttpCode(200)
  async prepareVisibility(
    @Req() req: FastifyRequest,
    @Param("bucketId") bucketId: string,
    @Body(parseBody(prepareVisibilitySchema)) dto: PrepareVisibilityDto,
  ) {
    const user = requireUser(req);
    return this.prepare.prepareVisibility(user.accountId, user.suiAddress, bucketId, {
      encryptionMode: dto.encryption_mode,
    });
  }
}
