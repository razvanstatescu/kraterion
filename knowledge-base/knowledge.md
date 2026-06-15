# Knowledge (searchable buckets)

Knowledge makes a bucket **searchable**. Once it's on, every object is chunked,
embedded, and indexed so an agent — or a direct search call — can pull the right
passages and **cite** them. This is the retrieval layer that powers RAG on
Kraterion.

## Enable knowledge

Toggle knowledge **per bucket** in the dashboard, or over the API with a bearer
token. Enabling kicks off a **backfill** that indexes whatever is already in the
bucket.

```bash
curl -X POST https://api.kraterion.com/v1/buckets/<bucket_id>/knowledge \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "embedding_model": "text-embedding-3-small",
    "chunk_tokens": 512,
    "chunk_overlap_tokens": 128
  }'
```

Fetch the current state — including how many objects are indexed, pending,
failed, or skipped — with `GET /v1/buckets/:id/knowledge`.

## Prerequisites

- **Your own OpenAI key.** Embeddings are generated with your key, so the project
  needs an active OpenAI key configured before knowledge can be enabled.
- **On-chain read access for the indexer (private buckets).** For a private
  bucket, the indexer needs on-chain access to read the objects it's indexing.
  Enabling knowledge surfaces whether that grant is required, and the dashboard
  walks you through it.

## The indexing pipeline

When an object lands, the indexer:

1. **Decrypts** it (using its on-chain-granted access).
2. **Splits** it into overlapping chunks of `chunk_tokens` tokens, with
   `chunk_overlap_tokens` of overlap to preserve context across boundaries.
3. **Embeds** each chunk.
4. **Stores** both the chunk text and its vector.

Overwriting an object re-indexes it; deleting it removes its chunks.

## Manifests & verifiable citations

Indexing produces a **manifest** per object: the ordered list of chunks, each
chunk's **content hash**, and the Walrus blob ids the content came from. The
manifest is what makes a citation **checkable** — a hash ties a quoted passage
back to specific, content-addressed bytes. Agents can fetch it via the
`kraterion_get_manifest` tool.

This is why Kraterion answers can be trusted: a citation isn't just "the model
said so," it's a hash that resolves to exact bytes anyone can verify.

## Search

Knowledge search is **hybrid** — it combines keyword (BM25) and vector (semantic)
retrieval, so it catches both exact-term matches and meaning-based matches.
Agents call it with the `kraterion_search` tool (`bucket`, `query`, optional
`top_k`); MCP clients can call the same tool directly.

## Backfill & reindex

- **Backfill** — re-run indexing over the whole bucket with
  `POST /v1/buckets/:id/knowledge/backfill`.
- **Reindex** — to change chunking or the embedding model, use
  `POST /v1/buckets/:id/knowledge/reindex`; it clears existing chunks and rebuilds
  them with the new settings.
- **Disable** — post `{ "enabled": false }` to the knowledge endpoint.

## Common questions

**Do I need to pay Kraterion for embeddings?** No — embeddings run on *your*
OpenAI key (bring your own key). Kraterion meters the indexed chunks/vectors on
the "Knowledge index" meter (see [pricing.md](pricing.md)), not the embedding
calls.

**How are citations verifiable?** Each indexed chunk has a content hash recorded
in the object's manifest, tying any quoted passage back to exact,
content-addressed bytes on Walrus.

**What file types can be indexed?** Text-extractable content (documents, text,
PDFs). The indexer decrypts, extracts text, then chunks and embeds it.
