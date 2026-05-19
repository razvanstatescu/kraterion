import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

import { PrismaService } from "../src/prisma/prisma.service.js";
import { BillingService } from "../src/billing/billing.service.js";
import { StorageDowngradeProcessor } from "../src/billing/storage-downgrade.processor.js";
import { StripeService } from "../src/billing/stripe.service.js";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const stripe = new StripeService();
  stripe.onModuleInit();
  const billing = new BillingService(prisma, stripe);
  const proc = new StorageDowngradeProcessor(prisma, stripe, billing);
  const result = await proc.tick();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
