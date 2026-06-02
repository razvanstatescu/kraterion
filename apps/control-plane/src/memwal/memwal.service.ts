import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { MemWal } from "@mysten-incubation/memwal";
import type {
  RememberResult,
  RecallResult,
} from "@mysten-incubation/memwal";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * P9 Feature 3 — MemWal-as-tool.
 *
 * One MemWal account per Kraterion deployment. Per-agent isolation is
 * achieved via namespace (`agent:<agent_id>`) — the SDK binds a
 * namespace at construction time, so we keep one `MemWal` client per
 * agent in a process-local cache.
 *
 * Boot behaviour:
 *  - Credentials missing → service starts, logs a warning, every tool
 *    call throws `PreconditionFailed`. The deployment stays alive and
 *    every other agent surface works.
 *  - Credentials present → first call per agent constructs a client
 *    lazily; subsequent calls reuse it.
 */
@Injectable()
export class MemwalService implements OnModuleDestroy {
  private readonly logger = new Logger(MemwalService.name);
  private readonly accountId: string | null;
  private readonly delegateKey: string | null;
  private readonly serverUrl: string | undefined;
  private readonly clients = new Map<string, MemWal>();

  constructor() {
    this.accountId = (process.env["MEMWAL_ACCOUNT_ID"] ?? "").trim() || null;
    this.delegateKey =
      (process.env["MEMWAL_DELEGATE_KEY"] ?? "").trim() || null;
    const url = (process.env["MEMWAL_SERVER_URL"] ?? "").trim();
    this.serverUrl = url || undefined;

    if (this.isConfigured()) {
      this.logger.log(
        `MemwalService configured (account=${shortId(this.accountId!)}, ` +
          `server=${this.serverUrl ?? "https://relayer.memwal.ai (default)"})`,
      );
    } else {
      this.logger.warn(
        "MemwalService is NOT configured — set MEMWAL_ACCOUNT_ID and " +
          "MEMWAL_DELEGATE_KEY to enable the memory.remember / memory.recall " +
          "tools. Tools will fail closed with PreconditionFailed.",
      );
    }
  }

  /** True if both required env vars are present. Tools call this before
   *  attempting any work so the error message stays user-facing rather
   *  than leaking SDK internals. */
  isConfigured(): boolean {
    return this.accountId !== null && this.delegateKey !== null;
  }

  /** Persist a fact in the agent's namespace and wait until the
   *  underlying Walrus write has settled. Synchronous (`rememberAndWait`)
   *  on purpose — we want the tool_call's `output` to include the
   *  `blob_id` so the lineage graph shows a complete receipt. */
  async remember(agentId: string, content: string): Promise<RememberResult> {
    const client = this.clientFor(agentId);
    return client.rememberAndWait(content);
  }

  /** Retrieve top-K memories matching a semantic query. */
  async recall(
    agentId: string,
    query: string,
    topK: number,
  ): Promise<RecallResult> {
    const client = this.clientFor(agentId);
    return client.recall({ query, limit: topK });
  }

  /** Namespace used for a given agent. Exposed so the tool handlers can
   *  echo it back in the structured output (lineage detail panel). */
  namespaceFor(agentId: string): string {
    return `agent:${agentId}`;
  }

  private clientFor(agentId: string): MemWal {
    if (!this.isConfigured()) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Memory is not configured for this deployment.",
      );
    }
    let client = this.clients.get(agentId);
    if (!client) {
      client = MemWal.create({
        key: this.delegateKey!,
        accountId: this.accountId!,
        namespace: this.namespaceFor(agentId),
        ...(this.serverUrl ? { serverUrl: this.serverUrl } : {}),
      });
      this.clients.set(agentId, client);
    }
    return client;
  }

  /** NestJS shutdown hook — wipe key material from every cached client. */
  onModuleDestroy(): void {
    for (const client of this.clients.values()) {
      try {
        client.destroy();
      } catch {
        // best-effort cleanup; don't crash shutdown
      }
    }
    this.clients.clear();
  }
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}
