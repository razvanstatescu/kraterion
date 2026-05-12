# Kraterion — AI Features Plan

> **Status:** Draft (2026-05-12)
> **Owner:** Razvan
> **Window:** ~10–14 working days, slotting between current dashboard polish
> (W3, ahead of plan) and the W6 hardening window. Submission gate is
> 2026-06-21.
> **Companion to:** `/docs/implementation-plan.md`. That doc remains the
> source of truth for the S3 + Walrus + Seal product. This doc layers an
> AI/agent surface on top without altering any current foundations.

This file is written to be handed to Claude Code in chunks. Each phase has
exit criteria, file paths to touch, and explicit "do not do this yet"
boundaries. If a phase blows past its budget, drop the stretch items —
never the demo path.

---

## 1. Why we are doing this

The Walrus track problem statement explicitly leans on AI agents: long-term
verifiable memory, multi-agent coordination, artifact-driven workflows,
integrations into existing agent frameworks. Our current pitch — "S3 on
Walrus with Sui ownership and Seal revocation" — is strong infrastructure
but reads as off-axis from that brief. Judges scoring on the published
rubric will reward submissions that **show agents becoming more useful
because of Walrus**, not just submissions that put files on Walrus.

The opportunity: our existing primitives (per-bucket on-chain ownership,
Seal envelope encryption, gateway-delegated revocable access, S3 surface
that any tool already speaks) are exactly the substrate an agent needs for
**persistent, portable, verifiable memory**. The wedge for Kraterion is
not to compete with MemWal — MemWal is a semantic-memory primitive ("agent
writes a thought, agent recalls it"). Kraterion's wedge is one layer up:
**"drop any files into a bucket, get a verifiable, agent-queryable
knowledge base."** Every Kraterion bucket becomes a corpus; every PUT is
indexed; every query returns chunks with on-chain provenance and revocable
access.

### What we are optimizing for, in priority order

1. **A 90-second demo that hits the AI thesis without losing our two plot
   twists.** Cancel-subscription and revoke-API both still fire, now over
   a *knowledge base* surface — far louder than the file-only version.
2. **One-command developer adoption via MCP.** `npx @kraterion/mcp` and
   any Claude/Cursor/Cline agent has memory + retrieval over a Kraterion
   bucket. This is the line judges will quote.
3. **Verifiable retrieval, not just verifiable storage.** Per-object
   embedding manifests archived as Walrus blobs. The knowledge base is
   reproducible from on-chain artifacts even if our index is wiped.
4. **Zero churn to the S3 surface.** Existing buckets, existing API keys,
   existing dashboard. Knowledge is **additive**: a per-bucket flag, new
   endpoints, new MCP package — nothing pre-existing changes shape.

### What we are explicitly not building (now)

- A vector database. pgvector with HNSW. Move on.
- A custom embedding model. OpenAI `text-embedding-3-small` (1024 dims via
  `dimensions` param). BYO key for `/ask` LLM calls (no proxy ledger).
- A new Move module today. Manifests live as Walrus blobs referenced from
  Postgres. A `KnowledgeManifestPublished` event is in §6.7 as a stretch
  item; not on the critical path.
- Full PDF text extraction across every format. v1 indexes `text/*`,
  `application/json`, `application/xml`, `text/markdown`, source code MIME
  types, and `application/pdf` via `pdf-parse`. Images, audio, archives,
  binary blobs are skipped silently and noted in the manifest.
- Multipart upload, range reads, presigned PUT for indexed buckets. Same
  scope as the rest of the gateway.
- Multi-tenant LLM proxying. For `/ask`, the caller brings their own key.
- Cross-bucket search. Each query is bucket-scoped (matches the API key /
  MCP bucket scope and keeps the revoke-API mechanic clean).

---

## 2. Product shape

### 2.1 What the user sees in the dashboard

The dashboard gains exactly **one new tab per bucket**: **Knowledge**.
Everything else stays put. The tab contains:

- A toggle: *"Make this bucket searchable by AI."* On = the worker
  embeds every supported object on upload and on overwrite. Off = the
  bucket behaves exactly like today.
- An index status panel: total objects, indexed, queued, skipped (with
  per-MIME breakdown), last update.
- A live query box: natural-language search. Returns the top chunks with
  source object + Walruscan deep-link + "Open file" affordance.
- A "Connect an agent" panel with copy-paste snippets for the MCP server
  (Claude Desktop config, Cursor `mcp.json`, raw HTTP `curl`).
- A small note linking to a per-object manifest: `walrus://<blob_id>`,
  rendered as a Walruscan link. This is the verifiable-retrieval hook
  judges will inspect.

The bucket list page gets a small badge ("🧠 Knowledge") next to buckets
that have it enabled. The activity feed gains two new event kinds —
`KNOWLEDGE_INDEXED` and `KNOWLEDGE_QUERY` — reusing the existing
`UsageEvent` shape.

### 2.2 What an agent sees

Agents reach Kraterion through one of three doors. Same scope (project
/ bucket), same revocation lever.

- **MCP server**, hosted by us at `/mcp` on the control plane using the
  Streamable-HTTP transport from the November 2025 MCP spec. No local
  install. Two auth modes ship side-by-side, matching the dual model
  Linear / Stripe / GitHub use:
  - **Bearer token** with an existing Kraterion API key secret. The
    default for devs wiring agents into scripts, CI, custom Anthropic
    SDK code, Vercel AI SDK, Cline, or any unattended workflow. The
    fastest "give me an agent that can read my bucket" path.
  - **OAuth 2.1 + PKCE + DCR + RFC 9728 Protected Resource Metadata.**
    The 2026 MCP-spec-mandated path for end-user one-click flows
    (Claude Desktop "Connect Kraterion," Anthropic Connector marketplace
    listing, Cursor's MCP catalog). Required for any public listing;
    nice-to-have for everything else.

  Both modes go through one pluggable auth guard on the same `/mcp`
  route and resolve to the same `(project_id, api_key_id_or_user_id)`
  request principal — so the tool implementations and the revocation
  lever are identical regardless of how the agent authenticated.

  Tools exposed:
  - `kraterion.list_buckets`
  - `kraterion.search(bucket, query, top_k?)`
  - `kraterion.ask(bucket, query, model?)`
  - `kraterion.list_objects(bucket, prefix?)`
  - `kraterion.read_object(bucket, key)`
  - `kraterion.write_object(bucket, key, content, content_type?)`
  - `kraterion.get_manifest(bucket, key)`
- **REST API** on control-plane: `/v1/buckets/{id}/search`,
  `/v1/buckets/{id}/ask`, plus existing CRUD. SigV4 still works for raw
  S3 ops on the gateway.
- **Vercel AI SDK adapter** (stretch, §6.6). Thin wrapper that turns the
  MCP tools into AI SDK `tool()` definitions. Two files; no new runtime.

### 2.3 Lifecycle behaviors (delete, overwrite, revoke, toggle off)

The knowledge layer mirrors S3's existing soft-delete semantics. Chunks
are pure derived state; manifests are audit; Walrus blobs are forever.

| Event | Live index (`KnowledgeChunk`) | Manifest row | Manifest Walrus blob | Notes |
|-------|-------------------------------|--------------|----------------------|-------|
| `DeleteObject` | Hard delete the file's chunks | Soft delete (`deleted_at`) | Persists on chain | Order: chunks → manifest → `S3Object.deleted_at`, in one Prisma transaction. A search racing the delete cannot return a chunk whose manifest no longer resolves. |
| Re-PUT same key after delete | New chunks for the new content | New row, `version = prev + 1`. Old row stays soft-deleted. | New blob written. Old blob persists. | The `S3Object.deleted_at` un-set is already handled at [object-created.handler.ts:136](apps/worker/src/indexer/handlers/object-created.handler.ts#L136); we hook in after that. |
| Overwrite (PUT to existing key) | Old chunks deleted, new chunks written, same `S3Object.id` | New row, `version` bumps. Old row kept as-is. | New blob, old blob persists. | Already in §6.2.4. |
| `DeleteBucket` | Cascade hard-delete all chunks in the bucket | Soft delete every manifest | All blobs persist on chain | Same shape as today's bucket delete: nothing on chain torn down. |
| Toggle Knowledge off | Hard-delete all chunks for the bucket | Rows kept as audit | Blobs persist | `KnowledgeBucketSettings` row dropped; future PUTs no longer index. Toggling back on re-indexes from `S3Object` rows. |
| `revoke_api_access` (the demo lever) | Untouched | Untouched | Untouched | Search and `/ask` 403 immediately on the `api_access_granted` short-circuit. Re-grant restores access without re-indexing. |
| Account `status = cancelled` | Untouched | Untouched | Untouched | Same posture as the file path today. The user keeps everything; the platform stops paying renewal. |

The schema implication: `KnowledgeManifest` needs a `deleted_at`
column. Add it in the K0 migration so we don't have to migrate after
shipping. `KnowledgeChunk` does not — chunks are hard-deleted.

Cost-of-being-wrong: hard-deleting chunks means embedding work is
sunk on a delete-then-re-upload of the same content. A future
deduplication path keyed on `KnowledgeChunk.content_hash` is the
right answer; out of scope for the hackathon.

### 2.4 The demo (90 seconds, rewritten)

1. **(0:00–0:15) Setup, no narration.** Dashboard open. Empty knowledge
   bucket `demo-research`. Knowledge toggle flipped on.
2. **(0:15–0:35) "Any agent already speaks our protocol."** Terminal:
   `aws s3 cp paper-{1..5}.pdf s3://demo-research`. The Knowledge tab
   shows objects flipping from "queued" → "indexed" within seconds.
3. **(0:35–0:55) "Now your agent has memory."** Cursor window. The
   agent (with `@kraterion/mcp` connected) is asked *"What do these
   papers say about Walrus epoch lengths?"* It calls `search` → `ask`,
   returns a cited answer. Each citation is a clickable Walruscan link.
4. **(0:55–1:10) Plot twist 1 — cancel subscription.** Settings → Cancel.
   The agent's *next* query still works (user owns the SharedBlobs; the
   gateway is read-only against on-chain access).
5. **(1:10–1:30) Plot twist 2 — revoke API access.** Settings → Revoke.
   Agent's query fails with a clean error. We click "Manifest" on one
   chunk → Walruscan opens, showing the on-chain SharedBlob still owned
   by the user. The voice-over closes: *"The platform stops reading. You
   still own everything — files, embeddings, and the proof of how they
   were indexed."*

The demo lands on the same two levers as today, but the surface they
operate over is now a *knowledge base*, not a file list. That is the
upgrade.

---

## 3. Architecture — how this slots in

```
┌─────────────────────────────────────────────────────────────┐
│  apps/dashboard (Next.js)                                   │
│  - /buckets/[id]/knowledge tab                              │
│  - calls control-plane for search/ask, gateway for S3       │
└─────────────────────────────────────────────────────────────┘
            │                                  │
            ▼                                  ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│  apps/control-plane     │         │  apps/gateway (port     │
│  (port 4001)            │         │  4002, unchanged)       │
│  + /v1/buckets/:id/     │         │                         │
│      knowledge          │         │  S3 PUT → emits         │
│  + /v1/buckets/:id/     │         │  KraterionObjectCreated │
│      search             │         │  on-chain, today        │
│  + /v1/buckets/:id/ask  │         │                         │
└─────────────────────────┘         └─────────────────────────┘
            │                                  │
            │ pgvector search via Prisma       │ on-chain event
            ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Postgres (existing)                                        │
│  + KnowledgeBucketSettings                                  │
│  + KnowledgeChunk (chunk text, embedding vector, source FK) │
│  + KnowledgeManifest (per-object indexing record)           │
│  + KnowledgeQuery (audit log, fed into Activity)            │
└─────────────────────────────────────────────────────────────┘
            ▲                                  │
            │ writes chunks + manifest         │ ObjectCreatedHandler
            │                                  │ (already running)
┌─────────────────────────────────────────────────────────────┐
│  apps/worker (port 4003)                                    │
│  + BullMQ "kraterion-embeddings" queue                      │
│  + EmbeddingsModule:                                        │
│    1. Listen for KraterionObjectCreated in handler          │
│    2. If parent bucket is knowledge-enabled, enqueue        │
│    3. Worker: fetch plaintext via gateway service → chunk   │
│       → embed → upsert chunks → archive manifest as Walrus  │
│       blob → write manifest row                             │
└─────────────────────────────────────────────────────────────┘
            ▲
            │ stdio + streamable HTTP
┌─────────────────────────────────────────────────────────────┐
│  packages/mcp-server (NEW)                                  │
│  - MCP tools wrap control-plane REST + gateway S3           │
│  - Auth: Bearer API key (existing AKIA/secret pair)         │
└─────────────────────────────────────────────────────────────┘
```

### Key design choices and why

- **The worker, not the gateway, does embedding.** The gateway's PUT path
  is hot (sub-second budget, on the critical path of every customer
  request). Embedding is asynchronous, can fail and retry, and depends on
  third-party APIs (OpenAI). The worker app's existing brief
  (`apps/worker/CLAUDE.md`) is explicit about this separation. We add a
  `EmbeddingsModule` alongside the indexer; the existing
  `ObjectCreatedHandler` is the only piece that touches both.
- **The indexer triggers, but does not perform, embedding.** The handler
  inside the Prisma transaction must finish fast (it processes Sui
  checkpoints). It enqueues a BullMQ job and returns. Embedding latency
  has no effect on indexer lag.
- **Plaintext acquisition reuses gateway internals.** The worker uses the
  same `ObjectBytesService` pipeline (Seal SessionKey + Walrus
  aggregator) the gateway uses. We factor a shared package
  (`packages/object-bytes`) out of `apps/gateway/src/s3/` in Phase 0 so
  both apps can decrypt. This is a small refactor — ~150 lines moved —
  and pays off the moment any other service needs plaintext.
- **Embeddings stay in Postgres for the live index.** pgvector with
  HNSW, halfvec quantization. p95 query latency under 50 ms at our
  scale; one less service to operate; matches the existing data plane.
- **Manifests go to Walrus for verifiability.** Per indexed object, the
  worker writes a manifest blob (JSON: model id, chunking params, list
  of chunk hashes, source Walrus blob id, dimensions, version). That
  blob is a Walrus SharedBlob owned by the same on-chain bucket as the
  source. The Postgres `KnowledgeManifest` row carries the blob id; the
  dashboard renders it as `walrus://<id>`. Result: the knowledge base
  is reproducible from on-chain artifacts after a Postgres wipe — the
  most agent-thesis-aligned thing we can build inside the window.
- **Re-use the existing API key scope.** Each Kraterion API key is
  already project-scoped. MCP and the new REST endpoints honor that
  scope. No new auth surface; no new revocation lever; same
  `api_access_granted` flag already gates the gateway.

---

## 4. Data model additions

All new tables live in the existing `prisma/schema.prisma`. No changes to
existing tables. Add `vector` and `halfvec` types via the
`pgvector-prisma` (or raw SQL preview features) — see §5.4.

```prisma
// === Knowledge layer (additive; opt-in per bucket) ===

model KnowledgeBucketSettings {
  // 1:1 with Bucket. Existence implies the bucket is knowledge-enabled;
  // we never soft-disable — flipping off deletes this row and the chunks
  // it scopes (manifests on Walrus persist; that's the point).
  bucket_id            String  @id
  embedding_model      String  @default("text-embedding-3-small")
  embedding_dimensions Int     @default(1024)
  // "recursive" for v1. "semantic" reserved for stretch (§6.5).
  chunking_strategy    String  @default("recursive")
  chunk_tokens         Int     @default(400)
  chunk_overlap_tokens Int     @default(60)
  // Caller-supplied for /ask; null = require BYO key per request.
  default_llm_model    String?
  created_at           DateTime @default(now())
  updated_at           DateTime @updatedAt

  bucket Bucket @relation(fields: [bucket_id], references: [id])
}

model KnowledgeManifest {
  // One row per (s3_object_id, version). Re-indexing on overwrite or
  // model change bumps `version` and writes a new manifest blob.
  id                   String   @id @default(uuid())
  s3_object_id         String
  bucket_id            String   // denormalized for filter speed
  version              Int      @default(1)
  status               String   // "queued" | "indexing" | "indexed" | "skipped" | "failed"
  skip_reason          String?  // "unsupported_mime" | "too_large" | "empty" | etc.
  embedding_model      String?
  embedding_dimensions Int?
  chunk_count          Int      @default(0)
  // Walrus blob id of the manifest archive (a SharedBlob owned by the
  // user's on-chain bucket). Null until §6.4 lands.
  manifest_walrus_blob_id String?
  // Sui object id of the SharedBlob wrapping the manifest. Mirrors the
  // shape of S3Object.shared_blob_object_id.
  manifest_shared_blob_object_id String?
  bytes_in             BigInt   @default(0)
  bytes_indexed        BigInt   @default(0)
  embedding_tokens     Int      @default(0)
  error_detail         String?
  started_at           DateTime?
  finished_at          DateTime?
  // Soft-delete on DeleteObject / DeleteBucket / overwrite. Chunks are
  // hard-deleted; the row stays so historical KnowledgeQuery citations
  // resolve. The Walrus manifest blob persists regardless — the user
  // owns it.
  deleted_at           DateTime?
  created_at           DateTime @default(now())

  s3_object S3Object @relation(fields: [s3_object_id], references: [id])

  @@unique([s3_object_id, version])
  @@index([bucket_id, status])
}

model KnowledgeChunk {
  // The live retrieval index. Replaced wholesale when a manifest version
  // bumps (we delete chunks for old versions; the manifest row itself
  // stays for audit + the on-chain manifest blob remains).
  id            String   @id @default(uuid())
  bucket_id     String   // denormalized — every query is bucket-scoped
  s3_object_id  String
  manifest_id   String
  ordinal       Int      // chunk index within the document
  // SHA-256 of the chunk plaintext. Manifest archives the list of these
  // so the index can be rebuilt deterministically.
  content_hash  Bytes
  // The chunk's plaintext. Kept un-encrypted at rest in Postgres because:
  // (a) the bucket owner has explicitly opted into AI indexing of this
  //     content;
  // (b) the chunk is already Seal-decrypted on the worker to compute
  //     embeddings — re-encrypting at rest adds cost without changing
  //     the threat model;
  // (c) revoking platform access flips the bucket's `api_access_granted`,
  //     which the search endpoint short-circuits on (§6.3); chunks are
  //     never returned to a caller after revocation.
  content       String   @db.Text
  // halfvec saves 50% storage with negligible recall loss at 1024 dims.
  embedding     Unsupported("halfvec(1024)")
  token_count   Int
  start_offset  Int      // byte offset into source plaintext
  end_offset    Int

  manifest  KnowledgeManifest @relation(fields: [manifest_id], references: [id], onDelete: Cascade)
  s3_object S3Object          @relation(fields: [s3_object_id], references: [id])

  @@unique([manifest_id, ordinal])
  @@index([bucket_id])
  // HNSW index added via raw SQL migration (Prisma doesn't model index
  // operator classes natively yet). See §5.4.
}

model KnowledgeQuery {
  // Audit + activity feed source for the dashboard. One row per
  // /search or /ask call.
  id          String   @id @default(uuid())
  bucket_id   String
  project_id  String   // denormalized for activity scoping
  api_key_id  String?  // null when query came via session-authed dashboard
  kind        String   // "search" | "ask"
  query       String   @db.Text
  top_k       Int
  latency_ms  Int
  chunk_count Int
  // Hashes of the chunks returned — supports "the agent's answer was
  // backed by these citations" replay.
  cited_hashes Bytes[]
  llm_model   String?
  llm_tokens  Int?
  created_at  DateTime @default(now())

  bucket  Bucket  @relation(fields: [bucket_id], references: [id])

  @@index([bucket_id, created_at])
  @@index([project_id, created_at])
}
```

### Migration ordering

Two migrations, both backwards-compatible:

1. `add_knowledge_tables` — creates the four tables + foreign keys, but
   does **not** create the HNSW index (zero-row index build is free but
   we want it under a named migration).
2. `add_knowledge_hnsw_index` — raw SQL:
   ```sql
   CREATE INDEX knowledge_chunk_embedding_hnsw
     ON "KnowledgeChunk"
     USING hnsw (embedding halfvec_cosine_ops)
     WITH (m = 16, ef_construction = 200);
   ```
   Plus a function-based GIN index on `content` for hybrid search
   (§6.3 stretch).

---

## 5. Phased timeline

Four phases. Total budget: **10–14 days**. Anything under "Stretch"
gets cut first if a phase slips. Phase ordering is dependency-driven —
do not reorder without re-reading §3.

| Phase | Days | Workstream | Exit criteria |
|-------|------|------------|---------------|
| K0 | 1 | Plumbing | Plaintext extracted into `packages/object-bytes`. Both gateway and worker can decrypt an object. pgvector enabled in dev compose. |
| K1 | 3 | Pipeline | A PUT into a knowledge-enabled bucket auto-indexes within 10s. Chunks land in `KnowledgeChunk`. Manifest written (without on-Walrus archival yet). End-to-end via `aws s3 cp`. |
| K2 | 2 | Retrieval API | `POST /v1/buckets/{id}/search` and `/ask` ship with API-key auth, pgvector HNSW. `/ask` requires BYO LLM key in the request. |
| K3a | 1.5 | MCP server (bearer) | `/mcp` route hosted on the control plane (Streamable-HTTP transport). Bearer-token auth using existing Kraterion API keys. Claude Desktop / Cursor / Cline configs work end-to-end. |
| K3b | 2–3 | MCP server (OAuth) | OAuth 2.1 + PKCE + DCR (RFC 7591) + Protected Resource Metadata (RFC 9728) + Resource Indicators (RFC 8707). Layered on the same `/mcp` route via the pluggable auth guard. Ship if K0–K3a + K4 land on schedule; otherwise slip to post-hackathon. |
| K4 | 2 | Dashboard tab | Knowledge tab live: toggle, index status, live query box, connect-an-agent snippets. Walruscan deep-links on citations. |
| K5 | 1 | Manifest on Walrus | Manifests archived as SharedBlobs via the existing gateway path. Dashboard renders the on-chain link. |
| K6 | 1 | Demo polish | Full 90s rehearsal twice. Fix the rough edges only. |
| Stretch | as left | Pick one: late chunking, hybrid BM25, Vercel AI adapter, `KnowledgeManifestPublished` Move event, OpenClaw plugin, `packages/mcp-cli` thin local wrapper, OAuth refresh tokens, per-tool fine-grained scopes |

**Critical-path budget:** K0 + K1 + K2 + K3a + K4 + K5 + K6 = ~11 days.
K3b adds 2–3 days when it slots in (target: between K3a and K4, or
parallel with K4 if a second pair of hands is available). Total
budget if both phases ship: ~13–14 days.

### Calendar fit (current state, anchored 2026-05-12)

Per `/docs/timeline.md`, we are running ~2 weeks ahead of plan (W3 of
the original schedule, dashboard Phase A landed). 43 days to submission.
Knowledge work fits in 2 of those weeks comfortably with W6/W7 still
reserved for hardening, demo video, and submission polish.

---

## 6. Workstream details (what to build, in order)

### 6.1 Phase K0 — Plumbing

**Goal:** unlock the worker to decrypt objects and prepare the database
for vector indexing.

**Tasks:**

1. **Factor `packages/object-bytes`** out of
   `apps/gateway/src/s3/object-bytes.service.ts`. Move the Seal+Walrus
   pipeline (build `seal_approve` PTB, fetch ciphertext from aggregator,
   decrypt) into a framework-agnostic function that takes
   `{ bucket, object, sessionKey }` and returns `Uint8Array`. Keep the
   NestJS service in the gateway as a thin wrapper that injects the
   gateway's keypair + Redis. The worker imports the same function and
   injects its own keypair (a new sub-wallet in `SubWallet.role =
   "knowledge_indexer"`).
2. **Enable pgvector** in `infra/compose/docker-compose.yml` by switching
   the Postgres image to `pgvector/pgvector:pg16` (or adding the
   extension via init script if we're sticking with an existing image).
3. **Sub-wallet** for the embedding worker. Use the existing
   `bootstrap-gateway.ts` shape; new role `knowledge_indexer`. Address
   added to every knowledge-enabled bucket's `api_decryption_addresses`
   at enable-time (one on-chain call, reusing
   `kraterion::grant_api_access`).
4. **Prisma migration 1** (`add_knowledge_tables`).

**Exit criteria:** `pnpm typecheck` green; `pnpm --filter @kraterion/worker
test` includes a smoke test that decrypts one object via the new
sub-wallet.

**Do not do this yet:** the HNSW index, the worker module wiring, any
endpoint. K0 is purely plumbing.

---

### 6.2 Phase K1 — Embedding pipeline

**Goal:** PUTs into a knowledge-enabled bucket auto-index. End-to-end
proof via the existing S3 surface.

**Tasks:**

1. **BullMQ wiring in the worker.** Plan §8 and `apps/worker/CLAUDE.md`
   both already specify BullMQ; this is the first queue we actually
   create. Add `apps/worker/src/embeddings/` with:
   - `embeddings.module.ts` — Nest module registering the
     `kraterion-embeddings` queue (Redis via the existing `RedisModule`).
   - `embeddings.processor.ts` — BullMQ `Worker` class, concurrency 4.
   - `embeddings.service.ts` — enqueues a job given `s3_object_id`.
   - `chunking/recursive.ts` — recursive character splitter at 400
     tokens / 60 overlap using a `tiktoken` tokenizer (the OpenAI
     embedder's tokenizer is `cl100k_base`).
   - `embedders/openai.ts` — thin wrapper around the OpenAI embeddings
     endpoint. Batches at 100 chunks/request. Honors per-bucket
     `embedding_model` + `embedding_dimensions`.
   - `extractors/` — one file per MIME family: `text.ts`, `markdown.ts`,
     `json.ts`, `pdf.ts` (uses `pdf-parse`), `code.ts`. A dispatch
     function picks by `content_type` and falls back to `skipped`.
2. **Indexer hook.** Edit
   `apps/worker/src/indexer/handlers/object-created.handler.ts`
   ([apps/worker/src/indexer/handlers/object-created.handler.ts](apps/worker/src/indexer/handlers/object-created.handler.ts))
   to, **after** the existing upsert, check whether the parent bucket
   has a `KnowledgeBucketSettings` row. If yes, call
   `embeddingsService.enqueue(s3Object.id)`. This is the only edit to
   any existing file in K1.
3. **Manifest lifecycle.** The processor: insert a `KnowledgeManifest`
   row with status `queued` → flip to `indexing` → on success flip to
   `indexed`, write the chunks, fill in `chunk_count` / `bytes_indexed`
   / token counts. On unsupported MIME, status `skipped` with
   `skip_reason`. On failure after 3 retries, `failed` with
   `error_detail`. **No manifest on Walrus yet** — that's K5.
4. **Idempotency.** If a PUT overwrites an existing key, the existing
   `S3Object` row's id is reused (per the schema's
   `@@unique([bucket_id, s3_key])`). The processor:
   - bumps `manifest.version`,
   - deletes prior chunks via the cascade,
   - writes the new manifest + chunks.
5. **Vitest coverage.** Unit tests for chunking and the MIME dispatch.
   One integration test that runs the processor over a fixture .txt
   blob (mocked OpenAI client) and asserts the row shape.

**Exit criteria:**

- `aws s3 cp ./README.md s3://demo-research/readme.md` → within 10
  seconds, a `KnowledgeManifest` row in status `indexed` and N chunks
  in `KnowledgeChunk`.
- Re-PUT same key → version bumps, old chunks gone, new chunks present.
- A binary PUT (e.g., a .png) → status `skipped`, `skip_reason =
  unsupported_mime`.
- All chunk vectors are 1024-d halfvecs.

**Do not do this yet:** vector search, REST endpoint, MCP server,
dashboard tab, Walrus manifest archival.

---

### 6.3 Phase K2 — Retrieval API

**Goal:** call `POST /v1/buckets/{id}/search` from any HTTP client (API
key authed) and get a ranked chunk list. `/ask` does the same with an
LLM step.

**Tasks:**

1. **HNSW index** via Prisma migration 2 (raw SQL — see §4).
2. **New control-plane module** at
   `apps/control-plane/src/knowledge/`:
   - `knowledge.module.ts`
   - `knowledge.controller.ts` — three routes:
     - `POST /v1/buckets/:id/knowledge` — body `{ enabled: boolean,
       embedding_model?, chunking?, ... }`. Creates or deletes
       `KnowledgeBucketSettings`. On enable, also calls the on-chain
       `grant_api_access(bucket, knowledge_indexer_address)` PTB via the
       existing sponsor flow.
     - `POST /v1/buckets/:id/search` — body
       `{ query: string, top_k?: number }`, default `top_k = 8`. Returns
       chunks + source object metadata + Walruscan URLs. Embeds the
       query once via the **same model** the bucket was indexed with
       (read from `KnowledgeBucketSettings`).
     - `POST /v1/buckets/:id/ask` — body `{ query, top_k?, model?,
       openai_api_key? | anthropic_api_key? }`. Runs `search` →
       prompt-stuffs the top chunks → calls the BYO LLM with a citation
       contract → returns `{ answer, citations[] }`.
   - `knowledge.service.ts` — the retrieval impl. pgvector query via
     Prisma's `$queryRaw` (the HNSW cosine search):
     ```ts
     const rows = await prisma.$queryRaw<Chunk[]>`
       SELECT id, content, s3_object_id, ordinal, content_hash,
              embedding <=> ${queryEmbedding}::halfvec(1024) AS distance
         FROM "KnowledgeChunk"
         WHERE bucket_id = ${bucketId}
         ORDER BY distance
         LIMIT ${topK};
     `;
     ```
   - Always set `SET LOCAL hnsw.ef_search = 64` (or 96 for `/ask`) in
     the same transaction as the query.
3. **Auth.** Existing API key guard works as-is. The new endpoints sit
   under the same `/v1/buckets/:id` namespace as the read-only object
   routes already do. Same scoping (project ownership) checks.
4. **Revocation short-circuit.** `knowledge.service` reads the bucket
   first and returns `403 KeyAccessRevoked` if `api_access_granted ===
   false`. This is the same flag the gateway honors; flipping it
   revokes search instantly, which is the demo lever.
5. **Audit row.** Every `/search` and `/ask` writes a `KnowledgeQuery`
   row, fed into the existing Activity controller.

**Exit criteria:**

- `curl -X POST -H 'Authorization: AWS4-HMAC-SHA256 …' …/v1/buckets/<id>/search`
  returns top-8 chunks with citations.
- Latency p95 < 200 ms on a 1k-chunk corpus (mocked or real).
- Revoking the bucket's API access (existing dashboard button) breaks
  the next query with the canonical `KeyAccessRevoked` error.

**Do not do this yet:** dashboard UI, MCP server, on-Walrus manifest.

---

### 6.4 Phase K3 — MCP server (hosted on the control plane)

**Goal:** any MCP-aware agent (Claude Desktop, Cursor, Cline, Vercel AI
SDK clients, custom Anthropic SDK code, OpenAI Connectors) connects to
Kraterion. K3 ships in two phases:

- **K3a (bearer, ~1.5 days, required):** dev-flow auth. Paste one URL +
  one Kraterion API key.
- **K3b (OAuth 2.1, ~2–3 days, target-but-cuttable):** end-user
  one-click flow. Required for any public marketplace listing
  (Anthropic Connectors, Cursor catalog); strongly preferred for the
  Claude Desktop "Connect Kraterion" onboarding.

Both layer onto the same `/mcp` route via a **pluggable auth guard**
(see §6.4.0). The tool implementations are written **once** and never
care which scheme authenticated the request.

**Why hosted, not a distributed package:** the MCP November 2025 spec
made Streamable HTTP first-class and every major MCP client now supports
remote servers. A local `npx` package would (a) add an install step
that hurts the demo, (b) duplicate auth + tool-dispatch logic that
already lives in the control plane, and (c) carry a separate release
cadence. A thin `packages/mcp-cli` wrapper survives only as a
post-hackathon item for the narrow cases (keychain-stored secrets,
local-file tools).

**Why dual auth, not one or the other:** matches the industry pattern
(Linear, Stripe, GitHub all do dual). Bearer alone closes the door to
marketplace listings and to clients that only know how to do OAuth.
OAuth alone breaks every CI / scripted / unattended workflow where
operator-presence-required flows are non-starters. See the 2026-05-12
ADR in `/docs/decisions.md` for the trade-off.

---

#### 6.4.0 The pluggable auth guard (foundation for K3a and K3b)

One Nest guard mounted on `/mcp` that dispatches by token shape, then
hands the request the same `McpPrincipal` regardless of how
authentication happened.

```ts
// apps/control-plane/src/mcp/mcp.auth.guard.ts
type McpPrincipal = {
  project_id: string;
  // exactly one of these is set
  api_key_id?: string;   // bearer (K3a)
  user_id?: string;      // OAuth (K3b)
  scopes: string[];      // mcp:read, mcp:write, mcp:ask (K3b only; bearer = all)
};

// Dispatch: detect the scheme from the token shape.
// - JWTs are always three base64url segments joined with dots and start
//   with `eyJ` (the encoded `{"alg":...`). Any token starting with `eyJ`
//   that parses as a JWT → OAuth path.
// - Everything else → API-key path. (Kraterion API key secrets are
//   high-entropy random; AKIA prefix is on the access_key_id, the
//   bearer carries the *secret* portion.)
```

Both branches resolve to `McpPrincipal` and `request.principal` is set.
Tool handlers consume `request.principal` and never branch on the
scheme. This means K3b is **purely additive** to K3a — no churn in
the tool layer.

---

#### 6.4.1 Phase K3a — Bearer-token auth (~1.5 days, required)

**Tasks:**

1. **New module** at `apps/control-plane/src/mcp/`:
   - `mcp.module.ts` — Nest module.
   - `mcp.controller.ts` — exposes `POST /mcp` and the companion
     Streamable-HTTP routes. Wraps
     `@modelcontextprotocol/sdk@^1.29`'s `McpServer` +
     `StreamableHTTPServerTransport`. A session id flows through
     `Mcp-Session-Id` headers, honored but not persisted (control plane
     runs behind a single Postgres; resumption isn't needed for
     hackathon).
   - `mcp.tools.ts` — registers the seven tools listed in §2.2. Each
     tool calls the corresponding existing service **directly** (e.g.
     `knowledgeService.search(...)`), not over HTTP — same process,
     same Prisma connection, same DI graph.
   - `mcp.auth.guard.ts` — pluggable guard from §6.4.0; in K3a only the
     API-key branch is implemented. Looks up the `ApiKey` row by HMAC
     fingerprint of the secret (matching the SigV4 secret lookup at
     `apps/gateway/src/auth/sigv4/`), KMS-unwraps, compares in
     constant time, resolves the `project_id` scope, and returns
     `McpPrincipal{ project_id, api_key_id, scopes: ['mcp:*'] }`.
     Revoked or unknown tokens → `401`.
2. **Forward-compatible 401 response.** Even in K3a-only mode, the 401
   includes a stub `WWW-Authenticate` header:
   `Bearer realm="kraterion-mcp"`. K3b extends this with
   `resource_metadata="..."` (RFC 9728). Clients that don't speak
   OAuth ignore the realm; clients that do will trigger discovery
   only once we ship K3b.
3. **Tool surface.** Example, unchanged from before:
   ```ts
   server.tool(
     "kraterion.search",
     { description: "...", inputSchema: z.object({ bucket: z.string(), query: z.string(), top_k: z.number().optional() }) },
     async ({ bucket, query, top_k }, { principal }) => {
       const bucketRow = await bucketsService.resolveByName(principal.project_id, bucket);
       const res = await knowledgeService.search(bucketRow.id, query, top_k);
       return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
     },
   );
   ```
4. **Snippets** for the dashboard's "Connect an agent" panel (§6.5):
   - Claude Desktop `claude_desktop_config.json` snippet pointing at
     `https://<env>/mcp` with the user's API key secret as
     `Authorization: Bearer <secret>`.
   - Cursor `mcp.json` snippet, same shape.
   - Raw `curl -H 'Mcp-Session-Id: ...' -H 'Authorization: Bearer ...'`
     for non-MCP inspectors.

**Exit criteria:**

- Paste the dashboard's Claude Desktop snippet, restart Claude Desktop,
  open a chat — the seven tools appear in the picker.
- Asking the agent "search demo-research for X" calls the search tool
  and returns chunks with citations.
- Revoking the API key in the dashboard breaks the agent's next tool
  call with a clean `401` carrying `WWW-Authenticate: Bearer`.
- `curl` against `/mcp` with a valid bearer header round-trips a
  JSON-RPC `tools/list` request.

**Do not do this yet:** OAuth, scopes, `/.well-known/*` endpoints, a
local `npx` wrapper.

---

#### 6.4.2 Phase K3b — OAuth 2.1 + PKCE + DCR + RFC 9728 (~2–3 days, target)

**Goal:** end-user one-click "Connect Kraterion" from Claude Desktop and
eligibility for the Anthropic Connector marketplace + Cursor MCP
catalog. Implements every MUST in the 2026 MCP spec's authorization
section.

**Tasks:**

1. **Decide: do we host our own OAuth Authorization Server, or front
   it with a provider?** Two options:
   - **Self-hosted AS** inside the control plane. ~2 days but no new
     dependency. Reasonable because we already have user identity
     (Account, zkLogin sub, sessions) and a sponsor flow.
     `@nestjs/passport` + `oauth2-server`-style impl, or hand-rolled
     against the OAuth 2.1 draft.
   - **Front with WorkOS AuthKit, Stytch, or Clerk** — all three ship
     MCP-aware OAuth providers in 2026. ~half a day to integrate but
     adds a vendor dependency that survives post-hackathon.

   **Default: self-hosted AS.** Vendor dependencies on the auth path
   are hard to walk back. Revisit if K3b risks slipping into K4.

2. **Authorization endpoints under `/oauth/`** (sibling to `/mcp`):
   - `GET /oauth/authorize` — consent screen. Re-uses the existing
     dashboard session-auth gate so an already-signed-in user just
     sees "Allow [Cursor] to access your Kraterion data?" with the
     project + scope list. PKCE `code_challenge` required.
   - `POST /oauth/token` — exchanges code for access token. Issues a
     short-lived JWT (15 min) signed with an EdDSA key the gateway
     can verify offline. No refresh tokens for hackathon scope
     (clients re-auth via DCR); add refresh tokens as a follow-up.
   - `POST /oauth/register` — Dynamic Client Registration (RFC 7591).
     Anonymous endpoint per the MCP spec. Returns `client_id`. **No
     `client_secret`** (MCP clients are public clients; PKCE replaces
     the secret). Persisted in a new `OAuthClient` table.
   - `POST /oauth/revoke` — RFC 7009 token revocation. Cascades from
     the same `api_access_granted` flag the bearer path honors, plus
     a per-token revocation set in Redis.
3. **Discovery endpoints:**
   - `GET /.well-known/oauth-protected-resource` (RFC 9728) — JSON
     document advertising the AS URL, scopes supported, resource
     identifier. Per the MCP spec a MUST.
   - `GET /.well-known/oauth-authorization-server` (RFC 8414) —
     authorization server metadata. Lists `/authorize`, `/token`,
     `/register`, `/revoke`, supported grant types
     (`authorization_code`), PKCE methods (`S256`), token endpoint
     auth methods (`none` — public clients).
4. **Resource Indicators (RFC 8707).** Token requests include a
   `resource` parameter identifying the MCP URL. The token's `aud`
   claim is set to that URL. The MCP `/mcp` route validates `aud ===
   our_mcp_url` on every request — a token issued for another
   resource is rejected even if otherwise valid. Mitigates token
   replay across servers; the MCP spec MUST.
5. **WWW-Authenticate on 401.** Extend the K3a stub to:
   `Bearer realm="kraterion-mcp", resource_metadata="https://<env>/.well-known/oauth-protected-resource"`.
   Clients that don't have a token will discover the AS from this
   header.
6. **Scope vocabulary** (minimal for hackathon):
   - `mcp:read` — list / search / read tools.
   - `mcp:write` — write_object.
   - `mcp:ask` — the LLM-using `ask` tool (split because some users
     may want to lock it down).
   Default consent screen requests all three. Per-tool granular
   scopes are post-hackathon polish.
7. **Schema additions** (new migration after K3a's):
   ```prisma
   model OAuthClient {
     id                  String   @id @default(uuid())
     client_id           String   @unique
     // RFC 7591 metadata
     client_name         String?
     redirect_uris       String[] // PKCE clients can have multiple
     // Lifecycle
     created_at          DateTime @default(now())
     last_used_at        DateTime?
     // DCR clients with no recent use can be garbage-collected.
     // No client_secret column — these are public clients.
   }

   model OAuthGrant {
     id                  String   @id @default(uuid())
     client_id           String   // FK to OAuthClient.client_id
     account_id          String   // the user who consented
     project_id          String   // scoped to one project at consent time
     scopes              String[] // ["mcp:read","mcp:write","mcp:ask"]
     // Authorization code, used once.
     code                String   @unique
     code_challenge      String   // PKCE S256
     resource            String   // RFC 8707 — the MCP URL
     redirect_uri        String
     created_at          DateTime @default(now())
     consumed_at         DateTime?
     expires_at          DateTime // 60s typical
   }
   ```
   No `OAuthToken` table: tokens are JWTs validated by signature, not
   by DB lookup. Revocation goes through a Redis denylist
   (`oauth:revoked:<jti>`).
8. **JWT branch of the auth guard** (the other side of §6.4.0):
   - Detects `eyJ`-prefixed tokens, validates signature against the
     control plane's EdDSA public key, validates `aud === mcp_url`,
     `exp > now`, and the Redis denylist.
   - Resolves `principal.project_id` and `principal.user_id` from the
     JWT claims; `principal.scopes` from `scope` claim.
   - Tool handlers gain a scope check at the top of their handler;
     the K3a `mcp:*` principal automatically satisfies any scope
     check (it's the "I'm an API key, I have everything this project
     can do" principal).
9. **Dashboard "Connect an agent" panel (§6.5)** gains a second tab:
   *"For end-user agents (Claude Desktop, Cursor catalog)."* Shows
   the MCP URL only; the OAuth flow handles credentials interactively.

**Exit criteria:**

- Claude Desktop's "Connect a remote MCP server" flow against
  `https://<env>/mcp` triggers the OAuth dance: client_id registered
  via DCR, redirect to our `/oauth/authorize`, consent screen renders,
  redirect back with code, code → token, tool calls succeed.
- `curl https://<env>/.well-known/oauth-protected-resource` returns
  RFC 9728 metadata.
- Token issued for `resource=https://other.example.com/mcp` is
  rejected by `/mcp` even with a valid signature.
- Revoke from `/oauth/revoke` → next tool call fails 401.
- Bearer path from K3a still works unchanged.

**Do not do this yet:** refresh tokens, fine-grained per-tool scopes,
device code flow, vendored auth provider, multi-project consent on a
single token.

**When to slip K3b to post-hackathon:** if K0 + K1 + K2 + K3a + K4
together exceed 9 days, slip K3b. The K3a bearer path alone is
sufficient for the demo and for dev adoption; K3b is the
marketplace-eligibility upgrade. The pluggable guard from §6.4.0
guarantees slipping K3b is non-destructive — nothing else changes.

---

### 6.5 Phase K4 — Dashboard tab

**Goal:** the Knowledge tab described in §2.1. Visually consistent with
the rest of the dashboard; no new design tokens.

**Tasks:**

1. **Route.** Add `apps/dashboard/src/app/(app)/buckets/[id]/knowledge/`
   alongside the existing bucket sub-routes. Tab navigation in the
   bucket header gains a fourth entry.
2. **Toggle.** Calls `POST /v1/buckets/{id}/knowledge` with `enabled:
   true|false`. On enable, the worker backfills existing objects
   (queues a job per `S3Object` row in the bucket). UI shows
   "indexing N of M" until the queue drains.
3. **Status panel.** Reads from the existing buckets endpoint extended
   with `?include=knowledge_summary` (`KnowledgeManifest` aggregate
   counts grouped by status).
4. **Live query box.** Calls `/search` (not `/ask` — keep the dashboard
   path key-free; `/ask` is for API/MCP callers who bring an LLM key).
   Renders chunks with `bucket name / s3_key` headers, content preview,
   distance score (greyed out for non-power-users), and the manifest
   Walruscan link.
5. **"Connect an agent" panel.** Copy-paste snippets from §6.4 with the
   user's API key access_key_id pre-filled. Secret shown once with the
   existing "show secret" affordance from the API keys page.
6. **Activity feed.** Reads `KnowledgeQuery` rows alongside the
   existing `UsageEvent` stream — same Activity page, two new event
   kinds rendered.

**Exit criteria:**

- Toggle turns the bucket on and off cleanly. No console errors.
- Live query returns chunks within 500 ms on the demo corpus.
- Page works on the same screen widths the existing bucket pages
  already support.
- All copy is sentence case, no emoji except the existing 🔒/🌐 badges,
  matches the design-system rules in `/design-system/README.md`.

**Do not do this yet:** charts, embeddings-cost dashboard, model
selector UI. Toggle + status + query + snippets only.

---

### 6.6 Phase K5 — On-Walrus manifest archive

**Goal:** the verifiability hook. Each indexed object's manifest is a
Walrus SharedBlob owned by the bucket's on-chain object.

**Tasks:**

1. **Manifest schema (v1)** as JSON:
   ```json
   {
     "kraterion_manifest_version": 1,
     "source_s3_object_id": "<uuid>",
     "source_walrus_blob_id": "<base64-u256>",
     "source_etag": "<hex>",
     "embedding_model": "text-embedding-3-small",
     "embedding_dimensions": 1024,
     "chunking": { "strategy": "recursive", "tokens": 400, "overlap": 60 },
     "chunks": [
       { "ordinal": 0, "content_hash": "<hex>", "tokens": 397, "start": 0, "end": 1602 },
       ...
     ],
     "created_at": "2026-05-13T10:01:23Z",
     "indexer_version": "<git-sha>"
   }
   ```
   Critically: **no plaintext, no embedding vectors**. Hashes only.
   Reproducibility comes from (a) the source blob (encrypted on Walrus,
   user-owned) plus (b) the manifest (chunk boundaries + model id) — the
   embedder is deterministic given the same model and the same input.
2. **Pipeline.** Worker, after writing chunks, builds the manifest
   bytes, calls into the same `register_blob_for_bucket` →
   `wrap_in_shared_blob` flow the gateway uses for object uploads, then
   writes `manifest_walrus_blob_id` + `manifest_shared_blob_object_id`
   into `KnowledgeManifest`. The manifest blob inherits the bucket's
   `encryption_mode`; private buckets get Seal-encrypted manifests
   (with the same gateway+indexer decryption rights — flipping
   `revoke_all_api_access` cuts manifest reads too, which is the
   demo's point).
3. **Dashboard.** Manifest deep-links rendered as Walruscan URLs.

**Exit criteria:**

- For every `indexed` manifest, `manifest_walrus_blob_id` is set.
- Walruscan resolves the link to a real SharedBlob.
- Dashboard renders the link in the chunk citation panel.

**Do not do this yet:** a `KnowledgeManifestPublished` Move event
(noted §6.7 stretch).

---

### 6.7 Stretch items (do at most one if budget remains)

- **Late chunking** (§ in research notes). Run the full document
  through the embedding model with a long-context endpoint, then
  mean-pool inside chunk boundaries. Higher recall; ~2× embedding
  cost. Worth it only if the demo corpus benefits visibly.
- **Hybrid BM25 + vector.** Add a `tsvector` column on
  `KnowledgeChunk.content`, do a Reciprocal Rank Fusion. Significant
  recall jump on code and structured text. ~half a day.
- **`KnowledgeManifestPublished` Move event.** A real on-chain event
  the indexer subscribes to (matching the shape of
  `KraterionObjectCreated`). Makes the manifest's existence a chain
  fact, not just a Postgres claim. ~1 day, requires Move + bindings
  regen + handler.
- **Vercel AI SDK adapter.** Two-file package
  `packages/agent-sdk` exposing `kraterionTools(client)` for
  `streamText({ tools })`. ~half a day.
- **OAuth 2.1 + PKCE for the HTTP MCP transport.** Required if we
  ever advertise the MCP server publicly. For hackathon, bearer
  tokens are fine.

---

## 7. Demo guidance updates

The existing §13 of the implementation plan stays valid for the
S3-only demo path. The Walrus-track-aligned demo is the one in §2.3
here. Practical notes:

- Pre-warm the index before the recording — embeddings take 4–10s
  per paper-sized PDF; the demo budget shouldn't include that wait.
- Use `paper-1.pdf` … `paper-5.pdf` named to make the citations
  readable on screen (e.g., "Crowley_walrus_epochs.pdf" so the
  Walruscan link's filename hints what the chunk is about).
- The agent in Cursor should be Claude (Sonnet 4.6 default) — the
  citation behavior with the MCP tool is the most reliable.
- Have a backup-static demo of the same flow recorded, in case
  Cursor's MCP support has a hiccup mid-record.

---

## 8. Risks and open questions

- **OpenAI dependency.** The embedding step depends on a third-party
  API. Mitigations: (a) we ship a thin `LocalEmbedder` interface
  with a stub for bge-small-en-v1.5 via `@xenova/transformers` as a
  hackathon backup; (b) the demo bucket is pre-warmed.
- **PDF extraction quality.** `pdf-parse` is fine for the demo
  corpus but fragile on complex layouts. v1 ships with the basic
  parser; a footnote in the README acknowledges the limit.
- **Halfvec recall.** Halfvec quantization at 1024 dims should give
  near-identical recall to fp32. If we see drift on the demo corpus,
  switch to `vector(1024)` — same code, more disk.
- **Worker → on-chain sub-wallet funding.** The `knowledge_indexer`
  sub-wallet needs SUI for gas (for K5's manifest writes). Same
  bootstrap shape as the gateway sub-wallet; add a top-up to
  `scripts/setup-testnet.sh`.
- **Encryption-mode flips at runtime.** If a user toggles
  `encryption_mode` on a knowledge-enabled bucket, the worker's read
  path still works (Seal `seal_approve` branches inside our Move
  module — see `move/kraterion/sources/access.move`). No special
  handling needed. The manifest blob's mode follows the bucket at
  write-time; old manifests stay in their original mode.
- **Cross-bucket queries.** Out of scope. Each agent / API key
  session is single-bucket. If a customer wants federation, that's
  a post-hackathon Move policy decision.
- **Embeddings re-indexing on model change.** If we change the
  default model after launch, all existing chunks become
  un-queryable (different embedding spaces don't mix). Mitigation:
  the model is per-bucket in `KnowledgeBucketSettings`, so an
  upgrade is opt-in. A background job to re-index on demand is
  post-hackathon.
- **OAuth in K3b vs. demo budget.** OAuth 2.1 + DCR + RFC 9728 is
  three days of focused work plus testing across Claude Desktop,
  Cursor, and one custom Anthropic-SDK harness. If K0–K2 or K4
  slip even a day, K3b should drop. The bearer path from K3a is
  sufficient for the recorded demo and for any judge who pastes a
  URL+token into their own agent — the OAuth path is purely the
  marketplace-eligibility upgrade. The §6.4.0 pluggable guard
  guarantees slipping K3b is non-destructive.
- **DCR client-id spam.** Some MCP clients (Cursor reported this
  through Q1 2026) re-run DCR on every reconnect instead of caching
  the client_id, which would flood our `OAuthClient` table. K3b's
  garbage-collection job sweeps `OAuthClient` rows whose
  `last_used_at` is older than 7 days; small, runs in the worker.
  Not a hackathon-day-1 concern at our traffic shape, but flagged
  in the runbook.

---

## 9. References

### Internal
- `/docs/implementation-plan.md` — the canonical product spec.
- `/docs/timeline.md` — calendar view, exit criteria.
- `/docs/decisions.md` — append a new entry when we choose embedder /
  chunker / vector dim defaults.
- `/docs/runbook.md` — append after each non-trivial bug.
- `apps/gateway/src/s3/object-bytes.service.ts` —
  [apps/gateway/src/s3/object-bytes.service.ts](apps/gateway/src/s3/object-bytes.service.ts)
  — the source of the K0 refactor.
- `apps/worker/src/indexer/handlers/object-created.handler.ts` —
  [apps/worker/src/indexer/handlers/object-created.handler.ts](apps/worker/src/indexer/handlers/object-created.handler.ts)
  — the only existing file edited in K1.
- `move/kraterion/sources/access.move` — Seal `seal_approve`
  semantics; nothing changes here for K0–K5.

### External
- [pgvector best practices, 2026](https://danubedata.ro/blog/pgvector-rag-managed-postgres-2026) —
  HNSW, halfvec, hybrid retrieval.
- [Embedding APIs for RAG: model comparison, 2026](https://ofox.ai/blog/embedding-api-rag-complete-guide-2026/) —
  `text-embedding-3-small` configurable dims, cost-recall tradeoffs.
- [Best chunking strategies for RAG, 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-chunking-strategies-rag) —
  recursive default; late chunking notes.
- [Model Context Protocol — TypeScript SDK docs](https://ts.sdk.modelcontextprotocol.io/) —
  v1.29.0, Streamable HTTP transport, tool registration.
- [MCP authentication guide, 2026](https://mcpplaygroundonline.com/blog/mcp-server-oauth-authentication-guide) —
  OAuth 2.1 + PKCE for public; bearer tokens for scoped/private.
- [MemWal docs](https://docs.memwal.ai/) and
  [MemWal GitHub](https://github.com/MystenLabs/MemWal) — the
  complement Kraterion positions against (not competes with).
- [Walrus testnet announcement](https://docs.wal.app/blog/04_testnet_update.html) —
  blob deletion, epoch length (1 day on testnet).

---

## 10. What to do right now

Two next steps for whoever picks this up:

1. **Confirm scope.** Read §1 and §2.3. If the agent-knowledge framing
   is right, proceed to step 2. If we want to scale back (e.g., MCP
   server without the embedding pipeline, or vice versa), update §5
   here before any code changes.
2. **Start Phase K0.** Pure refactor + infra. No product surface yet.
   Single PR. Exit criteria above.
