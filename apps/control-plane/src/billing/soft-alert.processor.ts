import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { UsageService } from "../usage/usage.service.js";

/**
 * Soft-cap threshold evaluator.
 *
 * Each tick:
 *
 *   1. For every `BillingAccount` with a non-null
 *      `hard_spend_cap_usd_cents`, fetch this period's accrued spend
 *      via `UsageService.getCurrentPeriod(...)`.
 *   2. Compare `accrued / cap` against the project's configured
 *      thresholds (`soft_alert_thresholds`, default `[50, 80, 100]`).
 *   3. For each threshold the project has crossed for the first time
 *      this period, insert a `BillingAlert` row. The composite UNIQUE
 *      `(project_id, period, threshold_pct, channel)` makes replay a
 *      no-op.
 *
 * What this DOES NOT do:
 *
 *   - Deliver the alert. That's the `AlertDeliveryProcessor`'s job
 *     (separate concern, so a flaky email provider doesn't gate
 *     evaluation).
 *
 *   - Look at meter-specific (free-band) thresholds. Free-band alerts
 *     are surfaced through the dashboard `BillingBanner` only — the
 *     soft-cap evaluator is for the dollar-cap surface.
 *
 * Cron: 5-minute tick (cheap; reads `UsageDaily` aggregates, not raw
 * `UsageEvent`).
 */
@Injectable()
export class SoftAlertEvaluator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SoftAlertEvaluator.name);
  private readonly TICK_MS = 5 * 60 * 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    // First tick at +90s; gives rollups time to land a fresh sample.
    setTimeout(() => void this.tick(), 90_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`soft-alert evaluator armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ checked: number; fired: number }> {
    const period = currentPeriodKey();
    const accounts = await this.prisma.billingAccount.findMany({
      where: { hard_spend_cap_usd_cents: { not: null } },
    });

    let fired = 0;
    for (const account of accounts) {
      const cap = account.hard_spend_cap_usd_cents;
      if (!cap || cap <= 0) continue;

      const usage = await this.usage
        .getCurrentPeriod(account.project_id)
        .catch(() => null);
      if (!usage) continue;
      const accrued = usage.total_accrued_usd_cents;

      // Compare accrued against each configured threshold. If
      // accrued/cap × 100 ≥ threshold AND no row exists yet for
      // (project, period, threshold, 'log') → insert one.
      const thresholds = account.soft_alert_thresholds ?? [50, 80, 100];
      for (const threshold of thresholds) {
        const triggerAt = Math.floor((cap * threshold) / 100);
        if (accrued < triggerAt) continue;
        const created = await this.tryFire({
          projectId: account.project_id,
          period,
          thresholdPct: threshold,
          accruedCents: accrued,
          capCents: cap,
        });
        if (created) fired++;
      }
    }

    if (fired > 0) {
      this.logger.log(`fired ${fired} new soft alerts (period=${period})`);
    }
    return { checked: accounts.length, fired };
  }

  /** Idempotent insert — the UNIQUE constraint catches duplicates,
   *  so a race-replay of the same evaluator is a no-op. Returns true
   *  iff a row was actually created (i.e. first crossing). */
  private async tryFire(args: {
    projectId: string;
    period: string;
    thresholdPct: number;
    accruedCents: number;
    capCents: number;
  }): Promise<boolean> {
    try {
      await this.prisma.billingAlert.create({
        data: {
          project_id: args.projectId,
          period: args.period,
          threshold_pct: args.thresholdPct,
          // For now every alert goes to the `log` channel — the
          // delivery driver pumps it to stdout. Future B6 work adds
          // `email` and `slack` rows for projects with those wired.
          channel: "log",
          accrued_at_fire_usd_cents: args.accruedCents,
          cap_usd_cents: args.capCents,
        },
      });
      return true;
    } catch (err) {
      // Unique-violation → already fired this period, expected.
      if ((err as { code?: string }).code === "P2002") return false;
      this.logger.warn(
        `billing alert insert failed for project=${args.projectId}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}

/** YYYY-MM in UTC — matches the billing window /usage uses. */
function currentPeriodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
