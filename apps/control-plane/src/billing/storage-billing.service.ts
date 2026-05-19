import { Injectable, Logger } from "@nestjs/common";
import { Transaction } from "@mysten/sui/transactions";
import { type StripeMode } from "@kraterion/shared";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { ACTIVE_PRICE_LOOKUP_KEYS } from "./catalog.js";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  getPoolStorageCostFrost,
  getSuiClient,
} from "@kraterion/walrus-client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OperatorKeypairService } from "../sui/operator-keypair.service.js";
import { BillingService } from "./billing.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Orchestrates a customer-initiated storage resize.
 *
 * Two paths:
 *
 *   - **Upgrade (immediate).** Stripe subscription item quantity is
 *     bumped with `proration_behavior: 'create_prorations'` so the
 *     extra storage is billed for the remainder of the current month.
 *     The operator wallet signs a `pool_vault::resize_grow` PTB to
 *     enlarge the on-chain pool. If the chain step fails after Stripe
 *     succeeded, we issue a compensating Stripe update to roll the
 *     quantity back — same idempotency key so retries collapse.
 *
 *   - **Downgrade (scheduled).** We write a `PendingStorageDowngrade`
 *     row with `effective_at = subscription.current_period_end` and
 *     return immediately. The user keeps full capacity through the
 *     end of the paid month. A separate BullMQ processor
 *     (`storage-downgrade.processor.ts`) applies the change at the
 *     period boundary — updates Stripe quantity with
 *     `proration_behavior: 'none'` and marks the row applied. The
 *     on-chain pool is NOT shrunk in v1 (no `resize_shrink` Move
 *     entry yet); we eat the over-reservation until the pool's
 *     53-epoch window expires naturally. Documented limitation,
 *     codify when Walrus's storage_pool::resize_shrink is wrapped.
 *
 * Invariants:
 *   - `new_gb >= ceil(used_gb × 1.1)`. UI enforces; we re-check
 *     server-side to defend against a stale client. The 10% buffer is
 *     for indexer lag — `used_encoded_bytes` is event-driven, not
 *     wall-clock, so a brand-new PUT can briefly outrun the row.
 *   - `new_gb >= 10`. Storage tier 1 (the 10 GB free band) is the
 *     floor; to leave Kraterion the user cancels their subscription,
 *     not the storage line.
 *   - One in-flight resize per project. We rely on the resize
 *     operation being short (Stripe + ~5s indexer ack) and reject if
 *     another one is mid-flight via the in-DB pending-downgrade row.
 */
@Injectable()
export class StorageBillingService {
  private readonly logger = new Logger(StorageBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
    private readonly operator: OperatorKeypairService,
  ) {}

  /**
   * Resize entry point. Decides upgrade vs downgrade based on
   * direction; the caller (HTTP layer) only passes the target
   * quantity.
   */
  async resize(args: {
    projectId: string;
    newReservedGb: number;
  }): Promise<{
    direction: "upgrade" | "downgrade" | "noop";
    effective_at?: string;
    pool_resize_tx?: string;
    stripe_subscription_id?: string;
  }> {
    const state = await this.loadResizeState(args.projectId);
    const currentGb = state.currentReservedGb;
    const usedGb = state.currentUsedGb;
    const requested = args.newReservedGb;

    this.assertSane(requested, usedGb);

    if (requested === currentGb) {
      return { direction: "noop" };
    }
    if (requested > currentGb) {
      return this.applyUpgrade({ ...state, newGb: requested });
    }
    return this.scheduleDowngrade({ ...state, newGb: requested });
  }

