import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard.js";
import { requireAccountPrincipal } from "../auth/request-context.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import { BillingService } from "./billing.service.js";
import {
  cancelDowngradeSchema,
  cancelSubscriptionSchema,
  portalSessionSchema,
  resizeStorageSchema,
  setupIntentSchema,
  updateBillingDetailsSchema,
  updateSpendCapSchema,
  type CancelDowngradeDto,
  type CancelSubscriptionDto,
  type PortalSessionDto,
  type ResizeStorageDto,
  type SetupIntentDto,
  type UpdateBillingDetailsDto,
  type UpdateSpendCapDto,
} from "./dto.js";
import { StorageBillingService } from "./storage-billing.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Billing-side HTTP surface — read-only `GET /v1/billing/account` for
 * the dashboard plus two mutating endpoints that build Stripe Checkout
 * / Customer Portal URLs and hand them back to the dashboard for
 * redirect.
 *
 * Auth: all routes require a session or bearer token. Share tokens are
 * refused (`requireAccountPrincipal`). Project scoping is explicit in
 * the request body; we cross-check ownership via Postgres.
 */
@Controller("v1/billing")
@UseGuards(AuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly storageBilling: StorageBillingService,
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  /** Paid-billing endpoints are blocked while billing is disabled
   *  (`BILLING_ENABLED != true`) — only the free plan is available. */
  private assertBillingEnabled(): void {
    if (!this.stripe.enabled) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Billing isn't enabled yet — only the free plan is available right now.",
        { reason: "billing_disabled" },
      );
    }
  }

  /**
   * Read the current `BillingAccount` row for a project. Returns
   * `null` for projects that haven't gone through Checkout yet — the
   * dashboard renders the "Add payment method" empty state.
   */
  @Get("account/:projectId")
  async getAccount(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, projectId);
    const row = await this.billing.findBillingAccount(projectId);
    if (!row) return { account: null };
    return {
      account: {
        id: row.id,
        project_id: row.project_id,
        stripe_mode: row.stripe_mode,
        status: row.status,
        has_payment_method: row.has_payment_method,
        currency: row.currency,
        billing_email: row.billing_email,
        country: row.country,
        hard_spend_cap_usd_cents: row.hard_spend_cap_usd_cents,
        soft_alert_thresholds: row.soft_alert_thresholds,
        // The actual Stripe customer id is mode-aware; expose the one
        // for the current runtime so the dashboard can deep-link to
        // the right Stripe object.
        stripe_customer_id: this.stripe.getStripeCustomerId(row),
      },
    };
  }

  /**
   * Build a Stripe Customer Portal session URL. Project must already
   * have a Stripe customer (created via the Checkout flow); if not,
   * we surface a 409 so the dashboard can prompt for Checkout instead.
   */
  @Post("portal-session")
  @HttpCode(200)
  async createPortal(
    @Req() req: FastifyRequest,
    @Body(parseBody(portalSessionSchema)) dto: PortalSessionDto,
  ) {
    this.assertBillingEnabled();
    const user = requireAccountPrincipal(req);
    const project = await this.assertProjectOwned(user.accountId, dto.project_id);
    const account = await this.billing.findBillingAccount(dto.project_id);
    if (!account || !this.stripe.getStripeCustomerId(account)) {
      throw new ControlPlaneError(
        "Conflict",
        "No Stripe customer for this project — start a Checkout session first.",
      );
    }
    const { url } = await this.billing.createPortalSession({
      projectId: dto.project_id,
      accountEmail: project.account.email,
      accountSuiAddress: project.account.sui_address,
      projectName: project.name,
      returnUrl: dto.return_url,
    });
    return { url };
  }

  /**
   * Snapshot view of the storage subscription state for the dashboard
   * storage card. Returns `null` when the project hasn't gone through
   * Checkout yet — the card renders an empty state.
   */
  @Get("storage/state/:projectId")
  async getStorageState(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, projectId);
    return { state: await this.storageBilling.getStorageState(projectId) };
  }

  /**
   * Resize the project's storage reservation. The server decides
   * upgrade vs downgrade vs noop based on direction:
   *
   *   - Upgrade: Stripe quantity bumped with proration + on-chain
   *     `pool_vault::resize_grow` PTB. Effective immediately. Response
   *     includes the on-chain tx digest.
   *   - Downgrade: scheduled at `subscription.current_period_end`.
   *     User keeps their current capacity until then. A separate
   *     processor applies the change at the boundary. Response
   *     includes `effective_at`.
   *   - No-op: caller passed the current quantity. Returns 200 with
   *     `direction: "noop"`.
   *
   * See `storage-billing.service.ts` for the full state machine.
   */
  @Post("storage/resize")
  @HttpCode(200)
  async resizeStorage(
    @Req() req: FastifyRequest,
    @Body(parseBody(resizeStorageSchema)) dto: ResizeStorageDto,
  ) {
    this.assertBillingEnabled();
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, dto.project_id);
    return this.storageBilling.resize({
      projectId: dto.project_id,
      newReservedMb: dto.new_reserved_mb,
    });
  }

  /** Cancel a scheduled downgrade before it fires. Returns `{ cancelled: true }`
   *  on success, `{ cancelled: false }` if there was nothing scheduled. */
  @Delete("storage/pending-downgrade")
  @HttpCode(200)
  async cancelPendingDowngrade(
    @Req() req: FastifyRequest,
    @Body(parseBody(cancelDowngradeSchema)) dto: CancelDowngradeDto,
  ) {
    this.assertBillingEnabled();
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, dto.project_id);
    return this.storageBilling.cancelPendingDowngrade(dto.project_id);
  }

  /**
   * Mint a Stripe SetupIntent for inline `<PaymentElement />` card
   * collection. The dashboard receives `client_secret`, mounts
   * `@stripe/react-stripe-js`, and calls `stripe.confirmSetup(...)`
   * client-side. Stripe fires `setup_intent.succeeded` on success and
   * our webhook upgrades the BillingAccount + creates the subscription.
   *
   * No redirect. Matches the Vercel / Supabase inline flow.
   */
  @Post("setup-intent")
  @HttpCode(200)
  async createSetupIntent(
    @Req() req: FastifyRequest,
    @Body(parseBody(setupIntentSchema)) dto: SetupIntentDto,
  ) {
    this.assertBillingEnabled();
    const user = requireAccountPrincipal(req);
    const project = await this.assertProjectOwned(user.accountId, dto.project_id);
    return this.billing.createSetupIntent({
      projectId: dto.project_id,
      accountEmail: project.account.email,
      accountSuiAddress: project.account.sui_address,
      projectName: project.name,
    });
  }

  /**
   * Recent invoices for the dashboard's invoices card. Reads live from
   * Stripe (12 most recent in any state); the dashboard wraps this in
   * a 5-minute React Query cache so we don't hammer the API.
   */
  @Get("invoices/:projectId")
  async listInvoices(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, projectId);
    return this.billing.listInvoices({ projectId });
  }

  /**
   * Cancel the project's subscription at the end of the current
   * period. The customer keeps capacity until the boundary; on the
   * `customer.subscription.deleted` webhook the row flips to
   * `cancelled`.
   */
  @Post("cancel-subscription")
  @HttpCode(200)
  async cancelSubscription(
    @Req() req: FastifyRequest,
    @Body(parseBody(cancelSubscriptionSchema)) dto: CancelSubscriptionDto,
  ) {
    this.assertBillingEnabled();
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, dto.project_id);
    return this.billing.cancelSubscription(dto.project_id);
  }

  /**
   * Patch the hard spend cap + soft alert thresholds. The cap is in
   * USD cents (Stripe-native); `null` clears the cap entirely. Alerts
   * are whole-percent integers — `[50, 80, 100]` is the default
   * preset.
   */
  @Patch("spend-cap")
  @HttpCode(200)
  async updateSpendCap(
    @Req() req: FastifyRequest,
    @Body(parseBody(updateSpendCapSchema)) dto: UpdateSpendCapDto,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, dto.project_id);
    const account = await this.billing.findBillingAccount(dto.project_id);
    if (!account) {
      throw new ControlPlaneError(
        "Conflict",
        "No billing account for this project yet — add a payment method first.",
      );
    }
    const updated = await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: {
        hard_spend_cap_usd_cents: dto.hard_cap_usd_cents,
        ...(dto.alert_thresholds
          ? { soft_alert_thresholds: dto.alert_thresholds }
          : {}),
      },
    });
    return {
      hard_spend_cap_usd_cents: updated.hard_spend_cap_usd_cents,
      alert_thresholds: updated.soft_alert_thresholds,
    };
  }

  /**
   * Patch billing email / tax id / country. Updates the local row only;
   * the Stripe Customer is not mutated. The Customer Portal handles tax
   * registration and locale-specific tax-id validation — we link to it
   * from the same card.
   */
  @Patch("details")
  @HttpCode(200)
  async updateBillingDetails(
    @Req() req: FastifyRequest,
    @Body(parseBody(updateBillingDetailsSchema)) dto: UpdateBillingDetailsDto,
  ) {
    const user = requireAccountPrincipal(req);
    await this.assertProjectOwned(user.accountId, dto.project_id);
    const account = await this.billing.findBillingAccount(dto.project_id);
    if (!account) {
      throw new ControlPlaneError(
        "Conflict",
        "No billing account for this project yet — add a payment method first.",
      );
    }
    const patch: Record<string, unknown> = {};
    if (dto.billing_email !== undefined) patch["billing_email"] = dto.billing_email;
    if (dto.tax_id !== undefined) patch["tax_id"] = dto.tax_id;
    if (dto.country !== undefined) patch["country"] = dto.country;
    const updated = await this.prisma.billingAccount.update({
      where: { id: account.id },
      data: patch,
    });
    return {
      billing_email: updated.billing_email,
      tax_id: updated.tax_id,
      country: updated.country,
    };
  }

  // === Authorization helpers ===============================================

  /** Verify the principal owns the given project; throw 404 otherwise
   *  (same shape as other CP read paths so existence isn't leaked). */
  private async assertProjectOwned(accountId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { account: { select: { email: true, sui_address: true } } },
    });
    if (!project || project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Project not found.");
    }
    return project;
  }
}
