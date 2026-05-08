import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { BucketVisibilityChangedSchema, encryptionModeToString } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `BucketVisibilityChanged` → `Bucket.encryption_mode`.
 *
 * The Move `set_bucket_visibility` flips between PRIVATE (0) and
 * PUBLIC (1). The handler maps via `encryptionModeToString` and
 * applies the change.
 *
 * The Move side already short-circuits no-op flips (the test
 * `test_set_visibility_idempotent_no_event` verifies this), so a
 * received event always represents a real state change. Still, the
 * UPDATE is naturally idempotent — re-processing on `indexer:reset`
 * replays events in checkpoint order and lands on the same final
 * encryption_mode.
 */
@Injectable()
export class BucketVisibilityChangedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::BucketVisibilityChanged"] as const;

  private readonly logger = new Logger(BucketVisibilityChangedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = BucketVisibilityChangedSchema.parse(event.payload);
    const newMode = encryptionModeToString(parsed.new_mode);
    const result = await tx.bucket.updateMany({
      where: { kraterion_bucket_object_id: parsed.bucket_id, deleted_at: null },
      data: { encryption_mode: newMode },
    });
    if (result.count === 0) {
      throw new Error(
        `BucketVisibilityChanged: no Bucket row for ${parsed.bucket_id} ` +
          `(BucketCreatedHandler not yet run?)`,
      );
    }
    this.logger.log(
      `bucket visibility ${encryptionModeToString(parsed.old_mode)} → ${newMode} for ${parsed.bucket_id}`,
    );
  }
}
