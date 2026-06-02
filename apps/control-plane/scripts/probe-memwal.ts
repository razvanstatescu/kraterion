#!/usr/bin/env tsx
/**
 * P9 Feature 3 — non-LLM smoke test for the MemWal-as-tool wiring.
 *
 * Drives the two tool handlers directly (skipping OpenAI), so we can
 * verify:
 *   1. MEMWAL_ACCOUNT_ID + MEMWAL_DELEGATE_KEY are valid and the
 *      hosted relayer accepts them.
 *   2. The per-agent namespace is honoured (write under agent A, recall
 *      under agent B returns 0 hits).
 *   3. The tool handler shapes (text, structured) survive round-trip.
 *
 * Usage:
 *   pnpm --filter @kraterion/control-plane exec tsx scripts/probe-memwal.ts
 *
 * Expects MEMWAL_* env vars in process.env. Reads from the repo root
 * .env via dotenv (matching how the NestJS app boots).
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// .env lives at the repo root; the probe runs from `apps/control-plane`.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { MemwalService } from "../src/memwal/memwal.service.js";
import { memoryRecallTool } from "../src/agents/tools/memory-recall.js";
import { memoryRememberTool } from "../src/agents/tools/memory-remember.js";
import type { ToolContext } from "../src/agents/tools/types.js";

function makeCtx(agentId: string, memwal: MemwalService): ToolContext {
  return {
    // Tool handlers only touch ctx.memwal + ctx.agentId — the rest are
    // unused for memory.*, so we cast through unknown for the probe.
    prisma: undefined as never,
    buckets: undefined as never,
    knowledge: undefined as never,
    presign: undefined as never,
    memwal,
    agentId,
    accountId: "probe-account",
    projectId: "probe-project",
    apiKeyId: null,
    invocationId: "probe-invocation",
  };
}

async function main() {
  const memwal = new MemwalService();
  if (!memwal.isConfigured()) {
    console.error(
      "✗ MemwalService is not configured. Set MEMWAL_ACCOUNT_ID and " +
        "MEMWAL_DELEGATE_KEY in .env then re-run.",
    );
    process.exit(2);
  }

  const agentA = `probe-agent-a-${Date.now()}`;
  const agentB = `probe-agent-b-${Date.now()}`;
  console.log(`◇ probing with agents ${agentA} / ${agentB}`);

  // Step 1 — agent A remembers a unique fact.
  const fact = `the secret colour is plum-${Date.now()}`;
  console.log(`\n◇ memory.remember (agent A): ${fact}`);
  const remembered = await memoryRememberTool.execute(
    { content: fact },
    makeCtx(agentA, memwal),
  );
  console.log("  → text:", remembered.text);
  console.log("  → walrusBlobId:", remembered.walrusBlobId);

  // Step 2 — agent A recalls the fact.
  console.log("\n◇ memory.recall (agent A, query='secret colour')");
  const recalledA = await memoryRecallTool.execute(
    { query: "secret colour", top_k: 3 },
    makeCtx(agentA, memwal),
  );
  console.log(
    "  → structured:",
    JSON.stringify(recalledA.structured, null, 2),
  );
  console.log("  → text:", recalledA.text.slice(0, 500));

  // Step 3 — agent B should NOT see agent A's memory (namespace
  // isolation).
  console.log(
    "\n◇ memory.recall (agent B, same query — should return 0 hits)",
  );
  const recalledB = await memoryRecallTool.execute(
    { query: "secret colour", top_k: 3 },
    makeCtx(agentB, memwal),
  );
  const hitsB =
    (recalledB.structured as { hit_count: number } | undefined)
      ?.hit_count ?? -1;
  console.log("  → hit_count:", hitsB);
  if (hitsB !== 0) {
    console.warn(
      "  ! agent B saw agent A's memory — namespace isolation may be broken.",
    );
  } else {
    console.log("  ✓ namespace isolation holds.");
  }

  memwal.onModuleDestroy();
  console.log("\n◇ probe complete.");
}

main().catch((err) => {
  console.error("✗ probe failed:", err);
  process.exit(1);
});
