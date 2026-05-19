/**
 * End-to-end probe of the Stripe Checkout creation flow. Bypasses
 * the HTTP layer — instantiates BillingService directly so we can
 * verify the catalog → customer → checkout-session round-trip
 * against the live sandbox without needing a session token.
 *
 * Output is a Stripe Checkout URL. Open it in a browser, pay with
 * 4242... to complete the flow, then watch `stripe listen` forward
 * the `checkout.session.completed` event to the webhook controller.
 *
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-checkout-session.ts <projectId>
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
    console.error("usage: probe-checkout-session.ts <projectId>");
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

  console.log(`▸ project=${project.id} (account_email=${project.account.email})`);
  const { url, sessionId } = await billing.createCheckoutSession({
    projectId,
    accountEmail: project.account.email,
    accountSuiAddress: project.account.sui_address,
    projectName: project.name,
    successUrl: "http://localhost:3001/billing?checkout=success",
    cancelUrl: "http://localhost:3001/billing?checkout=cancel",
  });

  console.log(`◀ session_id = ${sessionId}`);
  console.log(`◀ url       = ${url}`);
  console.log("");
  console.log("Open the URL, pay with test card 4242 4242 4242 4242 (any exp/cvc).");
  console.log("Run `stripe listen --forward-to localhost:4001/webhooks/stripe` in another terminal");
  console.log("to forward the checkout.session.completed event.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
