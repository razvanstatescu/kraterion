/**
 * Idempotent Stripe catalog seeder. Reads `./catalog.ts`, walks every
 * Meter / Product / Price spec, and upserts each into the Stripe mode
 * indicated by `STRIPE_MODE`. Safe to re-run — on the second pass it
 * finds existing rows by stable identifiers and creates nothing.
 *
 * Run from the repo root:
 *
 *     pnpm stripe:sync
 *
 * Backed by a script alias added to `apps/control-plane/package.json`.
 *
 * Refusal posture: if `STRIPE_MODE=test` but the key is a live key
 * (or vice versa) we abort before any API call. Mixing modes inside
 * one runtime is the most dangerous billing footgun and the cheapest
 * to defend against.
 *
 * Output is intentionally noisy — `created`, `exists`, and `updated`
 * lines for every object so the run log is a self-contained audit
 * trail. Errors include the full Stripe error code.
 */
// The .env lives at the workspace root, but `pnpm --filter ...` runs
// this script with CP as cwd, so `dotenv/config`'s default lookup
// misses it. Resolve the root explicitly.
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../..", // scripts/stripe → control-plane → apps → repo root
    ".env",
  ),
});
import Stripe from "stripe";
import { readStripeMode, type StripeMode } from "@kraterion/shared";
import {
  ACTIVE_PRICE_LOOKUP_KEYS,
  METERS,
  PRICES,
  PRODUCTS,
  STRIPE_API_VERSION,
  metadataForMode,
  type PriceSpec,
} from "../../src/billing/catalog.js";

interface SyncStats {
  meters: { created: number; exists: number };
  products: { created: number; exists: number };
  prices: { created: number; exists: number };
}

async function main(): Promise<void> {
  const mode = readStripeMode(process.env);
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    fail("STRIPE_SECRET_KEY is unset");
  }
  assertKeyMatchesMode(secretKey, mode);

  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    // Keep the SDK's default network behaviour; sandbox is patient
    // and we don't need custom timeouts.
  });

  console.log(`▸ Stripe sync starting (mode=${mode}, api=${STRIPE_API_VERSION})`);
  const stats: SyncStats = {
    meters: { created: 0, exists: 0 },
    products: { created: 0, exists: 0 },
    prices: { created: 0, exists: 0 },
  };

  await syncMeters(stripe, mode, stats);
  await syncProducts(stripe, mode, stats);
  await syncPrices(stripe, mode, stats);

  console.log("");
  console.log("✓ Stripe sync complete");
  console.log(
    `  meters:   ${stats.meters.created} created / ${stats.meters.exists} already present`,
  );
  console.log(
    `  products: ${stats.products.created} created / ${stats.products.exists} already present`,
  );
  console.log(
    `  prices:   ${stats.prices.created} created / ${stats.prices.exists} already present`,
  );
}

// === Meters ================================================================

async function syncMeters(
  stripe: Stripe,
  mode: StripeMode,
  stats: SyncStats,
): Promise<void> {
  console.log("\n▸ meters");
  const existing = await listAllMeters(stripe);
  const byEventName = new Map(existing.map((m) => [m.event_name, m]));

  for (const spec of METERS) {
    const found = byEventName.get(spec.event_name);
    if (found) {
      stats.meters.exists++;
      // `display_name` is the one editable field on a Stripe Meter
      // (everything else is immutable post-create). Push drift so a
      // catalog rename propagates without bumping `_v2`.
      if (found.display_name !== spec.display_name) {
        await stripe.billing.meters.update(found.id, {
          display_name: spec.display_name,
        });
        console.log(
          `  ✎ ${spec.event_name}  updated display_name → "${spec.display_name}"`,
        );
      } else {
        console.log(`  • ${spec.event_name}  exists (id=${found.id})`);
      }
      continue;
    }
    const created = await stripe.billing.meters.create({
      display_name: spec.display_name,
      event_name: spec.event_name,
      default_aggregation: spec.default_aggregation,
      customer_mapping: spec.customer_mapping,
      value_settings: spec.value_settings,
      // Stripe Meters don't accept arbitrary metadata at create time
      // in v1; mode tagging happens at the price/product level.
    });
    stats.meters.created++;
    void mode; // metadata-tagging removed — Meters don't support it
    console.log(`  + ${spec.event_name}  created (id=${created.id})`);
  }
}

async function listAllMeters(stripe: Stripe): Promise<Stripe.Billing.Meter[]> {
  const out: Stripe.Billing.Meter[] = [];
  for await (const m of stripe.billing.meters.list({ limit: 100 })) {
    out.push(m);
  }
  return out;
}

// === Products ==============================================================

