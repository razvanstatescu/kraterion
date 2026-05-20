/**
 * Centralised billing knobs — free-band sizes, price quantities, storage
 * tier presets, hard-cap defaults, alert thresholds, Stripe-mode
 * identifier prefixing. Imported by control-plane, gateway, worker,
 * dashboard, and the Stripe catalog seed script so every surface bills
 * against the same numbers.
 *
 * Pricing rationale lives in /docs/monetization-and-billing.md. Numbers
 * here are the runtime contract; that doc is the why.
 *
 * Everything is plain TypeScript so the dashboard can import it
 * directly — no Prisma / Node-only deps.
 */

// === Stripe mode ===========================================================

/** `STRIPE_MODE` env value. The whole runtime reads from this; the
 *  Stripe SDK key is wired in CP and never inspected anywhere else. */
export type StripeMode = "test" | "live";

/** Reads `process.env.STRIPE_MODE`, defaults to `"test"` for safety.
 *  Throws on unknown values so a typo can't silently land in prod. */
export function readStripeMode(env: Record<string, string | undefined>): StripeMode {
  const raw = env["STRIPE_MODE"] ?? "test";
  if (raw !== "test" && raw !== "live") {
    throw new Error(
      `Invalid STRIPE_MODE=${raw}; must be 'test' or 'live'.`,
    );
  }
  return raw;
}

/** Prefix used for MeterEvent + idempotency identifiers so test and
 *  live emits can never collide inside Stripe's 24h dedupe window. */
export function meterIdentifierPrefix(mode: StripeMode): string {
  return `${mode}:`;
}

// === Meter names ===========================================================
//
// Every meter event uses one of these strings as its `event_name` when
// hitting `/v1/billing/meter_events`. The Stripe catalog seed creates a
// Meter resource per name. Keep alphabetised so reconciliation queries
// stay readable.

export const METER_NAMES = {
  agent_messages: "agent_messages",
  gateway_class_a: "gateway_class_a",
  gateway_class_b: "gateway_class_b",
  gateway_egress_bytes: "gateway_egress_bytes",
  kb_index_byte_seconds: "kb_index_byte_seconds",
  share_token_egress_bytes: "share_token_egress_bytes",
} as const;

export type MeterName = (typeof METER_NAMES)[keyof typeof METER_NAMES];

/** Meters that emit ONCE per row (agent_messages) — written inline at
 *  the call site, then drained. The rest are hourly rollups. */
export const PER_EVENT_METERS: ReadonlyArray<MeterName> = [
  METER_NAMES.agent_messages,
];

// === Free bands ============================================================
//
// Every metered Price ships as a 2-tier graduated price with tier 1 at
// $0 up to the free-band quantity below. New signups consume the free
// band before any card is on file.

export interface FreeBand {
  /** Quantity included at $0/month before the standard price kicks in. */
  quantity: number;
  /** Unit string for dashboard copy ("ops", "GB", "GB-day", "msg"). */
  unit: string;
  /** Stripe meter event_name this band corresponds to (storage uses
   *  the licensed item's own tier-1, see STORAGE_FREE_GB). */
  meter: MeterName | "storage_gb";
}

export const FREE_BANDS: Record<string, FreeBand> = {
  storage: { quantity: 500, unit: "MB", meter: "storage_gb" },
  gateway_class_a: { quantity: 1_000, unit: "ops", meter: METER_NAMES.gateway_class_a },
  gateway_class_b: { quantity: 1_000_000, unit: "ops", meter: METER_NAMES.gateway_class_b },
  gateway_egress_bytes: {
    quantity: 50 * 1024 * 1024 * 1024,
    unit: "bytes",
    meter: METER_NAMES.gateway_egress_bytes,
  },
  kb_index_byte_seconds: {
    quantity: 1 * 1024 * 1024 * 1024 * 86_400, // 1 GB-day in byte-seconds
    unit: "byte·s",
    meter: METER_NAMES.kb_index_byte_seconds,
  },
  agent_messages: { quantity: 100, unit: "messages", meter: METER_NAMES.agent_messages },
};

