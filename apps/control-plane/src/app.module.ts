import { Module } from "@nestjs/common";
import { AccountsModule } from "./accounts/accounts.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AgentsModule } from "./agents/agents.module.js";
import { ApiKeysModule } from "./api-keys/api-keys.module.js";
import { AuthCoreModule } from "./auth/auth-core.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BucketsModule } from "./buckets/buckets.module.js";
import { EnokiModule } from "./enoki/enoki.module.js";
import { FoldersModule } from "./folders/folders.module.js";
import { HealthController } from "./health.controller.js";
import { KnowledgeModule } from "./knowledge/knowledge.module.js";
import { McpModule } from "./mcp/mcp.module.js";
import { OAuthModule } from "./oauth/oauth.module.js";
import { ObjectsModule } from "./objects/presign.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { ProvidersModule } from "./providers/providers.module.js";
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
    ProvidersModule,
    AgentsModule,
    BucketsModule,
    ObjectsModule,
    FoldersModule,
    ActivityModule,
    KnowledgeModule,
    OAuthModule,
    McpModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
