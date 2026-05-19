-- Storage pool migration (Phase D).
-- See /docs/storage-pool-migration.md
--
-- This migration would normally never run against a live database because
-- we hard-reset at cutover (`prisma migrate reset --force` followed by
-- `migrate deploy` from a clean state). It's committed for reproducibility
-- and so any developer cloning the repo can `migrate deploy` to a
-- pristine instance.
--
-- NOTE: the `DropIndex` lines for `KnowledgeChunk_content_tsv_gin` and
-- `KnowledgeChunk_embedding_hnsw` that Prisma's diff naively emits are
-- intentionally omitted — both indexes are created by raw-SQL migrations
-- (`20260512130932_knowledge_chunk_tsvector`, `20260512134312_knowledge_chunk_hnsw`)
-- that Prisma's introspection can't see. They are not affected by this
-- migration; leave them in place. Same for the harmless
-- `KnowledgeChunk.content_tsv ALTER COLUMN ... DROP DEFAULT` (the column
-- is a generated stored column with no real default).

-- DropForeignKey
ALTER TABLE "S3ObjectExtension" DROP CONSTRAINT "S3ObjectExtension_s3_object_id_fkey";

-- DropIndex
DROP INDEX "S3Object_shared_blob_object_id_idx";

-- DropIndex
DROP INDEX "S3Object_shared_blob_object_id_key";

-- DropIndex
DROP INDEX "S3Object_storage_end_epoch_idx";

-- AlterTable
ALTER TABLE "AgentToolCall" DROP COLUMN "shared_blob_object_id",
ADD COLUMN     "pooled_blob_object_id" TEXT;

-- AlterTable
ALTER TABLE "S3Object" DROP COLUMN "shared_blob_object_id",
DROP COLUMN "storage_end_epoch",
ADD COLUMN     "encoded_size_bytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "pooled_blob_id" TEXT;

-- DropTable
DROP TABLE "S3ObjectExtension";

-- CreateTable
CREATE TABLE "StoragePool" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vault_object_id" TEXT NOT NULL,
    "pool_object_id" TEXT NOT NULL,
    "reserved_encoded_bytes" BIGINT NOT NULL,
    "used_encoded_bytes" BIGINT NOT NULL DEFAULT 0,
    "blob_count" INTEGER NOT NULL DEFAULT 0,
    "start_epoch" INTEGER NOT NULL,
    "end_epoch" INTEGER NOT NULL,
    "user_revoked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_extended_at" TIMESTAMP(3),
    "last_resized_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tx_digest" BYTEA,
    "event_seq" INTEGER,

    CONSTRAINT "StoragePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PooledBlob" (
    "id" TEXT NOT NULL,
    "storage_pool_id" TEXT NOT NULL,
    "walrus_blob_id" TEXT NOT NULL,
    "pooled_blob_object_id" TEXT NOT NULL,
    "encoded_size_bytes" BIGINT NOT NULL,
    "registered_epoch" INTEGER NOT NULL,
    "certified_epoch" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certified_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "PooledBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoragePoolExtension" (
    "id" TEXT NOT NULL,
    "storage_pool_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prev_end_epoch" INTEGER,
    "new_end_epoch" INTEGER,
    "prev_reserved_bytes" BIGINT,
    "new_reserved_bytes" BIGINT,
    "wal_cost_frost" BIGINT NOT NULL DEFAULT 0,
    "tx_digest" BYTEA NOT NULL,
    "event_seq" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoragePoolExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoragePool_project_id_key" ON "StoragePool"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "StoragePool_vault_object_id_key" ON "StoragePool"("vault_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "StoragePool_pool_object_id_key" ON "StoragePool"("pool_object_id");

-- CreateIndex
CREATE INDEX "StoragePool_end_epoch_idx" ON "StoragePool"("end_epoch");

-- CreateIndex
CREATE INDEX "StoragePool_status_idx" ON "StoragePool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StoragePool_indexer_event_key" ON "StoragePool"("tx_digest", "event_seq");

-- CreateIndex
CREATE UNIQUE INDEX "PooledBlob_pooled_blob_object_id_key" ON "PooledBlob"("pooled_blob_object_id");

-- CreateIndex
CREATE INDEX "PooledBlob_storage_pool_id_status_idx" ON "PooledBlob"("storage_pool_id", "status");

-- CreateIndex
CREATE INDEX "PooledBlob_walrus_blob_id_idx" ON "PooledBlob"("walrus_blob_id");

-- CreateIndex
CREATE INDEX "StoragePoolExtension_storage_pool_id_occurred_at_idx" ON "StoragePoolExtension"("storage_pool_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "StoragePoolExtension_tx_digest_event_seq_key" ON "StoragePoolExtension"("tx_digest", "event_seq");

-- CreateIndex
CREATE UNIQUE INDEX "S3Object_pooled_blob_id_key" ON "S3Object"("pooled_blob_id");

-- AddForeignKey
ALTER TABLE "S3Object" ADD CONSTRAINT "S3Object_pooled_blob_id_fkey" FOREIGN KEY ("pooled_blob_id") REFERENCES "PooledBlob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoragePool" ADD CONSTRAINT "StoragePool_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PooledBlob" ADD CONSTRAINT "PooledBlob_storage_pool_id_fkey" FOREIGN KEY ("storage_pool_id") REFERENCES "StoragePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoragePoolExtension" ADD CONSTRAINT "StoragePoolExtension_storage_pool_id_fkey" FOREIGN KEY ("storage_pool_id") REFERENCES "StoragePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

