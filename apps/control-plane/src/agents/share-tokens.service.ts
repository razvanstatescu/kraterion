import { Injectable } from "@nestjs/common";
import type { AgentShareToken } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { mintShareToken } from "./share-token.js";

/**
 * P6 — Authoritative writer for `AgentShareToken`.
 *
 * Mirrors `ApiKeysService.createBearerForProject` in shape: the
 * cleartext token leaves the server exactly once in the mint
 * response and is never retrievable. Storage is a SHA-256 hash;
 * lookups happen via `ShareTokenResolver` keyed on that hash.
 *
 * Owner check uses the agent's project's account_id — the share
 * token is bound to one agent, the agent is owned by one project,
 * which is owned by one account.
 */

export interface MintedShareTokenRow {
  /** The persisted row, minus secrets. */
  share_token: RedactedShareToken;
  /** Cleartext token — shown to the user exactly once. */
  token: string;
  network: "testnet" | "mainnet";
  WARNING: string;
}

/** Public wire shape — strips the irretrievable hash. */
export type RedactedShareToken = Omit<AgentShareToken, "token_hash">;

function redact(row: AgentShareToken): RedactedShareToken {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token_hash, ...rest } = row;
  return rest;
}

@Injectable()
export class ShareTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Asserts the agent exists AND is owned by the calling account. */
  private async assertAgentOwned(accountId: string, agentId: string) {
    const row = await this.prisma.kraterionAgent.findUnique({
      where: { id: agentId },
      select: { id: true, project: { select: { account_id: true } } },
    });
    if (!row || row.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }
  }

  async listForAgent(
    accountId: string,
    agentId: string,
  ): Promise<RedactedShareToken[]> {
    await this.assertAgentOwned(accountId, agentId);
    const rows = await this.prisma.agentShareToken.findMany({
      where: { agent_id: agentId },
      orderBy: { created_at: "asc" },
    });
    return rows.map(redact);
  }

  async create(
    accountId: string,
    agentId: string,
    input: {
      name: string;
      allowed_origins: string[];
      max_requests_per_day: number | null;
      max_spend_usd_per_day: number | null;
      cite_sources: boolean;
    },
  ): Promise<MintedShareTokenRow> {
    await this.assertAgentOwned(accountId, agentId);
    const { token, hash, display, network } = mintShareToken();

    // The dashboard accepts dollars; we store micros to keep the cap
    // ledger precise at sub-cent resolution.
    const maxSpendUsdMicros =
      input.max_spend_usd_per_day === null
        ? null
        : BigInt(Math.round(input.max_spend_usd_per_day * 1_000_000));

    const row = await this.prisma.agentShareToken.create({
      data: {
        agent_id: agentId,
        name: input.name,
        token_hash: hash,
        token_prefix: display,
        network,
        allowed_origins: input.allowed_origins,
        max_requests_per_day: input.max_requests_per_day,
        max_spend_usd_micros_per_day: maxSpendUsdMicros,
        cite_sources: input.cite_sources,
      },
    });

    return {
      share_token: redact(row),
      token,
      network,
      WARNING:
        "The `token` field is shown only once. Store it in the snippet you paste on your site — it cannot be retrieved later.",
    };
  }

  async update(
    accountId: string,
    tokenId: string,
    input: {
      name?: string | undefined;
      allowed_origins?: string[] | undefined;
      max_requests_per_day?: number | null | undefined;
      max_spend_usd_per_day?: number | null | undefined;
      cite_sources?: boolean | undefined;
    },
  ): Promise<RedactedShareToken> {
    const existing = await this.prisma.agentShareToken.findUnique({
      where: { id: tokenId },
      include: { agent: { include: { project: true } } },
    });
    if (!existing || existing.agent.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Share token not found");
    }
    if (existing.revoked_at) {
      // Refuse to mutate a revoked token — revoke is terminal; the user
      // mints a new one. Surface a friendly error rather than silently
      // dropping the edit.
      throw new ControlPlaneError(
        "Conflict",
        "Cannot edit a revoked share token. Mint a new one instead.",
      );
    }
    const updated = await this.prisma.agentShareToken.update({
      where: { id: tokenId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.allowed_origins !== undefined
          ? { allowed_origins: input.allowed_origins }
          : {}),
        ...(input.max_requests_per_day !== undefined
          ? { max_requests_per_day: input.max_requests_per_day }
          : {}),
        ...(input.max_spend_usd_per_day !== undefined
          ? {
              max_spend_usd_micros_per_day:
                input.max_spend_usd_per_day === null
                  ? null
                  : BigInt(Math.round(input.max_spend_usd_per_day * 1_000_000)),
            }
          : {}),
        ...(input.cite_sources !== undefined
          ? { cite_sources: input.cite_sources }
          : {}),
      },
    });
    return redact(updated);
  }

  async revoke(accountId: string, tokenId: string): Promise<RedactedShareToken> {
    const existing = await this.prisma.agentShareToken.findUnique({
      where: { id: tokenId },
      include: { agent: { include: { project: true } } },
    });
    if (!existing || existing.agent.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Share token not found");
    }
    if (existing.revoked_at) return redact(existing);
    const updated = await this.prisma.agentShareToken.update({
      where: { id: tokenId },
      data: { revoked_at: new Date() },
    });
    return redact(updated);
  }
}
