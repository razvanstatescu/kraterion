-- B5 follow-up — storage_v2 (500 MB free, MiB-granularity).
--
-- Renames `PendingStorageDowngrade.new_reserved_gb` /
-- `current_reserved_gb` → `_mb`. Stripe subscription-item quantity is
-- in MiB after this cutover so the DB columns match the unit the
-- downgrade processor reads + applies.
--
-- Multiplies any existing values × 1024 to preserve scheduled-
-- downgrade intents across the cutover. Sandbox-mode-only at this
-- point, but the multiplier is safe regardless: any row that pre-
-- dates the cutover holds GB and gets converted to MB cleanly.

ALTER TABLE "PendingStorageDowngrade"
  RENAME COLUMN "new_reserved_gb" TO "new_reserved_mb";

ALTER TABLE "PendingStorageDowngrade"
  RENAME COLUMN "current_reserved_gb" TO "current_reserved_mb";

UPDATE "PendingStorageDowngrade"
  SET "new_reserved_mb"     = "new_reserved_mb"     * 1024,
      "current_reserved_mb" = "current_reserved_mb" * 1024;
