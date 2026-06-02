import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SessionArchiveService } from "./session-archive.service.js";
import type { SessionCloseReason } from "./session-archive.js";

/**
 * P9 — Session sweeper.
 *
 * Runs every 60 seconds. Scans `AgentSession` for rows that are still
 * `open` but have either:
 *   - gone idle past their project's `session_idle_seconds` window, or
 *   - exceeded the absolute 24-hour age cap regardless of activity.
 *
 * Flips qualifying rows to `flushing` atomically (CAS via Prisma
 * `updateMany where: { status: 'open' }`) and enqueues the
 * session-archive BullMQ job. Mirrors the `PoolRenewalProcessor`
 * pattern: `setInterval` driver, no BullMQ repeatable-job machinery.
 *
 * Why Postgres scan instead of the Redis warm-set:
 *   The idle window is per-project (`Project.session_idle_seconds`).
 *   The warm-set in `SessionService` tracks `last_activity_at` but
 *   doesn't know per-project thresholds — we'd have to do the
 *   Postgres lookup anyway to apply the right cutoff. For v1 the
 *   warm-set is informational (kept for future optimization at scale);
 *   the sweeper queries Postgres directly. At hackathon volumes
 *   (<<100 projects) this is cheap.
 *
 * Concurrency safety: two workers running this sweeper simultaneously
 * is fine — `updateMany({ where: { id, status: 'open' } })` is a CAS,
 * so only one transitions the row to `flushing`. The other reads
 * `count = 0` and skips the enqueue.
 *
 * Hard size cap (1 MB uncompressed trace): not enforced here. The
 * archive processor (D4) builds the trace and could check, but
 * `buildSessionTrace` already returns a `sizeBytes` we can surface
 * for monitoring. Sub-MB traces are the norm; we'll address
 * over-cap sessions if/when they appear.
 */
@Injectable()
export class SessionSweeperService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SessionSweeperService.name);
  private readonly TICK_MS = 60_000;
  private readonly AGE_CAP_HOURS = 24;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly archive: SessionArchiveService,
  ) {}

  onModuleInit(): void {
    // First tick at +90s — buys time for boot + the BullMQ producer
    // to be ready. The 60s cadence kicks in after that.
    setTimeout(() => void this.tick(), 90_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `session-sweeper armed (tick=${this.TICK_MS}ms, age_cap=${this.AGE_CAP_HOURS}h)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One sweep. Returns counts for log/metric visibility. Exposed
   * publicly so tests + the (future) admin-debug endpoint can drive
   * it on demand.
   */
  async tick(): Promise<{ scanned: number; flushed: number }> {
    // Idle candidates: per-project idle window from
    // Project.session_idle_seconds. Raw SQL because Prisma's where
    // clauses can't express "column on parent < now() - (column on
    // child * unit)".
    const idleRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM "AgentSession" s
      JOIN "Project" p ON p.id = s.project_id
      WHERE s.status = 'open'
        AND s.last_activity_at < NOW() - (p.session_idle_seconds || ' seconds')::interval
      LIMIT 200
    `;

    // Age-cap candidates: 24h since opened_at, regardless of recent
    // activity. Pathological long-running sessions get flushed even
    // if a user is still trickling messages.
    const ageCutoff = new Date(Date.now() - this.AGE_CAP_HOURS * 60 * 60 * 1000);
    const ageRows = await this.prisma.agentSession.findMany({
      where: { status: "open", opened_at: { lt: ageCutoff } },
      select: { id: true },
      take: 200,
    });

    const idleIds = new Set(idleRows.map((r) => r.id));
    const ageIds = new Set(ageRows.map((r) => r.id));

    let flushed = 0;
    // Age cap takes priority over idle (semantically more specific).
    for (const id of ageIds) {
      if (await this.tryFlush(id, "age_cap")) flushed++;
    }
    for (const id of idleIds) {
      if (ageIds.has(id)) continue;
      if (await this.tryFlush(id, "idle")) flushed++;
    }

    const scanned = idleIds.size + ageIds.size - intersectionSize(idleIds, ageIds);
    if (scanned > 0) {
      this.logger.log(`session-sweeper tick: scanned=${scanned} flushed=${flushed}`);
    }
    return { scanned, flushed };
  }

  /**
   * Atomic CAS transition from `open` to `flushing`, then enqueue.
   * Returns true if we won the race (this caller flipped the row);
   * false if another sweeper instance got there first.
   */
  private async tryFlush(
    sessionId: string,
    reason: SessionCloseReason,
  ): Promise<boolean> {
    const result = await this.prisma.agentSession.updateMany({
      where: { id: sessionId, status: "open" },
      data: { status: "flushing" },
    });
    if (result.count !== 1) return false;

    try {
      await this.archive.enqueue({ session_id: sessionId, close_reason: reason });
      return true;
    } catch (err) {
      // BullMQ enqueue failed (Redis flake?). Roll the row back to
      // `open` so the next tick retries. Don't leave a row stuck in
      // `flushing` with no pending job.
      this.logger.error(
        `session-sweeper: enqueue failed for ${sessionId}, rolling back to open: ` +
          `${(err as Error).message}`,
      );
      await this.prisma.agentSession.updateMany({
        where: { id: sessionId, status: "flushing" },
        data: { status: "open" },
      });
      return false;
    }
  }
}

function intersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}
