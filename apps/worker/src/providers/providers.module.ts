import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ProviderCredentialService } from "./provider-credential.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ProviderCredentialService],
  exports: [ProviderCredentialService],
})
export class ProvidersModule {}
