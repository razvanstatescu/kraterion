import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  METER_NAMES,
  hourIsoKey,
  meterEventIdentifier,
} from "@kraterion/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Hourly rollup for the `kb_index_byte_seconds` meter.
 *
 * Knowledge-index pricing is per-byte per-second of indexed content;
 * we approximate the integral with a tick-by-tick rectangle rule.
 * At each tick (every 10 minutes) we read the total bytes of
 * `content` across all active `KnowledgeChunk` rows per project,
 * multiply by `TICK_SECONDS`, and emit one `MeterEvent` per
 * (project, hour).
 *
 *     bytes_seconds_this_tick = SUM(OCTET_LENGTH(content)) × tick_seconds
 *
 * Drift is bounded: a chunk that's inserted-then-deleted within the
 * same tick contributes zero (acceptable — same as the storage
 * snapshot policy). A chunk that lives across boundaries contributes
 * a proportional amount each tick it's seen.
 *
 * Identifier collisions are handled by the same `MeterEvent.identifier`
 * UNIQUE we use for the request rollup; here the key is
 * `{project_id}:{hour_iso}` so multiple ticks inside one hour
 * **increment** the existing event's value via upsert, not create
 * dupes.
 */
@Injectable()
export class IndexRollupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexRollupProcessor.name);
  private readonly TICK_MS = 10 * 60 * 1000;
  private readonly TICK_SECONDS = BigInt(this.TICK_MS / 1000);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`index-rollup armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ projects: number; meterEvents: number }> {
    // SUM(OCTET_LENGTH(content)) per project. JOIN chunks → manifests
    // → buckets → projects.
    const rows = await this.prisma.$queryRaw<
      Array<{ project_id: string; bytes: bigint }>
    >`
      SELECT b.project_id AS project_id,
             COALESCE(SUM(OCTET_LENGTH(c.content)::bigint), 0)::bigint AS bytes
      FROM "KnowledgeChunk" c
      JOIN "Bucket" b ON b.id = c.bucket_id
      WHERE b.deleted_at IS NULL
      GROUP BY b.project_id
      HAVING COALESCE(SUM(OCTET_LENGTH(c.content)::bigint), 0)::bigint > 0
    `;

    if (rows.length === 0) {
      return { projects: 0, meterEvents: 0 };
    }
    const hour = hourIsoKey(new Date());
    const day = todayUtcKey();
    let emitted = 0;

    for (const row of rows) {
      const byteSeconds = row.bytes * this.TICK_SECONDS;
      if (byteSeconds <= 0n) continue;
      emitted += await this.emit(row.project_id, byteSeconds, hour, day);
    }
    if (emitted > 0) {
      this.logger.log(
        `tick: ${rows.length} project(s), ${emitted} meter event(s)`,
      );
    }
    return { projects: rows.length, meterEvents: emitted };
  }

  private async emit(
    projectId: string,
    byteSeconds: bigint,
    hour: string,
    day: string,
  ): Promise<number> {
    const meter = METER_NAMES.kb_index_byte_seconds;
    const identifier = meterEventIdentifier({
      mode: this.stripe.mode,
      meter,
      key: `${projectId}:${hour}`,
    });
    // Upsert pattern: a single hourly meter event accumulates across
    // ticks within the same hour. This keeps Stripe-side row count
    // low (1/hour/project) and matches what reconciliation expects.
    const existing = await this.prisma.meterEvent.findUnique({
      where: { identifier },
    });
    if (existing) {
      // Only re-emit-able while still pending (Stripe dedupes us at
      // 24h anyway; once `sent` we can't bump it).
      if (existing.stripe_status === "pending") {
        await this.prisma.meterEvent.update({
          where: { identifier },
          data: { value: { increment: byteSeconds } },
        });
      } else {
        // The hour's event already shipped; the additional samples
        // for the same hour are lost (acceptable — meter events from
        // a fresh hour will carry the next sample). Document.
        return 0;
      }
    } else {
      await this.prisma.meterEvent.create({
        data: {
          project_id: projectId,
          meter_name: meter,
          value: byteSeconds,
          identifier,
          period_start: new Date(`${hour}:00:00Z`),
          occurred_at: new Date(),
          stripe_status: "pending",
        },
      });
    }

    await this.prisma.usageDaily.upsert({
      where: {
        project_id_day_meter_name: { project_id: projectId, day, meter_name: meter },
      },
      create: { project_id: projectId, day, meter_name: meter, value: byteSeconds },
      update: { value: { increment: byteSeconds } },
    });
    return 1;
  }
}

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
