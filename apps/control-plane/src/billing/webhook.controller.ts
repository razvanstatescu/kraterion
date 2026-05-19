import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service.js";
import { BillingService } from "./billing.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * `POST /webhooks/stripe` — Stripe webhook receiver.
 *
 * The contract Stripe expects:
 *
 *   1. **Verify the signature** against the raw payload bytes. We
 *      capture the raw body in `main.ts` (a JSON content-type parser
 *      that buffers before parsing) so `req.rawBody` holds the exact
 *      bytes Stripe sent. Any mismatch → 400.
 *   2. **Return 2xx quickly.** Stripe retries non-2xx responses for up
 *      to 3 days; long-running work has to be deferred. We persist the
 *      event to `StripeWebhookEvent` (`id` is the Stripe event id —
 *      idempotency happens at the unique-constraint layer) and
 *      dispatch synchronously to the handler. For sandbox v1 the
 *      handlers are fast enough to run inline; B4 moves them to a
 *      BullMQ queue.
 *   3. **Idempotent processing.** Stripe will redeliver the same
 *      `event.id` if we 5xx, so the handler must tolerate replays.
 *      The PK on `StripeWebhookEvent.id` plus per-handler upserts
 *      handle this.
 *
 * No auth guard. The signature IS the auth.
 *
 * The route lives outside the `/v1` prefix so the rest of the API can
 * version freely without breaking Stripe's configured endpoint.
 */
