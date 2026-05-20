import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  FREE_BANDS,
  METER_NAMES,
  STANDARD_PRICE_USD_MICROS,
  STORAGE_DEFAULT_MB,
  type MeterName,
} from "@kraterion/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { StripeService } from "../billing/stripe.service.js";
import { ACTIVE_PRICE_LOOKUP_KEYS } from "../billing/catalog.js";

/**
 * Aggregates usage data for the dashboard `/usage` view.
 *
 * Sources of truth, in priority order:
 *
 *   - `UsageDaily` — durable per-meter daily rollup written by the
 *     rollup processors. Authoritative for any meter we've completed
 *     an hourly rollup for.
 *   - `StoragePool` — point-in-time on-chain capacity for the
 *     storage row (used / reserved, not metered).
 *   - `BYOKDailySpend` — separate display sink for BYOK tokens.
 *
 * Cost imputation: for metered lines we multiply the period total by
 * the catalog rate, subtracting the free band. Storage cost comes
 * from the Stripe subscription quantity × $0.06/GB-mo (the live
 * data, not derived from meters — see `StorageBillingService`).
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly stripe?: StripeService,
  ) {}

  /**
   * Compose the data the storage card + meter table need for the
   * current calendar-month period. Returns dollar projections (in
   * cents) so the dashboard can format without doing pricing math.
   */
  async getCurrentPeriod(projectId: string) {
    const { startUtc, endUtc, daysElapsed, daysInPeriod } = currentPeriodWindow();
    const days = listDayKeys(startUtc, endUtc);

    const rows = await this.prisma.usageDaily.findMany({
      where: {
        project_id: projectId,
        day: { in: days },
      },
    });

    // Sum per meter across the elapsed days.
    const totalsByMeter = new Map<string, bigint>();
    for (const row of rows) {
      const existing = totalsByMeter.get(row.meter_name) ?? 0n;
      totalsByMeter.set(row.meter_name, existing + row.value);
    }

    const meters = this.composeBillableMeters(totalsByMeter, daysElapsed, daysInPeriod);

    // Storage row uses the latest `storage_used_bytes` /
    // `storage_reserved_bytes` samples from UsageDaily (most recent day
    // wins). Fall back to live StoragePool if no rollup samples exist
    // yet (fresh project).
    const storage = await this.composeStorage(projectId, rows);

    // BYOK rollup for the period.
    const byok = await this.composeByokSpend(projectId, days);

    const totalAccrued = meters.reduce(
      (acc, m) => acc + m.billable_cost_usd_cents,
      0,
    );
    const projectedTotal = meters.reduce(
      (acc, m) => acc + m.projected_cost_usd_cents,
      0,
    );

    return {
      period: {
        start: startUtc.toISOString(),
        end: endUtc.toISOString(),
        days_elapsed: daysElapsed,
        days_in_period: daysInPeriod,
      },
      total_accrued_usd_cents: totalAccrued,
      projected_total_usd_cents: projectedTotal,
      storage,
      meters,
      byok,
    };
  }

  /** Per-day breakdown for the chart (storage + 5 meters). Returns
   *  one entry per UTC day in the requested window. */
  async getByDay(args: {
    projectId: string;
    fromIso: string;
    toIso: string;
  }) {
    const days = listDayKeys(new Date(args.fromIso), new Date(args.toIso));
    if (days.length === 0) return { days: [] };
    const rows = await this.prisma.usageDaily.findMany({
      where: {
        project_id: args.projectId,
        day: { in: days },
      },
    });
    const byDay = new Map<
      string,
      Record<string, { value: string; cost_usd_cents: number }>
    >();
    for (const day of days) byDay.set(day, {});
    const specsByMeter = priceSpecsByMeter();
    for (const row of rows) {
      const slot = byDay.get(row.day);
      if (!slot) continue;
      const spec = specsByMeter.get(row.meter_name);
      // Per-day cost has NO free-band subtraction — the chart's job
      // is to show where the bill is coming from, not "what fell
      // above the band on a per-day basis" (which the meter table
      // already covers period-wide). A user crossing the band at
      // mid-month sees the days before AND after as billable in the
      // chart, which is what they want for diagnostics.
      const cents = spec ? costInCents(spec, row.value) : 0;
      slot[row.meter_name] = {
        value: row.value.toString(),
        cost_usd_cents: cents,
      };
    }
    return {
      days: days.map((day) => ({ day, meters: byDay.get(day) ?? {} })),
    };
  }

  // === Internals ===========================================================

  private composeBillableMeters(
    totalsByMeter: Map<string, bigint>,
    daysElapsed: number,
    daysInPeriod: number,
  ) {
    const billable: MeterDescriptor[] = [
      {
        meter: METER_NAMES.gateway_class_a,
        label: "Storage writes",
        unit: "ops",
        free_band: FREE_BANDS["gateway_class_a"]!.quantity,
        price_per_unit_usd_micros: STANDARD_PRICE_USD_MICROS["gateway_class_a_per_op"]!,
      },
      {
        meter: METER_NAMES.gateway_class_b,
        label: "Storage reads",
        unit: "ops",
        free_band: FREE_BANDS["gateway_class_b"]!.quantity,
        // Storage reads are so small per-op that the catalog stores
        // 1 micro; for projection we use the GB-style aggregate rate:
        // $0.40/M.
        price_per_unit_usd_micros: 400n, // 0.4 µ-USD per op
      },
      {
        meter: METER_NAMES.gateway_egress_bytes,
        label: "Download bandwidth",
        unit: "bytes",
        free_band: FREE_BANDS["gateway_egress_bytes"]!.quantity,
        // $0.01/GB → 0.01 / 1073741824 USD/byte = 9.31e-12 USD/byte
        //                                       = 9.31e-6 µ-USD/byte
        price_per_unit_usd_micros_per_billion: 9310n, // µ-USD per GiB → scaled below
      },
      {
        meter: METER_NAMES.kb_index_byte_seconds,
        label: "Knowledge storage",
        unit: "byte·s",
        free_band: FREE_BANDS["kb_index_byte_seconds"]!.quantity,
        // $0.10/GB-day = 0.10 / (1073741824 × 86400) USD/byte·s
        //              = ~1.08e-12 USD/byte·s = 1.08e-6 µ-USD/byte·s
        price_per_unit_usd_micros_per_billion: 1080n,
      },
      {
        meter: METER_NAMES.agent_messages,
        label: "Agent chat messages",
        unit: "messages",
        free_band: FREE_BANDS["agent_messages"]!.quantity,
        price_per_unit_usd_micros: 10_000n, // $0.01/msg
      },
    ];

    return billable.map((spec) => {
      const total = totalsByMeter.get(spec.meter) ?? 0n;
      const free = BigInt(spec.free_band);
      const billable = total > free ? total - free : 0n;
      const costCents = costInCents(spec, billable);
      const dailyAvg = daysElapsed > 0 ? Number(billable) / daysElapsed : 0;
      const projectedCents = Math.round(costCents * (daysInPeriod / Math.max(1, daysElapsed)));
      return {
        meter_name: spec.meter,
        label: spec.label,
        unit: spec.unit,
        used: total.toString(),
        free_band: spec.free_band.toString(),
        billable: billable.toString(),
        billable_cost_usd_cents: costCents,
        projected_cost_usd_cents: projectedCents,
        daily_average: dailyAvg,
      };
    });
  }

  private async composeStorage(
    projectId: string,
    rows: Array<{ meter_name: string; value: bigint; day: string }>,
  ) {
    // `used_mb` is real — comes from the on-chain pool (via the
    // hourly storage-usage snapshot, or live as a fallback). Reflects
    // bytes actually held, regardless of billing.
    let latestDay = "";
    let usedBytes = 0n;
    for (const row of rows) {
      if (row.meter_name !== "storage_used_bytes") continue;
      if (row.day > latestDay) {
        latestDay = row.day;
        usedBytes = row.value;
      } else if (row.day === latestDay) {
        usedBytes = row.value;
      }
    }
    if (!latestDay) {
      const pool = await this.prisma.storagePool.findUnique({
        where: { project_id: projectId },
        select: { used_encoded_bytes: true },
      });
      usedBytes = pool?.used_encoded_bytes ?? 0n;
    }

    // `reserved_mb` is the BILLING figure: it's what the customer is
    // paying for (Stripe subscription line `quantity`), NOT the on-chain
    // pool reservation. The gateway over-provisions the pool to a
    // 500 MiB minimum on first PUT — that's an infrastructure detail,
    // not the billing intent.
    //
    // Resolve in priority order:
    //   1. Live Stripe quantity, if a subscription with the storage
    //      line is active.
    //   2. STORAGE_DEFAULT_MB free-tier fallback (no card / no sub).
    const reservedMb = await this.resolveBilledReservationMb(projectId);
    const usedMb = Number(usedBytes / (1024n * 1024n));

    return {
      used_mb: usedMb,
      reserved_mb: reservedMb,
      monthly_cost_usd_cents: Math.round(
        Math.max(0, (reservedMb - 500) * 6) / 1024,
      ),
    };
  }

  /** Read the customer's active Stripe storage-line quantity. Falls
   *  back to the free-tier default if there's no BillingAccount, no
   *  Stripe customer, no active subscription, or no storage line on
   *  the subscription (any one of those means the customer isn't
   *  being billed for storage right now). */
  private async resolveBilledReservationMb(projectId: string): Promise<number> {
    if (!this.stripe) return STORAGE_DEFAULT_MB;
    try {
      const account = await this.prisma.billingAccount.findUnique({
        where: { project_id: projectId },
      });
      if (!account) return STORAGE_DEFAULT_MB;
      const customerId = this.stripe.getStripeCustomerId(account);
      if (!customerId) return STORAGE_DEFAULT_MB;
      const subs = await this.stripe.client.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      const live = subs.data.find(
        (s) => s.status === "active" || s.status === "trialing",
      );
      if (!live) return STORAGE_DEFAULT_MB;
      const storageItem = live.items.data.find(
        (it) => it.price.lookup_key === ACTIVE_PRICE_LOOKUP_KEYS.storage,
      );
      if (!storageItem?.quantity) return STORAGE_DEFAULT_MB;
      return storageItem.quantity;
    } catch (err) {
      this.logger.warn(
        `resolveBilledReservationMb fell back to free tier (project=${projectId}): ${(err as Error).message}`,
      );
      return STORAGE_DEFAULT_MB;
    }
  }

  private async composeByokSpend(projectId: string, days: string[]) {
    const rows = await this.prisma.bYOKDailySpend.findMany({
      where: {
        project_id: projectId,
        day: { in: days },
      },
    });
    let totalCents = 0n;
    let inputTokens = 0n;
    let outputTokens = 0n;
    const byModel = new Map<string, { input: bigint; output: bigint; cents: bigint }>();
    for (const row of rows) {
      totalCents += row.cost_usd_micros;
      inputTokens += row.input_tokens;
      outputTokens += row.output_tokens;
      const existing = byModel.get(row.model) ?? { input: 0n, output: 0n, cents: 0n };
      existing.input += row.input_tokens;
      existing.output += row.output_tokens;
      existing.cents += row.cost_usd_micros;
      byModel.set(row.model, existing);
    }
    // BYOKDailySpend.cost_usd_micros is in micros (1e-6 USD); divide
    // for cents.
    return {
      total_cost_usd_cents: Number(totalCents / 10_000n),
      total_input_tokens: inputTokens.toString(),
      total_output_tokens: outputTokens.toString(),
      by_model: Array.from(byModel, ([model, m]) => ({
        model,
        input_tokens: m.input.toString(),
        output_tokens: m.output.toString(),
        cost_usd_cents: Number(m.cents / 10_000n),
      })),
    };
  }
}

