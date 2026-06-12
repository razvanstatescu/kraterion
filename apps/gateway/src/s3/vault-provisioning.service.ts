/**
 * Lazy provisioner for per-project `KraterionPoolVault`s.
 *
 * The first PUT in a brand-new project has no on-chain vault yet — this
 * service creates one synchronously, waits for the indexer to write the
 * `StoragePool` row, then returns the vault's on-chain object ID. All
 * subsequent PUTs read the cached row.
 *
 * Race condition: two concurrent PUTs landing on a brand-new project
 * would both see "no vault" and both try to create one. We guard with a
 * Postgres advisory lock keyed on `project_id`. The second waiter
 * blocks until the first finishes, then re-reads the now-present row.
 *
 * The vault is signed by the gateway operator wallet (the same wallet
 * that's already on the reserve whitelist via the existing
 * `api_decryption` SubWallet — see `GatewayKeypairService`). The user's
 * Sui address is recorded as `vault.created_by` so user-side
 * `pool_vault::revoke_all` can assert ownership without an on-chain
 * `Project` Move object.
 *
 * See /docs/storage-pool-migration.md §2.4 (decision: gateway-signed
 * vault creation, `created_by` from intended_owner parameter).
 */

import { Injectable, Logger } from "@nestjs/common";
import { Transaction } from "@mysten/sui/transactions";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  STORAGE_DEFAULT_MB,
  WALRUS_SYSTEM_OBJECT_ID,
  initialPoolEpochsAhead,
} from "@kraterion/shared";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import { getPoolStorageCostFrost } from "@kraterion/walrus-client";
import { PrismaService } from "../prisma/prisma.service.js";
import { GasPoolService } from "../sui/gas-pool.service.js";
import { S3Error } from "./s3-error.js";

/**
 * Initial vault capacity for new projects. Anchored to
 * `STORAGE_DEFAULT_MB` so the on-chain pool matches the billing free
 * tier — no over-provisioning before the customer reserves more. Each
 * Stripe quantity unit = 1 MiB of encoded capacity. The dashboard
 * resize modal lets the customer go higher; the pool-renewal worker
 * extends every billing cycle.
 */
const INITIAL_RESERVED_ENCODED_BYTES = BigInt(STORAGE_DEFAULT_MB) * 1024n * 1024n;
/**
 * Initial pool lifetime — one billing cycle + renewal buffer.
 * Computed from `BILLING_CYCLE_DAYS` + `POOL_RENEWAL_BUFFER_DAYS` /
 * per-network epoch length in `@kraterion/shared`. See the comment on
 * `initialPoolEpochsAhead` for the reasoning.
 *
 * Previously hardcoded at 53 epochs (~2 years on mainnet) which left
 * downsized pools pre-paid for years of unused capacity. The new model
 * relies on `PoolRenewalProcessor` to extend monthly; this constant
 * just buys headroom for the first cycle.
 */
const INITIAL_EPOCHS_AHEAD = initialPoolEpochsAhead();
/** 15s — matches `waitForS3Object` for the indexer-ack timeout. */
const INDEXER_WAIT_TIMEOUT_MS = 15_000;
const INDEXER_POLL_INTERVAL_MS = 250;

@Injectable()
export class VaultProvisioningService {
  private readonly logger = new Logger(VaultProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gasPool: GasPoolService,
  ) {}

  /**
   * Return the vault's on-chain object ID for `projectId`, creating it
   * lazily if absent. `intendedOwner` is the Sui address that becomes
   * `vault.created_by` — typically the project owner's zkLogin address
   * (read by callers from the request context).
   *
   * Idempotent: concurrent first-PUTs serialize on a Postgres advisory
   * lock; only one tx hits the chain.
   */
  async ensureVaultForProject(
    projectId: string,
    intendedOwner: string,
  ): Promise<{ vaultObjectId: string; poolObjectId: string }> {
    // Fast path — vault row already present.
    const existing = await this.prisma.storagePool.findUnique({
      where: { project_id: projectId },
      select: { vault_object_id: true, pool_object_id: true },
    });
    if (existing) {
      return {
        vaultObjectId: existing.vault_object_id,
        poolObjectId: existing.pool_object_id,
      };
    }

    // Slow path — needs creation. Take an advisory lock to serialize
    // concurrent first-PUTs. The lock key is a stable hash of project_id,
    // truncated to fit pg_advisory_lock's bigint argument.
    const lockKey = this.advisoryLockKey(projectId);
    return await this.prisma.$transaction(async (tx) => {
      // `$executeRawUnsafe` (not `$queryRawUnsafe`) because
      // `pg_advisory_xact_lock` returns void — Prisma's row deserializer
      // throws "Failed to deserialize column of type 'void'" otherwise.
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

      // Re-check inside the lock — the other waiter may have finished.
      const recheck = await tx.storagePool.findUnique({
        where: { project_id: projectId },
        select: { vault_object_id: true, pool_object_id: true },
      });
      if (recheck) {
        return {
          vaultObjectId: recheck.vault_object_id,
          poolObjectId: recheck.pool_object_id,
        };
      }

      this.logger.log(
        `creating vault for project=${projectId} owner=${intendedOwner.slice(0, 12)}…`,
      );

      const ids = await this.submitCreateVault(projectId, intendedOwner);
      // The `tx` transaction commits AFTER we exit this callback; until
      // then the lock is held. Other waiters block. By the time they
      // re-check, the indexer will have written the StoragePool row
      // (we waited for it below) AND the lock will have released.
      return ids;
    });
  }

