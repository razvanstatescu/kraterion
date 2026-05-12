# Kraterion AI Platform — Proposal

**Date:** 2026-05-12
**Status:** Draft proposal — not committed roadmap
**Author:** Claude (research synthesis)
**Companion docs:** `/docs/ai-features-plan.md` (K0–K5), `/docs/implementation-plan.md`

---

## 1. What we have today

This proposal is grounded in the current Kraterion AI surface (see workstreams K0–K5 in `/docs/ai-features-plan.md`):

| Layer | Where | What it does |
|---|---|---|
| `@kraterion/embeddings-client` | `packages/embeddings-client` | OpenAI `text-embedding-3-small` @ 1024d (Matryoshka), batched, retry-aware |
| Knowledge schema | `prisma/migrations/202605120921…`, `…1309…`, `…1343…` | `KnowledgeBucketSettings`, `KnowledgeManifest`, `KnowledgeChunk` (halfvec + tsvector + HNSW), `KnowledgeQuery` |
| Ingestion (K1) | `apps/worker/src/embeddings/` | Fetch from Walrus → Seal-decrypt → extract (text, JSON, code, PDF) → recursive chunk → embed → persist; manifest JSON archived to Walrus (K5) |
| Retrieval (K2) | `apps/control-plane/src/knowledge/` | `/knowledge`, `/search` (hybrid BM25 + vector + RRF), `/ask` (BYO-OpenAI-key, `gpt-4o-mini` default), audited in `KnowledgeQuery` |
| MCP server (K3a) | `apps/control-plane/src/mcp/` | Streamable-HTTP, bearer-auth, seven tools (`list_buckets`, `list_objects`, `search`, `ask`, `read_object`, `write_object`, `get_manifest`) |
| Dashboard UI (K4) | `apps/dashboard/src/components/knowledge/` | Toggle, status panel (auto-refresh), search, **Verify** button (on-chain manifest hash check), Connect-an-agent panel |
| Verifiability (K5) | `embeddings/manifest-archive.ts` + `VerifyChunk.tsx` | Best-effort Walrus archival of manifest JSON; UI verifies each search hit against on-chain hash |

**Strengths**
- Hybrid retrieval (BM25 + vector + RRF) — recall@10 ~91% vs ~78% vector-only.
- Per-bucket revocation lever (`api_access_granted`) gates `/search`, `/ask`, and MCP uniformly.
- On-chain verifiable retrieval — the *only* feature of its kind among RAG products. This is the moat.
- MCP support out of the box — Claude Desktop, Cursor, custom agents connect today.

**Gaps**
- Locked to OpenAI for both embeddings and generation. Caller-supplied key means cost is on the user, but choice is on us.
- Only one chunking strategy (recursive); only one embedding model family.
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

I am proposing six features, ordered by ratio of **product impact** to **engineering cost** in the context of a hackathon-shipping startup. Each proposal explicitly states what we adopt vs. what we deliberately *don't* adopt.

### P1 — Multi-provider model gateway (small, high impact)

**What:** Replace the BYO-OpenAI-only contract on `/ask` and the MCP `kraterion_ask` tool with a model-agnostic façade. The caller picks `provider:model` (e.g. `openai:gpt-4o-mini`, `anthropic:claude-haiku-4-5`, `meta:llama-3.3-70b`, `mistral:ministral-3-14b`). Caller still supplies their own API key per provider; we never proxy with platform credentials.

**Why now:** DO's lesson is that *one OpenAI-compatible endpoint, many models* is the right shape for a retrieval-plus-generation product. We don't need DO's model hosting — we need DO's product affordance. Implementation is a thin adapter package (`packages/llm-client`) wrapping OpenAI/Anthropic SDKs with a uniform `complete(messages, {model, max_tokens, citations: true})` signature.

**Out of scope:** image/audio/video models; hosting weights; any model where we'd pay tokens. This stays BYOAI to preserve the "platform never sees your money" property of the gateway.

**Effort:** ~1 day. Mostly typing.

---

