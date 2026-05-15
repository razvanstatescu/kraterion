import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { utcDay } from "./share-token.js";

/**
 * P6 — Daily cap enforcement for the embed chat widget.
 *
 * `ShareTokenUsageDay` carries two counters per (token, UTC-day):
 * `requests` and `spend_usd_micros`. Both are upserted atomically; the
 * cap-check happens BEFORE the LLM call and the increment happens
 * AFTER the call returns (so over-cap is a hard "no", not an
 * after-the-fact tally that double-spends).
 *
 * Why Prisma counters instead of Redis: the control plane doesn't run
 * Redis today (the `ioredis` dep is parked, unused — see
 * `decisions.md` 2026-05-13 for the oauth.service note). Adding Redis
 * for one feature is more operational surface than this counter
 * needs. Prisma upserts on `(share_token_id, day_utc)` give us atomic
 * increments and a free audit trail. If P6 traffic ever justifies a
 * faster path, the same shape moves to Redis with a daily flush.
 */
@Injectable()
export class ShareTokenUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read today's row (or compute a zero row if no row yet). Throws
   * `RateLimited` if either cap is met or exceeded.
   *
   * NB: this is best-effort under racing requests. Two concurrent
   * over-cap requests can both pass this check before either has
   * incremented; the second will land slightly over the cap. We
   * accept that — for a hackathon embed widget the cap is a coarse
   * spend-protection, not a hard accounting boundary.
   */
  async assertWithinCaps(
    shareTokenId: string,
    maxRequestsPerDay: number | null,
    maxSpendUsdMicrosPerDay: bigint | null,
  ): Promise<void> {
    if (maxRequestsPerDay === null && maxSpendUsdMicrosPerDay === null) return;
    const today = utcDay();
    const row = await this.prisma.shareTokenUsageDay.findUnique({
      where: { share_token_id_day_utc: { share_token_id: shareTokenId, day_utc: today } },
    });
    const currentRequests = row?.requests ?? 0;
    const currentSpend = row?.spend_usd_micros ?? 0n;

    if (maxRequestsPerDay !== null && currentRequests >= maxRequestsPerDay) {
      throw new ControlPlaneError(
        "RateLimited",
        "This chat has reached its daily request limit. Try again tomorrow.",
        { limit: String(maxRequestsPerDay), scope: "share_token_day" },
      );
    }
    if (
      maxSpendUsdMicrosPerDay !== null &&
      currentSpend >= maxSpendUsdMicrosPerDay
    ) {
      throw new ControlPlaneError(
        "RateLimited",
        "This chat has reached its daily spend limit. Try again tomorrow.",
        {
          limit_usd_micros: String(maxSpendUsdMicrosPerDay),
          scope: "share_token_day",
        },
      );
    }
  }

  /**
   * Atomically bump the counters for today. Called after a successful
   * chat completion. Uses `upsert` so the first call of a fresh day
   * creates the row.
   *
   * `spendUsdMicros` is a bigint to stay precise at billion-micro
   * scale (1e9 micros = $1k). Computed by the caller as
   * `(output_tokens / 1_000_000) * price_per_m_tokens_usd * 1e6`.
   */
  async record(
    shareTokenId: string,
    spendUsdMicros: bigint,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const today = utcDay();
    await tx.shareTokenUsageDay.upsert({
      where: { share_token_id_day_utc: { share_token_id: shareTokenId, day_utc: today } },
      create: {
        share_token_id: shareTokenId,
        day_utc: today,
        requests: 1,
        spend_usd_micros: spendUsdMicros,
      },
      update: {
        requests: { increment: 1 },
        spend_usd_micros: { increment: spendUsdMicros },
      },
    });
  }
}

/**
 * Per-million-tokens USD price for chat models. Mirrors
 * `CHAT_MODELS.price_per_m_tokens_usd` in `@kraterion/shared`. We pull
 * a localized copy here to avoid the chat handler reaching deep into
 * the shared package at hot-path runtime.
 *
 * If a request hits an unknown model id (shouldn't happen — the chat
 * endpoint validates via `isKnownChatModel` before reaching the
 * embed-spend path), we charge zero. The audit row will still record
 * the requestcounter, so the cap is still partially effective.
 */
export function chatModelPricePerMTokensUsd(modelId: string): number {
  // Keep this in sync with `packages/shared/src/models.ts:CHAT_MODELS`.
  switch (modelId) {
    case "gpt-4o-mini":
      return 0.6;
    case "gpt-4o":
      return 10;
    case "gpt-4-turbo":
      return 30;
    case "o3-mini":
      return 4.4;
    case "o1":
      return 60;
    default:
      return 0;
  }
}

/**
 * Convert (completion_tokens, model) → USD spend in micros (1e-6 USD).
 *
 * Output-tokens-only for simplicity — input tokens are typically much
 * cheaper than output and the retrieval block re-sent every turn
 * makes input cost a poor proxy for "what the agent did this turn."
 * Caps are a coarse spend protection, not a billing source-of-truth.
 */
export function computeSpendUsdMicros(
  completionTokens: number,
  modelId: string,
): bigint {
  const pricePerM = chatModelPricePerMTokensUsd(modelId);
  // (completionTokens / 1_000_000) * pricePerM * 1e6 micros
  //   = completionTokens * pricePerM
  // (in micros, after the 1e-6 → 1e0 expansion).
  return BigInt(Math.round(completionTokens * pricePerM));
}
