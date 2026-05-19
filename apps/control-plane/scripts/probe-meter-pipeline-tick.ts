import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

import { Logger } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { StripeService } from "../src/billing/stripe.service.js";
import { RequestRollupProcessor } from "../src/billing/request-rollup.processor.js";
import { StorageUsageProcessor } from "../src/billing/storage-usage.processor.js";
import { IndexRollupProcessor } from "../src/billing/index-rollup.processor.js";
import { MeterEmitProcessor } from "../src/billing/meter-emit.processor.js";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const stripe = new StripeService();
  stripe.onModuleInit();
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
  const reqRollup = new RequestRollupProcessor(redis as never, prisma, stripe);
  const storageUsage = new StorageUsageProcessor(prisma);
  const indexRollup = new IndexRollupProcessor(prisma, stripe);
  const emit = new MeterEmitProcessor(prisma, stripe);

  const logger = new Logger("probe");
  logger.log("running request-rollup tick…");
  console.log("  ", await reqRollup.tick());
  logger.log("running storage-usage tick…");
  console.log("  ", await storageUsage.tick());
  logger.log("running index-rollup tick…");
  console.log("  ", await indexRollup.tick());
  logger.log("running meter-emit tick…");
  console.log("  ", await emit.tick());

  await redis.quit();
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
