-- Indexer schema bootstrap.
--
-- 1. Add nullable indexer-provenance columns to `Bucket` and `S3Object`
--    (`tx_digest`, `event_seq`, `event_payload`). Nullable so existing
--    rows from the gateway-direct write path don't fail. Once the
--    indexer is the sole writer (Phase 2 of the indexer plan), these
--    flip to NOT NULL.
-- 2. Add `(tx_digest, event_seq)` UNIQUE per table so the indexer's
--    `INSERT ... ON CONFLICT DO NOTHING` is idempotent against
--    re-processing on backfill.
-- 3. Create `IndexerCursor` (one row per pipeline source).
-- 4. Create `IndexerDeadLetter` (poison-event quarantine with
--    `(source_id, tx_digest, event_seq)` natural key).

-- AlterTable
ALTER TABLE "Bucket"
    ADD COLUMN "tx_digest" BYTEA,
    ADD COLUMN "event_seq" INTEGER,
    ADD COLUMN "event_payload" JSONB;

ALTER TABLE "S3Object"
    ADD COLUMN "tx_digest" BYTEA,
    ADD COLUMN "event_seq" INTEGER,
    ADD COLUMN "event_payload" JSONB;

-- CreateIndex (unique idempotency key for indexer writes)
CREATE UNIQUE INDEX "Bucket_indexer_event_key" ON "Bucket"("tx_digest", "event_seq");
CREATE UNIQUE INDEX "S3Object_indexer_event_key" ON "S3Object"("tx_digest", "event_seq");

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "source_id" TEXT NOT NULL,
    "last_checkpoint_seq" BIGINT NOT NULL,
    "last_tx_digest" BYTEA,
    "last_event_seq" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("source_id")
);

-- CreateTable
CREATE TABLE "IndexerDeadLetter" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "checkpoint_seq" BIGINT NOT NULL,
    "tx_digest" BYTEA NOT NULL,
    "event_seq" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_stack" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndexerDeadLetter_source_id_tx_digest_event_seq_key"
    ON "IndexerDeadLetter"("source_id", "tx_digest", "event_seq");
CREATE INDEX "IndexerDeadLetter_source_id_status_idx"
    ON "IndexerDeadLetter"("source_id", "status");
