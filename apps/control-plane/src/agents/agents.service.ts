import { Injectable, Logger } from "@nestjs/common";
import type { KraterionAgent } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { DEFAULT_CHAT_MODEL_ID, isKnownChatModel } from "@kraterion/shared";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { SuiClientService } from "../sui/sui-client.service.js";
import type { AgentJson, CreateAgentDto, UpdateAgentDto } from "./dto.js";
import { AgentToolRegistry } from "./tools/registry.js";

/** Per-bucket on-chain grant status for an agent. */
export interface AgentBucketGrant {
  bucket_id: string;
  bucket_name: string;
  granted_on_chain: boolean;
  kraterion_bucket_object_id: string;
}

function redact(
  row: KraterionAgent & {
    sub_wallet: { sui_address: string };
    buckets: { bucket_id: string }[];
    tools: { tool_name: string }[];
  },
): AgentJson {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    system_prompt: row.system_prompt,
    model: row.model,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    top_k: row.top_k,
    status: row.status as "active" | "revoked",
    sub_wallet_address: row.sub_wallet.sui_address,
    bucket_ids: row.buckets.map((b) => b.bucket_id),
    tools: row.tools.map((t) => t.tool_name),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    revoked_at: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

const AGENT_INCLUDE = {
  sub_wallet: { select: { sui_address: true } as const },
  buckets: { select: { bucket_id: true } as const },
  tools: { select: { tool_name: true } as const },
} as const;

/**
 * Authoritative writer for `KraterionAgent`. Owns sub-wallet
 * provisioning at create time, bucket-attachment validation, and the
 * revoke status flip.
 *
 * On-chain note: every agent is *provisioned* with a sub-wallet (Sui
 * keypair, seed KMS-wrapped) at create time, but the on-chain
 * `grant_api_access(bucket, agent_addr)` call is **not auto-fired**.
 * The user explicitly fires the sponsored grant tx per bucket via the
 * dashboard once the agent is ready. Revoke today is a DB-only flag
 * flip; the chat endpoint refuses on-status. Plugging the on-chain
 * revoke in is a follow-up tracked in decisions.md (2026-05-13 P3 entry).
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly buckets: BucketsService,
    private readonly wrapping: KeyWrappingService,
    private readonly sui: SuiClientService,
    private readonly toolRegistry: AgentToolRegistry,
  ) {}

  /** Reject unknown tool names against the server-side registry. The
   *  dashboard catalog and the registry stay in sync via convention;
   *  this is the runtime gate. */
  private validateToolNames(names: readonly string[]): void {
    for (const name of names) {
      if (!this.toolRegistry.knownNames.has(name)) {
        throw new ControlPlaneError(
          "InvalidArgument",
          `Unknown tool "${name}".`,
          { tool: name },
        );
      }
    }
  }

  async listForProject(accountId: string, projectId: string): Promise<AgentJson[]> {
    await this.projects.getOwned(accountId, projectId);
    const rows = await this.prisma.kraterionAgent.findMany({
      where: { project_id: projectId },
      include: AGENT_INCLUDE,
      orderBy: [{ created_at: "asc" }],
    });
    return rows.map(redact);
  }

  async getOwned(accountId: string, agentId: string): Promise<AgentJson> {
    const row = await this.fetchOwned(accountId, agentId);
    return redact(row);
  }

  /**
   * Internal getter that returns the full Prisma row (needed by the
   * chat endpoint to read system_prompt + sampling defaults). Throws
   * NotFound for foreign agents (don't leak existence).
   */
  async getOwnedRow(accountId: string, agentId: string) {
    return this.fetchOwned(accountId, agentId);
  }

  /**
   * P6 — fetch an agent by id without the account-ownership check,
   * surfacing the owning account_id so the chat handler can drive
   * knowledge retrieval (which is account-scoped at the service
   * layer).
   *
   * The share token is proof of authority — it was minted against
   * exactly this agent — so re-checking account ownership here would
   * be redundant (and impossible: share-token principals carry no
   * accountId). The return shape matches `fetchOwned` plus an extra
   * `account_id` field; the chat handler reads it via the returned
   * row, not via the principal.
   */
  async getByIdForShareToken(agentId: string) {
    const row = await this.prisma.kraterionAgent.findUnique({
      where: { id: agentId },
      include: {
        ...AGENT_INCLUDE,
        project: { select: { account_id: true } },
      },
    });
    if (!row) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }
    const { project, ...rest } = row;
    return { ...rest, account_id: project.account_id };
  }

  async create(
    accountId: string,
    projectId: string,
    dto: CreateAgentDto,
  ): Promise<AgentJson> {
    await this.projects.getOwned(accountId, projectId);

    if (!isKnownChatModel(dto.model)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Chat model "${dto.model}" isn't available.`,
        { model: dto.model },
      );
    }

    // Validate every attached bucket belongs to the same project AND
    // isn't soft-deleted. `BucketsService.getOwned` enforces both
    // (project ownership via account_id; deleted_at via the guard we
    // added in the P3 cleanup round).
    for (const bucketId of dto.bucket_ids) {
      const bucket = await this.buckets.getOwned(accountId, bucketId);
      if (bucket.project_id !== projectId) {
        throw new ControlPlaneError(
          "InvalidArgument",
          "Bucket belongs to a different project.",
          { bucket_id: bucketId },
        );
      }
    }

    // Validate enabled tools against the server-side registry.
    this.validateToolNames(dto.tools);

    // Provision sub-wallet. Same pattern bootstrap-gateway uses for
    // `knowledge_indexer`: Ed25519 keypair, raw 32-byte seed wrapped
    // via the KMS wrapper, stored alongside the Sui address. Sanity
    // round-trip the wrap to catch encryption bugs early.
    const keypair = Ed25519Keypair.generate();
    const address = keypair.toSuiAddress();
    const { secretKey: seedBytes } = decodeSuiPrivateKey(
      keypair.getSecretKey(),
    );
    if (seedBytes.length !== 32) {
      throw new Error(
        `Unexpected Sui seed length: ${seedBytes.length} (expected 32)`,
      );
    }
    const wrapped = this.wrapping.wrap(seedBytes);
    const roundTrip = Ed25519Keypair.fromSecretKey(
      this.wrapping.unwrap(wrapped),
    );
    if (roundTrip.toSuiAddress() !== address) {
      throw new Error("Wrapped agent seed round-trip produced a different address.");
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const subWallet = await tx.subWallet.create({
          data: {
            sui_address: address,
            mnemonic_wrapped: wrapped,
            role: "agent",
            account_id: null,
          },
        });
        return tx.kraterionAgent.create({
          data: {
            project_id: projectId,
            name: dto.name,
            description: dto.description ?? null,
            system_prompt: dto.system_prompt,
            model: dto.model,
            temperature: dto.temperature ?? 0.2,
            max_tokens: dto.max_tokens ?? 1024,
            top_k: dto.top_k ?? 8,
            sub_wallet_id: subWallet.id,
            buckets: {
              create: dto.bucket_ids.map((bucket_id) => ({ bucket_id })),
            },
            tools: {
              create: dto.tools.map((tool_name) => ({ tool_name })),
            },
          },
          include: AGENT_INCLUDE,
        });
      });
      this.logger.log(
        `agent created: id=${row.id} project=${projectId} name="${row.name}" addr=${address}`,
      );
      return redact(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw new ControlPlaneError(
            "Conflict",
            "An agent with that name already exists in this project.",
            { name: dto.name },
          );
        }
      }
      throw err;
    }
  }

  async update(
    accountId: string,
    agentId: string,
    dto: UpdateAgentDto,
  ): Promise<AgentJson> {
    const existing = await this.fetchOwned(accountId, agentId);

    if (dto.model !== undefined && !isKnownChatModel(dto.model)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Chat model "${dto.model}" isn't available.`,
        { model: dto.model },
      );
    }
    if (dto.bucket_ids) {
      for (const bucketId of dto.bucket_ids) {
        const bucket = await this.buckets.getOwned(accountId, bucketId);
        if (bucket.project_id !== existing.project_id) {
          throw new ControlPlaneError(
            "InvalidArgument",
            "Bucket belongs to a different project.",
            { bucket_id: bucketId },
          );
        }
      }
    }

    if (dto.tools) {
      this.validateToolNames(dto.tools);
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.bucket_ids) {
          // Wholesale replace the AgentBucket list. Simpler than
          // diffing; the dashboard always sends the full desired set.
          await tx.agentBucket.deleteMany({ where: { agent_id: agentId } });
          if (dto.bucket_ids.length > 0) {
            await tx.agentBucket.createMany({
              data: dto.bucket_ids.map((bucket_id) => ({
                agent_id: agentId,
                bucket_id,
              })),
            });
          }
        }
        if (dto.tools) {
          // Same wholesale-replace pattern. Disabling a tool is a single
          // delete; the model will stop being told about it on the next
          // chat turn.
          await tx.agentTool.deleteMany({ where: { agent_id: agentId } });
          if (dto.tools.length > 0) {
            await tx.agentTool.createMany({
              data: dto.tools.map((tool_name) => ({
                agent_id: agentId,
                tool_name,
              })),
            });
          }
        }
        return tx.kraterionAgent.update({
          where: { id: agentId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description }
              : {}),
            ...(dto.system_prompt !== undefined
              ? { system_prompt: dto.system_prompt }
              : {}),
            ...(dto.model !== undefined ? { model: dto.model } : {}),
            ...(dto.temperature !== undefined
              ? { temperature: dto.temperature }
              : {}),
            ...(dto.max_tokens !== undefined
              ? { max_tokens: dto.max_tokens }
              : {}),
            ...(dto.top_k !== undefined ? { top_k: dto.top_k } : {}),
          },
          include: AGENT_INCLUDE,
        });
      });
      return redact(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ControlPlaneError(
          "Conflict",
          "An agent with that name already exists in this project.",
        );
      }
      throw err;
    }
  }

  async revoke(accountId: string, agentId: string): Promise<AgentJson> {
    const existing = await this.fetchOwned(accountId, agentId);
    if (existing.status === "revoked") {
      return redact(existing);
    }
    const updated = await this.prisma.kraterionAgent.update({
      where: { id: agentId },
      data: { status: "revoked", revoked_at: new Date() },
      include: AGENT_INCLUDE,
    });
    this.logger.log(`agent revoked: id=${agentId}`);
    return redact(updated);
  }

  /**
   * Query the on-chain `api_decryption_addresses` list for each
   * attached bucket and report whether the agent's sub-wallet is on
   * it. One Sui RPC call per bucket — the dashboard's Connect tab
   * pages this lazily, and TanStack staleTime gives a free cache.
   *
   * Falls back to `granted_on_chain: false` if a single bucket's
   * lookup fails (network blip, unreadable object) — the user can
   * always re-grant idempotently, so a false negative just means an
   * extra prompt, not a broken state.
   */
  async listGrants(
    accountId: string,
    agentId: string,
  ): Promise<AgentBucketGrant[]> {
    const agent = await this.fetchOwned(accountId, agentId);
    if (agent.buckets.length === 0) return [];
    const bucketRows = await this.prisma.bucket.findMany({
      where: {
        id: { in: agent.buckets.map((b) => b.bucket_id) },
      },
      select: {
        id: true,
        name: true,
        kraterion_bucket_object_id: true,
      },
    });
    const targetAddr = agent.sub_wallet.sui_address.toLowerCase();
    const results: AgentBucketGrant[] = [];
    for (const b of bucketRows) {
      let granted = false;
      try {
        const { object } = await this.sui.get().core.getObject({
          objectId: b.kraterion_bucket_object_id,
          include: { json: true },
        });
        const fields = object.json;
        const list = fields?.["api_decryption_addresses"];
        if (Array.isArray(list)) {
          granted = list.some(
            (a) => typeof a === "string" && a.toLowerCase() === targetAddr,
          );
        }
      } catch {
        // leave granted=false; UI shows "Grant" which is idempotent
      }
      results.push({
        bucket_id: b.id,
        bucket_name: b.name,
        granted_on_chain: granted,
        kraterion_bucket_object_id: b.kraterion_bucket_object_id,
      });
    }
    return results;
  }

  async remove(accountId: string, agentId: string): Promise<void> {
    const existing = await this.fetchOwned(accountId, agentId);
    // Cascading delete handles AgentBucket + AgentInvocation rows.
    // The SubWallet is intentionally left behind for audit — its
    // role='agent' row stays in place, just without the FK from
    // KraterionAgent.
    await this.prisma.kraterionAgent.delete({ where: { id: existing.id } });
    this.logger.log(`agent deleted: id=${agentId}`);
  }

  private async fetchOwned(accountId: string, agentId: string) {
    const row = await this.prisma.kraterionAgent.findUnique({
      where: { id: agentId },
      include: {
        ...AGENT_INCLUDE,
        project: { select: { account_id: true } },
      },
    });
    if (!row || row.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }
    const { project: _project, ...rest } = row;
    void _project;
    return rest;
  }
}