// === Standard prices (USD micros) ==========================================
//
// Stored as USD micros (1e-6 USD) so they multiply cleanly with BigInt
// meter values. Stripe Prices created from the catalog read these
// numbers via `infra/stripe/catalog.ts`.

export const STANDARD_PRICE_USD_MICROS: Record<string, bigint> = {
  /** $0.06 per GB-month — applied to the licensed Storage item's
   *  `quantity = reserved_gb`. */
  storage_per_gb_month: 60_000n,
  /** $5.00 per 1M operations. */
  gateway_class_a_per_op: 5n, // = $0.000005 → 5 µ-USD
  /** $0.40 per 1M operations. */
  gateway_class_b_per_op: 1n, // rounded; actual is 0.40 µ-USD which is sub-micro
  /** $0.01 per GB ≈ 0.0000093 µ-USD per byte; we bill at GB
   *  granularity in the rollup so this column is unused — Stripe
   *  graduated tiers do the math. */
  gateway_egress_per_gb: 10_000n,
  /** $0.10 per GB-day. */
  kb_index_per_gb_day: 100_000n,
  /** $0.01 per chat message. */
  agent_message_each: 10_000n,
};

// === Storage tier presets ==================================================
//
// Customer-visible storage size options on the resize modal, in **MB**
// (Stripe subscription-item `quantity` is integer MB so the smallest
// billable step is 1 MB). Anything outside this list still works via
// the custom-input path; these are the chips on the modal. The
// dashboard pretty-prints values ≥ 1024 MB as GB.

export const STORAGE_TIER_PRESETS_MB: ReadonlyArray<number> = [
  500,    // 500 MB — exactly the free band
  1_024,  // 1 GB
  5_120,  // 5 GB
  10_240, // 10 GB
  51_200, // 50 GB
  102_400, // 100 GB
  256_000, // 250 GB
  512_000, // 500 GB
  1_048_576, // 1 TB
];

/** Default `quantity` Stripe Subscription Item gets at first checkout.
 *  500 MB = exactly the free tier-1 of the storage Price, so a project
 *  with no extra ask is on a $0/month subscription. */
export const STORAGE_DEFAULT_MB = 500;

/** Smallest reservation a customer can ever drop below. Anchored at
 *  the free tier so canceling-by-shrinking is impossible — to leave
 *  Kraterion the customer cancels the subscription. */
export const STORAGE_MIN_MB = 500;

/** Per-write buffer the resize-validation UI keeps above current usage
 *  so indexer lag can't accidentally orphan a blob mid-shrink. */
export const STORAGE_SHRINK_HEADROOM = 1.1;

/** Throttle on resize ops — prevents Stripe quantity-thrash and the
 *  PTB bursts that go with it. */
export const STORAGE_RESIZE_COOLDOWN_SECONDS = 3600;

// === Pool lifetime + renewal ==============================================
//
// Walrus storage pools have an `end_epoch` set on creation and bumped via
// `extend_storage_pool`. The old model picked a 2-year horizon up-front
// to avoid renewal logistics; that meant downsizes left WAL pre-paid for
// up to ~2 years of unused capacity (Walrus's `decrease_…_unused_capacity`
// returns a `Storage` reservation receipt, not WAL).
//
// New model: keep the pool's reservation aligned with the billing cycle.
//
//   1. Initial pool lifetime ≈ 1 cycle + buffer (so a fresh signup has
//      headroom and the very first renewal isn't critical-path).
//   2. A daily renewal worker extends every active pool ~10 days before
//      its `end_epoch` by exactly one more cycle.
//   3. A scheduled downgrade is honored at the renewal that follows the
//      downgrade's effective_at: the worker shrinks the pool first
//      (`pool_vault::shrink_pool`, Stage 2 — pending Move redeploy), then
//      extends at the new smaller size.
//   4. If the subscription is cancelled (no auto-renew), the renewal
//      worker skips it; the pool naturally decays at end_epoch.
//
// Outcome: WAL over-payment on a downsize is bounded by ~1 cycle, not
// the full ~2-year horizon. Worst-case data loss requires the renewal
// worker to be down for the full renewal-buffer window — alertable.

