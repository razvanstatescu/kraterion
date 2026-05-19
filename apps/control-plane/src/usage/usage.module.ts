import { Module } from "@nestjs/common";
import { AuthCoreModule } from "../auth/auth-core.module.js";
import { UsageController } from "./usage.controller.js";
import { UsageService } from "./usage.service.js";

@Module({
  imports: [AuthCoreModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
