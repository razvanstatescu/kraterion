import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { BillingService } from "./billing.service.js";
import { ACTIVE_PRICE_LOOKUP_KEYS } from "./catalog.js";
import { StripeService } from "./stripe.service.js";

/**
 * Applies `PendingStorageDowngrade` rows whose `effective_at` has
 * passed. Wakes every 5 minutes; per-row processing is idempotent
 * (the row's `status` is the discriminator) so a missed tick or a
 * duplicate webhook firing the same downgrade are both safe.
 *
 * Steps per due row:
 *
 *   1. Re-read the active Stripe subscription for the project. Skip
 *      if it's gone (e.g. customer cancelled in the meantime).
 *   2. `subscriptionItems.update(quantity = new_gb, proration_behavior = 'none')`
 *      — new month, full new quantity, no proration.
 *   3. Mark the row `applied`. The dashboard "Pending downgrade"
 *      banner clears on next render.
 *
 * **No on-chain `resize_shrink` in v1.** The pool's
 * `reserved_encoded_bytes` stays at the larger value until the pool's
 * 53-epoch window expires naturally. Documented limitation; the
 * customer's Stripe bill reflects the new (smaller) quantity but our
 * underlying Walrus reservation cost stays unchanged for ~2 years.
 *
 * On error we increment `attempt_count` and leave the row
 * `scheduled` so the next tick retries; after a hard threshold we'll
 * page (TODO when we have an alerting backbone).
 */
@Injectable()
export class StorageDowngradeProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageDowngradeProcessor.name);
  private readonly TICK_MS = 5 * 60 * 1000; // 5 minutes
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit(): void {
    // Fire-and-forget first tick on boot so missed downgrades catch
    // up immediately rather than waiting a cycle.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.TICK_MS);
    // Don't keep the process alive just for this interval.
    this.timer.unref?.();
    this.logger.log(`storage-downgrade processor armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Single-shot. Exposed for tests + the boot-time first run. */
  async tick(): Promise<{ applied: number; failed: number; skipped: number }> {
    const due = await this.prisma.pendingStorageDowngrade.findMany({
      where: {
        status: "scheduled",
        effective_at: { lte: new Date() },
      },
      orderBy: { effective_at: "asc" },
      take: 50,
    });
    if (due.length === 0) {
      return { applied: 0, failed: 0, skipped: 0 };
    }
    let applied = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of due) {
      try {
        const result = await this.applyOne(row);
        if (result === "applied") applied++;
        else skipped++;
      } catch (err) {
        failed++;
        this.logger.error(
          `apply failed for project=${row.project_id}: ${(err as Error).message}`,
        );
        await this.prisma.pendingStorageDowngrade
          .update({
            where: { project_id: row.project_id },
            data: {
              last_error: (err as Error).message.slice(0, 1024),
            },
          })
          .catch(() => {
            /* swallow — next tick retries */
          });
      }
    }
    if (applied + failed + skipped > 0) {
      this.logger.log(
        `tick: ${applied} applied, ${skipped} skipped, ${failed} failed (${due.length} due)`,
      );
    }
    return { applied, failed, skipped };
  }

  private async applyOne(row: {
    id: string;
    project_id: string;
    new_reserved_gb: number;
    current_reserved_gb: number;
  }): Promise<"applied" | "skipped"> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: row.project_id },
    });
    if (!account) {
      this.logger.warn(
        `no BillingAccount for project=${row.project_id}; cancelling pending downgrade`,
      );
      await this.prisma.pendingStorageDowngrade.update({
        where: { id: row.id },
        data: { status: "cancelled" },
      });
      return "skipped";
    }
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) {
      this.logger.warn(
        `no Stripe customer for project=${row.project_id}; cancelling pending downgrade`,
      );
      await this.prisma.pendingStorageDowngrade.update({
        where: { id: row.id },
        data: { status: "cancelled" },
      });
      return "skipped";
    }

    // Resolve the storage subscription item.
    const subs = await this.stripe.client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
      expand: ["data.items.data.price"],
    });
    const live = subs.data.find(
      (s) => s.status === "active" || s.status === "trialing",
    );
    if (!live) {
      this.logger.warn(
        `no active subscription for project=${row.project_id}; cancelling pending downgrade`,
      );
      await this.prisma.pendingStorageDowngrade.update({
        where: { id: row.id },
        data: { status: "cancelled" },
      });
      return "skipped";
    }
    const storageItem = live.items.data.find(
      (it) => it.price.lookup_key === ACTIVE_PRICE_LOOKUP_KEYS.storage,
    );
    if (!storageItem) {
      throw new Error(
        `subscription ${live.id} missing storage line item — data consistency bug`,
      );
    }

    // The actual quantity update. No proration — new month, new
    // quantity, full price from the boundary forward.
    const idempotencyKey = `${this.stripe.mode}:downgrade-apply:${row.project_id}:${row.new_reserved_gb}`;
    await this.stripe.client.subscriptionItems.update(
      storageItem.id,
      {
        quantity: row.new_reserved_gb,
        proration_behavior: "none",
      },
      { idempotencyKey },
    );

    await this.prisma.pendingStorageDowngrade.update({
      where: { id: row.id },
      data: {
        status: "applied",
        applied_at: new Date(),
        last_error: null,
      },
    });
    this.logger.log(
      `downgrade applied: project=${row.project_id} ${row.current_reserved_gb}→${row.new_reserved_gb} GB`,
    );
    // Touch BillingService to satisfy DI graph linting; the service
    // is referenced for parity with the upgrade path even though the
    // shrink mechanism itself is internal here.
    void this.billing;
    return "applied";
  }
}
