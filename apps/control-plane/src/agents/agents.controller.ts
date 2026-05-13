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
  ) {}

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
        });
      }

      const llmStart = Date.now();
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
          }),
      );
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
      const stream = await this.credentials.useDecrypted(
        // Agent.project_id is the credential scope. Look it up via the
        // invocation row to avoid a second DB hit; cheap enough.
        (
          await this.prisma.agentInvocation.findUniqueOrThrow({
            where: { id: args.invocationId },
            select: { project_id: true },
          })
        ).project_id,
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
          }),
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) accumulated += delta;
        // Forward verbatim — clients expect the standard OpenAI shape.
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
