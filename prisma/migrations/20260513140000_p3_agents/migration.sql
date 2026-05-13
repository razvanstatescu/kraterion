-- P3: First-class Agents resource.
--
-- Adds KraterionAgent + AgentBucket + AgentInvocation. Drops
-- `KnowledgeBucketSettings.default_llm_model` (model selection moves
-- to the per-agent layer; the bucket only owns retrieval-spec fields).
--
-- prisma migrate diff also emitted DropIndex statements for
-- KnowledgeChunk_content_tsv_gin and KnowledgeChunk_embedding_hnsw —
-- phantom drift from `Unsupported(...)` columns + raw indexes (same
-- gotcha as the K3b/oauth_tables, P0/provider_credentials migrations).
-- Hand-trimmed here; the K1/K2 indexes must stay.

-- AlterTable: drop the bucket-scoped default chat model. Agents own
-- model selection now.
ALTER TABLE "KnowledgeBucketSettings" DROP COLUMN "default_llm_model";

-- CreateTable
CREATE TABLE "KraterionAgent" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system_prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "max_tokens" INTEGER NOT NULL DEFAULT 1024,
    "top_k" INTEGER NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'active',
    "guardrails_id" TEXT,
    "sub_wallet_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "KraterionAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBucket" (
    "agent_id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBucket_pkey" PRIMARY KEY ("agent_id","bucket_id")
);

-- CreateTable
CREATE TABLE "AgentInvocation" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT,
    "api_key_id" TEXT,
    "oauth_client_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" TEXT NOT NULL,
    "output" TEXT,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "retrieval_latency_ms" INTEGER,
    "llm_latency_ms" INTEGER,
    "latency_ms" INTEGER,
    "bucket_ids" TEXT[],
    "cited_hashes" BYTEA[],
    "error_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "AgentInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KraterionAgent_sub_wallet_id_key" ON "KraterionAgent"("sub_wallet_id");

-- CreateIndex
CREATE INDEX "KraterionAgent_project_id_idx" ON "KraterionAgent"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "KraterionAgent_project_id_name_key" ON "KraterionAgent"("project_id", "name");

-- CreateIndex
CREATE INDEX "AgentBucket_bucket_id_idx" ON "AgentBucket"("bucket_id");

-- CreateIndex
CREATE INDEX "AgentInvocation_agent_id_created_at_idx" ON "AgentInvocation"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "AgentInvocation_project_id_created_at_idx" ON "AgentInvocation"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "KraterionAgent" ADD CONSTRAINT "KraterionAgent_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KraterionAgent" ADD CONSTRAINT "KraterionAgent_sub_wallet_id_fkey" FOREIGN KEY ("sub_wallet_id") REFERENCES "SubWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBucket" ADD CONSTRAINT "AgentBucket_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "KraterionAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBucket" ADD CONSTRAINT "AgentBucket_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInvocation" ADD CONSTRAINT "AgentInvocation_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "KraterionAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