/** Billing cycle granularity. Calendar month is what Stripe + the
 *  `/usage` page already use; everything aligns. */
export const BILLING_CYCLE_DAYS = 30;

/** Number of days BEFORE the pool's end_epoch that the renewal worker
 *  starts attempting to renew. Picks up worker downtime, transient
 *  Sui RPC failures, etc. */
export const POOL_RENEWAL_BUFFER_DAYS = 5;

/** Per-network Walrus epoch length in days. Mainnet runs 14d epochs;
 *  testnet is 1d. Picked from public Walrus docs. If a future devnet or
 *  custom network surfaces, extend this map — anything not in here
 *  defaults to the mainnet length so a typo can't accidentally bill
 *  faster than the chain settles. */
export const WALRUS_EPOCH_DAYS: Record<string, number> = {
  testnet: 1,
  mainnet: 14,
};

/** Resolve the active epoch length. Reads `process.env.SUI_NETWORK`
 *  (the same key the gateway + control-plane use for network selection)
 *  and falls back to mainnet (the conservative direction — longer
 *  epochs mean we lean toward fewer renewals if mis-configured). */
export function epochDaysForCurrentNetwork(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): number {
  const network = (env["SUI_NETWORK"] ?? "testnet").toLowerCase();
  return WALRUS_EPOCH_DAYS[network] ?? WALRUS_EPOCH_DAYS["mainnet"] ?? 14;
}

/** How many epochs to ask Walrus for at pool creation. Includes one
 *  cycle's worth + the renewal buffer so the first renewal isn't on
 *  hot path. */
export function initialPoolEpochsAhead(
  env?: Record<string, string | undefined>,
): number {
  const epochDays = epochDaysForCurrentNetwork(env);
  return Math.max(
    2,
    Math.ceil((BILLING_CYCLE_DAYS + POOL_RENEWAL_BUFFER_DAYS) / epochDays),
  );
}

/** How many epochs to extend by on each renewal. One billing cycle. */
export function renewalEpochsPerCycle(
  env?: Record<string, string | undefined>,
): number {
  const epochDays = epochDaysForCurrentNetwork(env);
  return Math.max(1, Math.ceil(BILLING_CYCLE_DAYS / epochDays));
}

// === Hard cap defaults =====================================================

/** Default `BillingAccount.hard_spend_cap_usd_cents` for new accounts.
 *  Null = no cap. We pick $25 as a friendly starter that catches
 *  runaway BYOK or class_a usage without surprising legitimate users
 *  on day one. */
export const DEFAULT_HARD_CAP_USD_CENTS: number | null = 2_500;

/** Soft-alert thresholds (percent of hard cap). UI lets the user
 *  add / remove these. */
export const DEFAULT_SOFT_ALERT_THRESHOLDS: ReadonlyArray<number> = [50, 80, 100];

// === Helpers ===============================================================

/** Build the dedupe identifier for a Stripe meter event. Pattern:
 *
 *     {mode}:{meter}:{key}
 *
 * Where `key` is `{project_id}:{hour_iso}` for hourly rollup meters and
 * the row id for per-event meters. The 24h Stripe dedupe window plus
 * UNIQUE in `MeterEvent.identifier` means retries are safe. */
export function meterEventIdentifier(args: {
  mode: StripeMode;
  meter: MeterName;
  key: string;
}): string {
  return `${args.mode}:${args.meter}:${args.key}`;
}

/** Hour-rounded ISO key used in meter identifiers. UTC so DST doesn't
 *  produce duplicate buckets twice a year. */
export function hourIsoKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}`;
}
