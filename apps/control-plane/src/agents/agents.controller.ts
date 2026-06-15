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
import { imputeAndRecordInvocationCost } from "../billing/invocation-cost.js";
import { Prisma } from "@prisma/client";
import {
  requireAccountPrincipal,
  requirePrincipal,
  requireUser,
} from "../auth/request-context.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { MemwalService } from "../memwal/memwal.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProviderCredentialService } from "../providers/provider-credential.service.js";
import { parseBody } from "../validation/zod-pipe.js";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { AgentsService } from "./agents.service.js";
import { SessionService, type SessionPrincipalKind } from "./session.service.js";
import {
  SESSION_ARCHIVE_QUEUE,
  type SessionArchiveJobData,
} from "./session-archive-queue.constants.js";
import { answerWithAgent, resolveCitations, streamWithAgent } from "./answer.js";
import {
  chatCompletionsSchema,
  createAgentSchema,
  createShareTokenSchema,
  updateAgentSchema,
  updateShareTokenSchema,
  type ChatCompletionsDto,
  type CreateAgentDto,
  type CreateShareTokenDto,
  type ShareTokenJson,
  type UpdateAgentDto,
  type UpdateShareTokenDto,
} from "./dto.js";
import { ShareTokensService, type RedactedShareToken } from "./share-tokens.service.js";
import { AgentToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import {
  accumulateToolCallDeltas,
  executeToolCall,
  MAX_TOOL_ROUNDS,
  type PartialToolCall,
  type ToolCallFrame,
} from "./tool-runner.js";
import {
  ShareTokenUsageService,
  approximateEgressBytes,
  computeSpendUsdMicros,
} from "./share-token-usage.js";
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
    private readonly shareTokenUsage: ShareTokenUsageService,
    private readonly shareTokens: ShareTokensService,
    private readonly sessions: SessionService,
    private readonly memwal: MemwalService,
    @InjectQueue(SESSION_ARCHIVE_QUEUE)
    private readonly archiveQueue: Queue<SessionArchiveJobData>,
  ) {}

  /** Map a `Principal` to the `(kind, id)` pair we record on AgentSession.
   *  Session principals key on accountId (project ownership is implicit
   *  via the agent); api_key on the bearer row id; share_token on the
   *  share-token row id. */
  private resolveSessionPrincipal(
    user: ReturnType<typeof requirePrincipal>,
    accountId: string,
  ): { kind: SessionPrincipalKind; id: string } {
    switch (user.kind) {
      case "session":
        return { kind: "session", id: accountId };
      case "api_key":
        return { kind: "api_key", id: user.apiKeyId };
      case "share_token":
        return { kind: "share_token", id: user.shareTokenId };
    }
  }

  /** Build the `retrieval_snapshot` payload persisted on AgentInvocation
   *  at completion. The session-archive worker (D4) assembles the
   *  canonical trace from these snapshots. No chunk text — recoverable
   *  by hash from KnowledgeChunk. */
  private retrievalSnapshot(
    hits: Awaited<ReturnType<KnowledgeService["search"]>>["hits"],
    bucketIds: string[],
    topK: number,
  ): Prisma.InputJsonValue {
    return {
      bucket_ids: bucketIds,
      top_k: topK,
      hits: hits.map((h) => ({
        bucket_id: h.bucket_id,
        chunk_id: h.id,
        ordinal: h.ordinal,
        content_hash: h.content_hash,
        s3_key: h.s3_key,
        source_walrus_blob_id: h.source_walrus_blob_id,
        // Required for the lineage's chunk-detail Verify button — the
        // browser fetches this Walrus blob, locates the chunk by
        // `ordinal`, and compares the manifest's `content_hash`
        // against the one we record here. Null until the K5 worker
        // archives the manifest (~30s after first upload).
        manifest_walrus_blob_id: h.manifest_walrus_blob_id,
        rrf_score: h.rrf_score,
      })),
    };
  }

  /** Build a ToolContext for the current chat invocation. Pure object —
   *  no DI hops at call time. */
  // (See `seedFromInvocationId` at the bottom of this file for the
  // module-scoped helper that derives the OpenAI `seed` from an
  // AgentInvocation UUID.)
  private toolContext(args: {
    agentId: string;
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
      memwal: this.memwal,
      agentId: args.agentId,
      accountId: args.accountId,
      projectId: args.projectId,
      apiKeyId: args.apiKeyId ?? null,
      invocationId: args.invocationId,
    };
  }

  @Get("agents")
  async list(@Req() req: FastifyRequest, @Query("project_id") projectId: string) {
    const user = requireAccountPrincipal(req);
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
    const user = requireAccountPrincipal(req);
    const agent = await this.agents.create(user.accountId, projectId, dto);
    return { agent };
  }

  @Get("agents/:agentId")
  async read(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requireAccountPrincipal(req);
    const agent = await this.agents.getOwned(user.accountId, agentId);
    return { agent };
  }

  @Patch("agents/:agentId")
  async update(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
    @Body(parseBody(updateAgentSchema)) dto: UpdateAgentDto,
  ) {
    const user = requireAccountPrincipal(req);
    const agent = await this.agents.update(user.accountId, agentId, dto);
    return { agent };
  }

  @Post("agents/:agentId/revoke")
  async revoke(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requireAccountPrincipal(req);
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
    const user = requireAccountPrincipal(req);
    const grants = await this.agents.listGrants(user.accountId, agentId);
    return { grants };
  }

  // === P6 — Embed widget share tokens ===

  @Get("agents/:agentId/share-tokens")
  async listShareTokens(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
  ) {
    const user = requireUser(req);
    const rows = await this.shareTokens.listForAgent(user.accountId, agentId);
    return { share_tokens: rows.map(serializeShareToken) };
  }

  /**
   * Mint a new share token. Returns the cleartext token exactly once —
   * the user pastes it into a `<script data-token=...>` tag on their
   * site and it cannot be retrieved again.
   */
  @Post("agents/:agentId/share-tokens")
  async createShareToken(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
    @Body(parseBody(createShareTokenSchema)) dto: CreateShareTokenDto,
  ) {
    const user = requireUser(req);
    const minted = await this.shareTokens.create(user.accountId, agentId, dto);
    return {
      share_token: serializeShareToken(minted.share_token),
      token: minted.token,
      network: minted.network,
      WARNING: minted.WARNING,
    };
  }

  @Patch("share-tokens/:tokenId")
  async updateShareToken(
    @Req() req: FastifyRequest,
    @Param("tokenId") tokenId: string,
    @Body(parseBody(updateShareTokenSchema)) dto: UpdateShareTokenDto,
  ) {
    const user = requireUser(req);
    const updated = await this.shareTokens.update(user.accountId, tokenId, dto);
    return { share_token: serializeShareToken(updated) };
  }

  @Post("share-tokens/:tokenId/revoke")
  async revokeShareToken(
    @Req() req: FastifyRequest,
    @Param("tokenId") tokenId: string,
  ) {
    const user = requireUser(req);
    const revoked = await this.shareTokens.revoke(user.accountId, tokenId);
    return { id: revoked.id, revoked_at: revoked.revoked_at };
  }

  @Delete("agents/:agentId")
  @HttpCode(204)
  async remove(@Req() req: FastifyRequest, @Param("agentId") agentId: string) {
    const user = requireAccountPrincipal(req);
    await this.agents.remove(user.accountId, agentId);
  }

  /**
   * P9 (D12) — List the agent's recent AgentSession rows. Powers the
   * dashboard's "Runs" tab. Account-scoped: only the owning account
   * sees its own sessions.
   *
   * Returns latest 20 by default, ordered by `opened_at` DESC.
   * Anchored sessions include `tx_digest` (the replay handle); open
   * or flushing sessions return null so the dashboard can render the
   * "still anchoring" state.
   */
  @Get("agents/:agentId/sessions")
  async listSessions(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
    @Query("limit") limitStr?: string,
  ): Promise<{
    sessions: Array<{
      id: string;
      status: string;
      principal_kind: string;
      opened_at: string;
      last_activity_at: string;
      closed_at: string | null;
      close_reason: string | null;
      invocation_count: number;
      tx_digest: string | null;
    }>;
  }> {
    const user = requireAccountPrincipal(req);
    // Ownership: agent → project → account.
    const agent = await this.prisma.kraterionAgent.findUnique({
      where: { id: agentId },
      select: { project: { select: { account_id: true } } },
    });
    if (!agent || agent.project.account_id !== user.accountId) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }

    const limit = Math.min(Math.max(parseInt(limitStr ?? "20", 10) || 20, 1), 100);
    const rows = await this.prisma.agentSession.findMany({
      where: { agent_id: agentId },
      orderBy: { opened_at: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        principal_kind: true,
        opened_at: true,
        last_activity_at: true,
        closed_at: true,
        close_reason: true,
        invocation_count: true,
        anchored_tx_digest: true,
      },
    });
    return {
      sessions: rows.map((r) => ({
        id: r.id,
        status: r.status,
        principal_kind: r.principal_kind,
        opened_at: r.opened_at.toISOString(),
        last_activity_at: r.last_activity_at.toISOString(),
        closed_at: r.closed_at?.toISOString() ?? null,
        close_reason: r.close_reason,
        invocation_count: r.invocation_count,
        // The digest is stored as UTF-8 bytes of the base58 string —
        // matches the indexer convention. Decode to the canonical
        // user-facing form here.
        tx_digest: r.anchored_tx_digest
          ? r.anchored_tx_digest.toString("utf-8")
          : null,
      })),
    };
  }

  /**
   * P9 — Force-flush an open AgentSession. Skips the worker's 60s idle
   * sweep so the session anchors immediately on chain. Used by:
   *   - the dashboard's "End session" button on the agent detail page
   *   - SDK middleware (Feature 3) signalling "the consumer's outer
   *     loop is done; archive now"
   *
   * Auth: session JWT or bearer API key, scoped to the agent's
   * account. Share-token principals are deliberately excluded —
   * the embed widget can't end its own session; the worker idle
   * sweep handles that case.
   *
   * State machine: only `open` sessions accept the request. If the
   * row is already `flushing`, `anchored`, or `failed` we return the
   * current state without re-enqueueing.
   */
  @Post("agents/:agentId/sessions/:sessionId/end")
  async endSession(
    @Req() req: FastifyRequest,
    @Param("agentId") agentId: string,
    @Param("sessionId") sessionId: string,
  ): Promise<{ session_id: string; status: string; enqueued: boolean }> {
    const user = requireAccountPrincipal(req);
    // Ownership: session → agent → project → account.
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        agent: { select: { id: true, project: { select: { account_id: true } } } },
      },
    });
    if (!session || session.agent.id !== agentId) {
      throw new ControlPlaneError("NotFound", "Session not found");
    }
    if (session.agent.project.account_id !== user.accountId) {
      throw new ControlPlaneError("NotFound", "Session not found");
    }

    if (session.status !== "open") {
      // Terminal or in-flight states are no-ops, surfaced to the caller.
      return { session_id: session.id, status: session.status, enqueued: false };
    }

    // Atomic CAS to `flushing` — same pattern the worker sweeper uses.
    // If a concurrent sweeper got there first, our count=0 and we just
    // report the new state.
    const flipped = await this.prisma.agentSession.updateMany({
      where: { id: sessionId, status: "open" },
      data: { status: "flushing" },
    });
    if (flipped.count !== 1) {
      const after = await this.prisma.agentSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      return {
        session_id: sessionId,
        status: after?.status ?? "unknown",
        enqueued: false,
      };
    }

    try {
      await this.archiveQueue.add(
        "archive-session",
        { session_id: sessionId, close_reason: "explicit_end" },
        {
          jobId: `session_${sessionId}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
          removeOnFail: { age: 14 * 24 * 60 * 60 },
        },
      );
      return { session_id: sessionId, status: "flushing", enqueued: true };
    } catch (err) {
      // Roll back so the worker sweeper can retry on its next tick.
      await this.prisma.agentSession.updateMany({
        where: { id: sessionId, status: "flushing" },
        data: { status: "open" },
      });
      throw new ControlPlaneError(
        "InternalError",
        `Could not enqueue session archive: ${(err as Error).message}`,
      );
    }
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

    // Three authentication paths reach this endpoint:
    //   - session JWT  → dashboard / `requireUser`-style flows
    //   - kr_* bearer  → CRUD / scripted / Claude Desktop bearer
    //   - kr_share_*   → P6 embed widget (anonymous public traffic)
    //
    // Share-token principals carry no accountId, so we fetch the
    // agent by id directly (the token is bound to this specific agent
    // and the resolver already confirmed the agent is active) and
    // pull account_id off the agent row for knowledge retrieval. For
    // session + bearer we go through the ownership-checked path and
    // use the principal's accountId.
    let agent;
    let accountId: string;
    if (user.kind === "share_token") {
      if (user.agentId !== agentId) {
        // The token was minted for a different agent — refuse and
        // surface NotFound so the client can't probe which agent ids
        // exist by attempting cross-agent calls.
        throw new ControlPlaneError("NotFound", "Agent not found");
      }
      // Origin allowlist gate. Empty list = dormant token (mint default).
      //
      // The chat call is made from inside our embed iframe, which is
      // served from the dashboard host — so the browser's own `Origin`
      // header is always that host and tells us nothing about which
      // site actually embedded the widget. The iframe forwards the real
      // host-page origin in `X-Kraterion-Embed-Origin`, derived from
      // `location.ancestorOrigins` (or a postMessage handshake's
      // `event.origin` on Firefox) — both browser-stamped and not
      // forgeable by the embedding page's JS. That is the value we gate
      // on. A request without the header (e.g. a raw API call) carries
      // no embed origin and is refused.
      const forwarded = req.headers["x-kraterion-embed-origin"];
      const origin = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      if (
        user.allowedOrigins.length === 0 ||
        typeof origin !== "string" ||
        !user.allowedOrigins.includes(origin)
      ) {
        throw new ControlPlaneError(
          "Forbidden",
          "This share token isn't authorized for the request origin.",
          { origin: origin ?? "(none)" },
        );
      }
      // Daily-cap gate. Either limit being null = unlimited.
      await this.shareTokenUsage.assertWithinCaps(
        user.shareTokenId,
        user.maxRequestsPerDay,
        user.maxSpendUsdMicrosPerDay,
      );
      const fetched = await this.agents.getByIdForShareToken(agentId);
      agent = fetched;
      accountId = fetched.account_id;
    } else {
      agent = await this.agents.getOwnedRow(user.accountId, agentId);
      accountId = user.accountId;
      // Bearer tokens are project-scoped — refuse cross-project use even
      // when the underlying account owns both projects. Session principals
      // are account-scoped and pass through.
      if (user.kind === "api_key" && user.projectId !== agent.project_id) {
        throw new ControlPlaneError("NotFound", "Agent not found");
      }
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

    // P9 — Replayable agent runs: attach this invocation to an open
    // AgentSession (or open a new one) so its trace can be batched and
    // anchored on idle. Sessions are opt-out for agents with zero
    // knowledge buckets attached (no bucket → no seal_identity prefix →
    // no on-chain anchor possible). The worker would no-op anyway; keep
    // the DB clean by not opening orphan sessions in the first place.
    let sessionId: string | null = null;
    if (agent.buckets.length > 0) {
      const principal = this.resolveSessionPrincipal(user, accountId);
      const project = await this.prisma.project.findUnique({
        where: { id: agent.project_id },
        select: { session_idle_seconds: true },
      });
      sessionId = await this.sessions.attachOrOpen({
        agentId: agent.id,
        projectId: agent.project_id,
        principalKind: principal.kind,
        principalId: principal.id,
        idleSeconds: project?.session_idle_seconds ?? 600,
      });
    }

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
        share_token_id: user.kind === "share_token" ? user.shareTokenId : null,
        session_id: sessionId,
        input,
        model: requestedModel,
        bucket_ids: agent.buckets.map((b) => b.bucket_id),
      },
    });

    // P9 (D10) — Derive a deterministic seed from the invocation UUID
    // so a replay of this turn (same seed + temp + retrieval) produces
    // the same output on deterministic providers. `seed` is OpenAI's
    // own knob and a no-op for providers that don't support it.
    const seed = seedFromInvocationId(invocation.id);

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
            accountId,
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
        agentId,
        accountId,
        projectId: agent.project_id,
        apiKeyId: user.kind === "api_key" ? user.apiKeyId : null,
        invocationId: invocation.id,
      });

      // P6 — share tokens own a per-deployment "cite sources" flag.
      // When false: strip the `[chunk N]` contract from the system
      // prompt AND force-disable the response-side citations +
      // retrieval-info extensions, so a public widget can never leak
      // internal source paths or chunk numbers to visitors.
      const suppressCitations =
        user.kind === "share_token" && !user.citeSources;
      const effectiveIncludeCitations =
        dto.include_citations && !suppressCitations;
      const effectiveIncludeRetrievalInfo =
        dto.include_retrieval_info && !suppressCitations;

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
          includeRetrievalInfo: effectiveIncludeRetrievalInfo,
          includeCitations: effectiveIncludeCitations,
          omitCitationInstructions: suppressCitations,
          tools,
          toolCtx,
          sessionId,
          agentTopK: agent.top_k,
          seed,
          ...(user.kind === "share_token"
            ? { shareTokenId: user.shareTokenId }
            : {}),
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
              seed,
              ...(suppressCitations ? { omitCitationInstructions: true } : {}),
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
          retrieval_snapshot: this.retrievalSnapshot(topHits, bucketIds, agent.top_k),
          seed,
          system_fingerprint: answered.system_fingerprint,
          finished_at: new Date(),
        },
      });

      // P9 — Bump the parent AgentSession's invocation_count +
      // last_activity_at so the idle-flush clock restarts. Fire-and-forget:
      // a session bump failure must never break a completed chat turn.
      if (sessionId) {
        void this.sessions.recordCompletion(sessionId);
      }

      // B1 billing — compute cost from the canonical OpenAI price
      // catalog, patch `cost_usd_micros` / `cost_price_version` /
      // `key_source` on the invocation, and bump `BYOKDailySpend`.
      // Best-effort: never throws from this call site.
      void imputeAndRecordInvocationCost({
        prisma: this.prisma,
        invocationId: invocation.id,
        projectId: agent.project_id,
        model: requestedModel,
        promptTokens: answered.prompt_tokens,
        completionTokens: answered.completion_tokens,
        keySource: "byok",
      });

      // P6 — bump the share token's daily counters AFTER a successful
      // turn (failures don't count toward caps).
      //
      // NB: pass `requestedModel` (canonical catalog id, e.g.
      // "gpt-4o-mini"), not `answered.model` — OpenAI returns the
      // versioned id ("gpt-4o-mini-2024-07-18") which doesn't match
      // our price catalog and would charge zero.
      if (user.kind === "share_token") {
        await this.shareTokenUsage.record(
          user.shareTokenId,
          computeSpendUsdMicros(answered.completion_tokens, requestedModel),
          approximateEgressBytes(answered.completion_tokens),
        );
      }

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
        includeRetrievalInfo: effectiveIncludeRetrievalInfo,
        includeCitations: effectiveIncludeCitations,
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
      pooled_blob_object_id: string | null;
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
        source_pooled_blob_object_id: h.source_pooled_blob_object_id,
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
        pooled_blob_object_id: tc.pooled_blob_object_id,
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
    /** P6 — share-token `cite_sources=false` strips the `[chunk N]`
     *  contract from the system prompt so the model emits clean prose
     *  (in addition to suppressing the citations + retrieval extension
     *  on the response side). */
    omitCitationInstructions?: boolean;
    tools: OpenAI.ChatCompletionTool[] | undefined;
    toolCtx: ToolContext;
    /** P6 — when the chat was authed via a share token, the token id
     *  used to bump `ShareTokenUsageDay` after a successful stream. */
    shareTokenId?: string | undefined;
    /** P9 — parent AgentSession id (null if the agent has no attached
     *  buckets and therefore no anchorable session). Used to bump
     *  `invocation_count` + `last_activity_at` at the clean-stream
     *  completion site. */
    sessionId: string | null;
    /** P9 — agent's `top_k` retrieval setting, persisted in the
     *  per-invocation `retrieval_snapshot` so the replay path can
     *  reproduce retrieval mode. */
    agentTopK: number;
    /** P9 (D10) — deterministic seed for the OpenAI call. Derived from
     *  the invocation UUID so replays reproduce on deterministic
     *  providers. */
    seed: number;
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
    let systemFingerprint: string | null = null;
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
              seed: args.seed,
              stream: true,
              ...(args.omitCitationInstructions
                ? { omitCitationInstructions: true }
                : {}),
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
          // P9 — `system_fingerprint` is present on most chunks in the
          // OpenAI streaming shape. Capture the latest non-null value;
          // by stream-end this holds the backend config id we persist.
          if (chunk.system_fingerprint) {
            systemFingerprint = chunk.system_fingerprint;
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
          source_pooled_blob_object_id: h.source_pooled_blob_object_id,
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
          pooled_blob_object_id: tc.pooled_blob_object_id,
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
          retrieval_snapshot: this.retrievalSnapshot(
            args.hits,
            args.bucketIds,
            args.agentTopK,
          ),
          seed: args.seed,
          system_fingerprint: systemFingerprint,
          finished_at: new Date(),
        },
      });

      // P9 — Bump parent AgentSession's invocation_count +
      // last_activity_at. Fire-and-forget; never block a stream that
      // already finished cleanly.
      if (args.sessionId) {
        void this.sessions.recordCompletion(args.sessionId);
      }

      // B1 billing — same hook as the non-streaming path. Best-effort
      // and fire-and-forget so a billing failure can never break a
      // chat completion that already streamed cleanly to the client.
      void imputeAndRecordInvocationCost({
        prisma: this.prisma,
        invocationId: args.invocationId,
        projectId,
        model: args.requestedModel,
        promptTokens,
        completionTokens,
        keySource: "byok",
      });

      // P6 — bump share-token daily counters after a clean stream.
      if (args.shareTokenId) {
        await this.shareTokenUsage.record(
          args.shareTokenId,
          computeSpendUsdMicros(completionTokens, args.requestedModel),
          approximateEgressBytes(completionTokens),
        );
      }
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
/** P9 (D10) — Derive a deterministic OpenAI `seed` from an
 *  AgentInvocation UUID. Takes the first 4 hex chars (16 bits) and
 *  signs them so they fit in JS's safe-integer range. OpenAI's seed
 *  is a number; consistent input gives the same number, which gives
 *  the same output for deterministic providers.
 *
 *  We deliberately use only 16 bits (~65k unique seeds) because (a)
 *  OpenAI's seed-determinism only kicks in when ALL inputs are
 *  identical, so collisions are harmless, and (b) staying inside u16
 *  avoids any int32-overflow surprise on roundtrip through Postgres
 *  (Int) + JSON. */
function seedFromInvocationId(invocationId: string): number {
  const hex = invocationId.replace(/-/g, "").slice(0, 4);
  return parseInt(hex, 16);
}

function safeJson(raw: string): unknown {
  try {
    return raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Wire-shape serializer for `AgentShareToken`. Converts the BigInt
 * `max_spend_usd_micros_per_day` back to dollars so the dashboard's
 * cap field reads naturally (and matches the value the user typed at
 * mint time).
 */
function serializeShareToken(row: RedactedShareToken): ShareTokenJson {
  return {
    id: row.id,
    agent_id: row.agent_id,
    name: row.name,
    token_prefix: row.token_prefix,
    network: row.network as "testnet" | "mainnet",
    allowed_origins: row.allowed_origins,
    max_requests_per_day: row.max_requests_per_day,
    max_spend_usd_per_day:
      row.max_spend_usd_micros_per_day === null
        ? null
        : Number(row.max_spend_usd_micros_per_day) / 1_000_000,
    cite_sources: row.cite_sources,
    last_used_at: row.last_used_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    revoked_at: row.revoked_at?.toISOString() ?? null,
  };
}
