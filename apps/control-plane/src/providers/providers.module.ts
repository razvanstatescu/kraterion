import { Module } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ProviderCredentialService } from "./provider-credential.service.js";
import { ProvidersController } from "./providers.controller.js";

@Module({
  controllers: [ProvidersController],
  providers: [ProviderCredentialService, KeyWrappingService, ProjectsService],
  exports: [ProviderCredentialService],
})
export class ProvidersModule {}
