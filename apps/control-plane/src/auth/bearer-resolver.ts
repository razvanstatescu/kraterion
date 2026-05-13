import { Injectable } from "@nestjs/common";
import { hashBearer, looksLikeBearer, networkFromEnv, networkOfToken } from "../api-keys/bearer.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiKeyPrincipal } from "./principal.js";

/**
 * Resolves a `kr_live_…` / `kr_test_…` bearer string to an `ApiKeyPrincipal`.
 * Returns `null` for every "not authenticated" outcome (malformed, wrong
 * network, unknown hash, revoked, suspended account) — the guard turns
 * that into a single `401 Unauthorized` so the client cannot probe which
 * specific check failed.
 */
@Injectable()
export class BearerResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(token: string): Promise<ApiKeyPrincipal | null> {
    if (!looksLikeBearer(token)) return null;
    const claimed = networkOfToken(token);
    if (!claimed || claimed !== networkFromEnv()) {
      // A kr_live_ token on a testnet deployment (or vice versa) is
      // refused outright. Mirrors Stripe's `sk_test_` vs `sk_live_` mode
      // mismatch — gives devs immediate, actionable feedback.
      return null;
    }
    const hash = hashBearer(token);
    const row = await this.prisma.apiKey.findUnique({
      where: { token_hash: hash },
      include: { project: { include: { account: true } } },
    });
    if (!row) return null;
    if (row.kind !== "bearer") return null;
    if (row.revoked_at) return null;
    if (row.project.account.status !== "active") return null;

    // Fire-and-forget last-used touch. We deliberately swallow errors —
    // a flaky write here must not block an authenticated request.
    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
      .catch(() => undefined);

    return {
      kind: "api_key",
      accountId: row.project.account_id,
      projectId: row.project_id,
      apiKeyId: row.id,
      scopes: row.scopes,
    };
  }
}
