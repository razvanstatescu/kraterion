import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { KnowledgeIndexerKeypairService } from "../auth/knowledge-indexer-keypair.service.js";
import { archiveManifestToWalrus } from "./manifest-archive.js";

/**
 * Manifest-archive sweeper.
 *
 * The K5 on-chain archive step (`archiveManifestToWalrus`) runs inline
 * after indexing and is deliberately best-effort: any failure (a relay
 * flake, a `register_blob` revert, a momentary RPC blip) is swallowed,
 * leaving the manifest `status=indexed` with `manifest_walrus_blob_id`
 * null. The chunks stay searchable, but the dashboard's "verify on
 * chain" surface shows "manifest hasn't been archived on chain yet".
 *
 * Before this sweeper the only recovery was the manual
 * `scripts/backfill-manifest-archive.ts` or the grant-event self-heal
 * (which re-embeds the whole bucket). A single transient flake stranded
 * a manifest permanently. This loop closes that gap: every couple of
 * minutes it re-attempts archival for stuck manifests, so transient
 * failures heal on their own.
 *
 * Mirrors `SessionSweeperService`: a `setInterval` driver, no BullMQ
 * repeatable-job machinery.
 *
 * Two safety properties matter here because each attempt signs an
 * on-chain `register_blob` that costs gas even when it reverts:
 *   - Backoff + attempt cap (in Redis): a manifest that keeps failing
 *     (e.g. the pool is genuinely full — `EInsufficientCapacity`) backs
 *     off exponentially and is abandoned after MAX_ATTEMPTS, so we don't
 *     burn the indexer wallet retrying a doomed write forever. Such
 *     manifests need an operator (free pool capacity, then re-run the
 *     backfill script).
 *   - Per-manifest Redis lock: multiple worker replicas running this
 *     sweeper won't double-submit `register_blob` for the same manifest
 *     (which would create a duplicate PooledBlob / abort the loser).
 *
 * `archiveManifestToWalrus` is itself idempotent (it no-ops once the
 * blob id is set), so the lock is belt-and-suspenders, not correctness-
 * critical for the single-replica case.
 */
