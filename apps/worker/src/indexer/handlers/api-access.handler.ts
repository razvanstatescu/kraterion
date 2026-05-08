import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ApiAccessGrantedSchema,
  ApiAccessRevokedSchema,
} from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `ApiAccessGranted` / `ApiAccessRevoked` → `Bucket.api_access_granted`.
 *
 * Two events, one bucket field, two states:
 *   - `ApiAccessGranted{ granted_to: ourGatewayAddr }` → flip to true
 *   - `ApiAccessRevoked{ }` (revoke-all) → flip to false
 *
 * Sui's `KraterionBucket.api_decryption_addresses` is a `vector<address>`,
 * but our `Bucket.api_access_granted` is a single boolean — we only
 * mirror "is OUR gateway authorized," not the full list. This is fine
 * because the `revoke_all_api_access` Move call clears the entire list
 * (so granted=false applies to everyone), and grants are typically to
 * one gateway address (ours).
 *
 * `ApiAccessGranted` events that target a `granted_to` other than our
 * gateway sub-wallet are logged but skipped — they're someone else's
 * grant, not ours.
 *
 * Idempotency: a "set X = Y" UPDATE is naturally idempotent, so no
 * separate log table needed. Re-processing an event under
 * `indexer:reset` lands the same final state because cursor order is
 * preserved.
 */
@Injectable()
export class ApiAccessHandler implements EventHandler {
  // Two suffixes routed through the same handler — the dispatcher
  // calls `handle()` for both, and we disambiguate via
  // `event.eventType`.
  readonly typeSuffixes = [
    "::events::ApiAccessGranted",
    "::events::ApiAccessRevoked",
  ] as const;

  private readonly logger = new Logger(ApiAccessHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    if (event.eventType.endsWith("::events::ApiAccessGranted")) {
      await this.handleGranted(tx, event);
    } else if (event.eventType.endsWith("::events::ApiAccessRevoked")) {
      await this.handleRevoked(tx, event);
    } else {
      throw new Error(`ApiAccessHandler received unexpected event type: ${event.eventType}`);
    }
  }

  private async handleGranted(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = ApiAccessGrantedSchema.parse(event.payload);
    const ourGatewayAddr = process.env["INDEXER_GATEWAY_ADDRESS"] ?? null;
    if (ourGatewayAddr && parsed.granted_to.toLowerCase() !== ourGatewayAddr.toLowerCase()) {
      this.logger.debug(
        `ApiAccessGranted to ${parsed.granted_to} (not our gateway ${ourGatewayAddr}); skipping`,
      );
      return;
    }
    const result = await tx.bucket.updateMany({
      where: { kraterion_bucket_object_id: parsed.bucket_id, deleted_at: null },
      data: { api_access_granted: true },
    });
    if (result.count === 0) {
      // Bucket not yet indexed (out-of-order) — let it bubble; DLQ
      // will catch it and a retry sweep will re-attempt later.
      throw new Error(
        `ApiAccessGranted: no Bucket row for ${parsed.bucket_id} (BucketCreatedHandler not yet run?)`,
      );
    }
    this.logger.log(`api access GRANTED bucket=${parsed.bucket_id} → ${parsed.granted_to}`);
  }

  private async handleRevoked(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = ApiAccessRevokedSchema.parse(event.payload);
    const result = await tx.bucket.updateMany({
      where: { kraterion_bucket_object_id: parsed.bucket_id, deleted_at: null },
      data: { api_access_granted: false },
    });
    if (result.count === 0) {
      throw new Error(
        `ApiAccessRevoked: no Bucket row for ${parsed.bucket_id} (BucketCreatedHandler not yet run?)`,
      );
    }
    this.logger.log(`api access REVOKED bucket=${parsed.bucket_id}`);
  }
}
