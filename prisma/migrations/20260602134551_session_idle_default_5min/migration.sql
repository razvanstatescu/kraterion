-- P9-F1 (follow-up) — Drop the session idle window default from 10 min
-- to 5 min. Short enough that anchoring keeps up with normal conversation
-- pacing; long enough to roll a multi-turn exchange into one anchor.
--
-- Existing projects on the 10-min default are bulk-migrated to 5 min.
-- Projects with custom values (set via `/billing` admin or directly)
-- are left alone — only the unchanged-from-default value is rewritten.
--
-- The `DROP INDEX "KnowledgeChunk_content_tsv_gin"`,
-- `DROP INDEX "KnowledgeChunk_embedding_hnsw"`, and
-- `ALTER TABLE "KnowledgeChunk" ALTER COLUMN "content_tsv" DROP DEFAULT`
-- lines Prisma's diff naively emits are intentionally omitted — both
-- indexes (and the GENERATED stored column) come from raw-SQL migrations
-- that Prisma's introspection can't see. Same pattern as the other p9
-- migrations and `20260518100000_p7_storage_pools`.

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "session_idle_seconds" SET DEFAULT 300;

-- Back-fill projects still on the old default. We don't have a
-- "default was applied" flag, so this WHERE clause is the best
-- approximation — any project that's at exactly 600 either took the
-- default or independently chose 10 min. The two cases are
-- indistinguishable; in either case 5 min is the better current
-- value.
UPDATE "Project" SET session_idle_seconds = 300 WHERE session_idle_seconds = 600;
