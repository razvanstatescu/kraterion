import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Transaction } from "@mysten/sui/transactions";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
  POOL_RENEWAL_BUFFER_DAYS,
  epochDaysForCurrentNetwork,
  renewalEpochsPerCycle,
} from "@kraterion/shared";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import { getPoolStorageCostFrost, getSuiClient } from "@kraterion/walrus-client";
import { PrismaService } from "../prisma/prisma.service.js";
import { GasPoolService } from "../sui/gas-pool.service.js";
import { StripeService } from "./stripe.service.js";
import { ACTIVE_PRICE_LOOKUP_KEYS } from "./catalog.js";

/**
 * Daily pool renewal worker.
 *
 * The new pool-lifetime model aligns Walrus's `end_epoch` with our
 * billing cycle (see `/docs/decisions.md` 2026-05-19 "Pool lifetime
 * tracks billing cycle"). Each pool is created with ~1 cycle +
 * buffer, and this worker extends it monthly so it always reads
 * ~1 cycle ahead of "now".
 *
 * Tick logic:
 *
 *   1. Read on-chain `epoch` from Sui RPC (Walrus aligns epochs to
 *      Sui's checkpoint cadence; the published `current_epoch` on
 *      the Walrus system object is the same value but we already
 *      have a Sui client wired so we use that).
 *   2. For every active `StoragePool`:
 *        a. Skip if `status != 'active'` or `user_revoked`.
 *        b. Skip if the project's Stripe subscription is cancelled
 *           or past_due (we don't keep extending capacity for
 *           non-paying users; the pool will naturally decay).
 *        c. Compute `days_until_end = (end_epoch - current_epoch) ×
 *           epoch_days_for_network`. Skip if `> POOL_RENEWAL_BUFFER_DAYS × 2`
 *           — plenty of headroom.
 *        d. **Stage 2 (pending Move redeploy):** if a
 *           `PendingStorageDowngrade` exists with `effective_at <= now`,
 *           call `pool_vault::shrink_pool` first. Today the wrapper
 *           isn't deployed on chain, so we log + skip the shrink and
 *           let the next renewal at full-size keep the lights on.
 *        e. Sign + submit `pool_vault::extend` for
 *           `renewalEpochsPerCycle()` more epochs. Fund from the
 *           reserve.
 *
 * Failure mode worth thinking about: if this worker is down for the
 * full `POOL_RENEWAL_BUFFER_DAYS` window, pools start expiring →
 * blobs become un-readable. Monitoring: a single missing tick from
 * this processor in the logs is the early-warning signal.
 *
 * Daily tick. Each tick processes every pool that needs renewing in
 * sequence — at sandbox-mode volumes (<<100 projects) this is fine.
 * At scale we'd batch + parallelize.
 */
