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
import { StorageBillingService } from "../src/billing/storage-billing.service.js";
import { StripeService } from "../src/billing/stripe.service.js";
import { OperatorKeypairService } from "../src/sui/operator-keypair.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("usage: probe-cancel-downgrade.ts <projectId>");
    process.exit(1);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const stripe = new StripeService();
  stripe.onModuleInit();
  const billing = new BillingService(prisma, stripe);
  const operator = new OperatorKeypairService(prisma, new KeyWrappingService());
  await operator.onModuleInit();
  const sb = new StorageBillingService(prisma, billing, stripe, operator);

  const result = await sb.cancelPendingDowngrade(projectId);
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
