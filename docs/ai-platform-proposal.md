# Kraterion AI Platform — Proposal

**Date:** 2026-05-12 (revised)
**Status:** Draft proposal — not committed roadmap
**Author:** Claude (research synthesis)
**Companion docs:** `/docs/ai-features-plan.md` (K0–K5), `/docs/implementation-plan.md`

**Revision note (2026-05-12, v2):** Replaced the original BYO-key-per-request model with **project-scoped stored provider credentials** (see new §P0). Knowledge is gated on a configured provider credential at the project level; the credential is reused across all buckets and all LLM features (`/ask`, agents, widget). Starting with OpenAI only; provider abstraction lands when a second provider is added.

---

## Hackathon scope (2026-05-13)

This proposal was written as the full 30-day platform shape. For the Sui
Overflow 2026 submission (deadline **Jun 21, 2026** — 39 days from this
note) we are explicitly cutting scope. The plan from here to submission:

**Shipping:**
- **P0** (project credentials, multi-step enable modal, model pickers, cost
  estimate, destructive re-index) — done.
- **P3** (Agents) + **P4** (Function calling) — the demo-defining surface.
  Plan to land both before the final demo cut.
- **P6** (Embeddable widget) — stretch; the demo lands harder if we ship it.

**Deferred past the hackathon (will not ship for the submission):**
- **P1 — Multi-provider abstraction.** OpenAI-only at submission. Adding
  Anthropic/Cohere/Llama is a clean future move on top of P0's
  provider-tagged schema, but doing it now buys no demo value and
  risks the wrong seams. Revisit when a real second-provider customer
  ask exists.
- **P2 — Reranker.** Investigated end-to-end — see
  [`docs/p2-reranker-research.md`](p2-reranker-research.md) for the
  provider comparison (Cohere Rerank 3.5 wins for our flow), the
  three-stage `search()` decomposition, and the ~3.5-day effort
  breakdown. Cut because (a) it adds a second credential surface
  (Cohere) — i.e. effectively triggers P1 scaffolding before P1's
  own deferral, (b) the demo's wow factor is the on-chain Verify
  trail + Agents, not retrieval precision tweaks, and (c) the ~3.5
  day budget is better spent on P3 + P4 polish. Kept prominently on
  the post-hackathon backlog — it's the cheapest precision-per-
  engineering-hour move and the natural next round.
- **P5 — Guardrails.** PII / jailbreak / content moderation are
  production-shipping concerns; the hackathon judges aren't a
  regulator. Stub in P3 with `guardrails_id?` on the agent model so
  P5 plugs in cleanly later, but don't build the middleware.
- **The 1536d / 3072d embedding options.** The `KnowledgeChunk.embedding`
  column is `halfvec(1024)`. Surfacing the other dims requires either a
  schema-level change (per-dim shadow table or column) or breaking the
  pgvector contract. Not worth the migration risk before the demo;
  the picker shows the choices as "Coming soon" instead.
- **Transactional swap during re-index.** Re-index is destructive
  today — search returns empty between the chunk wipe and the worker
  draining. The transactional swap-over (`pending_embedding_*` shadow
  columns + manifest-spec-tagged chunks + cutover) is ~1.5 days of
  schema + query work for a behaviour that only matters at production
  traffic levels.
- **"Test connection" affordance** in the Add-OpenAI-key modal. The CP
  already validates via `GET /v1/models` on Save and rejects bad keys
  with a 400 — same outcome as a separate test button, one fewer
  click.

When these decisions land in `decisions.md` (2026-05-13 entry) they
become committed scope for the submission. After Jun 21, this proposal
becomes the post-hackathon roadmap.

---

## 1. What we have today

This proposal is grounded in the current Kraterion AI surface (see workstreams K0–K5 in `/docs/ai-features-plan.md`):

