-- pgvector extension: provides `halfvec` (used by KnowledgeChunk.embedding).
-- Idempotent so re-applying the migration on a primed DB doesn't fail.
-- The K2 migration (`add_knowledge_hnsw_index`) adds the HNSW index over
-- `embedding`; we don't build it here because it's worth a named
-- migration.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "KnowledgeBucketSettings" (
    "bucket_id" TEXT NOT NULL,
    "embedding_model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "embedding_dimensions" INTEGER NOT NULL DEFAULT 1024,
    "chunking_strategy" TEXT NOT NULL DEFAULT 'recursive',
    "chunk_tokens" INTEGER NOT NULL DEFAULT 400,
    "chunk_overlap_tokens" INTEGER NOT NULL DEFAULT 60,
    "default_llm_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBucketSettings_pkey" PRIMARY KEY ("bucket_id")
);

-- CreateTable
CREATE TABLE "KnowledgeManifest" (
    "id" TEXT NOT NULL,
    "s3_object_id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "skip_reason" TEXT,
    "embedding_model" TEXT,
    "embedding_dimensions" INTEGER,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "manifest_walrus_blob_id" TEXT,
    "manifest_shared_blob_object_id" TEXT,
    "bytes_in" BIGINT NOT NULL DEFAULT 0,
    "bytes_indexed" BIGINT NOT NULL DEFAULT 0,
    "embedding_tokens" INTEGER NOT NULL DEFAULT 0,
    "error_detail" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "s3_object_id" TEXT NOT NULL,
    "manifest_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content_hash" BYTEA NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" halfvec(1024) NOT NULL,
    "token_count" INTEGER NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeQuery" (
    "id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "kind" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "top_k" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "chunk_count" INTEGER NOT NULL,
    "cited_hashes" BYTEA[],
    "llm_model" TEXT,
    "llm_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeManifest_bucket_id_status_idx" ON "KnowledgeManifest"("bucket_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeManifest_s3_object_id_version_key" ON "KnowledgeManifest"("s3_object_id", "version");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_bucket_id_idx" ON "KnowledgeChunk"("bucket_id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_manifest_id_ordinal_key" ON "KnowledgeChunk"("manifest_id", "ordinal");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_bucket_id_created_at_idx" ON "KnowledgeQuery"("bucket_id", "created_at");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_project_id_created_at_idx" ON "KnowledgeQuery"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "KnowledgeBucketSettings" ADD CONSTRAINT "KnowledgeBucketSettings_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeManifest" ADD CONSTRAINT "KnowledgeManifest_s3_object_id_fkey" FOREIGN KEY ("s3_object_id") REFERENCES "S3Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "KnowledgeManifest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_s3_object_id_fkey" FOREIGN KEY ("s3_object_id") REFERENCES "S3Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQuery" ADD CONSTRAINT "KnowledgeQuery_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
