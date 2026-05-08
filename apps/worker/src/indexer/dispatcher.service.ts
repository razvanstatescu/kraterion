import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  indexerEventsProcessed,
  indexerHandlerFailures,
  indexerLagSeconds,
} from "./metrics.js";
import { BucketCreatedHandler } from "./handlers/bucket-created.handler.js";
import type { EventHandler, ParsedEvent } from "./handlers/handler.interface.js";

/**
 * Routes events to handlers by `eventType` suffix. The map is
 * deliberately keyed on the package-id-stripped suffix
 * (`::events::KraterionBucketCreated`) so a Move package redeploy
 * doesn't require touching the dispatcher.
 *
 * Phase 1 wires only `BucketCreatedHandler`. Phase 2/3 register the
 * remaining 5 active handlers + 5 log-only fallthroughs.
 */
@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly handlers: EventHandler[];

  constructor(bucketCreated: BucketCreatedHandler) {
    this.handlers = [bucketCreated];
  }

  /**
   * Find the matching handler for an event type. Returns `null` if
   * no handler is registered (the run-loop logs and skips — known-
   * but-unhandled events should not poison-pill the queue).
   */
  resolve(eventType: string): EventHandler | null {
    for (const h of this.handlers) {
      if (eventType.endsWith(h.typeSuffix)) return h;
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
