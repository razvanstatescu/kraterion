/**
 * D9 — End-to-end probe of the session archive pipeline.
 *
 * Creates the minimum-viable Postgres state for a complete agent
 * session, then directly calls `archiveSessionToWalrus` (bypassing
 * BullMQ + the sweeper) to fire the Seal+Walrus+Sui anchor sequence.
 *
 * Pre-requisites (run in order):
 *   1. `scripts/setup-testnet.sh --force` (or upgrade)
 *   2. `pnpm -F @kraterion/gateway bootstrap`
 *   3. `pnpm -F @kraterion/gateway smoke` (to lazy-create the vault)
 *   4. (worker running so the indexer keeps up)
 *
 * What this probe does:
 *   - Idempotently provisions a `KnowledgeBucketSettings` row for the
 *     test bucket (so the seal_identity prefix path is valid).
 *   - Creates a `KraterionAgent` with a fresh Ed25519 sub-wallet.
 *   - Attaches the test bucket to the agent.
 *   - Creates an `AgentSession` with `status='flushing'` (skipping
 *     the sweeper) + two completed `AgentInvocation` rows so the
 *     trace serializer has real input to chew on.
 *   - Calls `archiveSessionToWalrus(...)` directly. The function
 *     prints the resulting tx digest on success.
 *
 * After it finishes:
 *   - Wait ~15s for the indexer to write `AgentSessionTrace`.
 *   - Look up the `anchored_tx_digest` from the AgentSession row.
 *   - Run `pnpm replay <digest>` to verify the round-trip.
 *
 * Idempotent: every step looks for existing rows and re-uses them.
 * Run it multiple times; each run creates a fresh session.
 */

import "dotenv/config";
import { Logger } from "@nestjs/common";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { PrismaClient, Prisma } from "@prisma/client";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import { KnowledgeIndexerKeypairService } from "../src/auth/knowledge-indexer-keypair.service.js";
import { archiveSessionToWalrus } from "../src/sessions/session-archive.js";

