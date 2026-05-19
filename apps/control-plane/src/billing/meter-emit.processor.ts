import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Drains `MeterEvent` rows with `stripe_status = 'pending'` to Stripe
 * via `POST /v1/billing/meter_events`. Runs every 60 s in-process.
 *
 * For each batch (50 rows max per tick):
 *
 *   1. Resolve the project's Stripe customer id (we cache the
 *      mode-correct value on `BillingAccount`).
 *   2. POST the meter event with the row's `identifier` as the
 *      Stripe dedupe key — same value we used to UNIQUE-key the
 *      local row, so a retry of the same row collapses inside the
 *      24 h Stripe dedupe window.
 *   3. On success → `stripe_status = 'sent'`, `sent_at = now()`.
 *   4. On retryable error → `attempt_count += 1`. After 12 attempts
 *      the row goes `dead_letter` and stops being retried.
 *   5. On permanent error (4xx besides 429) → straight to
 *      `dead_letter`.
 *
 * Skips events for projects without a Stripe customer (free-band
 * projects that haven't checked out yet). Those rows sit in `pending`
 * forever; the dashboard's projection still uses them for display.
 * If the project later attaches a card, the next drain picks them up
 * — assuming we're still inside Stripe's 24 h dedupe window (older
 * rows get sent normally; Stripe will accept them but won't dedupe
 * across the window).
 */
@Injectable()
export class MeterEmitProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeterEmitProcessor.name);
  private readonly TICK_MS = 60 * 1000;
  private readonly MAX_ATTEMPTS = 12;
  private readonly BATCH_SIZE = 50;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    // Don't fire on boot — let the rollup processors land some
    // events first. The first tick happens after `TICK_MS`.
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`meter-emit armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Single-shot drain. Exposed for tests + admin triggers. */
  async tick(): Promise<{ sent: number; failed: number; deadLetter: number; skipped: number }> {
    const pending = await this.prisma.meterEvent.findMany({
      where: {
        stripe_status: "pending",
        attempt_count: { lt: this.MAX_ATTEMPTS },
      },
      orderBy: { occurred_at: "asc" },
      take: this.BATCH_SIZE,
    });
    if (pending.length === 0) {
      return { sent: 0, failed: 0, deadLetter: 0, skipped: 0 };
    }

    let sent = 0;
    let failed = 0;
    let deadLetter = 0;
    let skipped = 0;
    for (const row of pending) {
      try {
        const result = await this.emitOne(row);
        if (result === "sent") sent++;
        else if (result === "skipped") skipped++;
      } catch (err) {
        const next = row.attempt_count + 1;
        const message = (err as Error).message;
        if (next >= this.MAX_ATTEMPTS) {
          deadLetter++;
          await this.prisma.meterEvent
            .update({
              where: { id: row.id },
              data: {
                stripe_status: "dead_letter",
                attempt_count: next,
                last_error: message.slice(0, 1024),
              },
            })
            .catch(() => undefined);
          this.logger.error(
            `dead-letter: meter=${row.meter_name} project=${row.project_id} value=${row.value} after ${next} attempts: ${message}`,
          );
        } else {
          failed++;
          await this.prisma.meterEvent
            .update({
              where: { id: row.id },
              data: {
                attempt_count: next,
                last_error: message.slice(0, 1024),
              },
            })
            .catch(() => undefined);
          this.logger.warn(
            `attempt ${next}/${this.MAX_ATTEMPTS} failed (meter=${row.meter_name}, project=${row.project_id}): ${message}`,
          );
        }
      }
    }
    if (sent + failed + deadLetter > 0) {
      this.logger.log(
        `tick: ${sent} sent, ${skipped} skipped, ${failed} retrying, ${deadLetter} dead-lettered (${pending.length} in batch)`,
      );
    }
    return { sent, failed, deadLetter, skipped };
  }

  private async emitOne(row: {
    id: string;
    project_id: string;
    meter_name: string;
    value: bigint;
    identifier: string;
    occurred_at: Date;
  }): Promise<"sent" | "skipped"> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: row.project_id },
    });
    if (!account) return "skipped"; // free band, no customer
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) return "skipped";

    await this.stripe.client.billing.meterEvents.create({
      event_name: row.meter_name,
      identifier: row.identifier,
      // Stripe accepts the event timestamp in seconds since epoch.
      // Send the row's `occurred_at` (which is the hour-bucket the
      // rollup tick stamped) so Stripe places the usage in the
      // correct billing period.
      timestamp: Math.floor(row.occurred_at.getTime() / 1000),
      payload: {
        stripe_customer_id: customerId,
        value: row.value.toString(),
      },
    });

    await this.prisma.meterEvent.update({
      where: { id: row.id },
      data: {
        stripe_status: "sent",
        sent_at: new Date(),
      },
    });
    return "sent";
  }
}