@Controller("webhooks")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("stripe")
  @HttpCode(200)
  async receive(
    @Req() req: FastifyRequest,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true; event_id: string }> {
    if (!signature) {
      this.logger.warn("rejected: missing Stripe-Signature header");
      throw new HttpException("Missing Stripe-Signature header", 400);
    }
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw) {
      // Sanity guard. Should never fire — the JSON parser in main.ts
      // attaches rawBody on every request.
      this.logger.error("rejected: rawBody not captured — main.ts parser missing");
      throw new HttpException("Webhook ingest misconfigured", 500);
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.verifyWebhook(raw, signature);
    } catch (err) {
      this.logger.warn(`signature verification failed: ${(err as Error).message}`);
      throw new HttpException("Invalid signature", 400);
    }

    // Idempotent persistence keyed on Stripe event id. If we've
    // already received this event, skip the handler and short-circuit
    // to 200 — Stripe is just retrying.
    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
      select: { id: true, processed_at: true },
    });
    if (existing) {
      this.logger.log(
        `duplicate event ${event.id} (type=${event.type}) — ack without re-processing`,
      );
      return { received: true, event_id: event.id };
    }

    await this.prisma.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        payload: event as unknown as object,
      },
    });

    // Dispatch inline. Sandbox v1 only — the plan moves this to a
    // BullMQ queue in B4 once the handler logic gets heavier.
    try {
      await this.dispatch(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { processed_at: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `handler failed for ${event.id} (type=${event.type}): ${message}`,
      );
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: {
          attempt_count: { increment: 1 },
          last_error: message.slice(0, 1024),
        },
      });
      // 500 → Stripe will retry. We've recorded the row so a
      // subsequent retry hits the duplicate-detector branch only
      // after success.
      throw new HttpException("Webhook handler failed", 500);
    }
    return { received: true, event_id: event.id };
  }

  // === Dispatch ============================================================

  /**
   * Hand the event to the right handler. Each handler is idempotent
   * (upserts / unique-keyed inserts) so replays are safe.
   *
   * For events we don't care about yet (`payment_intent.*`,
   * `charge.*`, `invoice.upcoming`, etc.) we just log + ack. Stripe's
   * webhook UI lets us subscribe to the exact set we want; this
   * defensive coverage means an over-subscribed endpoint can't break
   * the project.
   */
  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        return;
      case "setup_intent.succeeded":
        await this.handleSetupIntentSucceeded(
          event.data.object as Stripe.SetupIntent,
        );
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.handleSubscriptionUpdate(
          event.data.object as Stripe.Subscription,
          event.type,
        );
        return;
      case "payment_method.attached":
      case "payment_method.detached":
        await this.handlePaymentMethod(
          event.data.object as Stripe.PaymentMethod,
          event.type === "payment_method.attached",
        );
        return;
      default:
        // No-op handler — record but don't act on these in B2.
        this.logger.log(`event ${event.id} type=${event.type} (no handler)`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    // The Checkout session was created with `client_reference_id =
    // project_id` and `mode: 'setup'`. Resolve the billing account
    // from there; if the row doesn't exist (e.g. project was deleted
    // between checkout and webhook arrival), log + skip.
    const projectId = session.client_reference_id;
    if (!projectId) {
      this.logger.warn(
        `checkout.session.completed without client_reference_id (id=${session.id})`,
      );
      return;
    }
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) {
      this.logger.warn(
        `checkout.session.completed for unknown project=${projectId} (session=${session.id})`,
      );
      return;
    }
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? null);
    if (!customerId) {
      this.logger.error(
        `checkout.session.completed without customer (session=${session.id}, project=${projectId})`,
      );
      return;
    }

    // Setup mode produces a `setup_intent` whose `payment_method` is
    // the card the user entered. Promote it to be the customer's
    // default so future subscription invoices charge it.
    const setupIntentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : (session.setup_intent?.id ?? null);
    let paymentMethodId: string | null = null;
    if (setupIntentId) {
      const si = await this.stripe.client.setupIntents.retrieve(setupIntentId);
      paymentMethodId =
        typeof si.payment_method === "string"
          ? si.payment_method
          : (si.payment_method?.id ?? null);
      if (paymentMethodId) {
        await this.billing.setDefaultPaymentMethod(customerId, paymentMethodId);
      }
    }

    // Create the subscription server-side (idempotent — re-runs are
    // safe). All seven items; storage at qty=10 covered by the free
    // tier so the subscription starts at $0/month.
    const { subscriptionId, created } = await this.billing.ensureSubscription({
      projectId,
      stripeCustomerId: customerId,
    });

    await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: {
        has_payment_method: true,
        ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
        ...this.stripe.customerIdPatch(customerId),
        status: "active",
      },
    });
    this.logger.log(
      `checkout completed project=${projectId} customer=${customerId} ` +
        `payment_method=${paymentMethodId} subscription=${subscriptionId} (subscription_created=${created})`,
    );
  }

  /**
   * Inline-Elements card flow: the dashboard calls
   * `POST /v1/billing/setup-intent`, mounts Stripe's `<PaymentElement />`,
   * and calls `stripe.confirmSetup(...)` on the browser. Stripe attaches
   * the card to the customer and fires `setup_intent.succeeded`.
   *
   * Handler responsibilities mirror `handleCheckoutCompleted`:
   *   - resolve the project from the SetupIntent metadata
   *   - read the attached payment method id off the SI
   *   - set it as the customer's default
   *   - ensureSubscription (idempotent)
   *   - flip BillingAccount.has_payment_method + status
   *
   * Idempotent across replays via the `StripeWebhookEvent` PK and the
   * upsert-shape of every downstream call.
   */
  private async handleSetupIntentSucceeded(si: Stripe.SetupIntent): Promise<void> {
    const projectId = si.metadata?.["project_id"];
    if (!projectId) {
      this.logger.warn(
        `setup_intent.succeeded without project_id metadata (si=${si.id})`,
      );
      return;
    }
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) {
      this.logger.warn(
        `setup_intent.succeeded for unknown project=${projectId} (si=${si.id})`,
      );
      return;
    }
    const customerId =
      typeof si.customer === "string"
        ? si.customer
        : (si.customer?.id ?? null);
    if (!customerId) {
      this.logger.error(
        `setup_intent.succeeded without customer (si=${si.id}, project=${projectId})`,
      );
      return;
    }
    const paymentMethodId =
      typeof si.payment_method === "string"
        ? si.payment_method
        : (si.payment_method?.id ?? null);
    if (paymentMethodId) {
      await this.billing.setDefaultPaymentMethod(customerId, paymentMethodId);
    }
    const { subscriptionId, created } = await this.billing.ensureSubscription({
      projectId,
      stripeCustomerId: customerId,
    });
    await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: {
        has_payment_method: true,
        ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
        ...this.stripe.customerIdPatch(customerId),
        status: "active",
      },
    });
    this.logger.log(
      `setup_intent.succeeded project=${projectId} customer=${customerId} ` +
        `payment_method=${paymentMethodId} subscription=${subscriptionId} (created=${created})`,
    );
  }

  private async handleSubscriptionUpdate(
    sub: Stripe.Subscription,
    eventType: string,
  ): Promise<void> {
    // Resolve the project via customer metadata or the subscription's
    // own metadata (we set both at Checkout time). `sub.customer` can
    // be a string id, an expanded Customer, or a DeletedCustomer (no
    // `metadata` field) — only follow the expanded-live path.
    const customerMetadata =
      typeof sub.customer === "object" &&
      sub.customer !== null &&
      "metadata" in sub.customer &&
      !("deleted" in sub.customer && sub.customer.deleted)
        ? (sub.customer as Stripe.Customer).metadata
        : null;
    const projectId =
      sub.metadata?.["project_id"] ?? customerMetadata?.["project_id"];
    if (!projectId) {
      this.logger.warn(`${eventType} without project_id metadata (sub=${sub.id})`);
      return;
    }
    const newStatus = mapStripeSubscriptionStatus(sub.status);
    if (eventType === "customer.subscription.deleted") {
      await this.prisma.billingAccount
        .update({
          where: { project_id: projectId },
          data: { status: "cancelled" },
        })
        .catch(() => {
          /* row may not exist; harmless */
        });
      this.logger.log(`subscription cancelled project=${projectId} (${sub.id})`);
      return;
    }
    await this.prisma.billingAccount
      .update({
        where: { project_id: projectId },
        data: { status: newStatus },
      })
      .catch(() => {
        /* row may not exist; harmless */
      });
    this.logger.log(
      `subscription ${eventType} project=${projectId} status=${newStatus} (${sub.id})`,
    );
  }

  private async handlePaymentMethod(
    pm: Stripe.PaymentMethod,
    attached: boolean,
  ): Promise<void> {
    const customerId = typeof pm.customer === "string"
      ? pm.customer
      : pm.customer?.id ?? null;
    if (!customerId) return;
    const account = await this.findBillingAccountByCustomer(customerId);
    if (!account) {
      this.logger.warn(
        `payment_method.* for unknown customer=${customerId} (pm=${pm.id})`,
      );
      return;
    }
    await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: attached
        ? { has_payment_method: true, default_payment_method: pm.id }
        : { default_payment_method: null },
    });
  }

  private async findBillingAccountByCustomer(customerId: string) {
    if (this.stripe.mode === "live") {
      return this.prisma.billingAccount.findUnique({
        where: { stripe_customer_id_live: customerId },
      });
    }
    return this.prisma.billingAccount.findUnique({
      where: { stripe_customer_id_test: customerId },
    });
  }
}

/** Map Stripe subscription statuses to our internal three-state enum. */
function mapStripeSubscriptionStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "active";
  }
}