@Injectable()
export class ManifestArchiveSweeperService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ManifestArchiveSweeperService.name);
  private readonly TICK_MS = 120_000;
  /** Candidates scanned per tick (most may be in backoff and skipped). */
  private readonly SCAN_LIMIT = 50;
  /** Hard cap on real archive attempts per tick — bounds gas + RPC load. */
  private readonly ATTEMPTS_PER_TICK = 10;
  /** Give up (until manual backfill) after this many failed attempts. */
  private readonly MAX_ATTEMPTS = 8;
  /** Base backoff; doubles each attempt, capped at 1h. */
  private readonly BACKOFF_BASE_SEC = 120;
  private readonly BACKOFF_CAP_SEC = 3_600;
  private readonly ATTEMPTS_TTL_SEC = 7 * 24 * 60 * 60;
  private readonly LOCK_TTL_SEC = 180;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keypair: KnowledgeIndexerKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    // First tick at +120s — boot + background keypair load need to
    // settle (the archive can't sign without the indexer keypair).
    setTimeout(() => void this.tick(), 120_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `manifest-archive-sweeper armed (tick=${this.TICK_MS}ms, max_attempts=${this.MAX_ATTEMPTS})`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One sweep. Returns counts for log/metric visibility and is exposed
   * publicly so tests can drive it directly.
   */
  async tick(): Promise<{ scanned: number; attempted: number; archived: number }> {
    // Don't overlap ticks — a slow on-chain round-trip can exceed the
    // interval, and re-entrancy would fight the per-manifest locks for
    // no benefit.
    if (this.running) return { scanned: 0, attempted: 0, archived: 0 };
    this.running = true;
    try {
      return await this.sweep();
    } finally {
      this.running = false;
    }
  }

  private async sweep(): Promise<{
    scanned: number;
    attempted: number;
    archived: number;
  }> {
    // The archive needs the indexer keypair. It loads in the background
    // (DB-free boot), so on an early tick it may not be ready yet —
    // skip this round rather than throw.
    if (!this.keypairReady()) {
      this.logger.debug("manifest-archive-sweeper: keypair not ready, skipping tick");
      return { scanned: 0, attempted: 0, archived: 0 };
    }

    const candidates = await this.prisma.knowledgeManifest.findMany({
      where: {
        status: "indexed",
        manifest_walrus_blob_id: null,
        deleted_at: null,
        chunk_count: { gt: 0 },
      },
      select: { id: true },
      orderBy: { created_at: "asc" },
      take: this.SCAN_LIMIT,
    });

    let attempted = 0;
    let archived = 0;
    for (const { id } of candidates) {
      if (attempted >= this.ATTEMPTS_PER_TICK) break;
      const outcome = await this.tryArchive(id);
      if (outcome === "skipped") continue;
      attempted++;
      if (outcome === "archived") archived++;
    }

    if (attempted > 0) {
      this.logger.log(
        `manifest-archive-sweeper tick: scanned=${candidates.length} attempted=${attempted} archived=${archived}`,
      );
    }
    return { scanned: candidates.length, attempted, archived };
  }

  /**
   * Attempt one manifest, honoring Redis backoff + cap + lock.
   * Returns "skipped" (backed off / capped / lock lost), "archived",
   * or "failed".
   */
  private async tryArchive(
    manifestId: string,
  ): Promise<"skipped" | "archived" | "failed"> {
    const attemptsKey = this.attemptsKey(manifestId);
    const nextKey = this.nextKey(manifestId);
    const lockKey = this.lockKey(manifestId);

    const attempts = Number((await this.redis.get(attemptsKey)) ?? "0");
    if (attempts >= this.MAX_ATTEMPTS) return "skipped";
    // Still inside the backoff window from the last failure.
    if ((await this.redis.exists(nextKey)) === 1) return "skipped";

    // Per-manifest lock so concurrent replicas don't both submit
    // register_blob for the same manifest.
    const gotLock = await this.redis.set(lockKey, "1", "EX", this.LOCK_TTL_SEC, "NX");
    if (gotLock !== "OK") return "skipped";

    try {
      await archiveManifestToWalrus({
        prisma: this.prisma,
        signer: this.keypair.getKeypair(),
        logger: this.logger,
        manifestId,
      });

      // archiveManifestToWalrus swallows its own errors, so confirm the
      // outcome by re-reading the blob id rather than trusting a return.
      const after = await this.prisma.knowledgeManifest.findUnique({
        where: { id: manifestId },
        select: { manifest_walrus_blob_id: true },
      });
      if (after?.manifest_walrus_blob_id) {
        await this.redis.del(attemptsKey, nextKey);
        this.logger.log(`manifest-archive-sweeper: healed ${manifestId}`);
        return "archived";
      }

      await this.recordFailure(manifestId, attempts, attemptsKey, nextKey);
      return "failed";
    } catch (err) {
      // Defensive — archiveManifestToWalrus is best-effort and shouldn't
      // throw, but a keypair/DB blip here mustn't crash the sweep.
      this.logger.warn(
        `manifest-archive-sweeper: unexpected error on ${manifestId}: ${(err as Error).message}`,
      );
      await this.recordFailure(manifestId, attempts, attemptsKey, nextKey);
      return "failed";
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async recordFailure(
    manifestId: string,
    prevAttempts: number,
    attemptsKey: string,
    nextKey: string,
  ): Promise<void> {
    const n = prevAttempts + 1;
    await this.redis.set(attemptsKey, String(n), "EX", this.ATTEMPTS_TTL_SEC);
    const delay = Math.min(
      this.BACKOFF_CAP_SEC,
      this.BACKOFF_BASE_SEC * 2 ** (n - 1),
    );
    await this.redis.set(nextKey, "1", "EX", delay);
    if (n >= this.MAX_ATTEMPTS) {
      this.logger.error(
        `manifest-archive-sweeper: giving up on ${manifestId} after ${n} attempts. ` +
          `Check the worker log for the underlying 'manifest-archive:' error ` +
          `(a persistent failure usually means the on-chain pool is full — ` +
          `EInsufficientCapacity). Free pool capacity, then re-run ` +
          `\`pnpm -F @kraterion/worker exec tsx scripts/backfill-manifest-archive.ts --manifest-id ${manifestId}\`.`,
      );
    }
  }

  private keypairReady(): boolean {
    try {
      this.keypair.getKeypair();
      return true;
    } catch {
      return false;
    }
  }

  private attemptsKey(id: string): string {
    return `kraterion:manifest-archive:attempts:${id}`;
  }
  private nextKey(id: string): string {
    return `kraterion:manifest-archive:next:${id}`;
  }
  private lockKey(id: string): string {
    return `kraterion:manifest-archive:lock:${id}`;
  }
}
