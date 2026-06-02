-- P9 (D10) — Capture OpenAI `seed` + `system_fingerprint` on
-- AgentInvocation so the replay path can re-issue calls deterministically
-- and surface backend-version drift.
--
-- The `DROP INDEX "KnowledgeChunk_content_tsv_gin"`,
-- `DROP INDEX "KnowledgeChunk_embedding_hnsw"`, and
-- `ALTER TABLE "KnowledgeChunk" ALTER COLUMN "content_tsv" DROP DEFAULT`
-- lines Prisma's diff naively emits are intentionally omitted — both
-- indexes (and the GENERATED stored column) come from raw-SQL migrations
-- that Prisma's introspection can't see. Same pattern as the other p9
-- migration and `20260518100000_p7_storage_pools`.

-- AlterTable
ALTER TABLE "AgentInvocation" ADD COLUMN     "seed" INTEGER,
ADD COLUMN     "system_fingerprint" TEXT;