| Layer | Where | What it does |
|---|---|---|
| `@kraterion/embeddings-client` | `packages/embeddings-client` | OpenAI `text-embedding-3-small` @ 1024d (Matryoshka), batched, retry-aware |
| Knowledge schema | `prisma/migrations/202605120921…`, `…1309…`, `…1343…` | `KnowledgeBucketSettings`, `KnowledgeManifest`, `KnowledgeChunk` (halfvec + tsvector + HNSW), `KnowledgeQuery` |
| Ingestion (K1) | `apps/worker/src/embeddings/` | Fetch from Walrus → Seal-decrypt → extract (text, JSON, code, PDF) → recursive chunk → embed → persist; manifest JSON archived to Walrus (K5) |
| Retrieval (K2) | `apps/control-plane/src/knowledge/` | `/knowledge`, `/search` (hybrid BM25 + vector + RRF), `/ask` (BYO-OpenAI-key today → moving to stored project credential in P0, `gpt-4o-mini` default), audited in `KnowledgeQuery` |
| MCP server (K3a) | `apps/control-plane/src/mcp/` | Streamable-HTTP, bearer-auth, seven tools (`list_buckets`, `list_objects`, `search`, `ask`, `read_object`, `write_object`, `get_manifest`) |
| Dashboard UI (K4) | `apps/dashboard/src/components/knowledge/` | Toggle, status panel (auto-refresh), search, **Verify** button (on-chain manifest hash check), Connect-an-agent panel |
| Verifiability (K5) | `embeddings/manifest-archive.ts` + `VerifyChunk.tsx` | Best-effort Walrus archival of manifest JSON; UI verifies each search hit against on-chain hash |

**Strengths**
- Hybrid retrieval (BM25 + vector + RRF) — recall@10 ~91% vs ~78% vector-only.
- Per-bucket revocation lever (`api_access_granted`) gates `/search`, `/ask`, and MCP uniformly.
- On-chain verifiable retrieval — the *only* feature of its kind among RAG products. This is the moat.
- MCP support out of the box — Claude Desktop, Cursor, custom agents connect today.

**Gaps**
- No place to store a provider API key — every `/ask` call requires the caller to paste one, which blocks any feature that runs without a user in the loop (re-indexing on model change, scheduled summaries, agents, embedded widgets).
- Locked to OpenAI `text-embedding-3-small` @ 1024d. The schema supports tuning but the UI doesn't expose a choice.
- Only one chunking strategy (recursive); no model-family abstraction.
- No reranker — hybrid + RRF is good, but the easy +5–10pt precision win at top_k≤8 is being left on the table.
- No persistent "agent" abstraction — every consumer rebuilds prompts.
- No guardrails on `/ask` outputs. PII echo and jailbreak are realistic concerns when buckets contain customer data.
- No way to surface a knowledge base externally as a widget or hosted chatbot.
- No evals — can't tell when an index regresses after re-chunking or model swap.

---

## 2. What DigitalOcean Gradient AI Platform offers

Comprehensive feature-by-feature inventory in §Appendix A. Headline capabilities:

1. **Knowledge bases** — file/Spaces/web-crawl sources, OpenSearch hybrid retrieval, 7+ embedding models, BGE Reranker v2 M3, RAG Playground.
2. **First-class Agents** — REST resource with system prompt + KB attachments + functions + child agents + guardrails, exposed as OpenAI-compatible endpoint per agent.
3. **Model catalog** — 70+ models behind one OpenAI/Anthropic-compatible endpoint (Claude family, GPT-5 family, Llama, Mistral, Qwen, DeepSeek, NVIDIA Nemotron, plus image/audio/video generators).
4. **Guardrails** — managed PII / jailbreak / content moderation, attachable per-agent, billed per token.
5. **Function calling** — agents call DO Functions or arbitrary webhooks; tools defined per-route with input/output schemas.
6. **Multi-agent routing** — parent agent routes intents to child agents.
7. **Evaluations** — agent evals (scheduled prompt suites, ≤500 prompts) and model evals (LLM-as-judge over datasets).
8. **Inference Router** — A/B routing across model pools, 1k req/min.
9. **Batch inference** — token-cheaper batch jobs for large embedding/scoring workloads.
10. **Deployment surfaces** — embeddable web widget, Slack template, App Platform, MCP server.
11. **GPU droplets / dedicated inference** — out of scope for us.