async function syncProducts(
  stripe: Stripe,
  mode: StripeMode,
  stats: SyncStats,
): Promise<void> {
  console.log("\n▸ products");
  for (const spec of Object.values(PRODUCTS)) {
    let existing: Stripe.Product | null = null;
    try {
      existing = await stripe.products.retrieve(spec.id);
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
    if (existing) {
      stats.products.exists++;
      // Keep description in sync — Products are mutable so a doc
      // tweak in `catalog.ts` propagates on next sync.
      if (existing.description !== spec.description || existing.name !== spec.name) {
        await stripe.products.update(existing.id, {
          name: spec.name,
          description: spec.description,
          metadata: metadataForMode(mode),
        });
        console.log(`  ✎ ${spec.id}  updated (name/description drift)`);
      } else {
        console.log(`  • ${spec.id}  exists`);
      }
      continue;
    }
    const created = await stripe.products.create({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      metadata: metadataForMode(mode),
    });
    stats.products.created++;
    console.log(`  + ${spec.id}  created (stripe_id=${created.id})`);
  }
}

// === Prices ================================================================

async function syncPrices(
  stripe: Stripe,
  mode: StripeMode,
  stats: SyncStats,
): Promise<void> {
  console.log("\n▸ prices");
  // Resolve meter id by event_name once — Prices need the Stripe
  // meter id, not the event name.
  const meters = await listAllMeters(stripe);
  const meterIdByEventName = new Map(meters.map((m) => [m.event_name, m.id]));

  for (const spec of PRICES) {
    const existing = await findPriceByLookupKey(stripe, spec.lookup_key);
    if (existing) {
      stats.prices.exists++;
      // Prices in Stripe are mostly immutable (amount, tiers, currency
      // all locked) — but `nickname` is mutable. Push catalog drift so
      // a rename propagates without forcing a `_v2` bump.
      if (existing.nickname !== spec.nickname) {
        await stripe.prices.update(existing.id, { nickname: spec.nickname });
        console.log(
          `  ✎ ${spec.lookup_key}  updated nickname → "${spec.nickname}"`,
        );
      } else {
        console.log(`  • ${spec.lookup_key}  exists (id=${existing.id})`);
      }
      continue;
    }
    const created = await createPrice(stripe, mode, spec, meterIdByEventName);
    stats.prices.created++;
    console.log(`  + ${spec.lookup_key}  created (id=${created.id})`);
  }

  // Sanity check: every key in `ACTIVE_PRICE_LOOKUP_KEYS` must now
  // resolve to a price. If anything missed, fail loudly.
  for (const key of Object.values(ACTIVE_PRICE_LOOKUP_KEYS)) {
    const p = await findPriceByLookupKey(stripe, key);
    if (!p) {
      fail(`active price ${key} missing after sync`);
    }
  }
}

async function findPriceByLookupKey(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const list = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
    active: true,
  });
  return list.data[0] ?? null;
}

async function createPrice(
  stripe: Stripe,
  mode: StripeMode,
  spec: PriceSpec,
  meterIdByEventName: Map<string, string>,
): Promise<Stripe.Price> {
  // `recurring.meter` (Stripe field) is the meter ID, not event_name.
  let meterId: string | undefined;
  if (spec.recurring_usage_type === "metered") {
    if (!spec.meter_event_name) {
      throw new Error(
        `price ${spec.lookup_key} declared metered but no meter_event_name set`,
      );
    }
    meterId = meterIdByEventName.get(spec.meter_event_name);
    if (!meterId) {
      throw new Error(
        `price ${spec.lookup_key} references meter ${spec.meter_event_name} which was not created — meter sync must run first`,
      );
    }
  }

  const recurring: Stripe.PriceCreateParams.Recurring = {
    interval: spec.recurring_interval,
    usage_type: spec.recurring_usage_type,
    ...(meterId ? { meter: meterId } : {}),
  };

  return stripe.prices.create({
    currency: "usd",
    product: spec.product_id,
    nickname: spec.nickname,
    lookup_key: spec.lookup_key,
    billing_scheme: spec.billing_scheme,
    tiers_mode: spec.tiers_mode,
    tiers: spec.tiers.map((t) => ({
      up_to: t.up_to === null ? "inf" : t.up_to,
      unit_amount_decimal: t.unit_amount_decimal,
    })),
    recurring,
    metadata: metadataForMode(mode),
  });
}

// === Helpers ===============================================================

function assertKeyMatchesMode(secretKey: string, mode: StripeMode): void {
  const isLiveKey = secretKey.startsWith("sk_live_");
  const isTestKey = secretKey.startsWith("sk_test_");
  if (!isLiveKey && !isTestKey) {
    fail(
      `STRIPE_SECRET_KEY doesn't start with sk_live_ or sk_test_ — refusing to proceed.`,
    );
  }
  if (mode === "live" && !isLiveKey) {
    fail(
      `STRIPE_MODE=live but the secret key looks like a test key. Refusing to proceed.`,
    );
  }
  if (mode === "test" && !isTestKey) {
    fail(
      `STRIPE_MODE=test but the secret key looks like a live key. Refusing to proceed.`,
    );
  }
}

function isMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { statusCode?: number; code?: string; type?: string };
  return e.statusCode === 404 || e.code === "resource_missing";
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("✗ sync failed:", err);
  process.exit(1);
});
