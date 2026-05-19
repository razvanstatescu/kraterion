import { Module } from "@nestjs/common";
import { AuthCoreModule } from "../auth/auth-core.module.js";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminController } from "./admin.controller.js";
import { AdminGuard } from "./admin.guard.js";
import { AdminService } from "./admin.service.js";
import { OperatorKeypairService } from "./operator-keypair.service.js";

/**
 * Admin surface — manual storage-pool ops + on-chain reserve inspection.
 * Gated by `AuthGuard` (session-only) + `AdminGuard` (email allowlist
 * from `ADMIN_EMAILS` env var).
 *
 * Phase I of the storage-pool migration. Phase J adds reactive
 * auto-grow; Phase R automates renewal. Until then these endpoints are
 * the only way to extend or grow a pool — call them when an alert
 * fires for end_epoch < 12 or used/reserved > 0.8.
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [AdminController],
  providers: [
    PrismaService,
    KeyWrappingService,
    OperatorKeypairService,
    AdminService,
    AdminGuard,
  ],
})
export class AdminModule {}
