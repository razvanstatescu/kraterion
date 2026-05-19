/**
 * Drive the storage resize flow end-to-end via StorageBillingService.
 * Bypasses the HTTP layer + auth (same shape as the other probes);
 * useful for confirming the Stripe quantity update + on-chain
 * resize_grow + compensating rollback work without a browser.
 *
 *   pnpm -F @kraterion/control-plane exec tsx \
 *     scripts/probe-storage-resize.ts <projectId> <new_gb>
 *
 * For downgrade testing, pass the target as a smaller-than-current
 * quantity. The probe returns immediately; the downgrade is applied
 * by the in-process processor at `effective_at` (period end).
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
import { StorageBillingService } from "../src/billing/storage-billing.service.js";
import { StripeService } from "../src/billing/stripe.service.js";
import { OperatorKeypairService } from "../src/sui/operator-keypair.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";

async function main() {
  const projectId = process.argv[2];
  const newGb = Number(process.argv[3]);
  if (!projectId || !Number.isFinite(newGb)) {
    console.error("usage: probe-storage-resize.ts <projectId> <new_gb>");
    process.exit(1);
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  const stripe = new StripeService();
  stripe.onModuleInit();
  const billing = new BillingService(prisma, stripe);
  const keyWrapping = new KeyWrappingService();
  const operator = new OperatorKeypairService(prisma, keyWrapping);
  await operator.onModuleInit();
  const storageBilling = new StorageBillingService(prisma, billing, stripe, operator);

  console.log(`▸ resize project=${projectId} → ${newGb} GB`);
  const result = await storageBilling.resize({
    projectId,
    newReservedGb: newGb,
  });
  console.log(JSON.stringify(result, null, 2));

  // Snapshot the StoragePool row so the operator can sanity-check the
  // on-chain delta after the indexer catches up (~5s testnet).
  if (result.direction === "upgrade") {
    console.log("");
    console.log("waiting ~6s for indexer ack…");
    await new Promise((r) => setTimeout(r, 6000));
    const pool = await prisma.storagePool.findUnique({
      where: { project_id: projectId },
      select: { reserved_encoded_bytes: true, used_encoded_bytes: true },
    });
    console.log(
      `pool reserved=${pool?.reserved_encoded_bytes} bytes (${Number((pool?.reserved_encoded_bytes ?? 0n) / (1024n * 1024n * 1024n))} GB) used=${pool?.used_encoded_bytes} bytes`,
    );
  }
  if (result.direction === "downgrade") {
    const pending = await prisma.pendingStorageDowngrade.findUnique({
      where: { project_id: projectId },
    });
    console.log("");
    console.log("PendingStorageDowngrade row:", JSON.stringify(pending, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(`probe failed: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
