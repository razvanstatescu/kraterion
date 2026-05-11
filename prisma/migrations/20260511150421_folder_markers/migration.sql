-- CreateTable
CREATE TABLE "FolderMarker" (
    "id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FolderMarker_bucket_id_idx" ON "FolderMarker"("bucket_id");

-- CreateIndex
CREATE UNIQUE INDEX "FolderMarker_bucket_id_prefix_key" ON "FolderMarker"("bucket_id", "prefix");

-- AddForeignKey
ALTER TABLE "FolderMarker" ADD CONSTRAINT "FolderMarker_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
