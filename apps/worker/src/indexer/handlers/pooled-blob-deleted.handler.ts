import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionPooledBlobDeletedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionPooledBlobDeleted` → finalize delete state.
 *
 * Emitted by `pool_vault::delete_blob` (both the explicit S3 DELETE
 * path AND the overwrite-DELETE leg of an overwriting PUT). The
 * gateway's DELETE handler already soft-marks the row optimistically
 * (so the user-visible state advances even if the chain tx is slow);
 * this handler just makes the deletion absolute by setting
 * `PooledBlob.status='deleted'` and clearing the FK link from
 * `S3Object`.
 *
 * Clearing the FK matters because the pool's `used_encoded_bytes`
 * counter is now decremented; the storage_pool sync code reads
 * `pooled_blobs WHERE status != 'deleted'` to recompute slack and
 * shouldn't double-count the freed slot.
 *
 * Idempotent — re-applying on an already-deleted row is harmless.
 */
@Injectable()
export class PooledBlobDeletedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionPooledBlobDeleted"] as const;

  private readonly logger = new Logger(PooledBlobDeletedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionPooledBlobDeletedSchema.parse(event.payload);

    // Find the PooledBlob first so we can update both rows atomically.
    const pooled = await tx.pooledBlob.findUnique({
      where: { pooled_blob_object_id: parsed.pooled_blob_object_id },
      select: { id: true, status: true },
    });
    if (!pooled) {
      // Stray event — log + skip. Don't throw (no recovery possible).
      this.logger.warn(
        `PooledBlobDeletedHandler: no PooledBlob row for ` +
          `pooled_blob_object_id=${parsed.pooled_blob_object_id}. ` +
          `Skipping.`,
      );
      return;
    }
    if (pooled.status === "deleted") {
      // Already-applied. Idempotent skip.
      return;
    }

    await tx.pooledBlob.update({
      where: { id: pooled.id },
      data: { status: "deleted", deleted_at: new Date() },
    });
    // Clear the S3Object FK so the storage accounting query
    // (`pooled_blobs WHERE status != 'deleted'`) sees the right count.
    // The S3Object row itself stays soft-deleted (deleted_at != null)
    // from the gateway's optimistic mark.
    await tx.s3Object.updateMany({
      where: { pooled_blob_id: pooled.id },
      data: { pooled_blob_id: null },
    });

    this.logger.log(
      `PooledBlob deleted: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `pooled=${parsed.pooled_blob_object_id.slice(0, 12)}…`,
    );
  }
}
