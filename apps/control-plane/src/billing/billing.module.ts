import { Module } from "@nestjs/common";
import { UsageModule } from "../usage/usage.module.js";
import { AlertDeliveryProcessor } from "./alert-delivery.processor.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { CostFloorProcessor } from "./cost-floor.processor.js";
import { IndexRollupProcessor } from "./index-rollup.processor.js";
import { MeterEmitProcessor } from "./meter-emit.processor.js";
import { PoolRenewalProcessor } from "./pool-renewal.processor.js";
import { ReconciliationProcessor } from "./reconciliation.processor.js";
import { RequestRollupProcessor } from "./request-rollup.processor.js";
import { ShareTokenEgressRollupProcessor } from "./share-token-egress-rollup.processor.js";
import { SoftAlertEvaluator } from "./soft-alert.processor.js";
import { StorageBillingService } from "./storage-billing.service.js";
import { StorageDowngradeProcessor } from "./storage-downgrade.processor.js";
import { StorageUsageProcessor } from "./storage-usage.processor.js";
import { StripeService } from "./stripe.service.js";
import { UsageEventTtlProcessor } from "./usage-event-ttl.processor.js";
import { WebhookEventTtlProcessor } from "./webhook-event-ttl.processor.js";
import { StripeWebhookController } from "./webhook.controller.js";

/**
 * Control-plane billing module (B2 — sandbox-only Stripe wiring).
 *
 * Exposes:
 *   - `GET /v1/billing/account/:projectId` — dashboard read of the
 *     current `BillingAccount` row.
 *   - `POST /v1/billing/setup-intent` — inline Stripe Elements client
 *     secret. The dashboard mounts `<PaymentElement />` against this.
 *   - `POST /v1/billing/portal-session` — Stripe Customer Portal URL.
 *   - `POST /webhooks/stripe` — Stripe webhook receiver.
 *
 * The `StripeService` is exported so other modules (`usage`,
 * `storage-billing` in B3) can compose with it.
 */
@Module({
  imports: [UsageModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    StripeService,
    BillingService,
    StorageBillingService,
    StorageDowngradeProcessor,
    RequestRollupProcessor,
    StorageUsageProcessor,
    IndexRollupProcessor,
    ShareTokenEgressRollupProcessor,
    MeterEmitProcessor,
    UsageEventTtlProcessor,
    WebhookEventTtlProcessor,
    ReconciliationProcessor,
    CostFloorProcessor,
    SoftAlertEvaluator,
    AlertDeliveryProcessor,
    PoolRenewalProcessor,
  ],
  exports: [StripeService, BillingService, StorageBillingService],
})
export class BillingModule {}
