import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionPoolExtendedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionPoolExtended` → bump `StoragePool.end_epoch` + audit row.
 *
 * Emitted by `pool_vault::extend` (admin endpoint in v1; future
 * automated renewal worker in Phase R).
 *
 * The audit row carries `(tx_digest, event_seq) UNIQUE` for replay
 * safety — the pool's `end_epoch` is what the gateway and the renewal
 * cron read for "when does this need renewing?", so we update it
 * unconditionally (the event carries the new value directly).
 */
@Injectable()
export class PoolExtendedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionPoolExtended"] as const;

  private readonly logger = new Logger(PoolExtendedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionPoolExtendedSchema.parse(event.payload);

    const pool = await tx.storagePool.findUnique({
      where: { vault_object_id: parsed.vault_id },
      select: { id: true, end_epoch: true },
    });
    if (!pool) {
      throw new Error(
        `PoolExtendedHandler: no StoragePool for vault=${parsed.vault_id}. ` +
          `vault-created event must arrive first.`,
      );
    }

    // Idempotency log first — composite unique key dedupes replays.
    // On conflict we treat the event as already-applied (no-op).
    try {
      await tx.storagePoolExtension.create({
        data: {
          storage_pool_id: pool.id,
          kind: "extend",
          prev_end_epoch: pool.end_epoch,
          new_end_epoch: parsed.new_end_epoch,
          tx_digest: event.txDigest,
          event_seq: event.eventSeq,
        },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // Already applied. Skip.
        return;
      }
      throw err;
    }

    await tx.storagePool.update({
      where: { id: pool.id },
      data: {
        end_epoch: parsed.new_end_epoch,
        last_extended_at: new Date(),
        last_synced_at: new Date(),
      },
    });

    this.logger.log(
      `StoragePool extended: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `${pool.end_epoch} → ${parsed.new_end_epoch} ` +
        `by=${parsed.extended_by}`,
    );
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