---

## 3. Proposed integrations into Kraterion

I am proposing seven features, ordered by ratio of **product impact** to **engineering cost** in the context of a hackathon-shipping startup. Each proposal explicitly states what we adopt vs. what we deliberately *don't* adopt. **P0 is foundational** — every other feature in this list depends on it.

### P0 — Project-scoped provider credentials & enable-knowledge flow (foundational) — [Partial — hackathon cut documented inline]

> **Hackathon status (2026-05-13):** shipped end-to-end with three documented
> deviations — only the 1024d embedding option is selectable (§Step 2),
> re-index is destructive rather than transactional (§Re-indexing flow),
> and the Add-key modal validates implicitly on Save instead of via a
> dedicated "Test connection" button (§Step 1). See `decisions.md`
> 2026-05-13 ("Hackathon scope cuts…") for the rationale and the
> top-level "Hackathon scope" block above for the full deferred list.


**What:** A single new resource, **ProviderCredential**, owned by a **project** and reused across every bucket and every LLM-touching feature inside that project. Enabling Knowledge on the first bucket of a project requires configuring this credential; subsequent buckets reuse it.

Initial provider: **OpenAI only.** Schema is provider-tagged so Anthropic / others can be added later without migration.

**Data model (Prisma):**
```
model ProviderCredential {
  id              String   @id @default(uuid())
  project_id      String
  provider        String   // 'openai' (only value at launch)
  encrypted_key   Bytes    // KMS-wrapped, never plaintext at rest or in logs
  key_last_4      String   // for UI display
  status          String   // 'active' | 'invalid' | 'revoked'
  last_validated  DateTime?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  @@unique([project_id, provider])
}
```

**Storage rules (per `CLAUDE.md` crypto policy):**
- Plaintext key is held in memory only during the request that decrypts it; zeroed after use.
- Persisted only KMS-wrapped (Buffer/Uint8Array). Never serialized to logs, never echoed back to the dashboard.
- Dashboard displays `sk-...{key_last_4}` and a "Replace" / "Remove" action — no read endpoint for the plaintext.
- Validation pings `/v1/models` (OpenAI) on save; sets `status` accordingly.

**Where it gets used (all reads of the wrapped key go through `ProviderCredentialService.useDecrypted(project_id, provider, fn)`):**
- **Ingestion (K1):** worker loads the project's OpenAI key when an indexing job runs. Replaces today's process-wide `OPENAI_API_KEY` env var.
- **Query embedding (K2 `/search`):** same key, same model that indexed the bucket.
- **Generation (K2 `/ask`):** same key, model chosen per request (see below).
- **Agents (P3), guardrails (P5), widget (P6):** all flow through the same accessor.

**Enable-Knowledge flow (modal, dashboard):**

When the user clicks "Enable Knowledge" on a bucket that doesn't yet have it:

1. **Step 1 — Credential check.**
   - If the project has no active OpenAI `ProviderCredential` → modal asks for a key. Inline help: "Stored encrypted with our KMS. Used for embeddings on this bucket and any LLM features you configure (Ask, Agents). You can rotate or remove it from Project Settings."
   - "Test connection" button runs the validation ping before allowing save.

     > _Hackathon cut (2026-05-13):_ The separate "Test connection"
     > affordance is **deferred past Jun 21**. The CP validates the key
     > via `GET https://api.openai.com/v1/models` on Save — same call
     > the button would have triggered — and rejects bad keys with a
     > 400 that the modal surfaces inline. One fewer click, same
     > guarantee. The button comes back post-hackathon if user
     > research shows the implicit validation feels surprising.
   - If the project already has an active credential → step 1 is skipped; the modal opens directly on step 2 with the key fingerprint shown ("Using OpenAI key …{last_4} (Project default)").

