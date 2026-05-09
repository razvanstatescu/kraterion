import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { parseBody } from "../validation/zod-pipe.js";
import { ApiKeysService } from "./api-keys.service.js";
import { type CreateApiKeyDto, createApiKeySchema } from "./dto.js";

@Controller("v1")
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get("projects/:projectId/api-keys")
  async list(@Req() req: FastifyRequest, @Param("projectId") projectId: string) {
    const user = requireUser(req);
    const api_keys = await this.apiKeys.listForProject(user.accountId, projectId);
    return { api_keys };
  }

  /**
   * Mint a new API key. Returns cleartext `secret` exactly once — the
   * caller is responsible for storing it. `WARNING` is included in the
   * payload so consumers reading the response in a log can't miss it.
   */
  @Post("projects/:projectId/api-keys")
  async create(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Body(parseBody(createApiKeySchema)) dto: CreateApiKeyDto,
  ) {
    const user = requireUser(req);
    const { apiKey, secret } = await this.apiKeys.createForProject(
      user.accountId,
      projectId,
      dto.name,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { secret_wrapped, ...rest } = apiKey;
    return {
      api_key: rest,
      secret,
      WARNING: "The `secret` field is shown only once. Store it now; it cannot be retrieved later.",
    };
  }

  @Post("api-keys/:apiKeyId/revoke")
  async revoke(@Req() req: FastifyRequest, @Param("apiKeyId") apiKeyId: string) {
    const user = requireUser(req);
    const revoked = await this.apiKeys.revoke(user.accountId, apiKeyId);
    return { id: revoked.id, revoked_at: revoked.revoked_at };
  }
}
