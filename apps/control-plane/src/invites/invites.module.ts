import { Module } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard.js";
import { AuthCoreModule } from "../auth/auth-core.module.js";
import { InviteAdminController } from "./invite-admin.controller.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesService } from "./invites.service.js";

/**
 * Invite gate. Exposes the public validate/status endpoints and the
 * admin-only generation/management endpoints, and exports `InvitesService`
 * so the zkLogin sign-up flow (EnokiModule) can claim a code atomically
 * inside the account-creation transaction.
 *
 * `AdminGuard` is provided locally (it's stateless — just reads
 * `ADMIN_EMAILS`); `AuthGuard` comes from the globally-exported
 * `AuthCoreModule`.
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [InvitesController, InviteAdminController],
  providers: [InvitesService, AdminGuard],
  exports: [InvitesService],
})
export class InvitesModule {}
