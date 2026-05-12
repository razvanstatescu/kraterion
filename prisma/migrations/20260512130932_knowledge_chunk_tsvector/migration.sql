-- Adds a generated `tsvector` column + GIN index on KnowledgeChunk.content.
--
-- WHY (research, 2026): K2's retrieval ships as hybrid BM25 + vector +
-- RRF, not vector-only. Vector-only recall@10 ≈ 78%; hybrid ≈ 91% on
-- realistic corpora with exact identifiers (code, citation keys, PDF
-- text). See `docs/decisions.md` 2026-05-12 ADR for the source links.
--
-- We add the column NOW (during K1's ingestion phase) so K2 can do
-- hybrid retrieval without backfilling — the column is generated, so
-- every row K1 inserts populates it automatically.
--
-- `to_tsvector('english', content)` is the default; non-English buckets
-- will degrade gracefully (BM25 misses some morphology) but still score
-- exact-match terms. A per-bucket locale knob is post-hackathon.

-- Generated (STORED) so the GIN index doesn't recompute on read. The
-- index build is free on an empty table; on a populated table this
-- would be ~minutes per million rows.
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

CREATE INDEX "KnowledgeChunk_content_tsv_gin"
  ON "KnowledgeChunk"
  USING gin ("content_tsv");
