import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST,
  WRITE_PRICE_PER_MIB_FROST,
} from "@kraterion/walrus-client";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Cost-floor snapshot — daily check that our sticker prices stay
 * comfortably above what the underlying providers charge us.
 *
 * Process:
 *
 *   1. Fetch SUI/USD + WAL/USD from CoinGecko (free, no auth). Pyth
 *      Hermes is the upgrade path; see footnote.
 *   2. Read on-chain Walrus pricing constants (currently pinned in
 *      `packages/walrus-client/src/index.ts` — these are governance
 *      params, not RPC-fetched, so the snapshot just records the
 *      value we shipped with).
 *   3. Per metered surface: compute `raw_cost_usd_micros` for one
 *      unit of usage (1 byte-second, 1 op, 1 byte egressed, etc.),
 *      multiply by an FX-buffer multiplier, compute headroom against
 *      the customer-facing price from `/packages/shared/src/billing-
 *      constants.ts`.
 *   4. Write a `CostFloorSnapshot` row. If any meter's headroom drops
 *      below 25%, set `alert_fired = true` and log at WARN. The B6
 *      soft-alert evaluator can route the alert to email/Slack once
 *      a delivery channel exists.
 *
 * Why not Pyth (yet): Pyth's Sui-native price feeds publish through
 * an on-chain oracle account. Reading the price means either (a)
 * a Move call that costs gas every tick, or (b) the off-chain
 * "Hermes" REST endpoint. The REST path needs the feed id for each
 * symbol — for WAL/USD that's an open question on testnet (the
 * token may not yet have a Pyth feed). CoinGecko gives us SUI
 * immediately and we hardcode a WAL/USD fallback (1 WAL ≈ $1) for
 * sandbox-mode; the production swap is documented in the
 * `/docs/runbook.md` follow-up.
 *
 * Sandbox-mode reality: WAL has no public price discovery yet on
 * testnet. The "is our margin compressing" question is meaningful
 * only post-launch with live tokens. We still write daily snapshots
 * so when WAL gets a real price, the time series exists for
 * comparison.
 */
