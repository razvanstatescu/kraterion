/**
 * Billing-side helpers for `AgentInvocation` cost imputation.
 *
 * The two LLM call sites in `agents.controller.ts` (non-streaming +
 * streaming) both end with token counts on hand, and both need to do
 * the same three things:
 *
 *   1. Compute `cost_usd_micros` from the canonical OpenAI price catalog.
 *   2. Patch the `AgentInvocation` row with cost + price_version + key_source.
 *   3. Update the BYOK rollup OR write a `MeterEvent` row.
 *
 * This module is the single source for that logic so the two call
 * sites stay in lockstep. The price catalog lives in
 * `@kraterion/shared` (`openai-prices.ts`); see that file for the
 * versioning convention.
 *
 * Key-source policy for v1:
 *
 *   Every chat-completion call today goes through
 *   `providerCredentials.useDecrypted` — i.e. a project-owned OpenAI
 *   key. So `key_source` is hard-coded to `'byok'` in this helper.
 *   When the platform-shared OpenAI pool feature ships (post-v1), the
 *   call site will pass the source explicitly.
 *
 * The `MeterEvent` write for `'platform'` invocations is wired here
 * but unreachable while `key_source` is always `'byok'` — kept for the
 * future flip so the call sites don't need to change again.
 */

import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import {
  computeChatCostUsdMicros,
  METER_NAMES,
  meterEventIdentifier,
  readStripeMode,
} from "@kraterion/shared";

const logger = new Logger("InvocationCost");

export type AgentKeySource = "byok" | "platform";

export interface ImputeArgs {
  prisma: PrismaClient;
  invocationId: string;
  projectId: string;
  model: string;
  promptTokens: number | null | undefined;
  completionTokens: number | null | undefined;
  /** Defaults to `'byok'` until the platform-pool feature ships. */
  keySource?: AgentKeySource;
}

/**
 * Compute cost + patch the invocation row + write BYOK/MeterEvent.
 * Best-effort: every step is wrapped so a billing-only failure can
 * never bubble up and break a chat completion that's already
 * succeeded from the user's perspective.
 */
export async function imputeAndRecordInvocationCost(args: ImputeArgs): Promise<void> {
  const keySource: AgentKeySource = args.keySource ?? "byok";
  const { cost_usd_micros, price_version } = computeChatCostUsdMicros({
    model: args.model,
    prompt_tokens: args.promptTokens,
    completion_tokens: args.completionTokens,
  });

  // Patch the invocation row. If the row was already updated by the
  // caller (the typical flow), this just adds the three billing
  // columns alongside the rest. Idempotent.
  try {
    await args.prisma.agentInvocation.update({
      where: { id: args.invocationId },
      data: {
        cost_usd_micros,
        cost_price_version: price_version,
        key_source: keySource,
      },
    });
  } catch (err) {
    logger.warn(
      `imputation update failed for invocation=${args.invocationId}: ${(err as Error).message}`,
    );
    return;
  }

  // Tracking sink depends on the key source.
  if (keySource === "byok") {
    try {
      await upsertByokRollup({
        prisma: args.prisma,
        projectId: args.projectId,
        model: args.model,
        promptTokens: args.promptTokens ?? 0,
        completionTokens: args.completionTokens ?? 0,
        costUsdMicros: cost_usd_micros,
      });
    } catch (err) {
      logger.warn(
        `BYOKDailySpend upsert failed for invocation=${args.invocationId}: ${(err as Error).message}`,
      );
    }
    return;
  }

  // Platform-key path. Writes a `MeterEvent` row for the
  // `agent_messages` meter; the meter-emit worker drains it to Stripe
  // (B4). Identifier is keyed on the invocation id so retries are
  // safe inside Stripe's 24h dedupe window.
  try {
    const mode = readStripeMode(process.env);
    await args.prisma.meterEvent.create({
      data: {
        project_id: args.projectId,
        meter_name: METER_NAMES.agent_messages,
        value: 1n,
        identifier: meterEventIdentifier({
          mode,
          meter: METER_NAMES.agent_messages,
          key: args.invocationId,
        }),
        occurred_at: new Date(),
        stripe_status: "pending",
      },
    });
  } catch (err) {
    logger.warn(
      `MeterEvent insert failed for invocation=${args.invocationId}: ${(err as Error).message}`,
    );
  }
}

async function upsertByokRollup(args: {
  prisma: PrismaClient;
  projectId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicros: bigint;
}): Promise<void> {
  const day = todayUtcKey();
  await args.prisma.bYOKDailySpend.upsert({
    where: {
      project_id_day_model: {
        project_id: args.projectId,
        day,
        model: args.model,
      },
    },
    create: {
      project_id: args.projectId,
      day,
      model: args.model,
      input_tokens: BigInt(args.promptTokens),
      output_tokens: BigInt(args.completionTokens),
      cost_usd_micros: args.costUsdMicros,
    },
    update: {
      input_tokens: { increment: BigInt(args.promptTokens) },
      output_tokens: { increment: BigInt(args.completionTokens) },
      cost_usd_micros: { increment: args.costUsdMicros },
    },
  });
}

function todayUtcKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
