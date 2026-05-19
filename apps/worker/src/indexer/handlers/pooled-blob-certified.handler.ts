import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionPooledBlobCertifiedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionPooledBlobCertified` → flip `PooledBlob.status` to
 * 'certified'.
 *
 * The gateway's `waitForS3Object` polls for
 * `S3Object.pooled_blob.status='certified'` after PTB 2 lands —
 * meaning the row is created by the register handler with
 * status='registered', and this handler flips it to 'certified',
 * which is what unblocks the PUT response.
 *
 * Idempotent — re-applying on an already-certified row is harmless.
 */
@Injectable()
export class PooledBlobCertifiedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionPooledBlobCertified"] as const;

  private readonly logger = new Logger(PooledBlobCertifiedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionPooledBlobCertifiedSchema.parse(event.payload);

    const result = await tx.pooledBlob.updateMany({
      where: { pooled_blob_object_id: parsed.pooled_blob_object_id },
      data: {
        status: "certified",
        certified_at: new Date(),
      },
    });

    if (result.count === 0) {
      // Either the register event hasn't been processed yet (race —
      // throw and DLQ for retry), or we're seeing a stray event for a
      // pool we don't track. Throwing covers both: the register event
      // is bounded by `tx_digest`-ordered checkpoint replay, so a few
      // retries should resolve any race.
      throw new Error(
        `PooledBlobCertifiedHandler: no PooledBlob row for ` +
          `pooled_blob_object_id=${parsed.pooled_blob_object_id}.`,
      );
    }

    this.logger.log(
      `PooledBlob certified: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `pooled=${parsed.pooled_blob_object_id.slice(0, 12)}…`,
    );
  }
}
