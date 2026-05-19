import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { KraterionVaultRevokedSchema } from "../event-types.js";
import type { EventHandler, ParsedEvent } from "./handler.interface.js";

/**
 * `KraterionVaultRevoked` → flip `StoragePool.user_revoked` + status.
 *
 * Emitted by `pool_vault::revoke_all` (user-signed). After this,
 * the platform side can't `register_blob` / `certify_blob` /
 * `delete_blob` / `extend` / `resize_grow` against the vault — every
 * mutating entry fn asserts `vault.platform_authorized` before
 * checking reserve auth.
 *
 * Reads continue working; existing blobs stay alive until the pool's
 * `end_epoch` passes. With renewal blocked, they eventually expire.
 *
 * Idempotent — if the row's already revoked, the update is a no-op.
 */
@Injectable()
export class VaultRevokedHandler implements EventHandler {
  readonly typeSuffixes = ["::events::KraterionVaultRevoked"] as const;

  private readonly logger = new Logger(VaultRevokedHandler.name);

  async handle(tx: Prisma.TransactionClient, event: ParsedEvent): Promise<void> {
    const parsed = KraterionVaultRevokedSchema.parse(event.payload);

    const result = await tx.storagePool.updateMany({
      where: { vault_object_id: parsed.vault_id, user_revoked: false },
      data: { user_revoked: true, status: "user_revoked" },
    });

    if (result.count === 0) {
      // Either already-revoked, or the StoragePool row doesn't exist
      // (the user revoked a vault we don't track — shouldn't happen,
      // but logged for observability rather than treated as an error).
      this.logger.warn(
        `VaultRevokedHandler: no rows updated for vault=${parsed.vault_id}. ` +
          `Either already revoked or untracked.`,
      );
      return;
    }

    this.logger.log(
      `StoragePool revoked by user: vault=${parsed.vault_id.slice(0, 12)}… ` +
        `by=${parsed.revoked_by}`,
    );
  }
}