@Injectable()
export class CostFloorProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CostFloorProcessor.name);
  private readonly TICK_MS = 24 * 60 * 60 * 1000; // daily
  private readonly HEADROOM_ALERT_PCT = 25;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // First tick at +2 min so it doesn't pile up with boot work.
    setTimeout(() => void this.tick(), 2 * 60_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `cost-floor armed (tick=${this.TICK_MS}ms, alert_below=${this.HEADROOM_ALERT_PCT}%)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{
    day: string;
    wal_usd: number;
    sui_usd: number;
    alert_fired: boolean;
    perMeter: Array<{ meter: string; headroom_pct: number }>;
  }> {
    const day = todayUtcKey();
    const { walUsd, suiUsd, sources } = await this.fetchOraclePrices();

    // Per-meter cost floors. Today these are coarse — sticker-price
    // headroom is what we're after, not penny-accurate.
    //
    // Storage:   $0.06/GB-mo  vs  Walrus storage at 3000 frost/MiB/epoch.
    // Class A:   $5/M ops     vs  per-PUT SUI gas (rough ~0.001 SUI/PUT).
    // Class B:   $0.40/M ops  vs  ~zero (RPC reads aren't charged).
    // Egress:    $0.01/GB     vs  bandwidth ~= our hosting margin.
    // Knowledge: $0.10/GB-day vs  Postgres + pgvector storage cost.
    // Agent:     $0.01/msg    vs  OpenAI ~$0.005/msg gpt-4o-mini avg.
    //
    // None of these are precise; the snapshot is the audit, not the
    // billing source. We document the assumption in the comment so a
    // future tightening pass knows where to look.

    const perMeterFloor = {
      storage_byte_seconds: this.headroomPct(0.06, walUsd * 0.5),
      gateway_class_a: this.headroomPct(5 / 1_000_000, suiUsd * 0.001),
      gateway_class_b: this.headroomPct(0.4 / 1_000_000, 0),
      gateway_egress_bytes: this.headroomPct(0.01 / 1_073_741_824, 0.005 / 1_073_741_824),
      kb_index_byte_seconds: this.headroomPct(
        0.1 / (1_073_741_824 * 86_400),
        0.01 / (1_073_741_824 * 86_400),
      ),
      agent_messages: this.headroomPct(0.01, 0.005),
    };
    const perMeter = Object.entries(perMeterFloor).map(([meter, headroom]) => ({
      meter,
      headroom_pct: headroom,
    }));
    const alertFired = perMeter.some(
      (m) => m.headroom_pct < this.HEADROOM_ALERT_PCT,
    );

    await this.prisma.costFloorSnapshot.upsert({
      where: { day },
      update: {
        wal_usd_micros: BigInt(Math.round(walUsd * 1_000_000)),
        sui_usd_micros: BigInt(Math.round(suiUsd * 1_000_000)),
        walrus_storage_price_frost: STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST,
        walrus_write_price_frost: WRITE_PRICE_PER_MIB_FROST,
        per_meter_floor_json: perMeterFloor as unknown as Prisma.InputJsonValue,
        oracle_sources: sources as unknown as Prisma.InputJsonValue,
        alert_fired: alertFired,
      },
      create: {
        day,
        wal_usd_micros: BigInt(Math.round(walUsd * 1_000_000)),
        sui_usd_micros: BigInt(Math.round(suiUsd * 1_000_000)),
        walrus_storage_price_frost: STORAGE_PRICE_PER_MIB_PER_EPOCH_FROST,
        walrus_write_price_frost: WRITE_PRICE_PER_MIB_FROST,
        per_meter_floor_json: perMeterFloor as unknown as Prisma.InputJsonValue,
        oracle_sources: sources as unknown as Prisma.InputJsonValue,
        alert_fired: alertFired,
      },
    });

    if (alertFired) {
      const compressed = perMeter
        .filter((m) => m.headroom_pct < this.HEADROOM_ALERT_PCT)
        .map((m) => `${m.meter}=${m.headroom_pct.toFixed(1)}%`)
        .join(", ");
      this.logger.warn(
        `cost-floor alert: headroom below ${this.HEADROOM_ALERT_PCT}% on ${compressed}`,
      );
    } else {
      this.logger.log(
        `cost-floor snapshot ${day} written; WAL=$${walUsd.toFixed(4)} SUI=$${suiUsd.toFixed(4)}; min headroom=${Math.min(...perMeter.map((m) => m.headroom_pct)).toFixed(1)}%`,
      );
    }
    return { day, wal_usd: walUsd, sui_usd: suiUsd, alert_fired: alertFired, perMeter };
  }

  /**
   * Fetch SUI/USD + WAL/USD. CoinGecko Simple Price is free + public;
   * if it times out or returns a missing key we fall back to a hardcoded
   * baseline so the snapshot still writes.
   */
  private async fetchOraclePrices(): Promise<{
    walUsd: number;
    suiUsd: number;
    sources: Record<string, unknown>;
  }> {
    const sources: Record<string, unknown> = { primary: "coingecko" };
    let walUsd = 1.0; // sandbox fallback
    let suiUsd = 2.5; // sandbox fallback
    try {
      const url =
        "https://api.coingecko.com/api/v3/simple/price?ids=sui,walrus-2&vs_currencies=usd";
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        sources["error"] = `coingecko ${res.status}`;
        return { walUsd, suiUsd, sources };
      }
      const body = (await res.json()) as Record<
        string,
        { usd?: number }
      >;
      if (body["sui"]?.usd) suiUsd = body["sui"]!.usd!;
      if (body["walrus-2"]?.usd) walUsd = body["walrus-2"]!.usd!;
      sources["coingecko_response"] = body;
    } catch (err) {
      sources["error"] = (err as Error).message;
      this.logger.warn(
        `cost-floor oracle fetch failed, using fallback (WAL=$${walUsd}, SUI=$${suiUsd}): ${(err as Error).message}`,
      );
    }
    return { walUsd, suiUsd, sources };
  }

  /** Headroom = (price - cost) / price × 100. Used as a percentage. */
  private headroomPct(price: number, cost: number): number {
    if (price <= 0) return 0;
    return ((price - cost) / price) * 100;
  }
}

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
