import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import Stripe from "stripe";
import { isBillingEnabled, readStripeMode, type StripeMode } from "@kraterion/shared";

/**
 * Thin DI wrapper around the official Stripe Node SDK. One singleton
 * per process; every controller / processor injects this rather than
 * instantiating their own client. Centralising the configuration here
 * keeps the pinned API version and the `STRIPE_MODE` discriminator in
 * exactly one place.
 *
 * Three discrete responsibilities:
 *
 *   1. **Construct the client** with the pinned API version and the
 *      mode-correct secret key. Fails fast at boot if the key prefix
 *      doesn't match `STRIPE_MODE` — refusing to mix `sk_test_` and
 *      `sk_live_` runtimes is our most important footgun guard.
 *
 *   2. **Verify webhook signatures.** The Stripe SDK ships
 *      `stripe.webhooks.constructEvent` which is the only correct
 *      way; we expose it via `verifyWebhook(...)` so the webhook
 *      controller doesn't need to import the SDK directly.
 *
 *   3. **Resolve the active customer id** for a `BillingAccount` row,
 *      picking the test or live column based on the current
 *      `STRIPE_MODE`. Anything that needs to hit the Stripe API for a
 *      project's customer goes through `getStripeCustomerId(...)`.
 *
 * No business logic lives here. The controllers + processors compose
 * `.client` (the raw SDK) with `BillingAccount` reads.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private _client!: Stripe;
  private _mode!: StripeMode;
  private _webhookSecret: string | null = null;
  private _enabled = false;

  /** Pinned API version. Bumped to match what `stripe@22.x` ships as
   *  its default. Changing this is a coordinated effort across the
   *  catalog, the SDK upgrade, and any response-shape parsers. */
  public static readonly API_VERSION = "2026-04-22.dahlia" as const;

  onModuleInit(): void {
    this._enabled = isBillingEnabled(process.env);
    if (!this._enabled) {
      // Billing off: boot without Stripe keys — only the free plan is available.
      // `mode` is still read (defaults to "test") so column selection helpers
      // stay well-defined; no client is constructed and no key is required.
      this._mode = readStripeMode(process.env);
      this.logger.warn(
        "Billing is DISABLED (set BILLING_ENABLED=true to enable). Stripe not " +
          "initialised — paid plans are blocked and only the free plan is usable.",
      );
      return;
    }
    this._mode = readStripeMode(process.env);
    const secretKey = process.env["STRIPE_SECRET_KEY"];
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    this.assertKeyMatchesMode(secretKey);
    this._client = new Stripe(secretKey, {
      apiVersion: StripeService.API_VERSION,
      typescript: true,
      appInfo: {
        name: "Kraterion",
        url: "https://kraterion.dev",
      },
    });
    this._webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"] || null;
    this.logger.log(
      `Stripe client initialised (mode=${this._mode}, api=${StripeService.API_VERSION})`,
    );
    if (!this._webhookSecret) {
      this.logger.warn(
        "STRIPE_WEBHOOK_SECRET unset — webhook verification will reject every event. Set it from `stripe listen` in dev.",
      );
    }
  }

  /** Whether paid billing is enabled. Every code path that touches
   *  {@link client} must check this first and take a free-plan branch when
   *  false. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Raw SDK. Use for everything Stripe-specific. Throws when billing is
   *  disabled — callers must guard on {@link enabled}. */
  get client(): Stripe {
    if (!this._enabled) {
      throw new Error(
        "Billing is disabled (BILLING_ENABLED != true); no Stripe client is available.",
      );
    }
    return this._client;
  }

  /** Current Stripe mode. Code that needs to choose between
   *  `stripe_customer_id_test` and `*_live` reads this. */
  get mode(): StripeMode {
    return this._mode;
  }

  /** Pull the Stripe customer id off a `BillingAccount` row according
   *  to the current mode. Returns `null` when the project hasn't gone
   *  through Checkout yet (free band — no Stripe customer exists). */
  getStripeCustomerId(account: {
    stripe_customer_id_test: string | null;
    stripe_customer_id_live: string | null;
  }): string | null {
    return this._mode === "live"
      ? account.stripe_customer_id_live
      : account.stripe_customer_id_test;
  }

  /** Build the {@link Prisma.BillingAccountUpdateInput}-compatible patch
   *  that sets the right customer-id column for the current mode. */
  customerIdPatch(stripeCustomerId: string): Record<string, string> {
    return this._mode === "live"
      ? { stripe_customer_id_live: stripeCustomerId }
      : { stripe_customer_id_test: stripeCustomerId };
  }

  /**
   * Verify a webhook payload's signature against `STRIPE_WEBHOOK_SECRET`
   * and return the parsed event. Throws if the signature is invalid,
   * if the secret is missing, or if the payload can't be parsed.
   *
   * `rawBody` must be the exact bytes Stripe sent (no JSON parsing).
   * Our webhook controller bypasses Fastify's body parser to keep the
   * bytes intact.
   */
  verifyWebhook(rawBody: Buffer | string, signatureHeader: string): Stripe.Event {
    if (!this._webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }
    return this._client.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      this._webhookSecret,
    );
  }

  private assertKeyMatchesMode(secretKey: string): void {
    const isLiveKey = secretKey.startsWith("sk_live_");
    const isTestKey = secretKey.startsWith("sk_test_");
    if (!isLiveKey && !isTestKey) {
      throw new Error(
        "STRIPE_SECRET_KEY must start with sk_live_ or sk_test_",
      );
    }
    if (this._mode === "live" && !isLiveKey) {
      throw new Error(
        "STRIPE_MODE=live but the secret key looks like a test key. Refusing to start.",
      );
    }
    if (this._mode === "test" && !isTestKey) {
      throw new Error(
        "STRIPE_MODE=test but the secret key looks like a live key. Refusing to start.",
      );
    }
  }
}
