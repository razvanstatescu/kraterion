import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountId } from "../auth/request-context.js";
import { OnboardingService } from "./onboarding.service.js";

/**
 * Dashboard "Get started" card backend. Three endpoints — read state,
 * dismiss, reset — all session-authenticated, all account-scoped.
 */
@Controller("v1/onboarding")
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  async getState(@Req() req: FastifyRequest) {
    const accountId = requireAccountId(req);
    return this.onboarding.getState(accountId);
  }

  @Post("dismiss")
  async dismiss(@Req() req: FastifyRequest) {
    const accountId = requireAccountId(req);
    await this.onboarding.dismiss(accountId);
    return { ok: true };
  }

  /** Re-arms the card so the sidebar "Get started" entry can bring it
   *  back. Useful for demos and for users who dismissed by mistake. */
  @Post("reset")
  async reset(@Req() req: FastifyRequest) {
    const accountId = requireAccountId(req);
    await this.onboarding.reset(accountId);
    return { ok: true };
  }
}
