import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  indexerEventsProcessed,
  indexerHandlerFailures,
  indexerLagSeconds,
} from "./metrics.js";
import { BucketCreatedHandler } from "./handlers/bucket-created.handler.js";
import { ObjectCreatedHandler } from "./handlers/object-created.handler.js";
import { ObjectExtendedHandler } from "./handlers/object-extended.handler.js";
import { ApiAccessHandler } from "./handlers/api-access.handler.js";
import { BucketVisibilityChangedHandler } from "./handlers/bucket-visibility.handler.js";
import type { EventHandler, ParsedEvent } from "./handlers/handler.interface.js";

/**
 * Routes events to handlers by `eventType` suffix. The map is
 * deliberately keyed on the package-id-stripped suffix
 * (`::events::KraterionBucketCreated`) so a Move package redeploy
 * doesn't require touching the dispatcher.
 *
 * Reserve events (`ReserveCreated`, `ReserveCallerAuthorized`,
 * `ReserveCallerDeauthorized`, `ReserveFunded`, `ReserveWithdrawn`)
 * have no domain mapping yet — they fall through to the
 * "unhandled event" debug log. A `ReserveBalanceMirror` table is a
 * future Phase-7 nice-to-have.
 */
@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly handlers: EventHandler[];

  constructor(
    bucketCreated: BucketCreatedHandler,
    objectCreated: ObjectCreatedHandler,
    objectExtended: ObjectExtendedHandler,
    apiAccess: ApiAccessHandler,
    bucketVisibility: BucketVisibilityChangedHandler,
  ) {
    this.handlers = [
      bucketCreated,
      objectCreated,
      objectExtended,
      apiAccess,
      bucketVisibility,
    ];
  }

  /**
   * Find the matching handler for an event type. Returns `null` if
   * no handler is registered (the run-loop logs and skips — known-
   * but-unhandled events should not poison-pill the queue).
   */
  resolve(eventType: string): EventHandler | null {
    for (const h of this.handlers) {
      for (const suffix of h.typeSuffixes) {
        if (eventType.endsWith(suffix)) return h;
      }
    }
    return null;
  }

  /**
   * Dispatch a single event inside the checkpoint's open transaction.
   * Throws on handler failure — caller catches and routes to DLQ.
   */
  async dispatch(
    tx: Prisma.TransactionClient,
    sourceId: string,
    event: ParsedEvent,
  ): Promise<void> {
    const handler = this.resolve(event.eventType);
    if (!handler) {
      // Unhandled event — not an error. Counter exists for visibility,
      // not for alerting.
      this.logger.debug(
        `unhandled event type=${event.eventType} ` +
          `tx=${event.txDigest.toString("utf8").slice(0, 12)}…`,
      );
      return;
    }
    try {
      await handler.handle(tx, event);
      indexerEventsProcessed.inc({ source: sourceId, type: event.eventType });
      // Lag = wall-clock now - event timestamp (ms → s).
      if (event.timestampMs > 0) {
        indexerLagSeconds.set(
          { source: sourceId },
          Math.max(0, (Date.now() - event.timestampMs) / 1000),
        );
      }
    } catch (err) {
      indexerHandlerFailures.inc({ source: sourceId, type: event.eventType });
      throw err;
    }
  }
}