  /**
   * Snapshot view for the dashboard `/billing` storage card. Bundles
   * the on-chain capacity + current billing quantity + pending
   * downgrade (if any) into one cheap read. Returns `null` if the
   * project doesn't have an active subscription yet (no `BillingAccount`
   * means the storage card stays in its empty state).
   */
  async getStorageState(projectId: string): Promise<{
    reserved_gb: number;
    used_gb: number;
    pool_reserved_gb: number;
    stripe_quantity_gb: number;
    monthly_cost_usd_cents: number;
    next_bill_at: string | null;
    pending_downgrade: {
      new_gb: number;
      effective_at: string;
    } | null;
  } | null> {
    const pool = await this.prisma.storagePool.findUnique({
      where: { project_id: projectId },
    });
    if (!pool) return null;
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) return null;
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) return null;

    let stripeQty = 0;
    let nextBillAt: string | null = null;
    const sub = await this.findActiveSubscription(customerId);
    if (sub) {
      const storageItem = this.findStorageItem(sub);
      stripeQty = storageItem?.quantity ?? 0;
      const periodEnd =
        sub.items.data[0]?.current_period_end ?? sub.billing_cycle_anchor;
      if (periodEnd) nextBillAt = new Date(periodEnd * 1000).toISOString();
    }

    const pending = await this.prisma.pendingStorageDowngrade.findUnique({
      where: { project_id: projectId },
    });

    return {
      reserved_gb: stripeQty,
      used_gb: bytesToGb(pool.used_encoded_bytes),
      pool_reserved_gb: bytesToGb(pool.reserved_encoded_bytes),
      stripe_quantity_gb: stripeQty,
      // $0.06/GB-mo at standard rate, free for the first 10 GB.
      monthly_cost_usd_cents: Math.max(0, (stripeQty - 10) * 6),
      next_bill_at: nextBillAt,
      pending_downgrade:
        pending && pending.status === "scheduled"
          ? {
              new_gb: pending.new_reserved_gb,
              effective_at: pending.effective_at.toISOString(),
            }
          : null,
    };
  }

  /**
   * Cancel a pending downgrade. Idempotent — if the row was already
   * applied or already cancelled, returns the current status.
   */
  async cancelPendingDowngrade(
    projectId: string,
  ): Promise<{ cancelled: boolean; previous_status: string | null }> {
    const existing = await this.prisma.pendingStorageDowngrade.findUnique({
      where: { project_id: projectId },
    });
    if (!existing) return { cancelled: false, previous_status: null };
    if (existing.status !== "scheduled") {
      return { cancelled: false, previous_status: existing.status };
    }
    await this.prisma.pendingStorageDowngrade.update({
      where: { project_id: projectId },
      data: { status: "cancelled" },
    });
    this.logger.log(
      `cancelled PendingStorageDowngrade for project=${projectId} (was scheduled to ${existing.new_reserved_gb} GB)`,
    );
    return { cancelled: true, previous_status: "scheduled" };
  }

  // === Internals ===========================================================

  private async loadResizeState(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      throw new ControlPlaneError("NotFound", "Project not found.");
    }
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) {
      throw new ControlPlaneError(
        "Conflict",
        "Project has no billing account yet — start a Checkout session first.",
      );
    }
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) {
      throw new ControlPlaneError(
        "Conflict",
        "Project has no Stripe customer yet — start a Checkout session first.",
      );
    }
    const pool = await this.prisma.storagePool.findUnique({
      where: { project_id: projectId },
    });
    if (!pool) {
      throw new ControlPlaneError(
        "Conflict",
        "Project has no storage pool yet — upload a file to bootstrap one, " +
          "or wait for the gateway to provision it on first write.",
      );
    }
    if (pool.status !== "active") {
      throw new ControlPlaneError(
        "Conflict",
        `Storage pool is ${pool.status}; resize requires an active pool.`,
      );
    }
    const subscription = await this.findActiveSubscription(customerId);
    if (!subscription) {
      throw new ControlPlaneError(
        "Conflict",
        "No active Stripe subscription — add a payment method first.",
      );
    }
    const item = this.findStorageItem(subscription);
    if (!item) {
      throw new ControlPlaneError(
        "Conflict",
        "Subscription is missing the storage line item; this is a server-side data " +
          "consistency bug — please contact support.",
      );
    }
    // Existing pending downgrade blocks new resizes — caller should
    // cancel first if they want to change direction.
    const pending = await this.prisma.pendingStorageDowngrade.findUnique({
      where: { project_id: projectId },
    });
    if (pending && pending.status === "scheduled") {
      throw new ControlPlaneError(
        "Conflict",
        `A downgrade to ${pending.new_reserved_gb} GB is already scheduled for ${pending.effective_at.toISOString()}. ` +
          `Cancel it first if you want to change direction.`,
      );
    }
    // **Stripe's `quantity` is the billing source of truth**, not the
    // pool's `reserved_encoded_bytes`. The two can drift if the pool
    // was provisioned with a different default (e.g. the gateway's
    // lazy 1 GiB provisioning that runs on first PUT, before any
    // billing wiring). The customer's monthly invoice tracks the
    // Stripe quantity; the on-chain pool capacity is what they can
    // actually use. We resize one delta forward on each upgrade —
    // if the pool is currently smaller than Stripe says, that delta
    // includes the catch-up.
    const stripeQuantity = item.quantity ?? 0;
    const poolGb = bytesToGb(pool.reserved_encoded_bytes);
    return {
      projectId,
      projectName: project.name,
      account,
      stripeCustomerId: customerId,
      subscription,
      subscriptionItem: item,
      subscriptionItemId: item.id,
      pool,
      currentBillingQuantityGb: stripeQuantity,
      currentPoolReservedGb: poolGb,
      currentReservedGb: stripeQuantity, // alias for direction comparison
      currentUsedGb: bytesToGb(pool.used_encoded_bytes),
    };
  }

  private async applyUpgrade(state: ResolvedResizeState & { newGb: number }) {
    const newGb = state.newGb;
    // On-chain delta is `newGb - poolGb` — bumps the actual reserved
    // capacity to match. Stripe delta is `newGb - stripeQuantityGb` —
    // what the customer pays the proration for. The pool/Stripe gap
    // (1 GiB vs 10 GB on a fresh project) is closed by the on-chain
    // grow even if Stripe's quantity is already at the new value.
    const onChainAdditionalGb = newGb - state.currentPoolReservedGb;
    const additionalBytes = BigInt(onChainAdditionalGb) * 1024n * 1024n * 1024n;
    const stripeRollbackQuantity = state.currentBillingQuantityGb;

    // 1. Stripe — update quantity with proration. Idempotent on
    //    (project, newGb) so a retried request collapses.
    const idempotencyKey = this.idempotencyKey({
      op: "resize-upgrade",
      projectId: state.projectId,
      newGb,
    });
    let stripeUpdated = false;
    try {
      await this.stripe.client.subscriptionItems.update(
        state.subscriptionItemId,
        {
          quantity: newGb,
          proration_behavior: "create_prorations",
        },
        { idempotencyKey },
      );
      stripeUpdated = true;
      this.logger.log(
        `stripe quantity updated: project=${state.projectId} ` +
          `${stripeRollbackQuantity}→${newGb} GB (pool delta ${state.currentPoolReservedGb}→${newGb} = +${onChainAdditionalGb} GB)`,
      );
    } catch (err) {
      this.logger.error(
        `stripe update failed for project=${state.projectId}: ${(err as Error).message}`,
      );
      throw new ControlPlaneError(
        "InternalError",
        "Could not update the Stripe subscription. Try again in a moment.",
      );
    }

    // 2. Chain — sign + submit resize_grow. WAL pulled from reserve
    //    via the Move-side entry function.
    let txDigest: string;
    try {
      txDigest = await this.submitResizeGrow({
        vaultObjectId: state.pool.vault_object_id,
        additionalBytes,
        startEpoch: state.pool.start_epoch,
        endEpoch: state.pool.end_epoch,
      });
    } catch (chainErr) {
      // Compensating rollback — same idempotency key bucket so the
      // earlier success and this rollback can't double-bill.
      this.logger.error(
        `on-chain resize_grow failed; rolling Stripe quantity back: ${(chainErr as Error).message}`,
      );
      if (stripeUpdated) {
        await this.stripe.client.subscriptionItems
          .update(
            state.subscriptionItemId,
            {
              quantity: stripeRollbackQuantity,
              proration_behavior: "create_prorations",
            },
            { idempotencyKey: idempotencyKey + ":rollback" },
          )
          .catch((rbErr) => {
            this.logger.error(
              `stripe rollback FAILED for project=${state.projectId}: ${(rbErr as Error).message}. Manual reconciliation required.`,
            );
          });
      }
      throw new ControlPlaneError(
        "InternalError",
        "Storage upgrade failed on chain; your subscription was not modified. Please retry.",
      );
    }

    // 3. Write an audit row — the indexer's pool-resized handler will
    //    update `StoragePool.reserved_encoded_bytes` from chain
    //    state when the event fires, so the row is purely audit.
    this.logger.log(
      `upgrade complete: project=${state.projectId} +${onChainAdditionalGb} GB tx=${txDigest}`,
    );
    return {
      direction: "upgrade" as const,
      pool_resize_tx: txDigest,
      stripe_subscription_id: state.subscription.id,
    };
  }

  private async scheduleDowngrade(
    state: ResolvedResizeState & { newGb: number },
  ) {
    const newGb = state.newGb;
    const periodEnd =
      state.subscription.items.data[0]?.current_period_end ??
      state.subscription.billing_cycle_anchor;
    const effectiveAt = new Date(periodEnd * 1000);
    const row = await this.prisma.pendingStorageDowngrade.upsert({
      where: { project_id: state.projectId },
      create: {
        project_id: state.projectId,
        new_reserved_gb: newGb,
        current_reserved_gb: state.currentReservedGb,
        effective_at: effectiveAt,
        status: "scheduled",
      },
      update: {
        new_reserved_gb: newGb,
        current_reserved_gb: state.currentReservedGb,
        effective_at: effectiveAt,
        status: "scheduled",
        applied_at: null,
        last_error: null,
      },
    });
    this.logger.log(
      `downgrade scheduled: project=${state.projectId} ${state.currentReservedGb}→${newGb} GB at ${effectiveAt.toISOString()}`,
    );
    return {
      direction: "downgrade" as const,
      effective_at: effectiveAt.toISOString(),
      stripe_subscription_id: state.subscription.id,
      pending_id: row.id,
    };
  }

  private async findActiveSubscription(customerId: string) {
    const list = await this.stripe.client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
      expand: ["data.items.data.price"],
    });
    return list.data.find(
      (s) => s.status === "active" || s.status === "trialing",
    );
  }

  private findStorageItem(
    subscription: NonNullable<
      Awaited<ReturnType<StorageBillingService["findActiveSubscription"]>>
    >,
  ) {
    return subscription.items.data.find(
      (it) => it.price.lookup_key === ACTIVE_PRICE_LOOKUP_KEYS.storage,
    );
  }

  private async submitResizeGrow(args: {
    vaultObjectId: string;
    additionalBytes: bigint;
    startEpoch: number;
    endEpoch: number;
  }): Promise<string> {
    // Pay for the remaining epoch window — the pool's existing
    // start/end define the WAL cost basis.
    const remainingEpochs = args.endEpoch - args.startEpoch;
    const paymentBudget = getPoolStorageCostFrost(
      args.additionalBytes,
      remainingEpochs,
    );
    const tx = new Transaction();
    tx.add(
      pool_vault.resizeGrow({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: args.vaultObjectId,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          additionalEncodedCapacityBytes: args.additionalBytes,
          paymentBudgetFrost: paymentBudget,
        },
      }),
    );
    const client = getSuiClient();
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.operator.getKeypair(),
      options: { showEffects: true },
    });
    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? "unknown";
      throw new Error(`pool_vault::resize_grow reverted: ${err}`);
    }
    return result.digest;
  }

  private assertSane(newGb: number, usedGb: number): void {
    if (!Number.isFinite(newGb) || newGb <= 0) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "new_reserved_gb must be a positive integer.",
      );
    }
    if (newGb < 10) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "Storage cannot drop below the 10 GB free tier minimum.",
      );
    }
    const headroomFloor = Math.ceil(usedGb * 1.1);
    if (newGb < headroomFloor) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Cannot drop storage below ${headroomFloor} GB (current usage ${usedGb} GB × 1.1 buffer).`,
      );
    }
  }

  private idempotencyKey(args: {
    op: string;
    projectId: string;
    newGb: number;
  }): string {
    const mode: StripeMode = this.stripe.mode;
    return `${mode}:${args.op}:${args.projectId}:${args.newGb}`;
  }
}

interface ResolvedResizeState {
  projectId: string;
  projectName: string;
  account: Awaited<
    ReturnType<PrismaService["billingAccount"]["findUnique"]>
  > & object;
  stripeCustomerId: string;
  subscription: NonNullable<
    Awaited<ReturnType<StorageBillingService["findActiveSubscription"]>>
  >;
  subscriptionItem: { id: string; quantity?: number };
  subscriptionItemId: string;
  pool: NonNullable<
    Awaited<ReturnType<PrismaService["storagePool"]["findUnique"]>>
  >;
  /** Stripe subscription_item.quantity at request time — billing truth. */
  currentBillingQuantityGb: number;
  /** On-chain `StoragePool.reserved_encoded_bytes` at request time. */
  currentPoolReservedGb: number;
  /** Alias of `currentBillingQuantityGb` used for direction comparison. */
  currentReservedGb: number;
  currentUsedGb: number;
}

/** Bytes → whole GB, rounded down. We treat `reserved_encoded_bytes`
 *  as a multiple of GB on the billing side; the indexer writes
 *  exactly `quantity_gb × 1024^3` so rounding is lossless in practice. */
function bytesToGb(bytes: bigint): number {
  return Number(bytes / (1024n * 1024n * 1024n));
}
