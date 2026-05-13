import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { ProjectsService } from "../projects/projects.service.js";
import { parseBody, parseParam } from "../validation/zod-pipe.js";
import {
  providerSchema,
  upsertCredentialSchema,
  type ProviderName,
  type UpsertCredentialDto,
} from "./dto.js";
import { ProviderCredentialService } from "./provider-credential.service.js";

@Controller("v1")
@UseGuards(AuthGuard)
export class ProvidersController {
  constructor(
    private readonly credentials: ProviderCredentialService,
    private readonly projects: ProjectsService,
  ) {}

  @Get("projects/:projectId/credentials")
  async list(@Req() req: FastifyRequest, @Param("projectId") projectId: string) {
    const user = requireUser(req);
    await this.projects.getOwned(user.accountId, projectId);
    // Active-knowledge count is cheap and lives at the project scope
    // (credentials are project-scoped). The dashboard reads it to
    // pre-fill the destructive remove-modal copy without needing a
    // round-trip on open.
    const [credentials, activeKnowledgeBuckets] = await Promise.all([
      this.credentials.list(projectId),
      this.credentials.countActiveKnowledgeBuckets(projectId),
    ]);
    return { credentials, active_knowledge_buckets: activeKnowledgeBuckets };
  }

  @Put("projects/:projectId/credentials/:provider")
  async upsert(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("provider", parseParam(providerSchema)) provider: ProviderName,
    @Body(parseBody(upsertCredentialSchema)) dto: UpsertCredentialDto,
  ) {
    const user = requireUser(req);
    await this.projects.getOwned(user.accountId, projectId);
    const credential = await this.credentials.upsert(projectId, provider, dto.api_key);
    return { credential };
  }

  /**
   * Remove a stored credential. Without `?cascade=true`, the call
   * 409s if the project still has Knowledge-enabled buckets — the
   * dashboard surfaces a type-to-confirm modal and retries with
   * `cascade=true` once the user confirms.
   *
   * 200 (not 204) because cascade mode returns a meaningful count
   * the dashboard uses for its success toast.
   */
  @Delete("projects/:projectId/credentials/:provider")
  @HttpCode(200)
  async remove(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("provider", parseParam(providerSchema)) provider: ProviderName,
    @Query("cascade") cascadeParam?: string,
  ) {
    const user = requireUser(req);
    await this.projects.getOwned(user.accountId, projectId);
    const cascade = cascadeParam === "true";
    const result = await this.credentials.remove(projectId, provider, { cascade });
    if (!result.credential) {
      throw new ControlPlaneError("NotFound", `${provider} credential not found.`);
    }
    return { disabled_buckets: result.disabled_buckets };
  }
}
