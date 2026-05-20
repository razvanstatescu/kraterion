import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * UsageEvent TTL — daily cleanup of per-request logs older than 35
 * days.
 *
 * The plan called for a day-partitioned `UsageEvent` table with
 * `DROP PARTITION` for old days. That's the right answer at scale
 * (instant drop, no bloat). For sandbox-mode + the volumes we see
 * during the hackathon, a plain `DELETE WHERE occurred_at < cutoff`
 * is fine; the operation completes in well under a second on the
 * row counts we expect (≪1M).
 *
 * 35 days = one invoice cycle (30) + dispute window (5). After that
 * the per-request audit row is unreachable from any user-facing
 * surface — `UsageDaily` carries the rollup forever, and the meter
 * events themselves have shipped to Stripe.
 *
 * Tradeoff: the partition rewrite is a real-ops change with
 * downtime + an FK audit. We can land it later when:
 *   - sustained traffic crosses ~10M UsageEvent rows/day, or
 *   - the daily DELETE shows up in slow-query logs, or
 *   - we want point-in-time partition-drop for compliance.
 * Until then, this 60-line worker beats a 500-line migration.
 *
 * Runs once an hour (cheap enough; idempotent — second run finds
 * nothing to delete and exits).
 */
@Injectable()
export class UsageEventTtlProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsageEventTtlProcessor.name);
  private readonly TICK_MS = 60 * 60 * 1000; // 1h
  private readonly RETENTION_DAYS = 35;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // First tick happens 60s after startup so we don't compete with
    // module-init work. The runtime cost is small but the delay
    // makes startup logs cleaner.
    setTimeout(() => void this.tick(), 60_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `usage-event TTL armed (retention=${this.RETENTION_DAYS}d, tick=${this.TICK_MS}ms)`,
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
    const result = await this.prisma.usageEvent.deleteMany({
      where: { occurred_at: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(
        `pruned ${result.count} UsageEvent row(s) older than ${cutoff.toISOString()}`,
      );
    }
    return { deleted: result.count };
  }
}
