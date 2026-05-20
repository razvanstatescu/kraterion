import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Alert delivery — drains `BillingAlert` rows where `delivered_at IS NULL`
 * and pumps them to the configured channel.
 *
 * Today the only channel is `log` — we write to the NestJS logger and
 * mark the row delivered. That's intentional: the email/Slack provider
 * decision is a separate one the user should make (Resend vs Postmark
 * vs SES; Slack webhook URL vs Slack app). When that lands, this
 * processor grows two extra branches; the upstream evaluator and
 * `BillingAlert` table don't change.
 *
 * Why decoupled from the evaluator: a flaky email provider should
 * not gate "did this user cross 80% of their cap?" — the answer to
 * that question is data, not delivery state. Two processors, two
 * concerns.
 *
 * 30-s tick: fast enough that a user who just crossed a threshold
 * gets the notification within a minute; slow enough that the
 * processor doesn't busy-loop.
 */
@Injectable()
export class AlertDeliveryProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AlertDeliveryProcessor.name);
  private readonly TICK_MS = 30 * 1000;
  private readonly MAX_ATTEMPTS = 5;
  private readonly BATCH_SIZE = 50;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    setTimeout(() => void this.tick(), 30_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`alert-delivery armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ delivered: number; failed: number }> {
    const pending = await this.prisma.billingAlert.findMany({
      where: {
        delivered_at: null,
        attempt_count: { lt: this.MAX_ATTEMPTS },
      },
      orderBy: { fired_at: "asc" },
      take: this.BATCH_SIZE,
    });
    if (pending.length === 0) return { delivered: 0, failed: 0 };

    let delivered = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await this.deliverOne(row);
        await this.prisma.billingAlert.update({
          where: { id: row.id },
          data: { delivered_at: new Date() },
        });
        delivered++;
      } catch (err) {
        failed++;
        await this.prisma.billingAlert
          .update({
            where: { id: row.id },
            data: {
              attempt_count: { increment: 1 },
              last_error: (err as Error).message.slice(0, 1024),
            },
          })
          .catch(() => undefined);
      }
    }
    if (delivered + failed > 0) {
      this.logger.log(
        `tick: ${delivered} delivered, ${failed} failed (${pending.length} in batch)`,
      );
    }
    return { delivered, failed };
  }

  private async deliverOne(row: {
    id: string;
    project_id: string;
    period: string;
    threshold_pct: number;
    channel: string;
    accrued_at_fire_usd_cents: number;
    cap_usd_cents: number;
  }): Promise<void> {
    switch (row.channel) {
      case "log":
        // Stub channel — the "delivery" is just a logger line. When
        // we add `email` / `slack` they'll be siblings of this case
        // and call out to the corresponding provider client.
        this.logger.warn(
          `[BILLING ALERT] project=${row.project_id} period=${row.period} ` +
            `crossed ${row.threshold_pct}% of $${(row.cap_usd_cents / 100).toFixed(2)} cap ` +
            `(accrued $${(row.accrued_at_fire_usd_cents / 100).toFixed(2)})`,
        );
        return;
      // case "email": { … }   // pending B6
      // case "slack": { … }   // pending B6
      default:
        throw new Error(`unknown alert channel: ${row.channel}`);
    }
  }
}
