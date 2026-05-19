import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { S3Module } from "./s3/s3.module.js";

@Module({
  imports: [PrismaModule, RedisModule, AuthModule, BillingModule, S3Module],
  controllers: [HealthController],
})
export class AppModule {}
