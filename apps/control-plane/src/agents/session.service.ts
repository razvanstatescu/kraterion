import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";

/** Redis sorted-set that tracks open AgentSession rows by last activity.
 *  The session-archive sweeper (D5, worker-side) reads this to find
 *  sessions to flush without full-scanning Postgres. Loss-safe: the
 *  sweeper falls back to a Postgres scan if the set is empty. */
const WARM_SET_KEY = "kraterion:agent-sessions:warm";

/** Server-derived session keying. SDK middleware (Feature 3) will later
 *  pass an `X-Kraterion-Session-Id` header to override; for v1 this is
 *  always derived from `(agent_id, principal_kind, principal_id)`. */
export type SessionPrincipalKind = "session" | "api_key" | "share_token";

export interface AttachOrOpenSessionArgs {
  agentId: string;
  projectId: string;
  principalKind: SessionPrincipalKind;
  principalId: string;
  /** Project's configured idle window in seconds. Read from
   *  `Project.session_idle_seconds`. */
  idleSeconds: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Attach the next invocation to an existing open AgentSession for the
   * same `(agent, principal)` if one is still inside the idle window;
   * otherwise open a new one. Bumps `last_activity_at` on attach so the
   * idle-flush clock restarts on every turn. Mirrors that activity to
   * Redis's warm-set so the worker sweeper can find ready-to-flush
   * sessions without a Postgres scan.
   *
   * Returns the session row's id. Errors only on DB outage — Redis
   * write failures are logged but never block the chat path (the
   * sweeper's Postgres fallback covers data loss in the warm-set).
   */
  async attachOrOpen(args: AttachOrOpenSessionArgs): Promise<string> {
    const idleCutoff = new Date(Date.now() - args.idleSeconds * 1000);

    const existing = await this.prisma.agentSession.findFirst({
      where: {
        agent_id: args.agentId,
        principal_kind: args.principalKind,
        principal_id: args.principalId,
        status: "open",
        last_activity_at: { gt: idleCutoff },
      },
      orderBy: { last_activity_at: "desc" },
      select: { id: true },
    });

    const now = new Date();
    const sessionId = existing
      ? (
          await this.prisma.agentSession.update({
            where: { id: existing.id },
            data: { last_activity_at: now },
            select: { id: true },
          })
        ).id
      : (
          await this.prisma.agentSession.create({
            data: {
              project_id: args.projectId,
              agent_id: args.agentId,
              principal_kind: args.principalKind,
              principal_id: args.principalId,
              status: "open",
              opened_at: now,
              last_activity_at: now,
            },
            select: { id: true },
          })
        ).id;

    void this.bumpWarmSet(sessionId, now.getTime());
    return sessionId;
  }

  /**
   * Record that the next chat completion finished. Bumps
   * `invocation_count` and refreshes `last_activity_at`. Only called on
   * the completed-status path — failures don't count toward
   * `invocation_count` (a failed turn isn't a replayable turn) but they
   * already bumped `last_activity_at` at attach time, so a quick retry
   * after a failure still keeps the session warm.
   */
  async recordCompletion(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        last_activity_at: now,
        invocation_count: { increment: 1 },
      },
    });
    void this.bumpWarmSet(sessionId, now.getTime());
  }

  /** Best-effort Redis warm-set bump. Errors logged, never thrown. */
  private async bumpWarmSet(sessionId: string, atMs: number): Promise<void> {
    try {
      await this.redis.zadd(WARM_SET_KEY, atMs, sessionId);
    } catch (err) {
      this.logger.warn(
        `warm-set bump failed for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
