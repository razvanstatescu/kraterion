import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { parseBody } from "../validation/zod-pipe.js";
import { networkFromEnv } from "./bearer.js";
import { ApiKeysService } from "./api-keys.service.js";
import {
  type CreateApiKeyDto,
  type CreateBearerTokenDto,
  createApiKeySchema,
  createBearerTokenSchema,
} from "./dto.js";

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

  /**
   * Mint a unified bearer token (`kr_live_…` / `kr_test_…`). The prefix
   * reflects `SUI_NETWORK`; the bearer guard refuses cross-network use.
   * Returns the cleartext token exactly once — store it now.
   */
  @Post("projects/:projectId/api-keys/bearer")
  async createBearer(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Body(parseBody(createBearerTokenSchema)) dto: CreateBearerTokenDto,
  ) {
    const user = requireUser(req);
    const { apiKey, token } = await this.apiKeys.createBearerForProject(
      user.accountId,
      projectId,
      dto.name,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { secret_wrapped, token_hash, ...rest } = apiKey;
    return {
      api_key: rest,
      token,
      network: networkFromEnv(),
      WARNING:
        "The `token` field is shown only once. Store it now; it cannot be retrieved later.",
    };
  }

  @Post("api-keys/:apiKeyId/revoke")
  async revoke(@Req() req: FastifyRequest, @Param("apiKeyId") apiKeyId: string) {
    const user = requireUser(req);
    const revoked = await this.apiKeys.revoke(user.accountId, apiKeyId);
    return { id: revoked.id, revoked_at: revoked.revoked_at };
  }
}