interface MeterDescriptor {
  meter: MeterName;
  label: string;
  unit: string;
  free_band: number;
  /** µ-USD per single unit (op, message). Set this OR the per-billion
   *  variant — exactly one, depending on the meter's natural scale. */
  price_per_unit_usd_micros?: bigint;
  /** µ-USD per 10⁹ units. Used for byte / byte·second meters whose
   *  per-unit price would be sub-micro. */
  price_per_unit_usd_micros_per_billion?: bigint;
}

/** Static price-spec map keyed by meter name. Same shape the meter
 *  table uses; pulled out so `getByDay` can attach per-day cost
 *  without duplicating the spec inline. */
function priceSpecsByMeter(): Map<string, MeterDescriptor> {
  const list: MeterDescriptor[] = [
    {
      meter: METER_NAMES.gateway_class_a,
      label: "",
      unit: "ops",
      free_band: FREE_BANDS["gateway_class_a"]!.quantity,
      price_per_unit_usd_micros:
        STANDARD_PRICE_USD_MICROS["gateway_class_a_per_op"]!,
    },
    {
      meter: METER_NAMES.gateway_class_b,
      label: "",
      unit: "ops",
      free_band: FREE_BANDS["gateway_class_b"]!.quantity,
      price_per_unit_usd_micros: 400n,
    },
    {
      meter: METER_NAMES.gateway_egress_bytes,
      label: "",
      unit: "bytes",
      free_band: FREE_BANDS["gateway_egress_bytes"]!.quantity,
      price_per_unit_usd_micros_per_billion: 9310n,
    },
    {
      meter: METER_NAMES.share_token_egress_bytes,
      label: "",
      unit: "bytes",
      free_band: 0,
      price_per_unit_usd_micros_per_billion: 9310n,
    },
    {
      meter: METER_NAMES.kb_index_byte_seconds,
      label: "",
      unit: "byte·s",
      free_band: FREE_BANDS["kb_index_byte_seconds"]!.quantity,
      price_per_unit_usd_micros_per_billion: 1080n,
    },
    {
      meter: METER_NAMES.agent_messages,
      label: "",
      unit: "messages",
      free_band: FREE_BANDS["agent_messages"]!.quantity,
      price_per_unit_usd_micros: 10_000n,
    },
  ];
  return new Map(list.map((s) => [s.meter as string, s]));
}

