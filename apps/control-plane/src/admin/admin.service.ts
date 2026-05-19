/**
 * Service for `/admin/*` pool operations: list, detail, manual extend,
 * manual resize-grow, on-chain reserve balance lookup.
 *
 * All on-chain calls are signed by the gateway operator wallet (loaded
 * by `OperatorKeypairService`), which is on the platform reserve's
 * `authorized_callers` whitelist — same wallet the gateway uses for
 * register/certify/delete. WAL for fees is pulled from the reserve by
 * the Move-side `pool_vault::*` entry functions.
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Transaction } from "@mysten/sui/transactions";
import {
  KRATERION_PACKAGE_ID,
  KRATERION_RESERVE_ID,
  WALRUS_SYSTEM_OBJECT_ID,
} from "@kraterion/shared";
import { pool_vault } from "@kraterion/kraterion-move-sdk";
import {
  getPoolExtendCostFrost,
  getPoolStorageCostFrost,
  getSuiClient,
} from "@kraterion/walrus-client";
import { PrismaService } from "../prisma/prisma.service.js";
import { OperatorKeypairService } from "../sui/operator-keypair.service.js";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operatorKeypair: OperatorKeypairService,
  ) {}

  /** Paginated list of storage pools. v1: simple, no cursor — admins
   *  inspect a handful of pools at a time. */
  async listPools() {
    const rows = await this.prisma.storagePool.findMany({
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        project: { select: { id: true, name: true, account: { select: { email: true } } } },
        _count: { select: { pooled_blobs: true, extensions: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      project: {
        id: p.project_id,
        name: p.project.name,
        account_email: p.project.account.email,
      },
      vault_object_id: p.vault_object_id,
      pool_object_id: p.pool_object_id,
      reserved_encoded_bytes: p.reserved_encoded_bytes.toString(),
      used_encoded_bytes: p.used_encoded_bytes.toString(),
      blob_count: p.blob_count,
      live_pooled_blobs: p._count.pooled_blobs,
      extension_count: p._count.extensions,
      start_epoch: p.start_epoch,
      end_epoch: p.end_epoch,
      user_revoked: p.user_revoked,
      status: p.status,
      created_by_address: p.created_by_address,
      created_at: p.created_at.toISOString(),
      last_extended_at: p.last_extended_at?.toISOString() ?? null,
      last_resized_at: p.last_resized_at?.toISOString() ?? null,
      last_synced_at: p.last_synced_at.toISOString(),
    }));
  }

  /** Pool detail + last 20 extensions. */
  async getPool(id: string) {
    const pool = await this.prisma.storagePool.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, account: { select: { email: true } } } },
        extensions: {
          orderBy: { occurred_at: "desc" },
          take: 20,
        },
        _count: { select: { pooled_blobs: true } },
      },
    });
    if (!pool) {
      throw new NotFoundException(`StoragePool not found: ${id}`);
    }
    return {
      id: pool.id,
      project: {
        id: pool.project_id,
        name: pool.project.name,
        account_email: pool.project.account.email,
      },
      vault_object_id: pool.vault_object_id,
      pool_object_id: pool.pool_object_id,
      reserved_encoded_bytes: pool.reserved_encoded_bytes.toString(),
      used_encoded_bytes: pool.used_encoded_bytes.toString(),
      blob_count: pool.blob_count,
      live_pooled_blobs: pool._count.pooled_blobs,
      start_epoch: pool.start_epoch,
      end_epoch: pool.end_epoch,
      user_revoked: pool.user_revoked,
      status: pool.status,
      created_by_address: pool.created_by_address,
      created_at: pool.created_at.toISOString(),
      extensions: pool.extensions.map((e) => ({
        kind: e.kind,
        prev_end_epoch: e.prev_end_epoch,
        new_end_epoch: e.new_end_epoch,
        prev_reserved_bytes: e.prev_reserved_bytes?.toString() ?? null,
        new_reserved_bytes: e.new_reserved_bytes?.toString() ?? null,
        wal_cost_frost: e.wal_cost_frost.toString(),
        tx_digest: e.tx_digest.toString("utf8"),
        occurred_at: e.occurred_at.toISOString(),
      })),
    };
  }

  /** Manual `pool_vault::extend`. Returns the tx digest; indexer-side
   *  state catches up via the `pool-extended` handler. */
  async extendPool(id: string, extendedEpochs: number) {
    if (extendedEpochs <= 0 || extendedEpochs > 53) {
      throw new Error(`extendedEpochs must be 1..53 (got ${extendedEpochs})`);
    }
    const pool = await this.prisma.storagePool.findUnique({
      where: { id },
      select: {
        vault_object_id: true,
        reserved_encoded_bytes: true,
        status: true,
      },
    });
    if (!pool) {
      throw new NotFoundException(`StoragePool not found: ${id}`);
    }
    if (pool.status !== "active") {
      throw new Error(`Pool is ${pool.status}; cannot extend.`);
    }

    const paymentBudget = getPoolExtendCostFrost(
      pool.reserved_encoded_bytes,
      extendedEpochs,
    );

    const tx = new Transaction();
    tx.add(
      pool_vault.extend({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: pool.vault_object_id,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          extendedEpochs,
          paymentBudgetFrost: paymentBudget,
        },
      }),
    );

    return this.submit(tx, `extend pool=${id} epochs=${extendedEpochs}`);
  }

  /** Manual `pool_vault::resize_grow`. Returns the tx digest. */
  async resizeGrow(id: string, additionalBytes: bigint) {
    if (additionalBytes <= 0n) {
      throw new Error("additionalBytes must be positive.");
    }
    const pool = await this.prisma.storagePool.findUnique({
      where: { id },
      select: {
        vault_object_id: true,
        end_epoch: true,
        start_epoch: true,
        status: true,
      },
    });
    if (!pool) {
      throw new NotFoundException(`StoragePool not found: ${id}`);
    }
    if (pool.status !== "active") {
      throw new Error(`Pool is ${pool.status}; cannot resize.`);
    }

    // The new capacity is paid for the REMAINING epochs of the pool's
    // lifetime. We don't know the on-chain current_epoch without an RPC
    // call; conservatively budget against the full start→end window
    // (over-budget returns to the reserve).
    const remainingEpochs = pool.end_epoch - pool.start_epoch;
    const paymentBudget = getPoolStorageCostFrost(additionalBytes, remainingEpochs);

    const tx = new Transaction();
    tx.add(
      pool_vault.resizeGrow({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          vault: pool.vault_object_id,
          reserve: KRATERION_RESERVE_ID,
          system: WALRUS_SYSTEM_OBJECT_ID,
          additionalEncodedCapacityBytes: additionalBytes,
          paymentBudgetFrost: paymentBudget,
        },
      }),
    );

    return this.submit(tx, `resize-grow pool=${id} +${additionalBytes} bytes`);
  }

  /**
   * Read the on-chain `PlatformReserve` balance + whitelist state via
   * `sui_getObject`. The DB doesn't mirror this (the reserve is shared
   * across all projects and changes are infrequent); we read fresh.
   */
  async getReserve() {
    const client = getSuiClient();
    const obj = await client.getObject({
      id: KRATERION_RESERVE_ID,
      options: { showContent: true },
    });
    const content = obj.data?.content;
    if (!content || content.dataType !== "moveObject") {
      throw new Error("PlatformReserve object missing or not a Move object.");
    }
    const fields = content.fields as Record<string, unknown>;
    // wal_balance is `Balance<WAL>`; the inner `value` field is the
    // u64 FROST amount.
    const balance = fields["wal_balance"] as
      | { fields: { value: string | number } }
      | undefined;
    const walFrost = balance ? BigInt(balance.fields.value) : 0n;
    return {
      reserve_object_id: KRATERION_RESERVE_ID,
      admin_address: fields["admin"] as string,
      authorized_callers: (fields["authorized_callers"] as string[]) ?? [],
      wal_balance_frost: walFrost.toString(),
      // Convenience: WAL = 10^9 FROST. We surface both for ops.
      wal_balance: (Number(walFrost) / 1e9).toFixed(6),
    };
  }

  private async submit(tx: Transaction, label: string) {
    const client = getSuiClient();
    const keypair = this.operatorKeypair.getKeypair();
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true },
    });
    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? "unknown";
      this.logger.error(`Admin tx failed (${label}): ${err}`);
      throw new Error(`Admin tx failed: ${err}`);
    }
    this.logger.log(`Admin tx ok (${label}): digest=${result.digest}`);
    return { tx_digest: result.digest };
  }
}