2. **Step 2 — Embedding model choice.** A radio list, with a prominent warning above:
   > **The embedding model is locked once indexing starts.** Switching it later requires re-indexing every object in this bucket (download from Walrus, decrypt, re-chunk, re-embed). Switching the chat model is free and per-request.

   OpenAI options at launch:
   - **`text-embedding-3-small` @ 1024d** (default) — fast, ~$0.02 / M tokens, recommended for most buckets.
   - **`text-embedding-3-small` @ 1536d** — full dim, +50% storage, marginal recall lift.
   - **`text-embedding-3-large` @ 3072d** — higher quality, ~$0.13 / M tokens, ~3× storage, recommended for highly technical or multilingual corpora.

   > _Hackathon cut (2026-05-13):_ Only the **1024d** option is
   > selectable at submission. 1536d and 3072d are rendered as "Coming
   > soon" rows in the picker so the trade-off stays discoverable.
   > Reason: `KnowledgeChunk.embedding` is `Unsupported("halfvec(1024)")`
   > — pgvector fixes dimension at the column level, and adding 1536d /
   > 3072d needs either a per-dim shadow column or a `(chunk, model)`-
   > keyed shadow table. Both are real migrations with index-rebuild
   > cost; not worth the risk before the demo. See `decisions.md`
   > 2026-05-13 ("Embedding-model picker only exposes 1024d").

3. **Step 3 — Default chat model for `/ask` (optional, with skip).** Dropdown:
   - `gpt-4o-mini` (default — cheap, fast)
   - `gpt-4o`
   - `gpt-4-turbo`
   - `o3-mini` / `o1` (reasoning models, slower)

   Stored on `KnowledgeBucketSettings.default_chat_model`. Callers can still override per request.

4. **Step 4 — Confirm.** Summary screen: provider, embedding model, default chat model, estimated indexing cost for the current bucket contents (rough: `bucket_total_bytes / 4` tokens × per-million-tokens price). Hitting Confirm starts the indexer.

**Re-indexing flow (when user *does* try to change embedding model later):**

A separate "Re-index with new embedding model" action under bucket settings, gated behind a confirmation dialog that spells out:
- Current chunks (count + storage) will be **deleted and replaced**.
- Cost estimate for the re-embed pass.
- Verification trail (K5 manifest hashes) is **invalidated** — any pre-existing on-chain manifests no longer match the new chunks. New manifests will be archived to Walrus once re-indexing completes.
- During re-index, `/search` and `/ask` continue to return results from the old chunks until the new pass completes (a transactional swap-over at the end).

> _Hackathon cut (2026-05-13):_ Re-index is **destructive** at
> submission, not the transactional swap-over described in the last
> bullet. Chunks are dropped and `/search` returns empty for the bucket
> until the worker drains the new pass. The confirmation modal copy is
> honest about this. Reason: transactional swap needs `pending_embedding_*`
> shadow columns on `KnowledgeBucketSettings`, per-manifest embedding-
> spec tagging, and a spec-filtered chunk query — ~1.5 days of schema +
> query work for a property that only matters at production traffic
> levels. Pencilled as P0.5 follow-up. See `decisions.md` 2026-05-13
> ("Embedding-model picker only exposes 1024d; re-index is destructive").

**Why now:** This is the unblocker for every other proposal in this doc. Without stored credentials we cannot run background re-indexing, scheduled jobs, agent flows that wake without a user, or an embeddable widget — all of those need access to an LLM key when no human is in the request.

**Out of scope (deliberate):**
- **Multi-provider in a single project.** One project, one provider key. If a user wants Anthropic for `/ask` but OpenAI for embeddings, they wait for the v2 abstraction (P1 below).
- **User-scoped (rather than project-scoped) credentials.** Tempting for team scenarios but doubles the access-control surface. Project scope matches how billing/quota lives at OpenAI's end.
- **Rotating keys automatically.** The user owns rotation; we expose a Replace action.

**Effort:** ~2 days. Prisma model + migration, KMS wrap helper (we already have one for Seal session keys — reuse), credential service, dashboard modal flow, swap worker/control-plane to read via the service.

---

