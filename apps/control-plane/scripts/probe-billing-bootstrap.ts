/**
 * Bootstrap a test-mode subscription on a project's Stripe customer
 * without going through the browser Checkout flow. Attaches the
 * always-passing `pm_card_visa` test PaymentMethod, sets it as the
 * customer's default, then calls `ensureSubscription` to create the
 * 7-line subscription server-side.
 *
 * Test-mode only. Refuses to run if `STRIPE_MODE != test` or the key
 * isn't `sk_test_`.
 *
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-billing-bootstrap.ts <projectId>
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

import { PrismaService } from "../src/prisma/prisma.service.js";
import { BillingService } from "../src/billing/billing.service.js";
import { StripeService } from "../src/billing/stripe.service.js";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("usage: probe-billing-bootstrap.ts <projectId>");
    process.exit(1);
  }
  if (process.env["STRIPE_MODE"] !== "test") {
    console.error("refusing to run outside STRIPE_MODE=test");
    process.exit(1);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const stripe = new StripeService();
  stripe.onModuleInit();
  const billing = new BillingService(prisma, stripe);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { account: { select: { email: true, sui_address: true } } },
  });
  if (!project) {
    console.error(`no project id=${projectId}`);
    process.exit(1);
  }
  console.log(`▸ project=${project.id} (${project.name})`);

  const { stripeCustomerId } = await billing.ensureStripeCustomer({
    projectId,
    accountEmail: project.account.email,
    accountSuiAddress: project.account.sui_address,
    projectName: project.name,
  });
  console.log(`  stripe_customer=${stripeCustomerId}`);

  // Attach `pm_card_visa` (Stripe's always-passing test PM).
  const pm = await stripe.client.paymentMethods.attach("pm_card_visa", {
    customer: stripeCustomerId,
  });
  console.log(`  attached pm=${pm.id}`);

  await billing.setDefaultPaymentMethod(stripeCustomerId, pm.id);
  console.log(`  set as customer default`);

  const { subscriptionId, created } = await billing.ensureSubscription({
    projectId,
    stripeCustomerId,
  });
  console.log(`  subscription=${subscriptionId} (created=${created})`);

  // Mark BillingAccount as ready locally too.
  await prisma.billingAccount.update({
    where: { project_id: projectId },
    data: {
      has_payment_method: true,
      default_payment_method: pm.id,
      status: "active",
    },
  });

  console.log("");
  console.log("✓ bootstrap complete");
  console.log(`  customer:     ${stripeCustomerId}`);
  console.log(`  payment_method: ${pm.id}`);
  console.log(`  subscription: ${subscriptionId}`);
  console.log("");
  console.log(`run pnpm -F @kraterion/control-plane exec tsx scripts/probe-storage-resize.ts ${projectId} 50`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