  /** Build the create_vault PTB, sign + submit, wait for indexer. */
  private async submitCreateVault(
    projectId: string,
    intendedOwner: string,
  ): Promise<{ vaultObjectId: string; poolObjectId: string }> {
    const paymentBudget = getPoolStorageCostFrost(
      INITIAL_RESERVED_ENCODED_BYTES,
      INITIAL_EPOCHS_AHEAD,
    );

    const projectIdBytes = Array.from(new TextEncoder().encode(projectId));

    const tx = new Transaction();
    tx.add(
      pool_vault.createVault({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          reservedEncodedCapacityBytes: INITIAL_RESERVED_ENCODED_BYTES,
          epochsAhead: INITIAL_EPOCHS_AHEAD,
          paymentBudgetFrost: paymentBudget,
          intendedOwner,
          projectId: projectIdBytes,
        },
      }),
    );

    let result;
    try {
      result = await this.gasPool.execute(tx, { showObjectChanges: true });
    } catch (e) {
      this.logger.error(
        `create_vault RPC failed for project=${projectId}: ${(e as Error).message}`,
      );
      throw new S3Error(
        "ServiceUnavailable",
        "Could not provision storage for your project; please retry.",
      );
    }
    if (result.effects?.status?.status !== "success") {
      this.logger.error(
        `create_vault reverted for project=${projectId}: ${result.effects?.status?.error}`,
      );
      throw new S3Error(
        "InternalError",
        `Storage vault creation failed: ${result.effects?.status?.error ?? "unknown"}`,
      );
    }

    // Wait for the indexer to write the StoragePool row. We could parse
    // the on-chain object IDs directly from `result.objectChanges`, but
    // waiting on the indexer keeps the row available to any other
    // service that reads it — and matches the existing `waitForS3Object`
    // pattern. If indexer is down, we 503 (data IS on chain).
    const row = await this.waitForStoragePoolRow(projectId);

    this.logger.log(
      `vault provisioned project=${projectId} vault=${row.vault_object_id.slice(0, 12)}… ` +
        `pool=${row.pool_object_id.slice(0, 12)}… tx=${result.digest}`,
    );
    return {
      vaultObjectId: row.vault_object_id,
      poolObjectId: row.pool_object_id,
    };
  }

  private async waitForStoragePoolRow(
    projectId: string,
  ): Promise<{ vault_object_id: string; pool_object_id: string }> {
    const start = Date.now();
    while (Date.now() - start < INDEXER_WAIT_TIMEOUT_MS) {
      const row = await this.prisma.storagePool.findUnique({
        where: { project_id: projectId },
        select: { vault_object_id: true, pool_object_id: true },
      });
      if (row) return row;
      await sleep(INDEXER_POLL_INTERVAL_MS);
    }
    this.logger.error(
      `StoragePool row never appeared after ${INDEXER_WAIT_TIMEOUT_MS}ms (project=${projectId})`,
    );
    throw new S3Error(
      "ServiceUnavailable",
      "Storage vault created on-chain but the indexer hasn't caught up. Retry the request.",
    );
  }

  /**
   * Convert a UUID string to a deterministic bigint key for
   * pg_advisory_xact_lock. The lock space is 2^64; we hash the UUID
   * with djb2 and mask to fit a signed bigint (Postgres uses int8).
   */
  private advisoryLockKey(projectId: string): bigint {
    let hash = 5381n;
    for (let i = 0; i < projectId.length; i++) {
      hash = ((hash << 5n) + hash + BigInt(projectId.charCodeAt(i))) & 0xffffffffffffffffn;
    }
    // Coerce to signed-int8 range: subtract 2^64 if high bit set.
    const signed =
      hash > 0x7fffffffffffffffn ? hash - 0x10000000000000000n : hash;
    return signed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
