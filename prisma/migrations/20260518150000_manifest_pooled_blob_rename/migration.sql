-- Rename `KnowledgeManifest.manifest_shared_blob_object_id` →
-- `manifest_pooled_blob_object_id` to match the storage-pool migration.
-- The column type and nullability are unchanged; only the name moves so
-- the manifest archive code can address it via the new pool primitive.
ALTER TABLE "KnowledgeManifest"
  RENAME COLUMN "manifest_shared_blob_object_id" TO "manifest_pooled_blob_object_id";
