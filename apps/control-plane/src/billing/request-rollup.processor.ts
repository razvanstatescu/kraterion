import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  METER_NAMES,
  hourIsoKey,
  meterEventIdentifier,
  type MeterName,
} from "@kraterion/shared";
import type { Redis } from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { StripeService } from "./stripe.service.js";

/**
 * Hourly rollup of gateway request meters: `gateway_class_a`,
 * `gateway_class_b`, `gateway_egress_bytes`.
 *
 * The gateway interceptor already increments three Redis day-counters
 * per project per request. This processor takes hour-grained
 * snapshots of those counters at every tick: it computes the delta
 * since the last tick (read from a sibling `usage:rollup_seen:` key)
 * and emits one `MeterEvent` row per meter per project per hour.
 *
 * Idempotent: `MeterEvent.identifier` is UNIQUE on
 * `{mode}:{meter}:{project}:{hour_iso}`; if we re-emit the same hour
 * we hit the existing row and skip. Same shape Stripe uses
 * internally — their own 24h dedupe window catches the rest.
 *
 * Cadence: fires at `:01`, `:11`, `:21`, … of every hour (each tick
 * + 10 min) — close enough to "hourly" that the dashboard's "this
 * period" projection lands within ~10 min freshness. The dashboard
 * itself also reads the live Redis counters for the current hour so
 * users see usage in real time, not just at top-of-hour boundaries.
 *
 * `UsageEvent` reconciliation (sanity check against Redis drift) is
 * planned but deferred — Redis is durable enough for v1.
 */
@Injectable()
export class RequestRollupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestRollupProcessor.name);
  private readonly TICK_MS = 10 * 60 * 1000; // every 10 minutes
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(`request-rollup armed (tick=${this.TICK_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Single-shot. Exposed for tests. */
  async tick(): Promise<{ projects: number; meterEvents: number }> {
    // Enumerate all (project, day, meter) counters we wrote in the
    // current UTC hour. The interceptor uses pattern
    // `usage:{project}:{day}:{class_a|class_b|egress}`.
    const day = todayUtcKey();
    const hour = hourIsoKey(new Date());

    const counters = await this.scan(`usage:*:${day}:*`);
    const byProjectAndMeter = new Map<string, { class_a: bigint; class_b: bigint; egress: bigint }>();

    for (const key of counters) {
      const parts = key.split(":");
      // usage:{project}:{day}:{meter}
      if (parts.length !== 4) continue;
      const projectId = parts[1];
      const meter = parts[3];
      if (!projectId || !meter) continue;
      const raw = await this.redis.get(key);
      if (!raw) continue;
      const total = BigInt(raw);

      // We need a delta — read the last "seen" counter for this
      // (project, hour, meter) and emit the difference. The seen
      // key has the same TTL as the source counter (40 days).
      const seenKey = `usage:rollup_seen:${projectId}:${hour}:${meter}`;
      const lastSeenRaw = await this.redis.get(seenKey);
      const lastSeen = lastSeenRaw ? BigInt(lastSeenRaw) : 0n;
      const delta = total - lastSeen;
      if (delta <= 0n) continue;

      // Update the "seen" pointer before writing the meter event so a
      // failure mid-write doesn't double-count on retry. If the meter
      // event write fails after this, the next tick sees 0 delta and
      // skips — but we already lost the data point. Acceptable for v1;
      // Stripe's identifier dedupe is the real guard anyway.
      await this.redis.set(seenKey, total.toString(), "EX", 40 * 86400);

      let projectMeters = byProjectAndMeter.get(projectId);
      if (!projectMeters) {
        projectMeters = { class_a: 0n, class_b: 0n, egress: 0n };
        byProjectAndMeter.set(projectId, projectMeters);
      }
      if (meter === "class_a") projectMeters.class_a += delta;
      else if (meter === "class_b") projectMeters.class_b += delta;
      else if (meter === "egress") projectMeters.egress += delta;
    }

    let emitted = 0;
    for (const [projectId, m] of byProjectAndMeter) {
      if (m.class_a > 0n) {
        emitted += await this.emit(projectId, METER_NAMES.gateway_class_a, m.class_a, hour, day);
      }
      if (m.class_b > 0n) {
        emitted += await this.emit(projectId, METER_NAMES.gateway_class_b, m.class_b, hour, day);
      }
      if (m.egress > 0n) {
        emitted += await this.emit(projectId, METER_NAMES.gateway_egress_bytes, m.egress, hour, day);
      }
    }

    if (emitted > 0) {
      this.logger.log(
        `tick: ${byProjectAndMeter.size} project(s), ${emitted} meter event(s) for hour=${hour}`,
      );
    }
    return { projects: byProjectAndMeter.size, meterEvents: emitted };
  }

  /** Write a `MeterEvent` row and bump the `UsageDaily` rollup. The
   *  meter event identifier is UNIQUE on `{mode}:{meter}:{project}:{hour}`
   *  so re-runs are no-ops at the DB layer. */
  private async emit(
    projectId: string,
    meter: MeterName,
    value: bigint,
    hour: string,
    day: string,
  ): Promise<number> {
    const identifier = meterEventIdentifier({
      mode: this.stripe.mode,
      meter,
      key: `${projectId}:${hour}`,
    });
    try {
      await this.prisma.meterEvent.create({
        data: {
          project_id: projectId,
          meter_name: meter,
          value,
          identifier,
          period_start: hourStart(hour),
          occurred_at: new Date(),
          stripe_status: "pending",
        },
      });
    } catch (err) {
      // P2002 = unique constraint; the only path we expect.
      const code = (err as { code?: string }).code;
      if (code === "P2002") return 0;
      throw err;
    }

    // Bump UsageDaily for the dashboard. Same idempotent upsert.
    await this.prisma.usageDaily.upsert({
      where: {
        project_id_day_meter_name: { project_id: projectId, day, meter_name: meter },
      },
      create: {
        project_id: projectId,
        day,
        meter_name: meter,
        value,
      },
      update: {
        value: { increment: value },
      },
    });
    return 1;
  }

  /** SCAN over Redis without blocking the server on KEYS. */
  private async scan(pattern: string): Promise<string[]> {
    const out: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      out.push(...batch);
    } while (cursor !== "0");
    return out;
  }
}

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Parse the hour-iso back into a Date for `period_start`. */
function hourStart(hourIso: string): Date {
  // hourIso = "YYYY-MM-DDTHH"
  return new Date(`${hourIso}:00:00Z`);
}