### P2 — Reranker after hybrid retrieval (small, very high quality lift)

**What:** Optional post-retrieval reranking stage. Hybrid returns top-50 candidates today; pipe them through a reranker that scores each chunk against the original query and returns top-`k`. Two implementations behind the same interface:
- **Local:** `bge-reranker-v2-m3` via a hosted endpoint (DO Inference Engine has it; HF Inference has it too) — BYO-key like `/ask`.
- **Cohere rerank-3** — same pattern.

Off by default; toggleable per-bucket in `KnowledgeBucketSettings.reranker_model`.

**Why now:** This is the single highest-precision-per-engineering-hour move available. RRF gives recall; reranker gives precision. The Verify button looks better when the top three results are the *right* three.

**Out of scope:** training our own reranker; embedding-time reranking models.

**Effort:** ~1 day, including a config row and a small change to `knowledge.service.ts`.

---

### P3 — First-class Agents resource (medium, defining product surface)

**What:** A new domain object — **KraterionAgent** — owned by a project, scoped to one or more buckets, with:

- `system_prompt` (text, versioned)
- `model` (resolved via P1's adapter; default `openai:gpt-4o-mini`)
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

### P5 — Guardrails (small, regulatory affordance)

**What:** Per-agent guardrails configured as a triple of toggles:

- **PII detection** on outputs — block or redact (`<EMAIL>`, `<PHONE>`, `<SSN>`).
- **Jailbreak detection** on inputs — block known jailbreak patterns.
- **Content moderation** on inputs/outputs.

Implementation: route both legs through a hosted classifier (Anthropic + OpenAI both expose moderation endpoints; alternately, Llama Guard 3 via BYO-key inference). Caller supplies the key; we wire the request.

**Why now:** Customers shipping a chatbot over their support bucket need this to even consider Kraterion. PII redaction is also a natural pairing with our existing access-control story — "the agent can't see emails, the policy can't be revoked retroactively, your tenants get receipts."

**Out of scope:** custom guardrail rules (regex DSL). DO doesn't expose these either yet.

**Effort:** ~1 day. Pre/post-call middleware on `/agents/{id}/chat`.

---

### P6 — Embeddable chat widget (medium, distribution play)

**What:** A `<script>` snippet a user pastes on their site that mounts a chat panel against a specific Kraterion agent. Token auth via short-lived agent share token (HMAC-signed, optional domain pinning, optional rate limit per IP).

**Why now:** Distribution. A storage SaaS competes with S3 on price/feature parity — losing battle. A storage SaaS where "upload your docs and get a chatbot on your site in 60 seconds" wins on the demo. The widget is also the cleanest evidence that the platform's AI surface is real and not just an MCP toy.

**Visual:** lives in `packages/ui-embed` as a separate, minimal bundle (no shadcn, no app deps). Imports the brand tokens from `design-system/`. Honors the design-system hard rules (no pure black/white, sentence case, etc.).

**Out of scope:** Slack bot, Discord bot, Teams bot. Each is plausible later as a thin wrapper around the same agent endpoint.

**Effort:** ~2 days. Widget bundle + share-token endpoint + dashboard page to mint/revoke share tokens.

---

## 4. Explicitly *not* proposing

| DO feature | Why we skip |
|---|---|
| **GPU Droplets / dedicated inference** | Capital-intensive, not in scope for Walrus track. BYO-key keeps us provider-neutral and free of inference costs. |
| **Fine-tuning** | BYO weights would require either dedicated GPUs or a partnership. Not the moat. |
| **Image / audio / video generation** | Off-strategy. Kraterion is "the storage substrate," not the generation surface. Users can store generated outputs in their bucket via the existing S3 API. |
| **Inference Router / A/B** | Premature. Revisit if/when we have multiple production models in P3. |
| **Web crawl as a KB source** | Tempting but punctures the "user-owned, on-chain blob" property — crawled pages have no owner story. If users want crawled docs indexed, they upload the crawl output as objects first. |
| **Batch inference** | Worth measuring once we cross ~10M chunks indexed. Not now. |
| **Child / multi-agent routing** | Real complexity; defer until at least three users ask for it. Built on top of P3 + P4 trivially. |
| **Model evaluations / agent evals** | Worth shipping (see §5) but as a separate workstream after P1–P6. |

---

## 5. The 30-day shape

Hackathon-cadence sequencing, assuming we accept all six. Each is independently shippable; P1 unblocks P3 unblocks P4/P5/P6.

```
Week 1   P1 (model gateway)  +  P2 (reranker)
Week 2   P3 (agents resource, dashboard CRUD, on-chain wiring)
Week 3   P4 (functions, audit trail)  +  P5 (guardrails)
Week 4   P6 (embeddable widget)  +  hardening / docs / demo script
```

Demo arc at end of month: *upload a folder of PDFs → toggle Knowledge → create an agent with a system prompt, GPT-5 model, PII guardrail, and a webhook tool calling the user's CRM → paste the widget on a landing page → ask a question → click Verify on a cited chunk → revoke the agent on-chain → show the next request fails mid-stream.* That demo doesn't exist anywhere else.

---

## 6. The Kraterion-native angle (and why this beats DO)

DO Gradient AI is a **centralized** platform. Models, knowledge bases, agents, and access policies all sit in DO's control plane. The user trusts DO.

Kraterion's AI features inherit our substrate:

- **Knowledge chunks reference Walrus blobs.** A KB on Kraterion is portable — the user owns the bytes, the manifest, the verification trail.
- **Agent access is an on-chain capability.** Each agent's sub-wallet is registered on the bucket. Revocation is a Move call, not a database flip.
- **Tool calls are auditable and revocable mid-flight.** A function call on a Kraterion agent reads a bucket; revoking access fails the next read.
- **Cited chunks are verifiable.** The Verify button is unique to us; carrying it through to agent responses (every cited chunk verifiable against on-chain manifest) is the differentiator.

The proposal above is the *minimum* set that brings Kraterion to feature parity on the surface area that mainstream RAG customers expect, while doubling down on the four properties above that DO structurally cannot offer.

---

## Appendix A — DigitalOcean Gradient AI feature index (condensed)

For full details see §2 of the research log. Categories: Knowledge Bases (sources, chunking, OpenSearch hybrid, BGE reranker, RAG playground, MCP, 120 KB/team, 5,500-page crawl, embedding indexing $0.009–$0.09/M tokens), Agents (REST `/v2/gen-ai/agents`, system prompt + model + KBs + functions + child agents + guardrails, OpenAI-compatible per-agent endpoint), Model catalog (Claude 4/4.5/4.6/4.7, GPT-5 family, Llama 3.3/4, Mistral, Qwen, DeepSeek V4, Nemotron, image/audio/video gens, 7+ embedding models, BGE reranker), Inference modes (Serverless OpenAI-compatible, Batch ≤10B tokens/model/account, Dedicated GPU endpoints), Router (≤1k req/min, model access keys), Fine-tuning (BYO via GPU droplets — not managed), Multi-agent routing (parent-child), Guardrails (PII $0.34/M, jailbreak $0.20/M, moderation $0.20/M), Functions (DO Functions or webhooks), Evals (agent evals ≤500 prompts, model evals ≤1k rows/1GB), Deployment (web widget, Slack template, App Platform, MCP server), GPU droplets ($0.76–$7.99/GPU·hr).

## Appendix B — Open questions

1. **Reranker hosting** — DO has BGE Reranker v2 M3 at attractive prices; do we plan to expose DO as a first-class BYO-key provider, alongside OpenAI/Anthropic/Cohere?
2. **Agent ownership** — is a KraterionAgent project-owned (admin-only) or user-owned (any team member can mint)? Affects the Move resource model.
3. **Widget pricing surface** — agent share tokens admit anonymous request volume against the user's BYO LLM key. Do we want a per-token rate limiter, or rely on the user's provider quotas?
4. **Eval framework** — worth proposing as P7 in a follow-up; would consume the existing `KnowledgeQuery` audit log as a gold dataset.