### P1 — Multi-provider model abstraction (small, deferred) — [Deferred — post-hackathon]

> **Hackathon status (2026-05-13):** **not shipping for the Jun 21
> submission.** OpenAI-only at the demo. P0's schema is already
> provider-tagged (`@@unique([project_id, provider])`), so adding
> Anthropic / Cohere / Llama later is additive — no migration to
> retrofit. We're deferring per the proposal's own rationale: "defer
> until P0 is shipped and we have at least one user asking for
> Anthropic." Building the abstraction speculatively risks the wrong
> seams. The rest of this section reads as the post-hackathon plan.


**What:** Generalize `ProviderCredential` to accept a second provider (Anthropic first; then Llama via DO Inference, Mistral, etc.). Introduce a thin adapter package (`packages/llm-client`) with a uniform `complete(messages, {provider, model, max_tokens, citations: true})` signature; same shape for `embed()`. The enable-knowledge modal gains a "Provider" step before the embedding-model step.

**Why now:** Defer this until P0 is shipped and we have at least one user asking for Anthropic. The day we add provider #2 is the day P1 needs to land — not earlier. Building the abstraction speculatively risks the wrong seams.

**Implementation note:** When this lands, `ProviderCredential` becomes one-row-per-`(project, provider)` (already the unique key in P0), and `KnowledgeBucketSettings.embedding_model` becomes `provider:model` rather than a bare model id.

**Out of scope:** image/audio/video models; hosting weights; running inference ourselves.

**Effort:** ~2 days **when** there's a concrete second provider to wire.

---

### P2 — Reranker after hybrid retrieval (small, very high quality lift) — [Deferred — post-hackathon]

