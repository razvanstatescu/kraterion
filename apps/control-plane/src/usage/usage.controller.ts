import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountPrincipal } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsageService } from "./usage.service.js";

/**
 * Usage read API for the dashboard `/usage` page.
 *
 *   - `GET /v1/usage/current-period/:projectId` — meter table +
 *     storage row + BYOK breakdown for the current billing month.
 *   - `GET /v1/usage/by-day/:projectId?from=&to=` — chart data,
 *     one row per UTC day.
 *
 * Both routes are auth-gated and ownership-checked.
 */
@Controller("v1/usage")
@UseGuards(AuthGuard)
export class UsageController {
  constructor(
    private readonly usage: UsageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("current-period/:projectId")
  async currentPeriod(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertOwned(user.accountId, projectId);
    return this.usage.getCurrentPeriod(projectId);
  }

  @Get("by-day/:projectId")
  async byDay(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Query("from") fromIso: string,
    @Query("to") toIso: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertOwned(user.accountId, projectId);
    if (!fromIso || !toIso) {
      throw new ControlPlaneError("InvalidArgument", "from and to query params required.");
    }
    return this.usage.getByDay({ projectId, fromIso, toIso });
  }

  private async assertOwned(accountId: string, projectId: string) {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { account_id: true },
    });
    if (!p || p.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Project not found.");
    }
  }
}
