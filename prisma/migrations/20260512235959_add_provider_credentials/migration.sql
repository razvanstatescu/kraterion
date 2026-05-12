-- P0: Project-scoped provider credentials.
--
-- Replaces the process-wide OPENAI_API_KEY env var. One row per
-- (project, provider); KMS-wrapped via the existing EnvKeyWrapper
-- (AES-256-GCM, same envelope shape as ApiKey.secret_wrapped).
--
-- prisma migrate diff also emitted DropIndex statements for
-- KnowledgeChunk_content_tsv_gin and KnowledgeChunk_embedding_hnsw —
-- those are phantom drift from `Unsupported(...)` columns + raw
-- indexes (same as the K3b/oauth_tables migration). They're trimmed
-- here; the K1/K2 indexes must stay.

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_key" BYTEA NOT NULL,
    "key_last_4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_validated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCredential_project_id_idx" ON "ProviderCredential"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_project_id_provider_key" ON "ProviderCredential"("project_id", "provider");

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
