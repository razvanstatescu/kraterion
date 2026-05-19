import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionVaultCreatedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionVaultCreated` → `StoragePool` row.
 *
 * Emitted by `pool_vault::create_vault` (gateway-signed via
 * `VaultProvisioningService`). The `project_id` field carries the
 * off-chain Postgres `Project.id` UUID as bytes; we decode it back
 * to UTF-8 to look up the parent project.
 *
 * Idempotent: re-running on the same (tx_digest, event_seq) is a no-op
 * because of the `@@unique([tx_digest, event_seq])` constraint. The
 * upsert by `vault_object_id` handles the gateway's
 * indexer-wait → re-poll race (where the gateway has already created
 * the row optimistically — unlikely under v1 design but cheap insurance).
 */
@Injectable()
export class VaultCreatedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionVaultCreated"] as const;

  private readonly logger = new Logger(VaultCreatedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionVaultCreatedSchema.parse(event.payload);
    const projectId = parsed.project_id.toString("utf8");

    // Defensive: confirm the project exists. If not, DLQ — likely a
    // race against the dashboard's Account/Project provisioning (the
    // gateway should never call create_vault for a project that isn't
    // in our DB, but DLQ instead of silently dropping is safer).
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new Error(
        `VaultCreatedHandler: no Project for project_id=${projectId}. ` +
          `Vault ${parsed.vault_id} can't be linked.`,
      );
    }

    await tx.storagePool.upsert({
      where: { vault_object_id: parsed.vault_id },
      create: {
        project_id: projectId,
        vault_object_id: parsed.vault_id,
        pool_object_id: parsed.pool_id,
        reserved_encoded_bytes: parsed.reserved_encoded_capacity_bytes,
        start_epoch: parsed.start_epoch,
        end_epoch: parsed.end_epoch,
        created_by_address: parsed.created_by,
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
      },
      update: {
        // Pre-existing row (shouldn't happen in v1 — the gateway calls
        // ensureVaultForProject which doesn't write the DB row directly).
        // Backfill provenance only.
        tx_digest: event.txDigest,
        event_seq: event.eventSeq,
      },
    });

    this.logger.log(
      `StoragePool created: project=${projectId} vault=${parsed.vault_id.slice(0, 12)}… ` +
        `pool=${parsed.pool_id.slice(0, 12)}… reserved=${parsed.reserved_encoded_capacity_bytes} ` +
        `end_epoch=${parsed.end_epoch}`,
    );
  }
}
