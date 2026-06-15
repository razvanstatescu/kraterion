import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { EmbeddingsService } from "../../embeddings/embeddings.service.js";
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
 * Knowledge-indexer self-heal: when the grant targets the global
 * `knowledge_indexer` sub-wallet on a knowledge-enabled bucket, we
 * enqueue a full backfill. This is the DURABLE counterpart to the
 * dashboard's best-effort post-grant backfill call (KnowledgeToggle):
 * because we trigger off the on-chain grant event, indexing starts the
 * moment the indexer actually gains decrypt access — regardless of
 * whether the client's grant→backfill handshake completed, the tab
 * stayed open, or the user re-enabled to retry. Idempotent: the
 * embeddings queue dedups on `manifest_<id>_v<n>`.
 *
 * Other `granted_to` addresses (per-agent grants, etc.) are logged and
 * skipped — they're not the gateway and not the indexer.
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

  // Cached lowercase address of the global `knowledge_indexer` sub-wallet.
  // Resolved once from the DB; the wallet is created at bootstrap and
  // never rotates within a process lifetime.
  private knowledgeIndexerAddr: string | null = null;

  constructor(private readonly embeddings: EmbeddingsService) {}

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    if (event.eventType.endsWith("::events::ApiAccessGranted")) {
      await this.handleGranted(tx, event);
    } else if (event.eventType.endsWith("::events::ApiAccessRevoked")) {
      await this.handleRevoked(tx, event);
    } else {
      throw new Error(`ApiAccessHandler received unexpected event type: ${event.eventType}`);
    }
  }

  /** Lowercase address of the global knowledge_indexer sub-wallet, cached. */
  private async getKnowledgeIndexerAddr(
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (this.knowledgeIndexerAddr !== null) return this.knowledgeIndexerAddr;
    const sw = await tx.subWallet.findFirst({
      where: { role: "knowledge_indexer", account_id: null },
      select: { sui_address: true },
    });
    this.knowledgeIndexerAddr = sw?.sui_address.toLowerCase() ?? null;
    return this.knowledgeIndexerAddr;
  }

  private async handleGranted(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = ApiAccessGrantedSchema.parse(event.payload);
    const grantedTo = parsed.granted_to.toLowerCase();

    // Knowledge-indexer grant → kick a backfill so the bucket's existing
    // objects get indexed now that the indexer can decrypt them. Doesn't
    // touch `api_access_granted` (that boolean tracks the gateway only).
    const indexerAddr = await this.getKnowledgeIndexerAddr(tx);
    if (indexerAddr && grantedTo === indexerAddr) {
      const bucket = await tx.bucket.findFirst({
        where: { kraterion_bucket_object_id: parsed.bucket_id, deleted_at: null },
        select: { id: true, knowledge: { select: { bucket_id: true } } },
      });
      if (!bucket) {
        // Out-of-order: bucket-created not yet processed. Bubble to DLQ
        // for a retry sweep, same as the gateway path below.
        throw new Error(
          `ApiAccessGranted(indexer): no Bucket row for ${parsed.bucket_id} (BucketCreatedHandler not yet run?)`,
        );
      }
      if (bucket.knowledge) {
        // Fire-and-forget — BullMQ Redis writes shouldn't block the
        // indexer's checkpoint commit, and `enqueueBucket` reads
        // already-committed S3Object rows on its own connection.
        const bucketId = bucket.id;
        void this.embeddings
          .enqueueBucket(bucketId)
          .then((n) =>
            this.logger.log(
              `indexer granted → backfilled bucket=${bucketId} objects=${n}`,
            ),
          )
          .catch((err: unknown) =>
            this.logger.error(
              `indexer-granted backfill failed bucket=${bucketId}: ` +
                (err instanceof Error ? err.message : String(err)),
            ),
          );
      } else {
        this.logger.debug(
          `indexer granted on bucket=${parsed.bucket_id} but Knowledge not enabled; no backfill`,
        );
      }
      return;
    }

    const ourGatewayAddr = process.env["INDEXER_GATEWAY_ADDRESS"] ?? null;
    if (ourGatewayAddr && grantedTo !== ourGatewayAddr.toLowerCase()) {
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
