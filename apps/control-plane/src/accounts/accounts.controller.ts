import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireUser } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

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
}
