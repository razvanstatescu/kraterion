import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { DEFAULT_CHAT_MODEL_ID, isKnownChatModel } from "@kraterion/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { requirePrincipal } from "../auth/request-context.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProviderCredentialService } from "../providers/provider-credential.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import { AgentsService } from "./agents.service.js";
import { answerWithAgent, resolveCitations, streamWithAgent } from "./answer.js";
import {
  chatCompletionsSchema,
  createAgentSchema,
  updateAgentSchema,
  type ChatCompletionsDto,
  type CreateAgentDto,
  type UpdateAgentDto,
} from "./dto.js";
import { AgentToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import {
  accumulateToolCallDeltas,
  executeToolCall,
  MAX_TOOL_ROUNDS,
  type PartialToolCall,
  type ToolCallFrame,
} from "./tool-runner.js";
import type OpenAI from "openai";
import { PresignService } from "../objects/presign.service.js";

/**
 * Agents resource: CRUD + the OpenAI Chat-Completions-compatible
 * `/chat/completions` endpoint.
 *
 * Auth: every endpoint sits behind the standard session `AuthGuard`
 * for the hackathon submission. API-key and OAuth principals on the
 * chat endpoint are pencilled as a post-submission follow-up — the
 * existing MCP guard pattern carries over once we're ready.
 *
 * The chat endpoint speaks the OpenAI wire shape so consumers can
 * point the OpenAI SDK at `base_url=/v1/agents/{id}` with no other
 * change. Kraterion-specific fields (retrieval info, citations) live
 * under a `kraterion` extension that stock SDKs ignore.
 */
@Controller("v1")
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly buckets: BucketsService,
    private readonly knowledge: KnowledgeService,
    private readonly credentials: ProviderCredentialService,
    private readonly prisma: PrismaService,
    private readonly toolRegistry: AgentToolRegistry,
    private readonly presign: PresignService,
  ) {}

  /** Build a ToolContext for the current chat invocation. Pure object —
   *  no DI hops at call time. */
  private toolContext(args: {
    accountId: string;
    projectId: string;
    apiKeyId?: string | null;
    invocationId: string;
  }): ToolContext {
    return {
      prisma: this.prisma,
      buckets: this.buckets,
      knowledge: this.knowledge,
      presign: this.presign,
      accountId: args.accountId,
      projectId: args.projectId,
      apiKeyId: args.apiKeyId ?? null,
      invocationId: args.invocationId,
    };
  }

  @Get("agents")
  async list(@Req() req: FastifyRequest, @Query("project_id") projectId: string) {
    const user = requirePrincipal(req);
    if (!projectId) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "project_id query parameter is required.",
      );
    }
    const agents = await this.agents.listForProject(user.accountId, projectId);
    return { agents };
  }

  @Post("projects/:projectId/agents")
  async create(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Body(parseBody(createAgentSchema)) dto: CreateAgentDto,
  ) {
    const user = requirePrincipal(req);
    const agent = await this.agents.create(user.accountId, projectId, dto);
    return { agent };
  }

  @Get("agents/:agentId")
  async read(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requirePrincipal(req);
    const agent = await this.agents.getOwned(user.accountId, agentId);
    return { agent };
  }

  @Patch("agents/:agentId")
  async update(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
    @Body(parseBody(updateAgentSchema)) dto: UpdateAgentDto,
  ) {
    const user = requirePrincipal(req);
    const agent = await this.agents.update(user.accountId, agentId, dto);
    return { agent };
  }

  @Post("agents/:agentId/revoke")
  async revoke(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requirePrincipal(req);
    const agent = await this.agents.revoke(user.accountId, agentId);
    return { agent };
  }

  /**
   * Per-bucket on-chain grant status for the agent's sub-wallet.
   * The dashboard's Connect tab calls this to know which attached
   * buckets need a `prepare-grant-agent` tx fired vs. already done.
   */
  @Get("agents/:agentId/grants")
  async grants(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requirePrincipal(req);
    const grants = await this.agents.listGrants(user.accountId, agentId);
    return { grants };
  }

  @Delete("agents/:agentId")
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requirePrincipal(req);
    await this.agents.remove(user.accountId, agentId);
  }

  /**
   * OpenAI Chat Completions-compatible endpoint. When `stream: true`,
   * responds with SSE chunks in the standard OpenAI shape; the
   * Kraterion citation block follows as a final non-standard event
   * before `data: [DONE]`.
   */
  @Post("agents/:agentId/chat/completions")
  async chat(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
    @Param("agentId") agentId: string,
    @Body(parseBody(chatCompletionsSchema)) dto: ChatCompletionsDto,
  ) {
    const user = requirePrincipal(req);
    const agent = await this.agents.getOwnedRow(user.accountId, agentId);

    // Bearer tokens are project-scoped — refuse cross-project use even
    // when the underlying account owns both projects. Session principals
    // are account-scoped and pass through.
    if (user.kind === "api_key" && user.projectId !== agent.project_id) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }

    if (agent.status !== "active") {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Agent is revoked. Restore the agent or create a new one.",
        { agent_id: agentId, status: agent.status },
      );
    }

    // Multi-turn: forward the full conversation history to the LLM.
    // The schema already restricts roles to `user | assistant` and
    // bans `system` (server owns the system prompt). We additionally
    // require:
    //   - at least one message
    //   - the LAST message is from the user (the agent answers it)
    // Retrieval is run against the last user message only; using the
    // whole history for retrieval needs query rewriting (see
    // `docs/progress.md` "multi-turn known issues").
    if (dto.messages.length === 0) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "messages must include at least one user message.",
      );
    }
    const lastMessage = dto.messages[dto.messages.length - 1]!;
    if (lastMessage.role !== "user") {
      throw new ControlPlaneError(
        "InvalidArgument",
        "The last message must be from the user.",
      );
    }
    const input = lastMessage.content;
    const conversationHistory = dto.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Per-request model override > agent default. Validated.
    const requestedModel = dto.model ?? agent.model;
    if (!isKnownChatModel(requestedModel)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Chat model "${requestedModel}" isn't available.`,
        { model: requestedModel },
      );
    }
    const temperature = dto.temperature ?? agent.temperature;
    const maxTokens = dto.max_tokens ?? agent.max_tokens;

    // Audit row up-front so credential / provider failures still
    // produce a trace. The row starts `pending`; we patch it to
    // 'completed' or 'failed' before returning / on error.
    //
    // Auth-method bookkeeping:
    //   - session → user_id = accountId, api_key_id = null
    //   - bearer  → api_key_id = the token's row id, user_id = null
    const invocation = await this.prisma.agentInvocation.create({
      data: {
        agent_id: agent.id,
        project_id: agent.project_id,
        user_id: user.kind === "session" ? user.accountId : null,
        api_key_id: user.kind === "api_key" ? user.apiKeyId : null,
        input,
        model: requestedModel,
        bucket_ids: agent.buckets.map((b) => b.bucket_id),
      },
    });

    const wallStart = Date.now();

    try {
      // === Retrieval ===
      // Run retrieval across every attached bucket; merge hits by
      // rrf_score (then truncate to agent.top_k). Buckets the user no
      // longer owns or that have been disabled fall out via
      // KnowledgeService.search's existing guards (PreconditionFailed
      // bubbles to the catch below).
      const retrievalStart = Date.now();
      const allHits: Awaited<ReturnType<KnowledgeService["search"]>>["hits"] = [];
      const retrievalErrors: string[] = [];
      const bucketIds = agent.buckets.map((b) => b.bucket_id);
      for (const bucketId of bucketIds) {
        try {
          const res = await this.knowledge.search({
            accountId: user.accountId,
            bucketId,
            query: input,
            topK: agent.top_k,
            efSearch: 96,
          });
          allHits.push(...res.hits);
        } catch (err) {
          if (err instanceof ControlPlaneError) {
            retrievalErrors.push(`${bucketId}: ${err.userMessage}`);
            continue;
          }
          throw err;
        }
      }
      // Re-rank merged hits by rrf_score (best from each bucket bubbles
      // up), then keep the agent's top_k. A future P2 reranker stage
      // slots in here.
      allHits.sort((a, b) => b.rrf_score - a.rrf_score);
      const topHits = allHits.slice(0, agent.top_k);
      const retrievalLatencyMs = Date.now() - retrievalStart;

      if (allHits.length === 0 && retrievalErrors.length > 0 && bucketIds.length > 0) {
        // Every bucket failed — this is a hard error, not "no hits".
        throw new ControlPlaneError(
          "PreconditionFailed",
          `Retrieval failed for every attached bucket: ${retrievalErrors.join("; ")}`,
        );
      }

      // === LLM ===
      const toolNames = agent.tools.map((t) => t.tool_name);
      const tools = this.toolRegistry.openAiToolsParam(toolNames);
      const toolCtx = this.toolContext({
        accountId: user.accountId,
        projectId: agent.project_id,
        apiKeyId: user.kind === "api_key" ? user.apiKeyId : null,
        invocationId: invocation.id,
      });

      if (dto.stream) {
        return await this.streamResponse({
          req,
          reply,
          agentId,
          invocationId: invocation.id,
          requestedModel,
          messages: conversationHistory,
          systemPrompt: agent.system_prompt,
          temperature,
          maxTokens,
          hits: topHits,
          bucketIds,
          retrievalLatencyMs,
          wallStart,
          includeRetrievalInfo: dto.include_retrieval_info,
          includeCitations: dto.include_citations,
          tools,
          toolCtx,
        });
      }

      // === Non-streaming tool-call loop ===
      const llmStart = Date.now();
      const extraMessages: OpenAI.ChatCompletionMessageParam[] = [];
      let finalAnswered: Awaited<ReturnType<typeof answerWithAgent>> | null = null;
      let toolRound = 0;
      while (true) {
        const answered = await this.credentials.useDecrypted(
          agent.project_id,
          "openai",
          (apiKey) =>
            answerWithAgent({
              apiKey,
              model: requestedModel,
              systemPrompt: agent.system_prompt,
              messages: conversationHistory,
              hits: topHits,
              temperature,
              maxTokens,
              ...(tools ? { tools, extraMessages } : { extraMessages }),
            }),
        );
        const choice = answered.completion.choices[0];
        const toolCalls = choice?.message?.tool_calls ?? [];
        if (
          !tools ||
          choice?.finish_reason !== "tool_calls" ||
          toolCalls.length === 0
        ) {
          finalAnswered = answered;
          break;
        }
        if (toolRound >= MAX_TOOL_ROUNDS) {
          throw new ControlPlaneError(
            "PreconditionFailed",
            `Exceeded the tool-call limit (${MAX_TOOL_ROUNDS} rounds).`,
          );
        }
        // Thread the assistant's tool_calls message + the tool results
        // back into the conversation for the next round.
        extraMessages.push({
          role: "assistant",
          content: choice.message.content ?? null,
          tool_calls: toolCalls,
        });
        for (const tc of toolCalls) {
          if (tc.type !== "function") continue;
          const executed = await executeToolCall({
            registry: this.toolRegistry,
            prisma: this.prisma,
            ctx: toolCtx,
            invocationId: invocation.id,
            round: toolRound,
            toolCallId: tc.id,
            toolName: tc.function.name,
            rawArguments: tc.function.arguments,
          });
          extraMessages.push(executed.message);
        }
        toolRound++;
      }

      const answered = finalAnswered!;
      const llmLatencyMs = Date.now() - llmStart;
      const wallMs = Date.now() - wallStart;

      // Patch the audit row to completed.
      await this.prisma.agentInvocation.update({
        where: { id: invocation.id },
        data: {
          status: "completed",
          output: answered.answer,
          prompt_tokens: answered.prompt_tokens,
          completion_tokens: answered.completion_tokens,
          retrieval_latency_ms: retrievalLatencyMs,
          llm_latency_ms: llmLatencyMs,
          latency_ms: wallMs,
          cited_hashes: answered.citations.map((c) =>
            Buffer.from(c.chunk_hash, "hex"),
          ),
          finished_at: new Date(),
        },
      });

      // Pull the audit children we just wrote so the response includes
      // the tool-call summary alongside citations.
      const toolCallRows = await this.prisma.agentToolCall.findMany({
        where: { invocation_id: invocation.id },
        orderBy: { created_at: "asc" },
      });

      const payload = this.buildOpenAiPayload({
        agentId,
        invocationId: invocation.id,
        requestedModel: answered.model,
        answer: answered.answer,
        promptTokens: answered.prompt_tokens,
        completionTokens: answered.completion_tokens,
        retrievalLatencyMs,
        llmLatencyMs,
        wallMs,
        hits: topHits,
        bucketIds,
        citations: answered.citations,
        includeRetrievalInfo: dto.include_retrieval_info,
        includeCitations: dto.include_citations,
        toolCalls: toolCallRows,
      });
      void reply.status(200).send(payload);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.agentInvocation
        .update({
          where: { id: invocation.id },
          data: {
            status: "failed",
            error_detail: message.slice(0, 1024),
            latency_ms: Date.now() - wallStart,
            finished_at: new Date(),
          },
        })
        .catch(() => {
          /* don't mask the original error if the patch fails */
        });
      throw err;
    }
  }

  private buildOpenAiPayload(args: {
    agentId: string;
    invocationId: string;
    requestedModel: string;
    answer: string;
    promptTokens: number;
    completionTokens: number;
    retrievalLatencyMs: number;
    llmLatencyMs: number;
    wallMs: number;
    hits: Awaited<ReturnType<KnowledgeService["search"]>>["hits"];
    bucketIds: string[];
    citations: Array<{ chunk_hash: string; s3_key: string; ordinal: number }>;
    includeRetrievalInfo: boolean;
    includeCitations: boolean;
    toolCalls?: Array<{
      tool_call_id: string;
      tool_name: string;
      status: string;
      round: number;
      arguments: string;
      output: string | null;
      output_json: unknown;
      tx_digest: string | null;
      walrus_blob_id: string | null;
      shared_blob_object_id: string | null;
      error_detail: string | null;
      latency_ms: number | null;
    }>;
  }) {
    const base = {
      id: `chatcmpl_kr_${args.invocationId}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: args.requestedModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: args.answer },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: args.promptTokens,
        completion_tokens: args.completionTokens,
        total_tokens: args.promptTokens + args.completionTokens,
      },
    };
    const kraterion: Record<string, unknown> = { agent_id: args.agentId };
    if (args.includeRetrievalInfo) {
      kraterion["retrieval"] = {
        bucket_ids: args.bucketIds,
        hit_count: args.hits.length,
        retrieval_latency_ms: args.retrievalLatencyMs,
        llm_latency_ms: args.llmLatencyMs,
        total_latency_ms: args.wallMs,
      };
    }
    if (args.includeCitations) {
      kraterion["citations"] = args.hits.map((h, i) => ({
        index: i + 1,
        chunk_hash: h.content_hash,
        s3_key: h.s3_key,
        ordinal: h.ordinal,
        bucket_id: h.bucket_id,
        source_walrus_blob_id: h.source_walrus_blob_id,
        source_shared_blob_object_id: h.source_shared_blob_object_id,
        manifest_walrus_blob_id: h.manifest_walrus_blob_id,
        cited: args.citations.some((c) => c.chunk_hash === h.content_hash),
      }));
    }
    if (args.toolCalls && args.toolCalls.length > 0) {
      kraterion["tool_calls"] = args.toolCalls.map((tc) => ({
        tool_call_id: tc.tool_call_id,
        tool_name: tc.tool_name,
        status: tc.status,
        round: tc.round,
        arguments: safeJson(tc.arguments),
        output: tc.output,
        output_json: tc.output_json,
        tx_digest: tc.tx_digest,
        walrus_blob_id: tc.walrus_blob_id,
        shared_blob_object_id: tc.shared_blob_object_id,
        error_detail: tc.error_detail,
        latency_ms: tc.latency_ms,
      }));
    }
    return { ...base, kraterion };
  }

  private async streamResponse(args: {
    req: FastifyRequest;
    reply: FastifyReply;
    agentId: string;
    invocationId: string;
    requestedModel: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    hits: Awaited<ReturnType<KnowledgeService["search"]>>["hits"];
    bucketIds: string[];
    retrievalLatencyMs: number;
    wallStart: number;
    includeRetrievalInfo: boolean;
    includeCitations: boolean;
    tools: OpenAI.ChatCompletionTool[] | undefined;
    toolCtx: ToolContext;
  }) {
    const { req, reply } = args;

    // SSE prelude. Going through `reply.raw` lets us flush chunks as
    // they land, but bypasses Fastify's CORS plugin — the `Access-
    // Control-Allow-*` headers it normally injects on the reply object
    // never reach the wire. The browser sees a CORS-failed response and
    // throws "TypeError: failed to fetch" with the body invisible to JS.
    // We echo the request's Origin (which has already cleared the CORS
    // preflight check by the time we get here) and the credentials flag
    // to match the global CORS config in `main.ts`. Cheap, safe — the
    // preflight is still the authoritative gate.
    const origin = req.headers.origin;
    const corsHeaders: Record<string, string> = origin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        }
      : {};
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders,
    });

    const sseSend = (payload: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const createdSec = Math.floor(Date.now() / 1000);
    const completionId = `chatcmpl_kr_${args.invocationId}`;
    let accumulated = "";
    let promptTokens = 0;
    let completionTokens = 0;
    const llmStart = Date.now();

    try {
      // Resolve project id once for credential decryption.
      const projectId = (
        await this.prisma.agentInvocation.findUniqueOrThrow({
          where: { id: args.invocationId },
          select: { project_id: true },
        })
      ).project_id;

      // Per-round streaming loop. Each iteration:
      //   1. Opens an OpenAI stream with the current `extraMessages`.
      //   2. Forwards `chat.completion.chunk` frames verbatim and
      //      accumulates content + tool_call deltas.
      //   3. If the round ended with finish_reason="tool_calls": emit
      //      pending → completed `kraterion.tool_call` frames per call,
      //      append assistant+tool messages, loop.
      //   4. Otherwise: terminal round; break and write the closing
      //      kraterion.extension + [DONE].
      const extraMessages: OpenAI.ChatCompletionMessageParam[] = [];
      let toolRound = 0;
      let finalRoundReached = false;
      while (!finalRoundReached) {
        if (toolRound > MAX_TOOL_ROUNDS) {
          throw new ControlPlaneError(
            "PreconditionFailed",
            `Exceeded the tool-call limit (${MAX_TOOL_ROUNDS} rounds).`,
          );
        }
        const stream = await this.credentials.useDecrypted(
          projectId,
          "openai",
          (apiKey) =>
            streamWithAgent({
              apiKey,
              model: args.requestedModel,
              systemPrompt: args.systemPrompt,
              messages: args.messages,
              hits: args.hits,
              temperature: args.temperature,
              maxTokens: args.maxTokens,
              stream: true,
              ...(args.tools ? { tools: args.tools, extraMessages } : { extraMessages }),
            }),
        );

        const toolCallBuf = new Map<number, PartialToolCall>();
        let roundFinishReason: string | null = null;
        let assistantContentThisRound = "";

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            assistantContentThisRound += delta;
          }
          // Streaming tool_call deltas arrive as `choices[0].delta.tool_calls`.
          accumulateToolCallDeltas(toolCallBuf, choice?.delta?.tool_calls);
          if (choice?.finish_reason) {
            roundFinishReason = choice.finish_reason;
          }
          // Forward verbatim — stock OpenAI SDKs expect this exact shape.
          sseSend({
            id: completionId,
            object: "chat.completion.chunk",
            created: createdSec,
            model: chunk.model ?? args.requestedModel,
            choices: chunk.choices,
          });
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
            completionTokens = chunk.usage.completion_tokens ?? completionTokens;
          }
        }

        if (roundFinishReason !== "tool_calls" || !args.tools || toolCallBuf.size === 0) {
          finalRoundReached = true;
          break;
        }

        // Round produced tool_calls. Collect them in stable order
        // (matches OpenAI's `index`), emit pending frames, execute,
        // emit completion frames, thread results back.
        const accumulatedCalls = [...toolCallBuf.values()].sort(
          (a, b) => a.index - b.index,
        );
        const validCalls = accumulatedCalls.filter(
          (c): c is PartialToolCall & { id: string; name: string } =>
            typeof c.id === "string" && typeof c.name === "string",
        );

        const assistantToolMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: assistantContentThisRound.length > 0 ? assistantContentThisRound : null,
          tool_calls: validCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        };
        extraMessages.push(assistantToolMsg);

        for (const call of validCalls) {
          // Emit pending frame so the dashboard can render the
          // "running…" state before the handler returns.
          const pendingFrame: ToolCallFrame = {
            object: "kraterion.tool_call",
            round: toolRound,
            tool_call_id: call.id,
            tool_name: call.name,
            status: "pending",
            arguments: safeJson(call.arguments),
          };
          sseSend(pendingFrame);

          const executed = await executeToolCall({
            registry: this.toolRegistry,
            prisma: this.prisma,
            ctx: args.toolCtx,
            invocationId: args.invocationId,
            round: toolRound,
            toolCallId: call.id,
            toolName: call.name,
            rawArguments: call.arguments,
          });
          extraMessages.push(executed.message);
          sseSend(executed.frame);
        }

        toolRound++;
      }

      const llmLatencyMs = Date.now() - llmStart;
      const wallMs = Date.now() - args.wallStart;
      const citations = resolveCitations(accumulated, args.hits);

      // Kraterion extension frame — clients that don't know to read it
      // see it as a no-op `data:` event. Then the OpenAI sentinel.
      const kraterion: Record<string, unknown> = { agent_id: args.agentId };
      if (args.includeRetrievalInfo) {
        kraterion["retrieval"] = {
          bucket_ids: args.bucketIds,
          hit_count: args.hits.length,
          retrieval_latency_ms: args.retrievalLatencyMs,
          llm_latency_ms: llmLatencyMs,
          total_latency_ms: wallMs,
        };
      }
      if (args.includeCitations) {
        kraterion["citations"] = args.hits.map((h, i) => ({
          index: i + 1,
          chunk_hash: h.content_hash,
          s3_key: h.s3_key,
          ordinal: h.ordinal,
          bucket_id: h.bucket_id,
          source_walrus_blob_id: h.source_walrus_blob_id,
          source_shared_blob_object_id: h.source_shared_blob_object_id,
          manifest_walrus_blob_id: h.manifest_walrus_blob_id,
          cited: citations.some((c) => c.chunk_hash === h.content_hash),
        }));
      }
      // Tool-call summary lands on the final extension frame so clients
      // that only read the last `kraterion.extension` (not the per-call
      // `kraterion.tool_call` deltas) still see the trail. Refetches from
      // the DB because individual round frames may be out of order in
      // the client's buffer.
      const toolCallRows = await this.prisma.agentToolCall.findMany({
        where: { invocation_id: args.invocationId },
        orderBy: { created_at: "asc" },
      });
      if (toolCallRows.length > 0) {
        kraterion["tool_calls"] = toolCallRows.map((tc) => ({
          tool_call_id: tc.tool_call_id,
          tool_name: tc.tool_name,
          status: tc.status,
          round: tc.round,
          arguments: safeJson(tc.arguments),
          output: tc.output,
          output_json: tc.output_json,
          tx_digest: tc.tx_digest,
          walrus_blob_id: tc.walrus_blob_id,
          shared_blob_object_id: tc.shared_blob_object_id,
          error_detail: tc.error_detail,
          latency_ms: tc.latency_ms,
        }));
      }
      sseSend({ object: "kraterion.extension", kraterion });
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();

      await this.prisma.agentInvocation.update({
        where: { id: args.invocationId },
        data: {
          status: "completed",
          output: accumulated,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          retrieval_latency_ms: args.retrievalLatencyMs,
          llm_latency_ms: llmLatencyMs,
          latency_ms: wallMs,
          cited_hashes: citations.map((c) =>
            Buffer.from(c.chunk_hash, "hex"),
          ),
          finished_at: new Date(),
        },
      });
    } catch (err) {
      // SSE error frame for clients that follow OpenAI's pattern.
      const message = err instanceof Error ? err.message : String(err);
      sseSend({
        object: "error",
        error: { message, type: "kraterion_error" },
      });
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      throw err;
    }
  }
}

/** Best-effort JSON parse for embedding arguments in the
 *  `kraterion.tool_call` SSE frame (or returning the raw string when
 *  the model emitted invalid JSON mid-stream). */
function safeJson(raw: string): unknown {
  try {
    return raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return raw;
  }
}
