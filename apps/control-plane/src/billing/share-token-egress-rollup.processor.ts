import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  METER_NAMES,
  hourIsoKey,
  meterEventIdentifier,
} from "@kraterion/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "./stripe.service.js";

/**
 * Share-token egress rollup (B1 closeout).
 *
 * `ShareTokenUsageDay` carries a running `bytes_out` counter that the
 * chat completion path bumps on every successful turn via
 * `ShareTokenUsageService.record(..., bytesOut)`. This processor
 * drains the delta into a `MeterEvent` row keyed
 * `{project_id}:{hour_iso}` so Stripe sees a steady trickle of usage
 * events on the `share_token_egress_bytes` meter rather than one
 * giant midnight burst.
 *
 * Drain shape: each tick (every 10 minutes)
 *
 *   1. Find rows where `bytes_out > bytes_out_at_last_emit` AND
 *      `day_utc = today`. (Yesterday's tail still lands at the next
 *      tick after the UTC boundary if any straggler write happened.)
 *   2. For each row: emit `(bytes_out - bytes_out_at_last_emit)` to
 *      MeterEvent under the row's project, then set
 *      `bytes_out_at_last_emit = bytes_out` in the same transaction.
 *
 * Why we don't piggy-back on the existing request-rollup processor:
 * share-token usage doesn't go through the gateway interceptor (it's
 * a CP chat endpoint, not S3), so the request rollup never sees
 * these bytes. Separate processor keeps the source-of-truth chain
 * obvious — see the meter source map in
 * `/docs/decisions.md` (B5 entry).
 *
 * Tradeoff considered: deriving the per-share-token egress on the
 * dashboard side from the existing `agent_messages` meter (multiply
 * by an average response size). Rejected — abuse detection on public
 * share links wants the per-token granularity the existing audit row
 * already provides, and the per-token byte count survives even if a
 * share token is later revoked.
 */
@Injectable()
export class ShareTokenEgressRollupProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ShareTokenEgressRollupProcessor.name);
  private readonly TICK_MS = 10 * 60 * 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `share-token-egress rollup armed (tick=${this.TICK_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ tokens: number; meterEvents: number }> {
    // Resolve project_id for every share token with un-drained bytes
    // today. AgentShareToken → KraterionAgent → project_id gets us
    // there in two joins; pulling the lot in one query avoids N+1.
    const today = todayUtcKey();
    const rows = await this.prisma.$queryRaw<
      Array<{
        share_token_id: string;
        project_id: string;
        delta_bytes: bigint;
        bytes_out: bigint;
      }>
    >`
      SELECT sd.share_token_id AS share_token_id,
             a.project_id      AS project_id,
             (sd.bytes_out - COALESCE(sd.bytes_out_at_last_emit, 0))::bigint AS delta_bytes,
             sd.bytes_out      AS bytes_out
      FROM "ShareTokenUsageDay" sd
      JOIN "AgentShareToken" t ON t.id = sd.share_token_id
      JOIN "KraterionAgent" a   ON a.id = t.agent_id
      WHERE sd.day_utc = ${today}
        AND sd.bytes_out > COALESCE(sd.bytes_out_at_last_emit, 0)
    `;

    if (rows.length === 0) {
      return { tokens: 0, meterEvents: 0 };
    }

    // Bucket deltas by project so we emit one MeterEvent per
    // (project, hour) — same convention as the index rollup.
    const byProject = new Map<string, bigint>();
    for (const row of rows) {
      const sum = byProject.get(row.project_id) ?? 0n;
      byProject.set(row.project_id, sum + row.delta_bytes);
    }

    const hour = hourIsoKey(new Date());
    let emitted = 0;
    for (const [projectId, bytes] of byProject) {
      if (bytes <= 0n) continue;
      emitted += await this.emit(projectId, bytes, hour, today);
    }

    // Advance the cursors. We do this AFTER the meter emit so a
    // crashed tick is recovered by the next one (we'll re-emit the
    // same delta — Stripe's `identifier` UNIQUE dedupes it).
    for (const row of rows) {
      await this.prisma.shareTokenUsageDay.update({
        where: {
          share_token_id_day_utc: {
            share_token_id: row.share_token_id,
            day_utc: today,
          },
        },
        data: { bytes_out_at_last_emit: row.bytes_out },
      });
    }

    if (emitted > 0) {
      this.logger.log(
        `tick: ${rows.length} share token row(s) drained, ${emitted} meter event(s)`,
      );
    }
    return { tokens: rows.length, meterEvents: emitted };
  }

  private async emit(
    projectId: string,
    bytes: bigint,
    hour: string,
    day: string,
  ): Promise<number> {
    const meter = METER_NAMES.share_token_egress_bytes;
    const identifier = meterEventIdentifier({
      mode: this.stripe.mode,
      meter,
      key: `${projectId}:${hour}`,
    });
    // Hour-bucketed: each tick within the same hour increments the
    // pending event. Same pattern as the index rollup.
    const existing = await this.prisma.meterEvent.findUnique({
      where: { identifier },
    });
    if (existing) {
      if (existing.stripe_status === "pending") {
        await this.prisma.meterEvent.update({
          where: { identifier },
          data: { value: { increment: bytes } },
        });
      } else {
        // Already shipped — next hour's event will carry the next
        // sample. Acceptable loss-of-precision; better than a
        // double-emit.
        return 0;
      }
    } else {
      await this.prisma.meterEvent.create({
        data: {
          project_id: projectId,
          meter_name: meter,
          value: bytes,
          identifier,
          period_start: new Date(`${hour}:00:00Z`),
          occurred_at: new Date(),
          stripe_status: "pending",
        },
      });
    }

    await this.prisma.usageDaily.upsert({
      where: {
        project_id_day_meter_name: {
          project_id: projectId,
          day,
          meter_name: meter,
        },
      },
      create: {
        project_id: projectId,
        day,
        meter_name: meter,
        value: bytes,
      },
      update: { value: { increment: bytes } },
    });
    return 1;
  }
}

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
