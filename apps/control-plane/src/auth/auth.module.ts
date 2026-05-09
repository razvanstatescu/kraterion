import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { AuthController } from "./auth.controller.js";

/**
 * Hosts the dev sign-up / sign-in controller. Foundational auth
 * providers (TokensService, AuthGuard) live in `AuthCoreModule`.
 */
@Module({
  imports: [ProjectsModule, ApiKeysModule],
  controllers: [AuthController],
})
export class AuthModule {}
