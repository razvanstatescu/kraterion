import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type Stripe from "stripe";
import { METER_NAMES, type MeterName } from "@kraterion/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Nightly reconciliation between local `MeterEvent` totals and Stripe's
 * authoritative Meter Event Summary.
 *
 * Both numbers should match within rounding (Stripe's summary
 * aggregates the same `(meter, customer, timestamp_window)` events we
 * shipped via `meter-emit`). Drift is the early-warning signal for:
 *
 *   - emit failures that landed in `dead_letter` and never made it to
 *     Stripe (local > Stripe);
 *   - duplicate or replayed emits (local < Stripe);
 *   - identifier-collision bugs;
 *   - Stripe-side delays past the 24h dedupe window leaking through.
 *
 * The processor:
 *
 *   1. For every `BillingAccount` with a Stripe customer, sum local
 *      `MeterEvent.value` where `stripe_status = 'sent'`,
 *      `period_start` in [yesterday-UTC, today-UTC), grouped by
 *      meter.
 *   2. Fetch Stripe's `billing.meters.eventSummaries.list` for the
 *      same customer + meter + window. Sum the `aggregated_value`s.
 *   3. Diff. Log `drift_pct = abs(local - stripe) / max(local, 1)`.
 *      Warn at 0.1%, error at 1%.
 *
 * What we DO NOT do:
 *
 *   - Block emit on drift. Reconciliation is read-only; the action is
 *     a human investigation triggered by the log line, not an
 *     automated cutoff.
 *   - Trust Stripe over local. The local row IS what we sent; if it
 *     doesn't appear in Stripe's summary, that's Stripe's problem to
 *     resolve, and we want to know.
 *
 * Cron: runs once a day at ~02:00 local time (5h after the boot of
 * a CP process for spacing — actual schedule is in the constructor
 * comment). The first tick happens 5 min after boot so we have an
 * immediate sanity check after a deploy.
 */
@Injectable()
export class ReconciliationProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReconciliationProcessor.name);
  private readonly TICK_MS = 24 * 60 * 60 * 1000; // daily
  private readonly DRIFT_WARN_PCT = 0.1;
  private readonly DRIFT_ERROR_PCT = 1.0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    // First tick 5min after boot — gives the emitter time to drain.
    setTimeout(() => void this.tick(), 5 * 60_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `reconciliation armed (tick=${this.TICK_MS}ms, warn=${this.DRIFT_WARN_PCT}%, error=${this.DRIFT_ERROR_PCT}%)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{
    accounts: number;
    matched: number;
    drifted: number;
    over_threshold: number;
  }> {
    // Window: yesterday-UTC 00:00 → today-UTC 00:00.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startSec = Math.floor(
      (today.getTime() - 24 * 60 * 60 * 1000) / 1000,
    );
    const endSec = Math.floor(today.getTime() / 1000);

    // Cache Meter id by event_name once per tick.
    const stripeMeters = await this.listAllStripeMeters();
    const meterIdByEventName = new Map(
      stripeMeters.map((m) => [m.event_name as MeterName, m.id]),
    );

    const accounts = await this.prisma.billingAccount.findMany({
      where: {
        OR: [
          { stripe_customer_id_test: { not: null } },
          { stripe_customer_id_live: { not: null } },
        ],
      },
    });

    let matched = 0;
    let drifted = 0;
    let overThreshold = 0;

    for (const account of accounts) {
      const customerId = this.stripe.getStripeCustomerId(account);
      if (!customerId) continue;

      // Local sums grouped by meter for the window.
      const localRows = await this.prisma.$queryRaw<
        Array<{ meter_name: MeterName; total: bigint }>
      >`
        SELECT meter_name, COALESCE(SUM(value), 0)::bigint AS total
        FROM "MeterEvent"
        WHERE project_id = ${account.project_id}
          AND stripe_status = 'sent'
          AND period_start >= to_timestamp(${startSec})
          AND period_start <  to_timestamp(${endSec})
        GROUP BY meter_name
      `;
      const localByMeter = new Map<MeterName, bigint>();
      for (const row of localRows) {
        localByMeter.set(row.meter_name, row.total);
      }

      // Stripe-side sums for each meter we care about.
      for (const eventName of Object.values(METER_NAMES) as MeterName[]) {
        const meterId = meterIdByEventName.get(eventName);
        if (!meterId) continue;

        const stripeSum = await this.sumStripeMeter(
          meterId,
          customerId,
          startSec,
          endSec,
        );
        const localSum = localByMeter.get(eventName) ?? 0n;

        // Both zero — nothing to reconcile, move on.
        if (stripeSum === 0n && localSum === 0n) continue;

        const driftPct = computeDriftPct(localSum, stripeSum);
        const tag =
          `project=${account.project_id} meter=${eventName} ` +
          `local=${localSum} stripe=${stripeSum} drift=${driftPct.toFixed(3)}%`;

        if (driftPct === 0) {
          matched++;
          // matched is the happy path — log at debug, not info.
          continue;
        }
        drifted++;
        if (driftPct >= this.DRIFT_ERROR_PCT) {
          overThreshold++;
          this.logger.error(`drift OVER error threshold: ${tag}`);
        } else if (driftPct >= this.DRIFT_WARN_PCT) {
          this.logger.warn(`drift over warn threshold: ${tag}`);
        } else {
          this.logger.log(`drift within tolerance: ${tag}`);
        }
      }
    }

    this.logger.log(
      `reconciliation tick: ${accounts.length} accounts, ${matched} exact matches, ${drifted} drifted, ${overThreshold} over error threshold`,
    );
    return {
      accounts: accounts.length,
      matched,
      drifted,
      over_threshold: overThreshold,
    };
  }

  private async sumStripeMeter(
    meterId: string,
    customerId: string,
    startSec: number,
    endSec: number,
  ): Promise<bigint> {
    // Stripe's eventSummaries.list is paginated; sum across all pages.
    // `value_grouping_window: "hour"` matches our hour-bucketed
    // emit cadence; we sum the hourly buckets back up.
    let total = 0n;
    const params: Stripe.Billing.MeterListEventSummariesParams = {
      customer: customerId,
      start_time: startSec,
      end_time: endSec,
      value_grouping_window: "hour",
      limit: 100,
    };
    for await (const summary of this.stripe.client.billing.meters.listEventSummaries(
      meterId,
      params,
    )) {
      total += BigInt(Math.round(summary.aggregated_value));
    }
    return total;
  }

  private async listAllStripeMeters(): Promise<Stripe.Billing.Meter[]> {
    const out: Stripe.Billing.Meter[] = [];
    for await (const m of this.stripe.client.billing.meters.list({
      limit: 100,
    })) {
      out.push(m);
    }
    return out;
  }
}

function computeDriftPct(local: bigint, stripe: bigint): number {
  if (local === stripe) return 0;
  const max = local > stripe ? local : stripe;
  if (max === 0n) return 0;
  const diff = local > stripe ? local - stripe : stripe - local;
  // Compute as float for log readability; precision loss at billion
  // scale is irrelevant for a drift % display.
  return (Number(diff) / Number(max)) * 100;
}
