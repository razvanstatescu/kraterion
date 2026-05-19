import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionPoolResizedGrowSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionPoolResizedGrow` → bump `StoragePool.reserved_encoded_bytes`
 * + audit row.
 *
 * Emitted by `pool_vault::resize_grow` (admin endpoint in v1; future
 * reactive auto-grow in Phase J).
 *
 * `pool_vault::resize_shrink` doesn't get an audit-event handler in v1
 * because shrink ops are admin-driven and rare; the new reserved size
 * can be read on-chain when needed. We can add a Resized handler if
 * shrink-volume justifies it.
 */
@Injectable()
export class PoolResizedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionPoolResizedGrow"] as const;

  private readonly logger = new Logger(PoolResizedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionPoolResizedGrowSchema.parse(event.payload);

    const pool = await tx.storagePool.findUnique({
      where: { vault_object_id: parsed.vault_id },
      select: { id: true, reserved_encoded_bytes: true },
    });
    if (!pool) {
      throw new Error(
        `PoolResizedHandler: no StoragePool for vault=${parsed.vault_id}.`,
      );
    }

    try {
      await tx.storagePoolExtension.create({
        data: {
          storage_pool_id: pool.id,
          kind: "resize_grow",
          prev_reserved_bytes: pool.reserved_encoded_bytes,
          new_reserved_bytes: parsed.new_reserved_encoded_capacity_bytes,
          tx_digest: event.txDigest,
          event_seq: event.eventSeq,
        },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return;
      }
      throw err;
    }

    await tx.storagePool.update({
      where: { id: pool.id },
      data: {
        reserved_encoded_bytes: parsed.new_reserved_encoded_capacity_bytes,
        last_resized_at: new Date(),
        last_synced_at: new Date(),
      },
    });

    this.logger.log(
      `StoragePool grew: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `+${parsed.additional_encoded_capacity_bytes} bytes → ` +
        `${parsed.new_reserved_encoded_capacity_bytes} total ` +
        `by=${parsed.resized_by}`,
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
