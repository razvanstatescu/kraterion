/**
 * Sandbox-only Stripe wipe — deletes EVERY test-mode Customer (plus its
 * subscriptions). Use only when about to hard-reset the local DB so
 * orphaned Stripe customers don't pile up across iterations.
 *
 * Refuses to run unless:
 *   - `STRIPE_MODE=test`
 *   - secret key starts with `sk_test_`
 *
 *   pnpm -F @kraterion/control-plane exec tsx \
 *     scripts/probe-stripe-wipe-customers.ts
 */
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
    ".env",
  ),
});

import Stripe from "stripe";
import { STRIPE_API_VERSION } from "../src/billing/catalog.js";

async function main(): Promise<void> {
  const mode = process.env["STRIPE_MODE"] ?? "test";
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (mode !== "test") {
    console.error(`✗ STRIPE_MODE=${mode} — test-mode only.`);
    process.exit(1);
  }
  if (!secretKey || !secretKey.startsWith("sk_test_")) {
    console.error("✗ STRIPE_SECRET_KEY missing or not a test key.");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  let deleted = 0;
  let skipped = 0;

  console.log("▸ listing test-mode customers");
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    // Cancel any non-cancelled subscriptions first (Stripe rejects
    // customer.del while a non-cancelled sub exists).
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    for (const sub of subs.data) {
      if (sub.status === "canceled") continue;
      try {
        await stripe.subscriptions.cancel(sub.id, { prorate: false });
        console.log(`  ✂ sub=${sub.id} cancelled`);
      } catch (err) {
        console.warn(`  ! sub=${sub.id} cancel failed: ${(err as Error).message}`);
      }
    }
    // Void any draft invoices.
    const drafts = await stripe.invoices.list({
      customer: customer.id,
      status: "draft",
      limit: 100,
    });
    for (const inv of drafts.data) {
      if (!inv.id) continue;
      try {
        await stripe.invoices.voidInvoice(inv.id);
        console.log(`  ✂ invoice=${inv.id} voided`);
      } catch {
        /* harmless */
      }
    }
    try {
      await stripe.customers.del(customer.id);
      deleted++;
      console.log(`  ✂ customer=${customer.id} (${customer.email ?? "—"}) deleted`);
    } catch (err) {
      skipped++;
      console.warn(
        `  ! customer=${customer.id} delete failed: ${(err as Error).message}`,
      );
    }
  }

  console.log("");
  console.log(`✓ wipe complete: ${deleted} deleted, ${skipped} skipped`);
}

main().catch((err) => {
  console.error("✗ wipe failed:", err);
  process.exit(1);
});
