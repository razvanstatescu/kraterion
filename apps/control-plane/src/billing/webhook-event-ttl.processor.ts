import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * StripeWebhookEvent TTL — daily cleanup of processed webhook
 * payloads older than 90 days.
 *
 * The row is used for two things:
 *   1. Idempotency dedup against Stripe's at-most-3-day retry window
 *      (PK on `event.id`).
 *   2. Local audit trail of every Stripe event we received.
 *
 * Stripe doesn't retry past 3 days, so the PK side of the row is
 * dead weight after that. The audit-trail side is useful for
 * forensics but doesn't need a 5-year retention — the original event
 * lives forever in Stripe's logs anyway. 90 days is a comfortable
 * dispute window.
 *
 * We only delete rows where `processed_at` is set — a stuck row
 * (handler keeps failing) stays in place so we can find it. If a row
 * has been stuck for 90+ days, we want to know, not silently lose
 * it.
 */
@Injectable()
export class WebhookEventTtlProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WebhookEventTtlProcessor.name);
  private readonly TICK_MS = 24 * 60 * 60 * 1000; // daily
  private readonly RETENTION_DAYS = 90;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // First tick at +5 min so cron coexists with the other startup
    // processors without flooding the logs.
    setTimeout(() => void this.tick(), 5 * 60_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `webhook-event TTL armed (retention=${this.RETENTION_DAYS}d, tick=${this.TICK_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ deleted: number }> {
    const cutoff = new Date(
      Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.prisma.stripeWebhookEvent.deleteMany({
      where: {
        received_at: { lt: cutoff },
        processed_at: { not: null },
      },
    });
    if (result.count > 0) {
      this.logger.log(
        `pruned ${result.count} StripeWebhookEvent row(s) processed before ${cutoff.toISOString()}`,
      );
    }
    return { deleted: result.count };
  }
}
