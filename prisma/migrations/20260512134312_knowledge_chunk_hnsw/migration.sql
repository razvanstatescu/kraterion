-- HNSW index over KnowledgeChunk.embedding for K2 vector retrieval.
--
-- Build parameters per pgvector best-practices guidance (2026):
--   m = 16              — neighbors per layer; higher = better recall,
--                         more memory; 16 is the sweet spot for 1024-d
--                         normalized embeddings.
--   ef_construction = 200 — search depth at build time; higher = better
--                         build quality at the cost of one-time
--                         construction time. 200 is the recommended
--                         hackathon-grade default.
--
-- Operator class: `halfvec_cosine_ops` — cosine distance over halfvec.
-- Matches our `embedding <=> $query::halfvec(1024)` query operator
-- (`<=>` is cosine for halfvec, NOT L2 — the operator's overload
-- depends on the operator class).
--
-- Query-time tuning (set per-transaction in the service layer):
--   SET LOCAL hnsw.ef_search = 64  -- /search
--   SET LOCAL hnsw.ef_search = 96  -- /ask (slightly higher recall for
--                                     LLM-stuffed answers)
-- The default ef_search (40) is fine for huge indexes; we keep our
-- tuning explicit so re-tuning later is one-line.
--
-- Build is fast on the K1-shaped corpus (<1k chunks per bucket).
-- Production-scale builds would use `CREATE INDEX CONCURRENTLY` to
-- avoid table-locking, but `CONCURRENTLY` can't run inside Prisma's
-- migration transaction wrapper. For our hackathon dataset the
-- blocking build is fine.

CREATE INDEX "KnowledgeChunk_embedding_hnsw"
  ON "KnowledgeChunk"
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);
