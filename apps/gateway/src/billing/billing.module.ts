import { Module } from "@nestjs/common";
import { UsageInterceptor } from "./usage.interceptor.js";
import { SpendCapGuard } from "./spend-cap.guard.js";
import { PoolCapacityGuard } from "./pool-capacity.guard.js";

/**
 * Gateway-side billing scaffolding (B1).
 *
 * Today the module just exposes the interceptor + the two scaffold
 * guards. `main.ts` registers them globally via `app.useGlobalInterceptors`
 * / `app.useGlobalGuards`. PrismaModule + RedisModule are global; no
 * extra imports needed.
 */
@Module({
  providers: [UsageInterceptor, SpendCapGuard, PoolCapacityGuard],
  exports: [UsageInterceptor, SpendCapGuard, PoolCapacityGuard],
})
export class BillingModule {}
