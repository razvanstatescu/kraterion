-- P6 follow-up — per-share-token "cite sources" toggle.
-- When false, the model's system prompt drops the `[chunk N]` citation
-- contract and the response omits the citations + retrieval-info
-- extension. Default true preserves existing behavior on every token
-- already minted.
ALTER TABLE "AgentShareToken"
  ADD COLUMN "cite_sources" BOOLEAN NOT NULL DEFAULT true;
