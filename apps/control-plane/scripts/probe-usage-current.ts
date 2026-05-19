import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

import { PrismaService } from "../src/prisma/prisma.service.js";
import { UsageService } from "../src/usage/usage.service.js";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("usage: probe-usage-current.ts <projectId>");
    process.exit(1);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const usage = new UsageService(prisma);
  const data = await usage.getCurrentPeriod(projectId);
  console.log(JSON.stringify(data, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
