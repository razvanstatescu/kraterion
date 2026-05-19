import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { IndexRollupProcessor } from "./index-rollup.processor.js";
import { MeterEmitProcessor } from "./meter-emit.processor.js";
import { RequestRollupProcessor } from "./request-rollup.processor.js";
import { StorageBillingService } from "./storage-billing.service.js";
import { StorageDowngradeProcessor } from "./storage-downgrade.processor.js";
import { StorageUsageProcessor } from "./storage-usage.processor.js";
import { StripeService } from "./stripe.service.js";
import { StripeWebhookController } from "./webhook.controller.js";

/**
 * Control-plane billing module (B2 — sandbox-only Stripe wiring).
 *
 * Exposes:
 *   - `GET /v1/billing/account/:projectId` — dashboard read of the
 *     current `BillingAccount` row.
 *   - `POST /v1/billing/checkout-session` — Stripe Checkout URL.
 *   - `POST /v1/billing/portal-session` — Stripe Customer Portal URL.
 *   - `POST /webhooks/stripe` — Stripe webhook receiver.
 *
 * The `StripeService` is exported so other modules (`usage`,
 * `storage-billing` in B3) can compose with it.
 */
@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [
    StripeService,
    BillingService,
    StorageBillingService,
    StorageDowngradeProcessor,
    RequestRollupProcessor,
    StorageUsageProcessor,
    IndexRollupProcessor,
    MeterEmitProcessor,
  ],
  exports: [StripeService, BillingService, StorageBillingService],
})
export class BillingModule {}
