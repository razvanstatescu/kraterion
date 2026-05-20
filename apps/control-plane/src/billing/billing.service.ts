import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Orchestration layer between Postgres `BillingAccount` rows and the
 * Stripe API. The controller is the HTTP shape; this service is the
 * "ensure customer / build Checkout / build Portal" mechanics.
 *
 * Conventions:
 *
 *   - **Lazy BillingAccount creation.** New projects get nothing in
 *     Postgres at signup. The first call to `ensureBillingAccount`
 *     creates the row. The first call to `ensureStripeCustomer` adds
 *     the Stripe customer. Keeps the sandbox-mode dashboard zero-state
 *     simple — no orphan Stripe objects for accounts that never reach
 *     Checkout.
 *
 *   - **Idempotency keys** on every mutating Stripe call. Pattern:
 *     `{operation}:{project_id}:{intent}`. A retry of the same request
 *     yields the same Stripe object, never a duplicate.
 *
 *   - **Mode discriminator** lives only in StripeService. This service
 *     reads via `stripe.getStripeCustomerId(account)` and writes via
 *     `stripe.customerIdPatch(...)`; the columns are never referenced
 *     directly here.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  /** Ensure a `BillingAccount` row exists for a project. Idempotent.
   *  Returns the row. */
  async ensureBillingAccount(
    projectId: string,
    fallbackEmail: string | null,
  ): Promise<NonNullable<Awaited<ReturnType<typeof this.findBillingAccount>>>> {
    const existing = await this.findBillingAccount(projectId);
    if (existing) return existing;
    const created = await this.prisma.billingAccount.create({
      data: {
        project_id: projectId,
        billing_email: fallbackEmail,
        stripe_mode: this.stripe.mode,
      },
    });
    this.logger.log(
      `created BillingAccount ${created.id} for project=${projectId}`,
    );
    return created;
  }

  async findBillingAccount(projectId: string) {
    return this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
  }

  /**
   * Ensure the project has a Stripe customer in the current mode.
   * Creates one if not present, writes the id back to the
   * mode-correct column. Returns the id. Idempotent.
   *
   * Project metadata + the project id go on the Stripe customer for
   * easy correlation in the Stripe dashboard.
   */
  async ensureStripeCustomer(args: {
    projectId: string;
    accountEmail: string | null;
    accountSuiAddress: string | null;
    projectName: string;
  }): Promise<{ stripeCustomerId: string; created: boolean }> {
    const account = await this.ensureBillingAccount(
      args.projectId,
      args.accountEmail,
    );
    const existing = this.stripe.getStripeCustomerId(account);
    if (existing) return { stripeCustomerId: existing, created: false };

    const email = account.billing_email ?? args.accountEmail ?? null;
    const customer = await this.stripe.client.customers.create(
      {
        ...(email ? { email } : {}),
        name: args.projectName,
        metadata: {
          project_id: args.projectId,
          ...(args.accountSuiAddress ? { sui_address: args.accountSuiAddress } : {}),
          kraterion_mode: this.stripe.mode,
        },
      },
      { idempotencyKey: `customer:${args.projectId}:${this.stripe.mode}` },
    );
    await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: this.stripe.customerIdPatch(customer.id),
    });
    this.logger.log(
      `created Stripe customer ${customer.id} for project=${args.projectId}`,
    );
    return { stripeCustomerId: customer.id, created: true };
  }

  /**
   * Look up the seven `Price` rows we ship in our catalog, by their
   * `lookup_key`. Used by the Checkout-session builder to assemble
   * `line_items`. Errors if any are missing — that means
   * `pnpm stripe:sync` hasn't been run.
   */
  async loadActivePrices(): Promise<Record<string, Stripe.Price>> {
    const lookupKeys = [
      "storage_v1",
      "gateway_class_a_v1",
      "gateway_class_b_v1",
      "gateway_egress_v1",
      "share_token_egress_v1",
      "kb_index_v1",
      "agent_messages_v1",
    ];
    const res = await this.stripe.client.prices.list({
      lookup_keys: lookupKeys,
      active: true,
      limit: 100,
    });
    const byKey: Record<string, Stripe.Price> = {};
    for (const p of res.data) {
      if (p.lookup_key) byKey[p.lookup_key] = p;
    }
    const missing = lookupKeys.filter((k) => !byKey[k]);
    if (missing.length > 0) {
      throw new Error(
        `Stripe catalog missing prices: ${missing.join(", ")}. Run \`pnpm stripe:sync\`.`,
      );
    }
    return byKey;
  }

  /**
   * Idempotent subscription bootstrap. Called from the webhook
   * handler once the card is attached. If a subscription already
   * exists for the customer (re-run, replay), returns it unchanged.
   * Otherwise creates one with all seven items:
   *   - Storage at quantity = 10 (free tier covers it; $0/month).
   *   - Six metered items (no quantity; billed on meter events).
   *
   * The new subscription's `default_payment_method` is left null;
   * Stripe falls back to the customer's `invoice_settings.default_payment_method`
   * which we set when the card was attached.
   */
  async ensureSubscription(args: {
    projectId: string;
    stripeCustomerId: string;
  }): Promise<{ subscriptionId: string; created: boolean }> {
    // Reuse an active subscription if one exists.
    const existing = await this.stripe.client.subscriptions.list({
      customer: args.stripeCustomerId,
      status: "all",
      limit: 1,
    });
    const live = existing.data.find(
      (s) => s.status === "active" || s.status === "trialing" || s.status === "incomplete",
    );
    if (live) {
      return { subscriptionId: live.id, created: false };
    }

    const prices = await this.loadActivePrices();
    const items = [
      { price: prices["storage_v1"]!.id, quantity: 10 },
      { price: prices["gateway_class_a_v1"]!.id },
      { price: prices["gateway_class_b_v1"]!.id },
      { price: prices["gateway_egress_v1"]!.id },
      { price: prices["share_token_egress_v1"]!.id },
      { price: prices["kb_index_v1"]!.id },
      { price: prices["agent_messages_v1"]!.id },
    ];
    const subscription = await this.stripe.client.subscriptions.create(
      {
        customer: args.stripeCustomerId,
        items,
        metadata: {
          project_id: args.projectId,
          kraterion_mode: this.stripe.mode,
        },
        // Pay-as-you-go: charge automatically off the default
        // payment method when the invoice finalises.
        collection_method: "charge_automatically",
        // Tax handling lives at the subscription level; we leave
        // automatic tax off until B5 wires Stripe Tax.
        automatic_tax: { enabled: false },
      },
      {
        idempotencyKey: `subscription:${args.projectId}:${this.stripe.mode}`,
      },
    );
    this.logger.log(
      `created subscription ${subscription.id} for project=${args.projectId}`,
    );
    return { subscriptionId: subscription.id, created: true };
  }

  /**
   * Promote the payment method on a SetupIntent to be the customer's
   * default for future invoices. Stripe needs both `default_source`
   * (legacy) and `invoice_settings.default_payment_method` set — the
   * subscription will draft against the latter.
   */
  async setDefaultPaymentMethod(
    stripeCustomerId: string,
    paymentMethodId: string,
  ): Promise<void> {
    await this.stripe.client.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    this.logger.log(
      `set default payment method ${paymentMethodId} on customer ${stripeCustomerId}`,
    );
  }

  /**
   * Create a SetupIntent for inline Stripe Elements card collection.
   * Returns the `client_secret` the dashboard's `<PaymentElement />`
   * needs to confirm the card on the browser side. No redirect — the
   * dashboard stays in place, the card lands directly via JS.
   *
   * The SetupIntent's `client_reference_id` and `metadata.project_id`
   * carry the project ID so the webhook handler can resolve back to
   * us when `setup_intent.succeeded` fires.
   */
  async createSetupIntent(args: {
    projectId: string;
    accountEmail: string | null;
    accountSuiAddress: string | null;
    projectName: string;
  }): Promise<{ client_secret: string; setup_intent_id: string }> {
    const { stripeCustomerId } = await this.ensureStripeCustomer(args);
    const intent = await this.stripe.client.setupIntents.create(
      {
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          project_id: args.projectId,
          kraterion_mode: this.stripe.mode,
        },
      },
      {
        // Idempotency bucket per project per ~17 min so honest retries
        // collapse, but a fresh "Add card" attempt later returns a new
        // intent.
        idempotencyKey: `setup-intent:${args.projectId}:${Date.now() >> 20}`,
      },
    );
    if (!intent.client_secret) {
      throw new Error("Stripe didn't return a SetupIntent client_secret");
    }
    return { client_secret: intent.client_secret, setup_intent_id: intent.id };
  }

  /**
   * Retrieve invoices for the project. Read live from Stripe so we
   * never serve stale data; cached client-side (React Query) and
   * server-side (5-min in-memory) so the dashboard doesn't hammer
   * the API on every render.
   *
   * Returns the minimal invoice shape the dashboard renders — no
   * line items, no PDFs (those live in the Customer Portal deep
   * link). 12 most recent in any state.
   */
  async listInvoices(args: {
    projectId: string;
  }): Promise<{
    invoices: Array<{
      id: string;
      number: string | null;
      status: string | null;
      period_start: number;
      period_end: number;
      created: number;
      amount_due_usd_cents: number;
      amount_paid_usd_cents: number;
      hosted_invoice_url: string | null;
      invoice_pdf: string | null;
    }>;
  }> {
    const account = await this.findBillingAccount(args.projectId);
    if (!account) return { invoices: [] };
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) return { invoices: [] };
    const list = await this.stripe.client.invoices.list({
      customer: customerId,
      limit: 12,
    });
    return {
      invoices: list.data.map((inv) => ({
        id: inv.id ?? "",
        number: inv.number,
        status: inv.status,
        period_start: inv.period_start,
        period_end: inv.period_end,
        created: inv.created,
        amount_due_usd_cents: inv.amount_due,
        amount_paid_usd_cents: inv.amount_paid,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
      })),
    };
  }

  /**
   * Cancel the customer's subscription at the end of the current
   * billing period. The customer keeps full capacity (storage,
   * metered allowance) through the boundary; on `customer.subscription.deleted`
   * the webhook flips `BillingAccount.status = 'cancelled'`.
   */
  async cancelSubscription(projectId: string): Promise<{ cancel_at: number | null }> {
    const account = await this.findBillingAccount(projectId);
    if (!account) {
      throw new Error(`No BillingAccount for project=${projectId}`);
    }
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) {
      throw new Error(`No Stripe customer for project=${projectId}`);
    }
    const subs = await this.stripe.client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    const live = subs.data.find(
      (s) => s.status === "active" || s.status === "trialing",
    );
    if (!live) {
      throw new Error(`No active subscription for project=${projectId}`);
    }
    const updated = await this.stripe.client.subscriptions.update(live.id, {
      cancel_at_period_end: true,
    });
    this.logger.log(
      `subscription ${live.id} marked cancel_at_period_end for project=${projectId}`,
    );
    return { cancel_at: updated.cancel_at };
  }

  /**
   * Build a Customer Portal session URL. The portal handles card
   * management, invoice viewing, tax-info updates — we never
   * re-implement those.
   */
  async createPortalSession(args: {
    projectId: string;
    accountEmail: string | null;
    accountSuiAddress: string | null;
    projectName: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const { stripeCustomerId } = await this.ensureStripeCustomer(args);
    const session = await this.stripe.client.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: args.returnUrl,
    });
    return { url: session.url };
  }
}
