-- Log table for idempotent application of `KraterionObjectExtended`
-- events. The handler increments `S3Object.storage_end_epoch` by
-- `epochs_added`; replaying the event would double-add. Insert a row
-- here first with `(tx_digest, event_seq) UNIQUE`; if the insert
-- conflicts the extension was already applied and the update is
-- skipped.
CREATE TABLE "S3ObjectExtension" (
    "id" TEXT NOT NULL,
    "s3_object_id" TEXT NOT NULL,
    "tx_digest" BYTEA NOT NULL,
    "event_seq" INTEGER NOT NULL,
    "epochs_added" INTEGER NOT NULL,
    "funder" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "S3ObjectExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "S3ObjectExtension_tx_digest_event_seq_key"
    ON "S3ObjectExtension"("tx_digest", "event_seq");
CREATE INDEX "S3ObjectExtension_s3_object_id_idx"
    ON "S3ObjectExtension"("s3_object_id");

ALTER TABLE "S3ObjectExtension"
    ADD CONSTRAINT "S3ObjectExtension_s3_object_id_fkey"
    FOREIGN KEY ("s3_object_id") REFERENCES "S3Object"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
