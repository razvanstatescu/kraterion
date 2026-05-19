/**
 * Declarative spec for the Kraterion Stripe product / price / meter
 * catalog. The sync script (`./sync.ts`, run via `pnpm stripe:sync`)
 * reads this file and idempotently `upserts` everything into the mode
 * indicated by `STRIPE_MODE`.
 *
 * Two rules:
 *
 *   1. **Prices and Meters are immutable in Stripe.** To change a rate,
 *      bump its `_v1` suffix to `_v2` and let the sync script create a
 *      new Price alongside the old one. New subscriptions use v2;
 *      existing ones stay on v1 until a deliberate migration.
 *
 *   2. **lookup_key is the join.** The sync script searches by
 *      `lookup_key` and creates only if missing. Never edit a
 *      lookup_key once it's been published — re-version instead.
 *
 * The Storage line is a **licensed** subscription item — flat
 * per-unit price, `quantity = reserved_gb`, charged monthly. Every
 * other line is **metered** with a graduated price (tier-1 zero = free
 * band, tier-2 standard rate).
 *
 * The Storage price is graduated too so the free 10 GB tier comes for
 * free without us doing anything special at signup time.
 */

import {
  METER_NAMES,
  type MeterName,
  type StripeMode,
} from "@kraterion/shared";

/** Pin a single Stripe API version across every SDK call site. Avoids
 *  silent contract drift from auto-upgrades. Must match the constant
 *  in `apps/control-plane/src/billing/stripe.service.ts`. */
export const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

/** Tag every object created by the sync script with these so we can
 *  identify what we own vs anything created manually in the dashboard. */
export const KRATERION_OWNED_METADATA = {
  owner: "kraterion",
  catalog_version: "v1",
} as const;

// === Meters ================================================================
//
// One Meter per Stripe metered price. Meters are immutable after
// creation — only `display_name` is editable. Pick the aggregation
// once and never look back.

export interface MeterSpec {
  /** Internal name; matches `MeterEvent.event_name` and the keys the
   *  emit-worker uses when POSTing. */
  event_name: MeterName;
  /** Human-readable label in the Stripe dashboard. */
  display_name: string;
  /** Stripe-supported aggregations are `sum`, `count`, `last`. We use
   *  `sum` everywhere — every meter is additive over the period. */
  default_aggregation: { formula: "sum" };
  /** Which key in the event payload Stripe should sum. We always send
   *  `value` in the payload. */
  value_settings: { event_payload_key: "value" };
  /** Map events to customers by the `stripe_customer_id` key. */
  customer_mapping: { type: "by_id"; event_payload_key: "stripe_customer_id" };
}

