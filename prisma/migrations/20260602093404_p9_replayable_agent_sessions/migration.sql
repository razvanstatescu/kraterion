-- P9 — Replayable agent sessions (per-session trace buffering, on-idle
-- flush to Walrus + Sui anchor). See /docs/kraterion-strategy-v3.md and
-- /Users/razvanstatescu/.claude/plans/good-i-want-you-steady-teacup.md.
--
-- NOTE: the `DROP INDEX "KnowledgeChunk_content_tsv_gin"`,
-- `DROP INDEX "KnowledgeChunk_embedding_hnsw"`, and
-- `ALTER TABLE "KnowledgeChunk" ALTER COLUMN "content_tsv" DROP DEFAULT`
-- lines Prisma's diff naively emits are intentionally omitted — both
-- indexes (and the GENERATED stored column) come from raw-SQL migrations
-- (`20260512130932_knowledge_chunk_tsvector`,
-- `20260512134312_knowledge_chunk_hnsw`) that Prisma's introspection can't
-- see. Same pattern as `20260518100000_p7_storage_pools`.

-- AlterTable
ALTER TABLE "AgentInvocation" ADD COLUMN     "retrieval_snapshot" JSONB,
ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "session_idle_seconds" INTEGER NOT NULL DEFAULT 600;

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "principal_kind" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "invocation_count" INTEGER NOT NULL DEFAULT 0,
    "anchored_tx_digest" BYTEA,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSessionTrace" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "pooled_blob_id" TEXT NOT NULL,
    "walrus_blob_id" TEXT NOT NULL,
    "seal_identity" BYTEA NOT NULL,
    "trace_hash" BYTEA NOT NULL,
    "invocation_count" INTEGER NOT NULL,
    "trace_size_bytes" INTEGER NOT NULL,
    "trace_gzip_size_bytes" INTEGER NOT NULL,
    "tx_digest" BYTEA NOT NULL,
    "event_seq" INTEGER NOT NULL,
    "anchored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSessionTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_agent_id_principal_kind_principal_id_status_idx" ON "AgentSession"("agent_id", "principal_kind", "principal_id", "status");

-- CreateIndex
CREATE INDEX "AgentSession_status_last_activity_at_idx" ON "AgentSession"("status", "last_activity_at");

-- CreateIndex
CREATE INDEX "AgentSession_project_id_opened_at_idx" ON "AgentSession"("project_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSessionTrace_session_id_key" ON "AgentSessionTrace"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSessionTrace_pooled_blob_id_key" ON "AgentSessionTrace"("pooled_blob_id");

-- CreateIndex
CREATE INDEX "AgentSessionTrace_project_id_anchored_at_idx" ON "AgentSessionTrace"("project_id", "anchored_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSessionTrace_tx_digest_event_seq_key" ON "AgentSessionTrace"("tx_digest", "event_seq");

-- CreateIndex
CREATE INDEX "AgentInvocation_session_id_idx" ON "AgentInvocation"("session_id");

-- AddForeignKey
ALTER TABLE "AgentInvocation" ADD CONSTRAINT "AgentInvocation_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "KraterionAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSessionTrace" ADD CONSTRAINT "AgentSessionTrace_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSessionTrace" ADD CONSTRAINT "AgentSessionTrace_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSessionTrace" ADD CONSTRAINT "AgentSessionTrace_pooled_blob_id_fkey" FOREIGN KEY ("pooled_blob_id") REFERENCES "PooledBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
