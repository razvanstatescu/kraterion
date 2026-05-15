import { Injectable } from "@nestjs/common";
import {
  hashShareToken,
  looksLikeShareToken,
  networkOfShareToken,
} from "../agents/share-token.js";
import { networkFromEnv } from "../api-keys/bearer.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ShareTokenPrincipal } from "./principal.js";

/**
 * Resolves a `kr_share_<env>_…` token to a `ShareTokenPrincipal`.
 *
 * Same null-on-any-failure pattern as `BearerResolver` — the guard
 * turns that into a uniform 401 so clients can't probe which specific
 * check failed (malformed vs. wrong-network vs. unknown vs. revoked).
 *
 * Origin and per-day caps are NOT enforced here — those need the
 * request's `Origin` header + a same-transaction counter check, which
 * the chat endpoint does. The resolver's job is to authenticate the
 * token; authorization (which origins, how many requests, how much
 * spend) is handled at the boundary where we can refuse or 429.
 */
@Injectable()
export class ShareTokenResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(token: string): Promise<ShareTokenPrincipal | null> {
    if (!looksLikeShareToken(token)) return null;
    const claimed = networkOfShareToken(token);
    if (!claimed || claimed !== networkFromEnv()) return null;
    const row = await this.prisma.agentShareToken.findUnique({
      where: { token_hash: hashShareToken(token) },
      include: { agent: { select: { status: true } } },
    });
    if (!row) return null;
    if (row.revoked_at) return null;
    // If the parent agent is revoked, the share token follows. We don't
    // delete the token row — the dashboard surfaces "agent revoked" so
    // the user knows why their widget stopped responding.
    if (row.agent.status !== "active") return null;

    // Fire-and-forget last_used touch. Swallow errors so a flaky write
    // here never blocks an authenticated request.
    void this.prisma.agentShareToken
      .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
      .catch(() => undefined);

    return {
      kind: "share_token",
      shareTokenId: row.id,
      agentId: row.agent_id,
      allowedOrigins: row.allowed_origins,
      maxRequestsPerDay: row.max_requests_per_day,
      maxSpendUsdMicrosPerDay: row.max_spend_usd_micros_per_day,
      citeSources: row.cite_sources,
    };
  }
}
