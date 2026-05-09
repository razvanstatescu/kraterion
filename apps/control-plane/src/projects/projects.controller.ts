import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { parseBody } from "../validation/zod-pipe.js";
import { type CreateProjectDto, createProjectSchema } from "./dto.js";
import { ProjectsService } from "./projects.service.js";

@Controller("v1/projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list(@Req() req: FastifyRequest) {
    const user = requireUser(req);
    const projects = await this.projects.listForAccount(user.accountId);
    return { projects };
  }

  @Post()
  async create(
    @Req() req: FastifyRequest,
    @Body(parseBody(createProjectSchema)) dto: CreateProjectDto,
  ) {
    const user = requireUser(req);
    const project = await this.projects.create(user.accountId, dto.name);
    return { project };
  }
}
