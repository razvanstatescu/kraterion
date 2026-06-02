/**
 * D9 — End-to-end probe of `RunsService.verify(...)`.
 *
 * Same code path the `pnpm replay` CLI exercises end-to-end, but
 * called directly via Prisma+services rather than over HTTP. Lets us
 * confirm the replay-side decrypt + hash check works without needing
 * a bearer token.
 *
 * Pre-requisites:
 *   - probe-session-archive.ts already ran and produced an
 *     AgentSessionTrace row.
 *   - Walrus blob is certified (the second probe run is enough; the
 *     certify PTB2 fires inside archiveSessionToWalrus).
 *
 * Usage:
 *   pnpm -F @kraterion/control-plane exec tsx scripts/probe-runs-verify.ts <txDigest>
 */

import "dotenv/config";
import { Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { RunsService } from "../src/runs/runs.service.js";
import { OperatorKeypairService } from "../src/sui/operator-keypair.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import { ProviderCredentialService } from "../src/providers/provider-credential.service.js";

async function main() {
  const digest = process.argv[2];
  if (!digest) {
    console.error("usage: probe-runs-verify.ts <txDigest>");
    process.exit(1);
  }

  const logger = new Logger("probe-runs-verify");
  const prisma = new PrismaClient();
  await prisma.$connect();
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
  });

  // Mirror RunsModule's DI minimally.
  const keyWrapping = new KeyWrappingService();
  const operator = new OperatorKeypairService(
    prisma as never,
    keyWrapping,
  );
  await operator.onModuleInit();

  const credentials = new ProviderCredentialService(
    prisma as never,
    keyWrapping,
  );
  const runs = new RunsService(prisma as never, operator, credentials, redis);

  // Resolve the trace's account_id so the verify() authorization check
  // passes. We can read the trace row directly since this is a probe.
  const trace = await prisma.agentSessionTrace.findFirst({
    where: { tx_digest: Buffer.from(digest, "utf-8") },
    include: {
      session: {
        include: {
          agent: { include: { project: { select: { account_id: true } } } },
        },
      },
    },
  });
  if (!trace) {
    logger.error(`no AgentSessionTrace for digest=${digest}`);
    process.exit(2);
  }
  const accountId = trace.session.agent.project.account_id;
  logger.log(`account=${accountId.slice(0, 8)}…`);

  logger.log(`calling RunsService.verify({ txDigest: '${digest}' })`);
  const result = await runs.verify({ txDigest: digest, accountId });

  logger.log(`tx_digest          ${result.tx_digest}`);
  logger.log(`session_id         ${result.session_id}`);
  logger.log(`agent_id           ${result.agent_id}`);
  logger.log(`invocation_count   ${result.invocation_count}`);
  logger.log(`walrus_blob_id     ${result.walrus_blob_id}`);
  logger.log(`trace_hash_hex     ${result.trace_hash_hex}`);
  logger.log(`trace_hash_matches ${result.trace_hash_matches ? "✓" : "✗"}`);
  logger.log(`anchored_at        ${result.anchored_at}`);

  const traceObj = result.trace as Record<string, unknown>;
  logger.log(`---`);
  logger.log(`session metadata:`);
  logger.log(`  opened_at    ${traceObj["opened_at"]}`);
  logger.log(`  closed_at    ${traceObj["closed_at"]}`);
  logger.log(`  close_reason ${traceObj["close_reason"]}`);
  const invocations = traceObj["invocations"] as Array<Record<string, unknown>>;
  logger.log(`first invocation:`);
  if (invocations[0]) {
    const inv = invocations[0];
    const input = inv["input"] as Record<string, unknown>;
    const output = inv["output"] as Record<string, unknown>;
    const model = inv["model"] as Record<string, unknown>;
    logger.log(`  user: ${input["last_user_message"]}`);
    logger.log(`  assistant: ${output["text"]}`);
    logger.log(
      `  model.seed: ${model["seed"]}  model.fingerprint: ${model["system_fingerprint"]}`,
    );
  }

  if (!result.trace_hash_matches) {
    await prisma.$disconnect();
    await redis.quit();
    console.error("trace_hash mismatch — TAMPER SIGNAL");
    process.exit(3);
  }
  logger.log("\n✓ end-to-end replay verified");

  // P9 Feature 2 (D3) — exercise the lineage envelope path. Same
  // backing trace; pure transformer; cheap.
  logger.log(`---`);
  logger.log(`calling RunsService.lineage(...)`);
  const lineage = await runs.lineage({ txDigest: digest, accountId });
  const totalInputs = lineage.runs.reduce(
    (acc, r) => acc + r.inputs.length,
    0,
  );
  const totalOutputs = lineage.runs.reduce(
    (acc, r) => acc + r.outputs.length,
    0,
  );
  logger.log(`job.namespace     ${lineage.job.namespace}`);
  logger.log(`job.name          ${lineage.job.name}`);
  logger.log(`session.anchor    ${lineage.session.anchored_tx_digest}`);
  logger.log(`runs.length       ${lineage.runs.length}`);
  logger.log(`inputs (total)    ${totalInputs}`);
  logger.log(`outputs (total)   ${totalOutputs}`);
  if (lineage.runs[0]) {
    const r0 = lineage.runs[0];
    logger.log(`run[0].runId      ${r0.runId}`);
    logger.log(`run[0].state      ${r0.state}`);
    logger.log(`run[0].outputs    ${r0.outputs.map((o) => o.namespace).join(", ")}`);
  }
  logger.log(`\n✓ lineage envelope built (kraterion_lineage_version=${lineage.kraterion_lineage_version})`);

  await prisma.$disconnect();
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
