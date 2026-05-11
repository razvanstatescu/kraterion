import { Module } from "@nestjs/common";
import { AccountsModule } from "./accounts/accounts.module.js";
import { ApiKeysModule } from "./api-keys/api-keys.module.js";
import { AuthCoreModule } from "./auth/auth-core.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BucketsModule } from "./buckets/buckets.module.js";
import { EnokiModule } from "./enoki/enoki.module.js";
import { FoldersModule } from "./folders/folders.module.js";
import { HealthController } from "./health.controller.js";
import { ObjectsModule } from "./objects/presign.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { SuiClientModule } from "./sui/sui-client.module.js";

@Module({
  imports: [
    PrismaModule,
    SuiClientModule,
    AuthCoreModule,
    EnokiModule,
    AuthModule,
    AccountsModule,
    ProjectsModule,
    ApiKeysModule,
    BucketsModule,
    ObjectsModule,
    FoldersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
