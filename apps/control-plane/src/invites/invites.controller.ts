import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { parseBody } from "../validation/zod-pipe.js";
import { type ValidateInviteDto, validateInviteSchema } from "./dto.js";
import { InvitesService } from "./invites.service.js";

/**
 * Public invite surface (no auth) — used by the dashboard sign-in page before
 * an account exists.
 *
 *   GET  /v1/invites/system-status  → is the gate on?
 *   POST /v1/invites/validate       → is this code usable right now?
 *
 * Neither endpoint mutates state; the authoritative claim happens atomically
 * during sign-up (see InvitesService.claimWithinTx).
 */
@Controller("v1/invites")
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get("system-status")
  systemStatus(): { enabled: boolean } {
    return { enabled: this.invites.isEnabled() };
  }

  @Post("validate")
  @HttpCode(200)
  async validate(@Body(parseBody(validateInviteSchema)) dto: ValidateInviteDto) {
    return this.invites.validate(dto.code);
  }
}