async function main() {
  const prisma = new PrismaClient();
  const logger = new Logger("probe-session-archive");

  await prisma.$connect();

  // 1. Find the test project + bucket the bootstrap left behind.
  const bucket = await prisma.bucket.findFirst({
    where: { name: "test-bucket" },
    include: { project: true, knowledge: true },
  });
  if (!bucket) {
    throw new Error(
      "No test-bucket in Postgres. Run `pnpm -F @kraterion/gateway bootstrap` first.",
    );
  }
  logger.log(
    `bucket id=${bucket.id} project=${bucket.project.id} ` +
      `kraterion_id=${bucket.kraterion_bucket_object_id.slice(0, 16)}…`,
  );

  // 2. Knowledge-enable the bucket if not already. The seal_identity
  //    bucket lookup needs `bucket.knowledge !== null`.
  if (!bucket.knowledge) {
    await prisma.knowledgeBucketSettings.create({
      data: {
        bucket_id: bucket.id,
        embedding_model: "text-embedding-3-small",
        embedding_dimensions: 1536,
      },
    });
    logger.log("knowledge-enabled test bucket");
  } else {
    logger.log("test bucket already knowledge-enabled");
  }

  // 3. Provision a KraterionAgent sub-wallet (per-agent identity).
  const wrap = new KeyWrappingService();
  const agentKeypair = new Ed25519Keypair();
  const { secretKey: agentSeed } = decodeSuiPrivateKey(agentKeypair.getSecretKey());
  const agentSubWallet = await prisma.subWallet.create({
    data: {
      sui_address: agentKeypair.toSuiAddress(),
      mnemonic_wrapped: wrap.wrap(agentSeed),
      role: "agent",
    },
  });

  // 4. Create the agent. (Project owner = account id from project.)
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: bucket.project.account_id },
  });
  const agent = await prisma.kraterionAgent.create({
    data: {
      project_id: bucket.project.id,
      name: `probe-agent-${Date.now()}`,
      description: "D9 probe agent",
      system_prompt: "You are a probe agent.",
      model: "gpt-4o-mini",
      sub_wallet_id: agentSubWallet.id,
    },
  });
  await prisma.agentBucket.create({
    data: { agent_id: agent.id, bucket_id: bucket.id },
  });
  logger.log(
    `agent id=${agent.id.slice(0, 8)}… sub_wallet=${agentKeypair.toSuiAddress().slice(0, 12)}…`,
  );

  // 5. Open a session in flushing state + 2 completed invocations.
  const session = await prisma.agentSession.create({
    data: {
      project_id: bucket.project.id,
      agent_id: agent.id,
      principal_kind: "session",
      principal_id: account.id,
      status: "flushing",
      invocation_count: 2,
    },
  });

  const inv1 = await prisma.agentInvocation.create({
    data: {
      agent_id: agent.id,
      project_id: bucket.project.id,
      user_id: account.id,
      session_id: session.id,
      status: "completed",
      input: "hello, agent",
      output: "hello back",
      model: "gpt-4o-mini",
      prompt_tokens: 12,
      completion_tokens: 3,
      retrieval_latency_ms: 0,
      llm_latency_ms: 100,
      latency_ms: 100,
      bucket_ids: [bucket.id],
      cited_hashes: [],
      retrieval_snapshot: {
        bucket_ids: [bucket.id],
        top_k: 8,
        hits: [],
      } satisfies Prisma.InputJsonValue,
      // P9 (D10) — simulate what the live chat path now stores:
      // a deterministic seed derived from the invocation UUID, and
      // the OpenAI system fingerprint from the response.
      seed: 0xa1b2,
      system_fingerprint: "fp_test_probe_d13",
      finished_at: new Date(),
    },
  });
  await new Promise((r) => setTimeout(r, 25));
  const inv2 = await prisma.agentInvocation.create({
    data: {
      agent_id: agent.id,
      project_id: bucket.project.id,
      user_id: account.id,
      session_id: session.id,
      status: "completed",
      input: "what's the weather like?",
      output: "I don't know weather, only the canonical replay test data.",
      model: "gpt-4o-mini",
      prompt_tokens: 18,
      completion_tokens: 14,
      retrieval_latency_ms: 0,
      llm_latency_ms: 240,
      latency_ms: 240,
      bucket_ids: [bucket.id],
      cited_hashes: [],
      retrieval_snapshot: {
        bucket_ids: [bucket.id],
        top_k: 8,
        hits: [],
      } satisfies Prisma.InputJsonValue,
      seed: 0xc3d4,
      system_fingerprint: "fp_test_probe_d13",
      finished_at: new Date(),
    },
  });
  logger.log(
    `session=${session.id.slice(0, 8)}… invocations=[${inv1.id.slice(0, 8)}…, ${inv2.id.slice(0, 8)}…]`,
  );

  // 6. Drive the archive directly. Bypasses the BullMQ queue.
  //    `KnowledgeIndexerKeypairService` needs lifecycle init outside
  //    of Nest — we re-create it manually.
  const keypairService = new KnowledgeIndexerKeypairService(prisma, wrap);
  await keypairService.onModuleInit();
  const signer = keypairService.getKeypair() as unknown as Ed25519Keypair;
  logger.log(`signer (knowledge_indexer) = ${signer.toSuiAddress().slice(0, 12)}…`);

  logger.log("calling archiveSessionToWalrus…");
  // Cast to satisfy the Nest-typed PrismaService parameter; the
  // function only uses Prisma client methods, not Nest decorators.
  await archiveSessionToWalrus({
    prisma: prisma as unknown as Parameters<typeof archiveSessionToWalrus>[0]["prisma"],
    signer,
    logger,
    sessionId: session.id,
    closeReason: "explicit_end",
  });

  // 7. Show the digest the indexer will pick up.
  const after = await prisma.agentSession.findUniqueOrThrow({
    where: { id: session.id },
    select: { status: true, closed_at: true, anchored_tx_digest: true },
  });
  logger.log(`status=${after.status}`);
  if (after.anchored_tx_digest) {
    logger.log(`tx_digest=0x${after.anchored_tx_digest.toString("hex")}`);
    logger.log(
      `▸ wait ~10s for the indexer, then: pnpm replay 0x${after.anchored_tx_digest.toString("hex")}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