@Injectable()
export class PoolRenewalProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PoolRenewalProcessor.name);
  private readonly TICK_MS = 24 * 60 * 60 * 1000; // daily
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gasPool: GasPoolService,
    private readonly stripe: StripeService,
  ) {}

  onModuleInit(): void {
    // First tick at +3min — buys time for boot + the operator key to
    // be ready. The daily cadence kicks in after that.
    setTimeout(() => void this.tick(), 3 * 60_000).unref?.();
    this.timer = setInterval(() => void this.tick(), this.TICK_MS);
    this.timer.unref?.();
    this.logger.log(
      `pool-renewal armed (tick=${this.TICK_MS}ms, buffer=${POOL_RENEWAL_BUFFER_DAYS}d)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{
    pools: number;
    renewed: number;
    skipped: number;
    failed: number;
  }> {
    const currentEpoch = await this.readCurrentEpoch();
    if (currentEpoch === null) {
      this.logger.warn("could not read current Sui epoch; skipping tick");
      return { pools: 0, renewed: 0, skipped: 0, failed: 0 };
    }
    const epochDays = epochDaysForCurrentNetwork();
    const buffer = POOL_RENEWAL_BUFFER_DAYS * 2; // start trying ~10d early
    const renewalEpochs = renewalEpochsPerCycle();

    const pools = await this.prisma.storagePool.findMany({
      where: { status: "active", user_revoked: false },
    });

    let renewed = 0;
    let skipped = 0;
    let failed = 0;

    for (const pool of pools) {
      const daysLeft = (pool.end_epoch - currentEpoch) * epochDays;
      if (daysLeft > buffer) {
        skipped++;
        continue;
      }
      // Don't extend non-paying customers — let their pool decay.
      const subActive = await this.isSubscriptionActive(pool.project_id);
      if (!subActive) {
        this.logger.log(
          `pool ${pool.pool_object_id} project=${pool.project_id} subscription not active; skipping renewal (pool will decay at epoch ${pool.end_epoch})`,
        );
        skipped++;
        continue;
      }

      // If the customer scheduled a downsize that's now effective,
      // shrink the pool first so the renewal extends only the new
      // smaller reservation. Gated by KRATERION_ENABLE_POOL_SHRINK
      // until the Move package carrying `pool_vault::resize_shrink`
      // is redeployed — see /docs/runbook.md "Redeploying Move with
      // pool_vault::resize_shrink".
      try {
        if (process.env["KRATERION_ENABLE_POOL_SHRINK"] === "true") {
          await this.maybeShrinkForPendingDowngrade(pool);
        }

        const digest = await this.submitExtend({
          vaultObjectId: pool.vault_object_id,
          reservedBytes: pool.reserved_encoded_bytes,
          extendEpochs: renewalEpochs,
        });
        renewed++;
        this.logger.log(
          `renewed pool=${pool.pool_object_id} project=${pool.project_id} ` +
            `+${renewalEpochs} epochs tx=${digest}`,
        );
      } catch (err) {
        failed++;
        this.logger.error(
          `renew failed for pool=${pool.pool_object_id} project=${pool.project_id}: ${(err as Error).message}`,
        );
      }
    }

    if (renewed + failed > 0) {
      this.logger.log(
        `pool renewal tick: ${pools.length} pools, ${renewed} renewed, ${skipped} skipped, ${failed} failed`,
      );
    }
    return { pools: pools.length, renewed, skipped, failed };
  }

  private async readCurrentEpoch(): Promise<number | null> {
    try {
      const sys = await getSuiClient().getLatestSuiSystemState();
      return Number(sys.epoch);
    } catch (err) {
      this.logger.warn(`getLatestSuiSystemState failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async isSubscriptionActive(projectId: string): Promise<boolean> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { project_id: projectId },
    });
    if (!account) return false;
    if (account.status !== "active") return false;
    const customerId = this.stripe.getStripeCustomerId(account);
    if (!customerId) return false;
    // Cheap-ish — listing subs is one Stripe call per pool per day.
    // Could be batched if it ever shows up in cost reports.
    const subs = await this.stripe.client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    const live = subs.data.find(
      (s) => s.status === "active" || s.status === "trialing",
    );
    if (!live) return false;
    if (live.cancel_at_period_end) return false;
    // Sanity check: the storage line still exists.
    const hasStorage = live.items.data.some(
      (it) => it.price.lookup_key === ACTIVE_PRICE_LOOKUP_KEYS.storage,
    );
    return hasStorage;
  }

  /**
   * If `PendingStorageDowngrade.effective_at <= now` for this pool's
   * project, call `pool_vault::resize_shrink` with the right percent
   * to bring reserved capacity down to the target GB.
   *
   * Math: `percent_to_shrink_unused = (current_reserved - target) /
   * unused_capacity × 100`. Walrus operates on the **unused** portion
   * only; we can never shrink below `used_encoded_bytes`. If the
   * customer's target would dip into used capacity, we surface a
   * loud warning and skip the shrink (the Stripe quantity already
   * dropped per the storage-downgrade processor; the on-chain
   * mismatch becomes a manual reconciliation item).
   */
  private async maybeShrinkForPendingDowngrade(pool: {
    project_id: string;
    vault_object_id: string;
    reserved_encoded_bytes: bigint;
    used_encoded_bytes: bigint;
  }): Promise<void> {
    const pending = await this.prisma.pendingStorageDowngrade.findUnique({
      where: { project_id: pool.project_id },
    });
    if (!pending) return;
    if (pending.status !== "scheduled") return;
    if (pending.effective_at > new Date()) return;

    const targetBytes = BigInt(pending.new_reserved_mb) * 1_048_576n;
    if (targetBytes >= pool.reserved_encoded_bytes) {
      // Not actually a downsize (or already shrunk). Mark applied.
      await this.prisma.pendingStorageDowngrade.update({
        where: { id: pending.id },
        data: { status: "applied", applied_at: new Date() },
      });
      return;
    }
    const unused = pool.reserved_encoded_bytes - pool.used_encoded_bytes;
    if (unused <= 0n) {
      this.logger.warn(
        `cannot shrink pool=${pool.vault_object_id}: pool is full ` +
          `(reserved=${pool.reserved_encoded_bytes} used=${pool.used_encoded_bytes}). ` +
          `Stripe quantity already dropped; manual reconciliation required.`,
      );
      return;
    }
    const wantToFree = pool.reserved_encoded_bytes - targetBytes;
    if (wantToFree > unused) {
      this.logger.warn(
        `cannot shrink pool=${pool.vault_object_id} to ${pending.new_reserved_mb} MB: ` +
          `would dip into used capacity (need to free ${wantToFree}, only ${unused} unused). ` +
          `Stripe quantity already dropped; manual reconciliation required.`,
      );
      return;
    }
    // Walrus takes a u8 percent in [1, 100]. Round up so we shrink AT
    // LEAST to the target — the gas-budget loop would otherwise leave
    // residual capacity. The over-shrink is bounded by 1% of unused
    // (sub-MiB on a 1 GiB unused window).
    const percent = Math.min(
      100,
      Math.max(1, Math.ceil((Number(wantToFree) / Number(unused)) * 100)),
    );

    const digest = await this.submitShrink({
      vaultObjectId: pool.vault_object_id,
      percent,
    });
    await this.prisma.pendingStorageDowngrade.update({
      where: { id: pending.id },
      data: {
        status: "applied",
        applied_at: new Date(),
        resize_shrink_tx_digest: digest,
      },
    });
    this.logger.log(
      `shrunk pool=${pool.vault_object_id} project=${pool.project_id} ` +
        `${percent}% of unused (target ${pending.new_reserved_mb} MB) tx=${digest}`,
    );
  }

  private async submitShrink(args: {
    vaultObjectId: string;
    percent: number;
  }): Promise<string> {
    const tx = new Transaction();
    tx.add(
      pool_vault.resizeShrink({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: args.vaultObjectId,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          percent: args.percent,
        },
      }),
    );
    const result = await this.gasPool.execute(tx);
    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? "unknown";
      throw new Error(`pool_vault::resize_shrink reverted: ${err}`);
    }
    return result.digest;
  }

  private async submitExtend(args: {
    vaultObjectId: string;
    reservedBytes: bigint;
    extendEpochs: number;
  }): Promise<string> {
    // Budget: storage cost for the reserved capacity over the new
    // epoch window, with the safety multiplier from walrus-client.
    const paymentBudget = getPoolStorageCostFrost(
      args.reservedBytes,
      args.extendEpochs,
    );
    const tx = new Transaction();
    tx.add(
      pool_vault.extend({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: args.vaultObjectId,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          extendedEpochs: args.extendEpochs,
          paymentBudgetFrost: paymentBudget,
        },
      }),
    );
    const result = await this.gasPool.execute(tx);
    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? "unknown";
      throw new Error(`pool_vault::extend reverted: ${err}`);
    }
    return result.digest;
  }
}
