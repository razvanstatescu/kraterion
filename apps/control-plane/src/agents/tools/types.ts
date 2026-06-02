import type { z } from "zod";
import type { BucketsService } from "../../buckets/buckets.service.js";
import type { KnowledgeService } from "../../knowledge/knowledge.service.js";
import type { MemwalService } from "../../memwal/memwal.service.js";
import type { PresignService } from "../../objects/presign.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

/**
 * Shared agent + MCP tool framework. Each `ToolDef` describes one
 * built-in tool: its name (what the model sees), its argument schema
 * (Zod), a one-liner description (also rendered in the dashboard's
 * Tools step), and a pure-ish handler that takes a `ToolContext`.
 *
 * The same registry serves two callers:
 *   - The agent chat endpoint (`/v1/agents/:id/chat/completions`) when
 *     the user has enabled tools on the agent.
 *   - The MCP server, where `tools/list` enumerates the registry and
 *     `tools/call` dispatches through it.
 *
 * `read` vs `write` drives the dashboard badge and triggers the
 * on-chain receipt poll (only writes mint Move txs).
 */
export type ToolKind = "read" | "write";

export interface ToolContext {
  prisma: PrismaService;
  buckets: BucketsService;
  knowledge: KnowledgeService;
  presign: PresignService;
  memwal: MemwalService;
  /** Agent id behind the chat invocation — required by the memory tools
   *  (each agent has its own MemWal namespace). MCP callers pass the
   *  empty string; memory tools refuse to run without an agent id. */
  agentId: string;
  /** Account id behind the request (project owner). */
  accountId: string;
  /** Project scope. Bearer tokens are project-scoped at the principal
   *  level; tools should never look outside this project. */
  projectId: string;
  /** Optional bearer/API key id for audit (KnowledgeQuery.api_key_id). */
  apiKeyId?: string | null;
  /** Optional invocation id when the caller is an agent chat completion
   *  — the registry writes an `AgentToolCall` row when set. The MCP
   *  caller leaves this undefined; MCP keeps its own KnowledgeQuery
   *  audit. */
  invocationId?: string | null;
}

export interface ToolResult {
  /** Text fed back to the model (the `role: "tool"` message content).
   *  Structured payloads are JSON-stringified. */
  text: string;
  /** Captured into `AgentToolCall.output_json` for the dashboard. */
  structured?: Record<string, unknown>;
  /** On-chain Move tx digest (writes only). */
  txDigest?: string;
  /** Walrus content-addressed id (writes only). */
  walrusBlobId?: string;
  /** Sui object id of the PooledBlob inside the project's storage pool
   *  (writes only). Renamed from `sharedBlobObjectId` at the
   *  storage-pool migration cutover. */
  pooledBlobObjectId?: string;
}

export interface ToolDef<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Exposed verbatim to OpenAI (`tools[].function.name`) and stored
   *  in `AgentTool.tool_name`. Match the existing MCP names so we
   *  share metadata + handlers across both surfaces. */
  name: string;
  /** Short human-readable label for the dashboard Tools step. */
  label: string;
  /** Sentence-case description fed to the model + shown to the user. */
  description: string;
  /** Drives the dashboard badge and the on-chain-receipt audit poll. */
  kind: ToolKind;
  /** Zod schema for arguments — validated at the boundary. */
  args: Schema;
  /** JSON Schema for the OpenAI `tools[].function.parameters` field.
   *  Hand-written (rather than auto-derived from `args`) so we don't
   *  take on a new dependency. The two must stay in sync — the Zod
   *  schema is the runtime gate, the JSON Schema is what the model
   *  sees. Typed as `Record<string, unknown>` because OpenAI's
   *  `FunctionParameters` is an indexed type. */
  parameters: Record<string, unknown>;
  /** Handler — pure-ish. Argument validation has already run. */
  execute: (args: z.infer<Schema>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Helper to stringify structured payloads consistently. */
export function jsonText(payload: unknown): string {
  return JSON.stringify(payload, bigintReplacer, 2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bigintReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}
