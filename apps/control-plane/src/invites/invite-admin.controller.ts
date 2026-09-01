import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { parseBody } from "../validation/zod-pipe.js";
import {
  type DisableInviteDto,
  type GenerateInvitesDto,
  disableInviteSchema,
  generateInvitesSchema,
} from "./dto.js";
import { InvitesService } from "./invites.service.js";

/**
 * Admin invite management. Gated by `AuthGuard` + `AdminGuard` (the
 * `ADMIN_EMAILS` allowlist) — the same pattern as `AdminController`. Codes can
 * ONLY be generated here (or via the CLI script, which has direct DB access):
 * there is no user-facing generation, per product spec.
 *
 *   POST /admin/invites               → mint a batch
 *   GET  /admin/invites               → list with claim counts
 *   POST /admin/invites/:code/disable → soft kill / re-enable
 */
@Controller("admin/invites")
@UseGuards(AuthGuard, AdminGuard)
export class InviteAdminController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @HttpCode(200)
  async generate(@Body(parseBody(generateInvitesSchema)) dto: GenerateInvitesDto) {
    const codes = await this.invites.generate({
      count: dto.count,
      maxClaims: dto.max_claims,
      note: dto.note ?? null,
      expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
    });
    return { count: codes.length, codes };
  }

  @Get()
  async list() {
    return { invites: await this.invites.list() };
  }

  @Post(":code/disable")
  @HttpCode(200)
  async disable(
    @Param("code") code: string,
    @Body(parseBody(disableInviteSchema)) dto: DisableInviteDto,
  ) {
    await this.invites.setDisabled(code, dto.disabled);
    return { code, disabled: dto.disabled };
  }
}