/** Convert a billable count + pricing spec to USD cents. Uses
 *  BigInt math throughout to dodge float drift on huge byte counts. */
function costInCents(spec: MeterDescriptor, billable: bigint): number {
  if (spec.price_per_unit_usd_micros !== undefined) {
    const micros = billable * spec.price_per_unit_usd_micros;
    return Number(micros / 10_000n);
  }
  if (spec.price_per_unit_usd_micros_per_billion !== undefined) {
    const micros = (billable * spec.price_per_unit_usd_micros_per_billion) / 1_000_000_000n;
    return Number(micros / 10_000n);
  }
  return 0;
}

/** UTC calendar-month window. Stripe billing cycles to the day, but
 *  for dashboard purposes a calendar month is a close-enough
 *  approximation (we drift up to ~1 day off the actual sub anchor;
 *  refine when we surface real cycle dates in B5). */
function currentPeriodWindow(): {
  startUtc: Date;
  endUtc: Date;
  daysElapsed: number;
  daysInPeriod: number;
} {
  const now = new Date();
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInPeriod = Math.round((endUtc.getTime() - startUtc.getTime()) / 86400000);
  const daysElapsed = Math.max(
    1,
    Math.ceil((now.getTime() - startUtc.getTime()) / 86400000),
  );
  return { startUtc, endUtc, daysElapsed, daysInPeriod };
}

function listDayKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur < last) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