export const METERS: MeterSpec[] = [
  {
    event_name: METER_NAMES.gateway_class_a,
    display_name: "Storage writes",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
  {
    event_name: METER_NAMES.gateway_class_b,
    display_name: "Storage reads",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
  {
    event_name: METER_NAMES.gateway_egress_bytes,
    display_name: "Download bandwidth",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
  {
    event_name: METER_NAMES.share_token_egress_bytes,
    display_name: "Public link bandwidth",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
  {
    event_name: METER_NAMES.kb_index_byte_seconds,
    display_name: "Knowledge storage",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
  {
    event_name: METER_NAMES.agent_messages,
    display_name: "Agent chat messages",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
  },
];

// === Products ==============================================================

export interface ProductSpec {
  /** Stable across versions. We never rename. */
  id: string;
  name: string;
  description: string;
}

export const PRODUCTS = {
  storage: {
    id: "kraterion_storage",
    name: "Storage reservation",
    description:
      "Monthly reservation of Walrus storage (GB). Capacity is yours " +
      "whether you fill it or not. Upgrade takes effect immediately; " +
      "downsize applies at the next billing cycle.",
  },
  class_a: {
    id: "kraterion_gateway_class_a",
    name: "Storage writes",
    description:
      "Object write operations against the storage API — uploads, deletes, " +
      "and lists.",
  },
  class_b: {
    id: "kraterion_gateway_class_b",
    name: "Storage reads",
    description:
      "Object read operations against the storage API — downloads and " +
      "metadata fetches.",
  },
  egress: {
    id: "kraterion_gateway_egress",
    name: "Download bandwidth",
    description:
      "Data downloaded from your buckets through the storage API.",
  },
  share_token_egress: {
    id: "kraterion_share_token_egress",
    name: "Public link bandwidth",
    description:
      "Data served through agent share links embedded in third-party " +
      "sites. Tracked separately for abuse detection.",
  },
  kb_index: {
    id: "kraterion_knowledge_index",
    name: "Knowledge storage",
    description:
      "Indexed search storage for agent knowledge — chunked content " +
      "plus its vector embeddings.",
  },
  agent_messages: {
    id: "kraterion_agent_messages",
    name: "Agent chat messages",
    description:
      "Chat completions through agents using Kraterion's hosted model " +
      "key. Messages on your own OpenAI key are tracked but not billed.",
  },
} satisfies Record<string, ProductSpec>;

// === Prices ================================================================

/** Tier row in a graduated price. `up_to: null` means "infinity". */
export interface PriceTier {
  up_to: number | null;
  /** Per-unit price in USD cents. `0` = free band. */
  unit_amount_decimal: string;
}

export interface PriceSpec {
  /** Stable identifier we use to find this price. Bumping the suffix
   *  (e.g. `storage_v1` → `storage_v2`) creates a new Price; old subs
   *  stay on the old version. */
  lookup_key: string;
  nickname: string;
  product_id: string;
  /** "month" — we never bill on any other cadence. */
  recurring_interval: "month";
  /** "metered" or "licensed". Storage is licensed; everything else
   *  metered. */
  recurring_usage_type: "metered" | "licensed";
  /** Set on metered prices. Must match a Meter's `event_name`. */
  meter_event_name?: MeterName;
  billing_scheme: "tiered";
  tiers_mode: "graduated";
  tiers: PriceTier[];
}

/**
 * Six prices. All graduated, all monthly. Free bands are encoded as a
 * tier-1 zero-amount row up to the free quantity, then a tier-2 with
 * the standard rate up to infinity.
 *
 * Storage's `quantity` lives on the subscription item — we patch it
 * when the customer resizes the pool. The graduated tier-1 makes the
 * first 10 GB free even before they add a card.
 *
 * Class A free band is the tightest (1k/mo) because each PUT we serve
 * costs ~$0.04 in SUI gas. Bigger free bands let test users rack up
 * real platform-side cost; 1k/mo caps that exposure.
 */
export const PRICES: PriceSpec[] = [
  {
    lookup_key: "storage_v1",
    nickname: "Storage reservation $0.06/GB-mo",
    product_id: PRODUCTS.storage.id,
    recurring_interval: "month",
    recurring_usage_type: "licensed",
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: [
      { up_to: 10, unit_amount_decimal: "0" }, // 10 GB free
      { up_to: null, unit_amount_decimal: "6" }, // $0.06 = 6 cents
    ],
  },
  {
    lookup_key: "gateway_class_a_v1",
    nickname: "Storage writes $5/M ops",
    product_id: PRODUCTS.class_a.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.gateway_class_a,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // Stripe's unit_amount_decimal is per single op; 1M ops at $5 = $5/$1M
    // = 0.0005 cents/op = 0.000005 dollars/op. unit_amount_decimal is
    // expressed in the smallest currency unit (cents) with sub-cent
    // decimals allowed. $5/M = 0.0005 cents/op.
    tiers: [
      { up_to: 1_000, unit_amount_decimal: "0" }, // 1k ops free
      { up_to: null, unit_amount_decimal: "0.0005" },
    ],
  },
  {
    lookup_key: "gateway_class_b_v1",
    nickname: "Storage reads $0.40/M ops",
    product_id: PRODUCTS.class_b.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.gateway_class_b,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // $0.40/M = 0.00004 cents/op.
    tiers: [
      { up_to: 1_000_000, unit_amount_decimal: "0" },
      { up_to: null, unit_amount_decimal: "0.00004" },
    ],
  },
  {
    lookup_key: "gateway_egress_v1",
    nickname: "Download bandwidth $0.01/GB",
    product_id: PRODUCTS.egress.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.gateway_egress_bytes,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // $0.01/GB = $0.01 per 1,073,741,824 bytes
    // ≈ 0.0000000009 cents/byte. We bill in bytes, so the per-byte
    // unit_amount_decimal is tiny.
    tiers: [
      { up_to: 53_687_091_200, unit_amount_decimal: "0" }, // 50 GB free
      { up_to: null, unit_amount_decimal: "0.00000000093" },
    ],
  },
  {
    lookup_key: "share_token_egress_v1",
    nickname: "Public link bandwidth $0.01/GB",
    product_id: PRODUCTS.share_token_egress.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.share_token_egress_bytes,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // No separate free band for share-token egress — it's part of the
    // same product surface but tracked separately for abuse.
    tiers: [{ up_to: null, unit_amount_decimal: "0.00000000093" }],
  },
  {
    lookup_key: "kb_index_v1",
    nickname: "Knowledge storage $0.10/GB-day",
    product_id: PRODUCTS.kb_index.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.kb_index_byte_seconds,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // $0.10 per GB-day = $0.10 / (1_073_741_824 bytes × 86_400 s)
    // = 1.0775e-12 USD/byte·s = 1.0775e-10 cents/byte·s.
    // Stripe caps `unit_amount_decimal` at 12 places after the
    // point — we round up slightly (~0.2% margin in our favour).
    tiers: [
      { up_to: 92_805_734_400, unit_amount_decimal: "0" }, // 1 GB-day = 1024**3 * 86400 byte·s
      { up_to: null, unit_amount_decimal: "0.000000000108" },
    ],
  },
  {
    lookup_key: "agent_messages_v1",
    nickname: "Agent chat messages $0.01/msg",
    product_id: PRODUCTS.agent_messages.id,
    recurring_interval: "month",
    recurring_usage_type: "metered",
    meter_event_name: METER_NAMES.agent_messages,
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    // $0.01/msg = 1 cent/msg.
    tiers: [
      { up_to: 100, unit_amount_decimal: "0" },
      { up_to: null, unit_amount_decimal: "1" },
    ],
  },
];

/** Convenience accessor — used by the subscription bootstrap to look up
 *  the active price for each line. Keep in sync with `PRICES`. */
export const ACTIVE_PRICE_LOOKUP_KEYS = {
  storage: "storage_v1",
  gateway_class_a: "gateway_class_a_v1",
  gateway_class_b: "gateway_class_b_v1",
  gateway_egress: "gateway_egress_v1",
  share_token_egress: "share_token_egress_v1",
  kb_index: "kb_index_v1",
  agent_messages: "agent_messages_v1",
} as const;

/** Mode-aware tag added to every Stripe object's metadata so we can
 *  spot test-mode leftovers from a live-mode sync (shouldn't happen,
 *  but cheap to be defensive). */
export function metadataForMode(mode: StripeMode): Record<string, string> {
  return {
    ...KRATERION_OWNED_METADATA,
    stripe_mode: mode,
  };
}
