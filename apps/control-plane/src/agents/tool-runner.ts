import type OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AgentToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";

/**
 * Hard cap on the number of `(LLM-turn → tools)` rounds inside a
 * single chat invocation. Past this we bail with status=failed so a
 * misbehaving model can't burn provider credits in an infinite loop.
 *
 * 5 is generous for the demo arc ("search → read → write" = 3 rounds)
 * and well short of the OpenAI safety guidance (~10).
 */
export const MAX_TOOL_ROUNDS = 5;

/**
 * Telemetry envelope for the `kraterion.tool_call` SSE extension frame.
 * Stock OpenAI SDKs ignore unknown `object`s; the dashboard reads it
 * to render the inline "Tools used" card.
 */
export interface ToolCallFrame {
  object: "kraterion.tool_call";
  round: number;
  tool_call_id: string;
  tool_name: string;
  status: "pending" | "completed" | "failed";
  arguments: unknown;
  output?: string;
  output_json?: Record<string, unknown>;
  tx_digest?: string;
  walrus_blob_id?: string;
  shared_blob_object_id?: string;
  error_detail?: string;
  latency_ms?: number;
}

/**
 * Streaming-delta accumulator for OpenAI `tool_calls`. The model emits
 * `id` + `name` in the first delta and appends to `arguments` across
 * subsequent chunks; we buffer by `index` (OpenAI's per-message index)
 * because not every chunk carries `id`.
 */
export interface PartialToolCall {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
}

export function accumulateToolCallDeltas(
  buf: Map<number, PartialToolCall>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deltas: any[] | undefined,
): void {
  if (!deltas) return;
  for (const d of deltas) {
    const idx: number = d.index ?? 0;
    const existing: PartialToolCall = buf.get(idx) ?? {
      index: idx,
      arguments: "",
    };
    if (d.id) existing.id = d.id;
    if (d.function?.name) existing.name = d.function.name;
    if (d.function?.arguments) existing.arguments += d.function.arguments;
    buf.set(idx, existing);
  }
}

export interface ExecutedToolCall {
  /** The OpenAI `tool` message to append to the conversation. */
  message: OpenAI.ChatCompletionToolMessageParam;
  /** Telemetry payload for the SSE frame and the audit row. */
  frame: ToolCallFrame;
}

/**
 * Validate args, execute the handler, persist an `AgentToolCall` row.
 * Returns the `role: "tool"` message to feed back to OpenAI and a
 * `ToolCallFrame` to surface over SSE.
 *
 * Errors are caught and translated into a `failed` frame + an
 * `Error: …` tool message. The model gets the error text and can
 * retry with corrected arguments (OpenAI's documented recovery
 * pattern).
 */
export async function executeToolCall(args: {
  registry: AgentToolRegistry;
  prisma: PrismaService;
  ctx: ToolContext;
  invocationId: string;
  round: number;
  toolCallId: string;
  toolName: string;
  rawArguments: string;
}): Promise<ExecutedToolCall> {
  const { registry, prisma, ctx, invocationId, round, toolCallId, toolName, rawArguments } = args;
  const startedAt = Date.now();

  // Persist the pending row up-front. If execution crashes we still
  // have the audit trail.
  await prisma.agentToolCall.create({
    data: {
      invocation_id: invocationId,
      tool_call_id: toolCallId,
      tool_name: toolName,
      status: "pending",
      round,
      arguments: rawArguments.slice(0, 64 * 1024),
    },
  });

  let parsed: unknown;
  try {
    parsed = rawArguments.length === 0 ? {} : JSON.parse(rawArguments);
  } catch (err) {
    return failTool(prisma, invocationId, toolCallId, toolName, round, rawArguments, startedAt, {
      detail: `Invalid JSON arguments: ${(err as Error).message}`,
    });
  }

  try {
    const result = await registry.execute(toolName, parsed, ctx);
    const latencyMs = Date.now() - startedAt;
    await prisma.agentToolCall.update({
      where: { invocation_id_tool_call_id: { invocation_id: invocationId, tool_call_id: toolCallId } },
      data: {
        status: "completed",
        output: result.text.slice(0, 64 * 1024),
        ...(result.structured
          ? { output_json: result.structured as Prisma.InputJsonValue }
          : {}),
        ...(result.txDigest ? { tx_digest: result.txDigest } : {}),
        ...(result.walrusBlobId ? { walrus_blob_id: result.walrusBlobId } : {}),
        ...(result.sharedBlobObjectId
          ? { shared_blob_object_id: result.sharedBlobObjectId }
          : {}),
        latency_ms: latencyMs,
        finished_at: new Date(),
      },
    });
    return {
      message: {
        role: "tool",
        tool_call_id: toolCallId,
        content: result.text,
      },
      frame: {
        object: "kraterion.tool_call",
        round,
        tool_call_id: toolCallId,
        tool_name: toolName,
        status: "completed",
        arguments: parsed,
        output: result.text,
        ...(result.structured ? { output_json: result.structured } : {}),
        ...(result.txDigest ? { tx_digest: result.txDigest } : {}),
        ...(result.walrusBlobId ? { walrus_blob_id: result.walrusBlobId } : {}),
        ...(result.sharedBlobObjectId
          ? { shared_blob_object_id: result.sharedBlobObjectId }
          : {}),
        latency_ms: latencyMs,
      },
    };
  } catch (err) {
    const detail =
      err instanceof ControlPlaneError
        ? err.userMessage
        : err instanceof Error
          ? err.message
          : String(err);
    return failTool(prisma, invocationId, toolCallId, toolName, round, rawArguments, startedAt, {
      detail,
    });
  }
}

async function failTool(
  prisma: PrismaService,
  invocationId: string,
  toolCallId: string,
  toolName: string,
  round: number,
  rawArguments: string,
  startedAt: number,
  opts: { detail: string },
): Promise<ExecutedToolCall> {
  const latencyMs = Date.now() - startedAt;
  await prisma.agentToolCall.update({
    where: { invocation_id_tool_call_id: { invocation_id: invocationId, tool_call_id: toolCallId } },
    data: {
      status: "failed",
      error_detail: opts.detail.slice(0, 1024),
      latency_ms: latencyMs,
      finished_at: new Date(),
    },
  });
  return {
    message: {
      role: "tool",
      tool_call_id: toolCallId,
      // Feed the error back to the model so it can self-correct on the
      // next round (e.g. fix the arguments and retry).
      content: `Error: ${opts.detail}`,
    },
    frame: {
      object: "kraterion.tool_call",
      round,
      tool_call_id: toolCallId,
      tool_name: toolName,
      status: "failed",
      arguments: safeParse(rawArguments),
      error_detail: opts.detail,
      latency_ms: latencyMs,
    },
  };
}

function safeParse(raw: string): unknown {
  try {
    return raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return raw;
  }
}
