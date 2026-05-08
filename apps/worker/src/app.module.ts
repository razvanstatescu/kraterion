import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { IndexerModule } from "./indexer/indexer.module.js";

@Module({
  imports: [PrismaModule, IndexerModule],
  controllers: [HealthController],
})
export class AppModule {}
