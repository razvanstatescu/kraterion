import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

const CancelBody = z.object({ confirm: z.literal(true) });

@Controller("v1/me")
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@Req() req: FastifyRequest) {
    const user = requireUser(req);
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      include: {
        projects: { orderBy: { created_at: "asc" } },
      },
    });
    if (!account) {
      // Token was valid (it verified) but the account was deleted between
      // sign-in and now. Treat as auth failure rather than a 404.
      throw new ControlPlaneError("Unauthorized", "Account no longer exists");
    }
    const { projects, ...rest } = account;
    return {
      account: {
        id: rest.id,
        email: rest.email,
        sui_address: rest.sui_address,
        status: rest.status,
        created_at: rest.created_at,
      },
      projects,
    };
  }

  @Patch("cancel")
  async cancel(@Req() req: FastifyRequest, @Body() body: unknown) {
    const user = requireUser(req);
    const parsed = CancelBody.safeParse(body);
    if (!parsed.success) {
      throw new ControlPlaneError("InvalidArgument", "Send { confirm: true } to cancel.");
    }
    const account = await this.prisma.account.findUnique({ where: { id: user.accountId } });
    if (!account) {
      throw new ControlPlaneError("Unauthorized", "Account no longer exists");
    }
    if (account.status === "cancelled") {
      return {
        account: {
          id: account.id,
          email: account.email,
          sui_address: account.sui_address,
          status: account.status,
          created_at: account.created_at,
        },
      };
    }
    const updated = await this.prisma.account.update({
      where: { id: user.accountId },
      data: { status: "cancelled" },
    });
    return {
      account: {
        id: updated.id,
        email: updated.email,
        sui_address: updated.sui_address,
        status: updated.status,
        created_at: updated.created_at,
      },
    };
  }
}
