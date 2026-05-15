import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountPrincipal } from "../auth/request-context.js";
import { parseQuery } from "../validation/zod-pipe.js";
import { ActivityService } from "./activity.service.js";
import { type ListActivityQuery, listActivityQuerySchema } from "./dto.js";

@Controller("v1/activity")
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Query(parseQuery(listActivityQuerySchema)) q: ListActivityQuery,
  ) {
    const user = requireAccountPrincipal(req);
    const events = await this.activity.list(user.accountId, { limit: q.limit });
    return { events };
  }
}
