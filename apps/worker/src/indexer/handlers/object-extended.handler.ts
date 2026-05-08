import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { KraterionObjectExtendedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionObjectExtended` → increment `S3Object.storage_end_epoch`
 * by `epochs_added`.
 *
 * Idempotency: this is the one handler whose core action is NOT
 * naturally idempotent (replaying would double-add). We use a small
 * log table `S3ObjectExtension` with `(tx_digest, event_seq) UNIQUE`.
 * Insert the log row first; on conflict (P2002), the extension was
 * already applied and we skip the increment entirely. Otherwise we
 * apply the increment in the same transaction.
 *
 * `funder` is captured for accounting — handy when we eventually
 * surface "who's been topping up the platform reserve" in the
 * dashboard.
 */
@Injectable()
export class ObjectExtendedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionObjectExtended"] as const;

  private readonly logger = new Logger(ObjectExtendedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionObjectExtendedSchema.parse(event.payload);

    // Find the S3Object by SharedBlob ID. If it doesn't exist, the
    // ObjectCreatedHandler hasn't run yet — let DLQ catch it.
    const s3Object = await tx.s3Object.findUnique({
      where: { shared_blob_object_id: parsed.shared_blob_id },
      select: { id: true, storage_end_epoch: true, s3_key: true },
    });
    if (!s3Object) {
      throw new Error(
        `ObjectExtendedHandler: no S3Object for shared_blob_object_id=${parsed.shared_blob_id}`,
      );
    }

    try {
      await tx.s3ObjectExtension.create({
        data: {
          s3_object_id: s3Object.id,
          tx_digest: event.txDigest,
          event_seq: event.eventSeq,
          epochs_added: parsed.epochs_added,
          funder: parsed.funder,
        },
      });
    } catch (err) {
      // P2002 = unique constraint violation on (tx_digest, event_seq).
      // The extension was already applied in a prior run; skip cleanly.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        this.logger.debug(
          `S3ObjectExtension already applied for tx=${event.txDigest.toString("utf8").slice(0, 12)}…`,
        );
        return;
      }
      throw err;
    }

    // Insert succeeded → apply the increment.
    await tx.s3Object.update({
      where: { id: s3Object.id },
      data: { storage_end_epoch: { increment: parsed.epochs_added } },
    });
    this.logger.log(
      `extended s3_key="${s3Object.s3_key}" by ${parsed.epochs_added} epochs ` +
        `(${s3Object.storage_end_epoch} → ${s3Object.storage_end_epoch + parsed.epochs_added}) ` +
        `funder=${parsed.funder}`,
    );
  }
}
