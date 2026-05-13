# P2 — Reranker research notes (May 2026)

**Status:** Deferred for the Sui Overflow 2026 submission (see
`decisions.md` 2026-05-13 entries). Captured here so the next round
doesn't repeat the research.

## TL;DR

- **OpenAI has no native rerank endpoint as of May 2026.** The
  proposal's preferred "OpenAI rerank when available" path doesn't
  exist yet; integrations in the wild use chat models as a hack —
  not viable for our flow.
- **Cohere Rerank 3.5 (and 4.0) is the strongest commercial choice**
  for our flow. Most mature API, multilingual (100+ languages),
  sub-200ms p50 in US-East, $2 per 1k queries (each call = 1 query
  with up to 50 docs).
- **Voyage AI rerank-2.5 beats Cohere v3.5 by 8–13% on benchmarks** but
  the gap is small enough that Cohere's developer-experience lead wins
  for a first launch.
- **BGE-reranker-v2-m3 is the best open-weight option.** 278M params,
  CPU-runnable for small batches, 50–100ms on GPU, Apache 2.0. Right
  post-launch move when we have an inference container worth running
  anyway.
- **Jina Reranker v3** — fastest commercial option (~188ms total
  including network), 81% Hit@1.
- **Industry consensus pattern:** retrieve broadly (top-20 to top-50),
  rerank precisely (top-5 to top-8). Our current top-50 → topK is the
  correct retrieval shape; just need to add the rerank stage in
  between. Reported lift: +15–40% precision at top_k≤8.

## Recommended launch shape (when we do ship P2)

- **First provider: Cohere Rerank 3.5** (or 4.0 if API parity holds when
  we wire it). Single credential, single endpoint, well-documented.
- **Default for the picker: "Off"** — preserve current behavior on
  existing buckets, opt-in per bucket via the Knowledge tab.
- **Silent fallback to RRF-only** when the credential is missing/invalid
  or the provider 5xx's. Search never fails because the reranker is
  sick.

## Architecture hooks (already in the codebase)

- `ProviderCredential` table already supports `provider='cohere'` —
  schema's provider column is a free-form lowercase string with
  `@@unique([project_id, provider])`. No migration needed for the
  credential side.
- `ProviderCredentialService.useDecrypted(projectId, 'cohere', fn)`
  works today for any new provider; just need to extend `validateKey`
  to ping Cohere's `GET /v1/models` (same shape as OpenAI's check).
- `KnowledgeBucketSettings` would gain `reranker_model: String?` —
  format `provider:model-id` (e.g. `cohere:rerank-3.5`) so it lines
  up with how the future P1 multi-provider `embedding_model` will
  shape.
- `KnowledgeService.search()` decomposes into three stages
  (`fuseRrf` → `maybeRerank` → `recordQuery`) with the reranker as a
  middle pass that reorders the RRF top-50 down to the requested topK.
- `KnowledgeQuery` audit row gains optional `reranker_model` +
  `reranker_latency_ms` for A/B analysis.
- `packages/reranker-client` new workspace package, mirrors
  `packages/embeddings-client` style — provider-agnostic
  `rerank(query, documents, opts)` signature, retry policy via p-retry.
- Dashboard: new `ChangeRerankerDialog` (mirrors `ChangeChatModelDialog`),
  new "Reranker" `ModelRow` on the on-state Knowledge card, extend
  `/keys?tab=providers` to accept a Cohere credential.

## Estimated effort

~3.5 days end-to-end:

1. Schema + catalog + Cohere validation — ½ day.
2. `packages/reranker-client` — ½ day.
3. `search()` three-stage refactor + silent fallback — 1 day.
4. Dashboard (provider tab, reranker picker, on-state row, optional
   "Reranked by Cohere" pill on search results) — 1 day.
5. Verification + smoke — ½ day.

## Why we cut it for the hackathon

Three reasons in the 2026-05-13 scope-cut decision:

1. **Adds a second credential surface** (Cohere) — i.e. effectively
   triggers P1 scaffolding before P1's own deferral. P1 was already
   cut.
2. **The demo's wow factor is the on-chain Verify trail + Agents**,
   not retrieval precision tweaks. The reranker would be invisible
   to a 60-second demo audience.
3. **The 3.5-day budget is better spent on P3 (Agents) + P4 (Function
   calling) polish** — those *are* the demo-defining surface.

## Sources used

- [Cohere Rerank API](https://cohere.com/rerank)
- [Cohere Rerank documentation](https://docs.cohere.com/docs/rerank)
- [Best Rerankers for RAG — Agentset leaderboard, Feb 2026](https://agentset.ai/rerankers)
- [Ultimate Guide to Choosing the Best Reranking Model in 2026](https://zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025/)
- [Voyage AI rerank-2.5 release notes](https://blog.voyageai.com/2025/08/11/rerank-2-5/)
- [LlamaIndex — RAG embeddings & rerankers picks](https://www.llamaindex.ai/blog/boosting-rag-picking-the-best-embedding-reranker-models-42d079022e83)
- [BGE-reranker-v2-m3 — FlagEmbedding repo](https://github.com/FlagOpen/FlagEmbedding)
- [Best Reranker Models for RAG: Open-Source vs API, Feb 2026](https://docs.bswen.com/blog/2026-02-25-best-reranker-models/)
