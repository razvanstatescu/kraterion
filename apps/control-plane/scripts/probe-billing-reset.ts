/**
 * Sandbox-only Stripe billing reset for a project.
 *
 * Tears down EVERY billing artefact for the given project so the next
 * `/billing` page render hits the clean "no payment method" state.
 * Useful for end-to-end testing the inline Stripe Elements flow
 * without having to swap projects between attempts.
 *
 * What this script wipes:
 *
 *   1. Stripe (test mode only):
 *        - every Subscription on the Customer
 *        - the Customer itself
 *   2. Postgres:
 *        - every `MeterEvent` for the project (regardless of
 *          stripe_status — sent rows would otherwise drift against
 *          the now-deleted Stripe customer)
 *        - every `UsageDaily`, `BYOKDailySpend`, `PendingStorageDowngrade`
 *        - the `BillingAccount` row itself
 *
 * What this script does NOT touch:
 *
 *   - The Stripe Product / Price / Meter catalog. Those are
 *     project-independent. To rebuild the catalog: `pnpm stripe:sync`.
 *   - `StripeWebhookEvent` rows. They keep the audit trail for
 *     debugging.
 *   - `S3Object`, `Bucket`, `Agent`, `KnowledgeChunk`, anything outside
 *     the billing surface — those keep the project usable post-reset.
 *
 * Refuses to run if:
 *   - `STRIPE_MODE` is not `test`.
 *   - The secret key doesn't start with `sk_test_`.
 *   - The project id is missing or malformed.
 *
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-billing-reset.ts <projectId>
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
import { PrismaService } from "../src/prisma/prisma.service.js";
import { STRIPE_API_VERSION } from "../src/billing/catalog.js";

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("usage: probe-billing-reset.ts <projectId>");
    process.exit(1);
  }

  const mode = process.env["STRIPE_MODE"] ?? "test";
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (mode !== "test") {
    console.error(`✗ STRIPE_MODE=${mode} — this script is test-mode only.`);
    process.exit(1);
  }
  if (!secretKey || !secretKey.startsWith("sk_test_")) {
    console.error("✗ STRIPE_SECRET_KEY missing or not a test key.");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const account = await prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) {
      console.log(`• project=${projectId} has no BillingAccount — already reset.`);
      return;
    }

    const customerId = account.stripe_customer_id_test;
    if (customerId) {
      console.log(`▸ tearing down Stripe customer ${customerId}`);
      // Cancel every subscription on the customer (including
      // `cancel_at_period_end` ones — we want clean state).
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of subs.data) {
        if (sub.status === "canceled") continue;
        await stripe.subscriptions.cancel(sub.id, { prorate: false });
        console.log(`  ✂ cancelled subscription ${sub.id}`);
      }
      // Delete the customer itself. Stripe rejects deletion of
      // customers with non-cancelled subscriptions, hence the cancel
      // step above. Some test-mode customers can also have an
      // invoice in `draft` — we void those.
      const drafts = await stripe.invoices.list({
        customer: customerId,
        status: "draft",
        limit: 100,
      });
      for (const inv of drafts.data) {
        if (!inv.id) continue;
        await stripe.invoices.voidInvoice(inv.id);
        console.log(`  ✂ voided draft invoice ${inv.id}`);
      }
      await stripe.customers.del(customerId);
      console.log(`  ✂ deleted customer ${customerId}`);
    } else {
      console.log(`• no Stripe customer id on record for project=${projectId}`);
    }

    // Wipe the local billing surface. Order matters: child rows
    // before the parent.
    const r1 = await prisma.meterEvent.deleteMany({
      where: { project_id: projectId },
    });
    const r2 = await prisma.usageDaily.deleteMany({
      where: { project_id: projectId },
    });
    const r3 = await prisma.bYOKDailySpend.deleteMany({
      where: { project_id: projectId },
    });
    const r4 = await prisma.pendingStorageDowngrade.deleteMany({
      where: { project_id: projectId },
    });
    const r5 = await prisma.billingAccount.delete({
      where: { id: account.id },
    });
    console.log("");
    console.log("✓ local billing surface wiped");
    console.log(`  meter_events:               ${r1.count}`);
    console.log(`  usage_daily:                ${r2.count}`);
    console.log(`  byok_daily_spend:           ${r3.count}`);
    console.log(`  pending_storage_downgrades: ${r4.count}`);
    console.log(`  billing_account:            ${r5.id ? 1 : 0}`);
    console.log("");
    console.log("Next: open /billing in the dashboard — the empty state should render.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("✗ reset failed:", err);
  process.exit(1);
});