> **Hackathon status (2026-05-13):** **not shipping for the Jun 21
> submission**, despite being the cheapest precision lift on the list.
> Research summary: OpenAI has no native rerank endpoint as of May
> 2026, so launching means adding **Cohere Rerank 3.5** (or Voyage
> rerank-2.5, or self-hosted BGE-reranker-v2-m3). Cohere is the
> strongest commercial option for our flow ($2 / 1k queries, sub-200ms
> US-East, multilingual). Estimated effort ~3.5 days end-to-end:
> `packages/reranker-client`, `RerankerOption` catalog, three-stage
> `KnowledgeService.search()` refactor with silent RRF fallback,
> `reranker_model` + `reranker_latency_ms` audit fields, dashboard
> picker + Cohere credential surface on `/keys`. Cut because it adds a
> second credential surface (effectively triggering P1 scaffolding
> before P1's own deferral) and the demo's wow factor is the on-chain
> Verify trail + Agents, not retrieval precision tweaks. Stays
> prominent on the post-hackathon backlog. The rest of this section
> reads as the post-hackathon plan.


**What:** Optional post-retrieval reranking stage. Hybrid returns top-50 candidates today; pipe them through a reranker that scores each chunk against the original query and returns top-`k`. Two implementations behind the same interface:
- **OpenAI rerank** (when added to their catalog) — uses the project's stored OpenAI credential. Zero extra config for users on the happy path.
- **Cohere rerank-3** — requires a *second* `ProviderCredential` row with `provider: 'cohere'`. Surfaced as a separate optional credential under Project Settings.
- **BGE Reranker v2 M3** via DO Inference Engine or HF — also a separate `ProviderCredential` when those land in P1.

Off by default; toggleable per-bucket in `KnowledgeBucketSettings.reranker_model`. If the bucket's selected reranker is configured at the project level but its credential is missing or invalid, retrieval silently falls back to RRF-only.

**Why now:** This is the single highest-precision-per-engineering-hour move available. RRF gives recall; reranker gives precision. The Verify button looks better when the top three results are the *right* three.

**Out of scope:** training our own reranker; embedding-time reranking models.

**Effort:** ~1 day, including a config row and a small change to `knowledge.service.ts`.

---

### P3 — First-class Agents resource (medium, defining product surface)

**What:** A new domain object — **KraterionAgent** — owned by a project, scoped to one or more buckets, with:

- `system_prompt` (text, versioned)
- `model` (one of the chat models supported by the project's `ProviderCredential`; default = bucket's `default_chat_model`)
- `temperature`, `max_tokens`, etc.
- `bucket_ids[]` — which knowledge bases the agent can read
- `reranker_model` (P2), `top_k`, `chunking_overrides` (per-agent retrieval tuning)
- `guardrails_id?` (P5)
- `tools[]` (P4)
- Stable URL: `POST /v1/agents/{id}/chat` — OpenAI Chat-Completions-compatible

**Why now:** Three reasons. (a) MCP tools today are *generic* over buckets — every consumer reinvents the system prompt and chooses the model. An agent resource lets a user *configure* once and *connect* many times. (b) It's a natural unit of granting: the on-chain `api_access_granted` lever extends to agents, so a user can revoke a specific agent without touching the bucket. (c) It is the unit users compare to ChatGPT custom GPTs, Claude projects, and DO agents — failing to ship this misses a vocabulary every PM understands.

**On-chain hook (Kraterion-native):** the agent's `sub_wallet_address` is registered as an authorized API decryption address on each attached bucket. Revoking the agent is a `revoke_api_access(bucket, agent_addr)` Move call — a *cleaner* revocation than today's all-or-nothing platform-access flag.

**Out of scope:** chained/child agents (P3.5, deferred). Long-running agent state. Memory.

**Effort:** ~3 days. New Prisma model, controller, dashboard pages (Create/Edit/Connect), MCP tool to discover/invoke an agent, Move call wiring.

---

### P4 — Function calling (medium, agent-defining)

**What:** Agents (P3) can declare functions that the LLM can invoke. Two registered tool types:

- **HTTP webhook tools** — user provides URL + secret + JSON schema; we POST tool args, return the JSON result back to the model.
- **Built-in Kraterion tools** — `read_object(bucket,key)`, `write_object`, `list_objects`, `get_manifest`, `search` (the same set MCP already exposes). Available to any agent without configuration.

**Why now:** Without functions, an agent is just RAG + a system prompt. With functions, an agent becomes a *useful coworker* over the bucket. The webhook tool gives users an escape hatch to integrate their own systems without us needing per-vendor work.

**Kraterion-native angle:** make `read_object` and `write_object` *audited and revocable*. Every tool call writes a row to `AgentToolCall` keyed by agent id and bucket id, surfaced in the dashboard timeline. Revoking the agent halts the next tool call mid-conversation.

**Out of scope:** code interpreter, browser tool, file search (we *are* file search).

**Effort:** ~2 days. Tool-router lives in `apps/control-plane`. Built-in tools are wrappers over existing services.

---

### P5 — Guardrails (small, regulatory affordance) — [Deferred — post-hackathon]

> **Hackathon status (2026-05-13):** **not shipping for the Jun 21
> submission.** PII / jailbreak / content-moderation middleware is a
> production-shipping concern, not a hackathon-judging concern. P3
> (Agents) will stub `guardrails_id?` on the agent model so P5 plugs
> in later without a schema break, but no middleware lands before
> Jun 21. The rest of this section reads as the post-hackathon plan.


**What:** Per-agent guardrails configured as a triple of toggles:

- **PII detection** on outputs — block or redact (`<EMAIL>`, `<PHONE>`, `<SSN>`).
- **Jailbreak detection** on inputs — block known jailbreak patterns.
- **Content moderation** on inputs/outputs.

Implementation: route both legs through OpenAI's `omni-moderation-latest` endpoint (free under the same OpenAI credential the project already configured in P0). No second credential needed at launch. When Anthropic / Llama Guard land in P1, expose them as alternates.

**Why now:** Customers shipping a chatbot over their support bucket need this to even consider Kraterion. PII redaction is also a natural pairing with our existing access-control story — "the agent can't see emails, the policy can't be revoked retroactively, your tenants get receipts."

**Out of scope:** custom guardrail rules (regex DSL). DO doesn't expose these either yet.

**Effort:** ~1 day. Pre/post-call middleware on `/agents/{id}/chat`.

---

### P6 — Embeddable chat widget (medium, distribution play)

**What:** A `<script>` snippet a user pastes on their site that mounts a chat panel against a specific Kraterion agent. Token auth via short-lived agent share token (HMAC-signed, optional domain pinning, optional rate limit per IP). Each request hits `/v1/agents/{id}/chat`, which uses the project's stored `ProviderCredential` — the widget is only feasible *because* of P0; without stored creds there's no way for an anonymous site visitor to drive an LLM call.

**Cost ceiling (important since the widget spends the project's API budget):** every agent has `max_spend_usd_per_day` and `max_requests_per_share_token` settings. The control-plane enforces both before issuing the LLM call. Exceeding the cap returns a 429 to the widget with a configurable "Sorry, this chatbot has reached its daily limit" message.

**Why now:** Distribution. A storage SaaS competes with S3 on price/feature parity — losing battle. A storage SaaS where "upload your docs and get a chatbot on your site in 60 seconds" wins on the demo. The widget is also the cleanest evidence that the platform's AI surface is real and not just an MCP toy.

**Visual:** lives in `packages/ui-embed` as a separate, minimal bundle (no shadcn, no app deps). Imports the brand tokens from `design-system/`. Honors the design-system hard rules (no pure black/white, sentence case, etc.).

**Out of scope:** Slack bot, Discord bot, Teams bot. Each is plausible later as a thin wrapper around the same agent endpoint.

**Effort:** ~2 days. Widget bundle + share-token endpoint + dashboard page to mint/revoke share tokens.

---

## 4. Explicitly *not* proposing

| DO feature | Why we skip |
|---|---|
| **GPU Droplets / dedicated inference** | Capital-intensive, not in scope for Walrus track. Stored-key model keeps us provider-neutral and free of inference cost-of-goods. |
| **Fine-tuning** | BYO weights would require either dedicated GPUs or a partnership. Not the moat. |
| **Image / audio / video generation** | Off-strategy. Kraterion is "the storage substrate," not the generation surface. Users can store generated outputs in their bucket via the existing S3 API. |
| **Inference Router / A/B** | Premature. Revisit if/when we have multiple production models in P3. |
| **Web crawl as a KB source** | Tempting but punctures the "user-owned, on-chain blob" property — crawled pages have no owner story. If users want crawled docs indexed, they upload the crawl output as objects first. |
| **Batch inference** | Worth measuring once we cross ~10M chunks indexed. Not now. |
| **Child / multi-agent routing** | Real complexity; defer until at least three users ask for it. Built on top of P3 + P4 trivially. |
| **Model evaluations / agent evals** | Worth shipping (see §5) but as a separate workstream after P1–P6. |

---

## 5. The 30-day shape

Hackathon-cadence sequencing. **P0 must land first** — everything else depends on stored credentials. P1 (multi-provider) is deliberately deferred outside the 30-day window unless a concrete second-provider need emerges.

```
Week 1   P0 (project credentials, enable-knowledge modal, KMS wrap)
Week 2   P2 (reranker)  +  P3 start (agents schema, dashboard CRUD)
Week 3   P3 finish (on-chain wiring)  +  P4 (functions, audit trail)
Week 4   P5 (guardrails)  +  P6 (embeddable widget)  +  demo polish
         P1 — deferred until a second provider has a real user behind it
```

Demo arc at end of month: *configure project OpenAI key once → upload a folder of PDFs → enable Knowledge (pick embedding model in the modal, see the cost estimate, confirm) → create an agent with a system prompt, GPT-4o model, PII guardrail, and a webhook tool calling the user's CRM → paste the widget on a landing page → ask a question → click Verify on a cited chunk → revoke the agent on-chain → show the next request fails mid-stream.* That demo doesn't exist anywhere else.

---

## 6. The Kraterion-native angle (and why this beats DO)

DO Gradient AI is a **centralized** platform. Models, knowledge bases, agents, and access policies all sit in DO's control plane. The user trusts DO.

Kraterion's AI features inherit our substrate:

- **Knowledge chunks reference Walrus blobs.** A KB on Kraterion is portable — the user owns the bytes, the manifest, the verification trail.
- **Agent access is an on-chain capability.** Each agent's sub-wallet is registered on the bucket. Revocation is a Move call, not a database flip.
- **Tool calls are auditable and revocable mid-flight.** A function call on a Kraterion agent reads a bucket; revoking access fails the next read.
- **Cited chunks are verifiable.** The Verify button is unique to us; carrying it through to agent responses (every cited chunk verifiable against on-chain manifest) is the differentiator.
- **The user's LLM bill is still the user's.** We store the OpenAI key (KMS-wrapped) but never proxy through a Kraterion-owned key — every token charge lands directly on the user's OpenAI account. We hold the secret to *use it on their behalf*, not to *resell inference*. That distinction matters for the trust story and keeps cost-of-goods at zero.

The proposal above is the *minimum* set that brings Kraterion to feature parity on the surface area that mainstream RAG customers expect, while doubling down on the five properties above that DO structurally cannot offer.

---

## Appendix A — DigitalOcean Gradient AI feature index (condensed)

For full details see §2 of the research log. Categories: Knowledge Bases (sources, chunking, OpenSearch hybrid, BGE reranker, RAG playground, MCP, 120 KB/team, 5,500-page crawl, embedding indexing $0.009–$0.09/M tokens), Agents (REST `/v2/gen-ai/agents`, system prompt + model + KBs + functions + child agents + guardrails, OpenAI-compatible per-agent endpoint), Model catalog (Claude 4/4.5/4.6/4.7, GPT-5 family, Llama 3.3/4, Mistral, Qwen, DeepSeek V4, Nemotron, image/audio/video gens, 7+ embedding models, BGE reranker), Inference modes (Serverless OpenAI-compatible, Batch ≤10B tokens/model/account, Dedicated GPU endpoints), Router (≤1k req/min, model access keys), Fine-tuning (BYO via GPU droplets — not managed), Multi-agent routing (parent-child), Guardrails (PII $0.34/M, jailbreak $0.20/M, moderation $0.20/M), Functions (DO Functions or webhooks), Evals (agent evals ≤500 prompts, model evals ≤1k rows/1GB), Deployment (web widget, Slack template, App Platform, MCP server), GPU droplets ($0.76–$7.99/GPU·hr).

## Appendix B — Open questions

1. **KMS choice for credential wrap.** We already KMS-wrap Seal session keys per `CLAUDE.md`. Confirm we reuse the same KMS (AWS KMS / GCP KMS / local libsodium-sealed-key for dev) for `ProviderCredential.encrypted_key` rather than introducing a second key-management surface.
2. **Project-level credential rotation UX.** What happens to in-flight indexer jobs when a user replaces or removes the project's OpenAI key mid-run? Recommend: jobs fail soft, manifests stay `indexing`, dashboard surfaces "credential changed — retry" CTA.
3. **Embedding-model migration during re-index.** During the swap-over from old → new embedding space, do we keep both indexes warm and dual-write, or do we cut over atomically once the new pass completes? Atomic cutover is simpler; dual-write enables zero-downtime search but doubles storage during migration.
4. **Reranker provider list.** Which rerankers do we ship in the bucket dropdown at P2 launch — OpenAI-only (when available), or do we also accept a separate Cohere credential on day one?
5. **Agent ownership scope.** Is a `KraterionAgent` project-owned (any team member can mint) or admin-only? Affects the Move resource model and the widget-revocation flow.
6. **Widget spend caps.** P6 introduces `max_spend_usd_per_day` per agent. Source of truth for the running total — Redis counter rolled at UTC midnight, or a streaming sum off the OpenAI usage API? Redis is simpler but drifts from real cost; OpenAI usage API has reporting lag.
7. **Eval framework.** Worth proposing as P7 in a follow-up; would consume the existing `KnowledgeQuery` audit log as a gold dataset.
