import { Module } from "@nestjs/common";
import { AuthCoreModule } from "../auth/auth-core.module.js";
import { StripeService } from "../billing/stripe.service.js";
import { UsageController } from "./usage.controller.js";
import { UsageService } from "./usage.service.js";

/**
 * Reads Stripe live for the storage row's billed quantity (the
 * dashboard /usage page needs the subscription's `quantity`, not the
 * on-chain pool size — see `composeStorage` in `UsageService`).
 *
 * `StripeService` is also provided here so `UsageService` can be
 * instantiated without a circular import from `BillingModule` — the
 * service is stateless apart from the Stripe SDK handle, so
 * instantiating it twice is fine.
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [UsageController],
  providers: [UsageService, StripeService],
  exports: [UsageService],
})
export class UsageModule {}
