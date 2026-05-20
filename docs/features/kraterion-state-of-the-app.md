# Kraterion — State of the App

> **Snapshot date:** 2026-05-20 (W2 calendar, 32 days to submission gate Jun 21).
> **Running:** ~2 weeks ahead of the original phasing in `/docs/timeline.md`.
> **Source-of-truth files this synthesizes:** `/docs/implementation-plan.md`,
> `/docs/ai-features-plan.md`, `/docs/ai-platform-proposal.md`,
> `/docs/monetization-and-billing.md`, `/docs/timeline.md`,
> `/docs/decisions.md` (~70 entries), `/docs/progress.md`, the live
> `prisma/schema.prisma`, and the deployed Move package.
> **Author:** Claude (factual rollup of shipped state, not a roadmap).

---

## 1. What Kraterion is, in one paragraph

S3-compatible object storage on **Walrus** where every file is a user-owned
**SharedBlob** on **Sui**, encrypted by default with **Seal** envelope
encryption, and where the platform's read access is an on-chain delegation
the user can revoke — provably ending our ability to decrypt. Layered on
top: a one-toggle **knowledge base** per bucket (hybrid BM25 + vector
retrieval with on-chain-verifiable retrieval manifests), a first-class
**Agents** resource with an OpenAI Chat Completions-compatible endpoint
and built-in function tools, a native **MCP server** for any
MCP-compatible client, an **embeddable chat widget** for the open web,
and a **Stripe-backed pay-as-you-go billing system** with hard spend caps
and admin tooling. Three product layers (storage → knowledge → agents),
one substrate (Sui + Walrus + Seal), one revocation lever.

The hackathon thesis is the same one we started with — "we don't own your
files AND we can't read them once you revoke" — but the demo arc now
runs over an *agent + knowledge base*, not a bare bucket browser.

---

## 2. Architecture (shipped shape)

```
                          ┌────────────────────────────┐
                          │  apps/landing (Next.js 16) │  public marketing
                          │  port 3000                 │
                          └────────────────────────────┘

                          ┌────────────────────────────┐
                          │  apps/dashboard (Next.js)  │  signed-in console
                          │  port 3001                 │  zkLogin via Enoki
                          └──────────────┬─────────────┘
                                         │ REST + cookies (HttpOnly JWT)
                                         ▼
   ┌─────────────────────────────┐   ┌────────────────────────────┐
   │  apps/control-plane (Nest)  │◀──│  apps/gateway (Nest+Fastify)│
   │  port 4001                  │   │  port 4002                  │
   │  - zkLogin + JWT sessions   │   │  - SigV4 (boto3/awscli/...) │
   │  - Buckets / Objects / Keys │   │  - PutObject / GetObject /  │
   │  - Knowledge / Agents       │   │    HeadObject / DeleteObject│
   │  - MCP (bearer + OAuth 2.1) │   │  - ListObjectsV2 / ListBkts │
   │  - Billing (Stripe meter)   │   │  - Public link / presigned  │
   │  - Embed widget chat route  │   │  - Seal encrypt+decrypt path│
   └────────────────┬────────────┘   └────────────┬────────────────┘
                    │                              │
       ┌────────────┴───────┐         ┌────────────┴────────────────┐
       ▼                    ▼         ▼                             ▼
   ┌─────────┐         ┌──────────┐  ┌────────────────────────────┐
   │ Postgres│         │  Redis   │  │  Walrus testnet            │
   │ 16 +    │         │  Valkey  │  │  (publisher + aggregator)  │
   │pgvector │         │ (BullMQ, │  └────────────────────────────┘
   │+halfvec │         │entitlmnts│  ┌────────────────────────────┐
   │+tsvector│         │SessionKey│  │  Seal testnet (Mysten 2/3) │
   │+HNSW    │         │ cache)   │  └────────────────────────────┘
   └─────────┘         └──────────┘  ┌────────────────────────────┐
        ▲                            │  Sui testnet               │
        │                            │  Kraterion Move package    │
   ┌────┴─────────────────────────┐  └────────────────────────────┘
   │  apps/worker (Nest+BullMQ)   │                ▲
   │  port 4003                   │                │
   │  - gRPC checkpoint stream    ├────────────────┘
   │    (sole writer for Bucket / │
   │    S3Object)                 │
   │  - 5 active event handlers   │
   │  - Embeddings processor      │
   │  - K5 manifest archive       │
   │  - Storage pool renewal      │
   │  - 4 billing-side processors │
   └──────────────────────────────┘
```

### 2.1 Repo layout (as shipped, May 2026)

```
kraterion/
├── apps/
│   ├── landing/                # Next.js 16, marketing site
│   ├── dashboard/              # Next.js 16, signed-in console
│   ├── control-plane/          # NestJS, CRUD + AI + MCP + billing
│   ├── gateway/                # NestJS+Fastify, SigV4 + S3 surface
│   └── worker/                 # NestJS+BullMQ, indexer + renewal +
│                               # embeddings + billing rollups
├── packages/
│   ├── shared/                 # Types, Zod schemas, network constants
│   ├── walrus-client/          # @mysten/walrus wrapper
│   ├── seal-client/            # @mysten/seal wrapper
│   ├── kraterion-move-sdk/     # Auto-generated TS bindings
│   ├── object-bytes/           # Shared Seal+Walrus decrypt pipeline
│   ├── embeddings-client/      # OpenAI text-embedding-3-small wrapper
│   └── ui/                     # shadcn primitives (dashboard + landing)
├── move/
│   └── kraterion/              # Sui Move package (5 modules)
├── prisma/
│   └── schema.prisma           # Single schema, ~30 models
├── infra/
│   ├── compose/                # docker-compose (postgres+valkey+pgvector)
│   └── docker/                 # Per-service Dockerfiles
├── scripts/                    # setup-testnet.sh, fund-sub-wallets.sh,
│                               # demo-cancel.sh, demo-revoke.sh, etc.
├── design-system/              # Brand tokens + reference UI kits
└── docs/                       # implementation-plan, decisions, runbook,
                                # progress, timeline, monetization, plus
                                # this report under features/
```

---

## 3. On-chain layer (Move package)

**Package ID:** `0x73b1…fa14` (latest, post pool_vault migration).
**Modules:** 5 total. 42/42 unit tests passing.

### 3.1 Modules

| Module | Role |
|---|---|
| `kraterion::kraterion` | `KraterionBucket` resource, lifecycle entry functions |
| `kraterion::access` | Single `seal_approve` branching on bucket mode |
| `kraterion::events` | Event structs for the off-chain indexer |
| `kraterion::pool_vault` | Multi-tenant Walrus storage pool reservation |
| `kraterion::p10n` *(internal)* | Helper utilities |

### 3.2 Public surface

**Bucket lifecycle:**
- `create_and_share_bucket(name, mode, ctx)` — atomic share
- `create_grant_and_share_bucket(name, api_addr, mode, ctx)` — same + grant in one tx
- `fund_bucket(...)` — top up bucket renewal funds
- `grant_api_access(bucket, addr)` — add an API decryption principal
- `revoke_all_api_access(bucket)` — the "revoke" demo lever
- `set_bucket_visibility(bucket, mode)` — flip public↔private

**Pool vault (storage reservation):**
- `pool_vault::resize_grow(...)` — upgrade reservation immediately
- `pool_vault::resize_shrink(...)` — downgrade at period boundary
  (Move side ready; Stage 2 awaiting redeploy, gated by env flag
  `KRATERION_ENABLE_POOL_SHRINK`)
- `pool_vault::extend(...)` — renew one billing cycle

### 3.3 Events emitted (consumed by the worker indexer)

- `KraterionBucketCreated`
- `ApiAccessGranted` / `ApiAccessRevoked`
- `BucketVisibilityChanged`
- Pool-vault lifecycle events (created / grew / shrunk / extended)

> *(`KraterionObjectCreated` and `KraterionObjectExtended` were retired
> in the 2026-05-18 pool migration — objects now live inside a shared
> pool reservation, not standalone SharedBlobs per object.)*

### 3.4 Key design decisions (frozen)

- Every bucket is **always a shared object**; the only constructors
  are entry functions that share atomically. There is no path to an
  owned `KraterionBucket`.
- Encryption is **always on at the byte layer**; bucket mode controls
  the *policy*, not whether bytes are encrypted.
- Access policy is **per-bucket, not per-file** — file ownership
  follows bucket ownership.
- No `Clock` parameter anywhere — events are timestamped by the
  consuming indexer, not by Move.
- Metadata flows through **events**, not dynamic fields on `SharedBlob`,
  to keep Walrus operations cheap.
- `PlatformReserve` is spawned by `init`, not a follow-up tx.

---

## 4. S3 gateway — full hackathon-scope surface, plus extras

### 4.1 Implemented S3 operations

| Op | Status | Notes |
|---|---|---|
| `PutObject` | ✅ | ≤ 13 GiB. Seal envelope encryption by default. `x-amz-acl: public-read` flips to public. |
| `GetObject` | ✅ | Whole-object only. Range header silently ignored (501). |
| `HeadObject` | ✅ | ETag (md5), Content-Length, Last-Modified, Content-Type, `x-amz-meta-kraterion-access`. |
| `DeleteObject` | ✅ | Soft delete in DB; SharedBlob persists on-chain until funding lapses. Cascades into `KnowledgeChunk` atomically. |
| `ListObjectsV2` | ✅ | Prefix + delimiter + ContinuationToken; byte-wise UTF-8 sort (`COLLATE "C"`) matches AWS. |
| `ListBuckets` | ✅ | DB query. |
| `DeleteBucket` | ✅ | Soft delete. |
| `CreateBucket` | 501 | Buckets are created in the dashboard, not via S3. |

**Conformance:** 36/36 boto3 test cases green; aws-cli + rclone smoke-tested.
**Extras shipped beyond plan §2.2:** public-link route (`/public/{bucket}/{key}`),
presigned PUT/GET URLs, Enoki-sponsored writes for the dashboard.

### 4.2 Auth surface

- **SigV4 (AWS-style)** — verifier ported from MinIO's Go impl, used by
  boto3/aws-cli/rclone.
- **Bearer API tokens** — unified `kr_live_<env>_<...>` / `kr_test_<...>`
  format (replaced the original `<AKIA>:<secret>` colon-format in the
  2026-05-13 MCP-unification decision). Used by REST, MCP, and the
  Knowledge endpoints.
- **Session JWT (HS256)** — HttpOnly cookie via Enoki zkLogin for the
  dashboard.
- **OAuth 2.1 + PKCE + DCR + RFC 9728** — for end-user MCP one-click
  consent.

All four flows resolve to the same `Principal` union the controllers
consume.

---

## 5. Knowledge layer (K0–K5, fully shipped)

One toggle on a bucket turns it into a queryable knowledge base.

### 5.1 Pipeline

1. **PUT** an object via the existing S3 surface.
2. The **worker's indexer** sees the `KraterionObjectCreated` event,
   upserts `S3Object`, then enqueues a BullMQ embedding job if the bucket
   has a `KnowledgeBucketSettings` row.
3. The **embeddings processor** fetches plaintext via `packages/object-bytes`
   (Seal+Walrus decrypt), dispatches by MIME (`text`, `markdown`, `json`,
   `code`, `pdf` via `pdf-parse`; everything else is silently `skipped`),
   chunks recursively at 400 tokens / 60 overlap, embeds via
   `text-embedding-3-small` @ 1024d (Matryoshka), writes
   `KnowledgeChunk` rows.
4. The **K5 manifest archive** uploads a `manifest.json` (model id,
   chunking params, chunk hashes, dimensions, source blob id) as a
   Walrus SharedBlob owned by the same bucket. Manifest blob id +
   shared-blob object id land on the `KnowledgeManifest` row.

### 5.2 Storage

- Live index: pgvector `halfvec(1024)` with HNSW (`m=16,
  ef_construction=200`).
- Hybrid retrieval: `tsvector` GIN index on `content` + halfvec HNSW +
  reciprocal rank fusion in `KnowledgeService.search()`.
- Per-query `SET LOCAL hnsw.ef_search` (64 for `/search`, 96 for agents).
- Recall@10 measured at ~91% vs ~78% vector-only.

### 5.3 Retrieval API (control-plane)

- `POST /v1/buckets/:id/knowledge` — enable / disable / re-index
- `POST /v1/buckets/:id/search` — hybrid retrieval, citations included
- `POST /v1/buckets/:id/reindex` — destructive re-embed pass
  (transactional swap deferred — see §10)
- Backfill endpoint for existing objects on enable

> Note: `/ask` was removed on 2026-05-13 (decisions §"P3 ships"). Its
> shape is subsumed by per-agent OpenAI Chat Completions endpoints.

### 5.4 Verifiable retrieval — the "Verify" button

Every chunk returned by `/search` includes a `manifest_walrus_blob_id` +
chunk hash. The dashboard's **Verify** button (in `VerifyChunk.tsx`):

1. Fetches the manifest blob from Walrus by id.
2. Verifies it's owned by the expected `KraterionBucket` on-chain.
3. Recomputes the hash of the returned chunk plaintext.
4. Checks it's present in the manifest's chunk-hash list.

The Verify button is currently **unique to Kraterion** in the RAG product
space. It's the centerpiece of the Walrus-track demo.

### 5.5 What's *not* in the live retrieval flow (deliberate cuts)

- **Reranker (P2)** — research preserved in `docs/p2-reranker-research.md`;
  Cohere Rerank 3.5 is the chosen path post-hackathon.
- **1536d and 3072d embedding options** — UI shows "Coming soon"; only
  1024d is selectable. Schema cost of multi-dim too high pre-demo.
- **Late chunking** — researched, deferred.
- **Cross-bucket federation** — single-bucket queries only (matches the
  scoped revoke lever).

---

## 6. Agents (P3, P4 — fully shipped)

### 6.1 KraterionAgent resource

A first-class domain object:

```
KraterionAgent {
  id, project_id, name, description,
  system_prompt,                   // versioned
  model,                           // gpt-4o-mini default
  temperature, max_tokens,
  bucket_ids[],                    // attached knowledge bases
  top_k,
  tools[],                         // see §6.3
  guardrails_id?,                  // stubbed; P5 deferred
  sub_wallet_address,              // Ed25519, KMS-wrapped seed
  spend_caps,                      // per-day USD ceilings
  ...
}
```

### 6.2 OpenAI Chat Completions endpoint

`POST /v1/agents/:id/chat/completions` — full OpenAI Chat Completions
wire format, including:
- SSE streaming
- Tool calling
- Multi-turn message arrays
- Bearer + OAuth + dashboard-session principal types (the
  `ShareTokenPrincipal` path is restricted to this endpoint only)

Any OpenAI client SDK speaks to a Kraterion agent unchanged — point the
`baseURL` at `https://<env>/v1/agents/:id/`, drop in the Kraterion bearer
token, swap the model id for the agent id, done.

### 6.3 Built-in tools (six, all live)

| Tool | Action | On-chain audit |
|---|---|---|
| `kraterion_search` | Hybrid retrieval over a bucket | `AgentToolCall` row |
| `kraterion_list_buckets` | List buckets in project | `AgentToolCall` row |
| `kraterion_list_objects` | List objects under a prefix | `AgentToolCall` row |
| `kraterion_read_object` | Fetch and decrypt an object | `AgentToolCall` row |
| `kraterion_write_object` | PUT an object | `AgentToolCall` row + `tx_digest` |
| `kraterion_get_manifest` | Fetch K5 manifest blob | `AgentToolCall` row |

Every tool call writes an `AgentToolCall` row keyed by agent id + bucket
id + session, surfaced in the dashboard's Activity feed. Write operations
also capture `tx_digest`, surfaced as Suiscan deep-links.

The agent-create dialog has a 4-step Tools picker for selecting which
tools each agent has access to. The schema includes a `tool_kind` column
that scaffolds HTTP webhook tools as a future add — webhook tools
themselves are deferred.

### 6.4 On-chain agent identity (P3's signature mechanic)

- Every agent has its own **Sui sub-wallet** (Ed25519, KMS-wrapped seed).
- The dashboard's Connect tab fires sponsored `grant_api_access(bucket,
  agent_addr)` Move calls per attached bucket.
- Per-address revoke is emulated server-side via `revoke_all +
  grant(survivors)` reading the current `api_decryption_addresses` list
  off chain — guarantees no surviving principal is dropped.
- Live grant status is read from Sui RPC into the dashboard.

This is a **cleaner revocation** than the bucket-wide
`api_access_granted` flag the original implementation plan called for.

---

## 7. MCP server (K3a + K3b — fully shipped)

Streamable-HTTP transport at `POST /mcp` on the control plane. The
November 2025 MCP spec is fully implemented.

### 7.1 Auth — dual model

- **Bearer (K3a)** — paste a Kraterion API key secret as
  `Authorization: Bearer <secret>`. The default for devs.
- **OAuth 2.1 + PKCE + DCR + RFC 9728 + RFC 8707 Resource Indicators
  (K3b)** — for end-user one-click flows (Claude Desktop "Connect
  Kraterion," Cursor catalog, Anthropic Connector marketplace
  eligibility).

Both paths resolve through one pluggable `McpAuthGuard` and emit the
same `McpPrincipal` to the tool handlers — tool code never branches on
the scheme.

### 7.2 Endpoints implemented (OAuth side)

- `GET /.well-known/oauth-protected-resource` — RFC 9728 metadata
- `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata
- `GET /oauth/authorize` — consent screen (reuses dashboard session)
- `POST /oauth/token` — code-for-token exchange, HS256 JWT, 15-min TTL,
  in-memory authorize stash (see decisions §2026-05-12 "K3b: HS256")
- `POST /oauth/register` — RFC 7591 dynamic client registration
- `POST /oauth/revoke` — RFC 7009 token revocation

Schema: `OAuthClient` + `OAuthGrant` tables. No `OAuthToken` table —
tokens are JWTs validated by signature; revocation via Redis denylist.

### 7.3 Tools exposed

Same six built-in tools as the agent surface (§6.3) plus
`kraterion_invoke_agent` for invoking a configured agent through MCP.

### 7.4 Dashboard surface

A "Connect an agent" panel on each Knowledge tab shows copy-paste configs
for:
- Claude Desktop (`claude_desktop_config.json`)
- Cursor (`mcp.json`)
- Raw `curl` for inspectors

Pre-filled with the user's API key + project context.

---

## 8. Embeddable widget (P6 — shipped 2026-05-15)

A `<script>` snippet a website owner pastes to mount a chat panel against
a specific Kraterion agent.

### 8.1 Shape

- Loader at `/embed/v1.js` (~6 KB) — vanilla JS, no framework deps.
- Mounts a Shadow-DOM launcher button; first click lazy-loads an iframe
  pointing at `/embed/chat/[agentId]?t=<share-token>` on the dashboard.
- Iframe hosts the chat UI in full isolation from the host page (no CSS
  leakage either direction).

### 8.2 Share token model

- Format: `kr_share_<env>_<36 chars>` (mirrors the bearer token format).
- Hash-stored, one-time reveal on creation.
- Each token row carries: `agent_id`, `origin_allowlist`,
  `max_requests_per_day`, `max_spend_usd_per_day`,
  `created_at`, `revoked_at`.
- Daily counters in `ShareTokenUsageDay` (rolled at UTC midnight).
- Egress measured as `completion_tokens × 4` (a deliberate proxy — see
  decisions §2026-05-19 "Share-token egress measured as completion_tokens").

### 8.3 Anonymous-traffic protections (in the chat handler)

- Origin allowlist (`Origin` header compared against the token's
  configured domains).
- Daily request cap (counter in Postgres; Redis migration deferred).
- Daily USD spend cap.
- `Principal` union extended with `ShareTokenPrincipal`; non-chat
  endpoints reject it via `requireAccountPrincipal`.

### 8.4 Dashboard surface

A "Share" tab on the agent detail page lets the operator mint, list, and
revoke share tokens. Mint dialog reveals the cleartext token *once* with
the one-line install snippet pre-filled.

### 8.5 Deferred from P6

- Published `packages/ui-embed` npm artifact (lives in-repo for now)
- Theming customization beyond brand tokens
- Pre-filled end-user identity (for known-visitor flows)
- Dynamic iframe sizing
- Per-visitor analytics
- Redis migration for daily counters (Postgres is fine at current volume)

---

## 9. Billing (B0–B5 — shipped through W2, 2026-05-19)

Stripe-backed pay-as-you-go billing system, sandbox mode. Live-mode
promotion is a single env-var flip deferred until post-submission.

### 9.1 Pricing shape (catalog-as-code)

| Stream | Stripe shape | Notes |
|---|---|---|
| Storage | Monthly licensed reservation | Tied to Walrus pool capacity; resize_grow immediate, resize_shrink at period boundary |
| Storage writes | Metered (per GB) | Hourly rollup |
| Storage reads | Metered (per GB) | Hourly rollup |
| Knowledge byte-seconds | Metered | Per-bucket index footprint × time |
| Knowledge queries | Metered (per request) | Search + agent chat both bill here |
| Agent BYOK proxy | Metered (per dollar passed through) | When the user's OpenAI key drives an agent call |
| Share-token egress | Metered | `completion_tokens × 4` proxy |

Catalog synced via `pnpm stripe:sync` — drift on Product / Price /
Meter labels updates Stripe; the script refuses to drift the
*shape* (id-keyed creates, never deletes).

### 9.2 Tables added

- `BillingAccount` — per-project Stripe customer + subscription state
- `MeterEvent` — outbound queue to Stripe's `/v1/billing/meter_events`
- `UsageDaily` — denormalized per-day aggregate for the dashboard chart
- `BYOKDailySpend` — daily dollar count of user-keyed agent calls
- `PendingStorageDowngrade` — scheduled resize_shrink at period
  boundary
- `StripeWebhookEvent` — idempotency log for incoming webhooks
- `CostFloorSnapshot` — daily SUI + WAL price snapshot vs configured
  per-meter floor
- `BillingAlert` — soft-alert thresholds (50 / 80 / 100% of cap)
- `ShareTokenUsageDay` — daily share-token counters (added in B1
  closeout)

### 9.3 Processors (running in `apps/worker` and `apps/control-plane`)

| Cadence | Processor | Job |
|---|---|---|
| 60 s | `kraterion-meter-emit` | Drains `MeterEvent` rows to Stripe |
| 10 min | `share-token-egress-rollup` | Tally share-token completion-token egress, emit MeterEvents |
| Hourly | `meter-rollup` | Gateway requests + knowledge byte-seconds + storage snapshot for display |
| Hourly | `usage-event-ttl` | DELETE `UsageEvent` rows > 35 days (Postgres-native partitioning deferred) |
| Daily | `cost-floor` | CoinGecko SUI + WAL price fetch, write `CostFloorSnapshot`, warn at <25% headroom |
| Daily | `reconciliation` | Sum local sent MeterEvents vs Stripe meter event summaries, warn at 0.1% / error at 1% drift |
| Daily | `pool-renewal` | `pool_vault::extend` for pools within ~10 days of `end_epoch` (skips inactive Stripe subs) |
| Daily | `webhook-event-ttl` | DELETE processed `StripeWebhookEvent` rows > 90 days |
| 5 min | `soft-alert` | Cross-check accrued vs thresholds, insert `BillingAlert` rows on first crossing |
| 30 s | `alert-delivery` | Drain `delivered_at IS NULL` rows (today: `log` channel only) |

### 9.4 Dashboard surface

`/billing` rewritten in Vercel/Supabase shape (single column of stacked
cards):

- `CurrentPeriodCard` — period range, accrued, projected, days left
- `PaymentMethodCard` — inline Stripe Elements (no redirect to hosted
  Checkout — that fallback was removed in B2)
- `StorageCard` + `ResizeStorageModal` — pool resize flow
- `SpendCapCard` — hard cap + multi-select thresholds (50/80/100%)
- `InvoicesCard` — last 12 invoices, deep-link to Stripe portal for
  PDFs / full history / tax info
- `BillingDetailsCard` — email / tax id / country
- `DangerZoneCard` — cancel subscription
- `BillingBanner` — global priority-ordered banner across `(app)`
  layout

`/usage` has a stacked daily bar chart (hand-rolled SVG, no chart deps)
with per-day per-meter `{value, cost_usd_cents}`. Period selector
(current / previous / last-7-days), click-a-bar-to-filter, per-meter
sparkline trends.

### 9.5 B6–B8 — what's still pending

| Phase | Status | Scope |
|---|---|---|
| **B6** | Pending | Gateway + agent controller enforcement (507 / 429 / 402 with `X-Kraterion-Reason` headers) of spend cap + free-band + pool capacity. Scaffolds in place; live entitlements Redis cache to wire. |
| **B7** | Pending | Admin pages (`/admin/billing` list + detail, `/admin/cost-floor` graph, sandbox-reset button). |
| **B8** | Pending | Onboarding flow + `RequiresPaymentMethodGuard` on bucket-create / agent-create / knowledge-enable + server-side remove-payment-method guard while unbilled usage exists. |

### 9.6 Walrus storage pool migration (2026-05-18)

Storage moved from a per-object SharedBlob model to a **multi-tenant
shared pool reservation** under `kraterion::pool_vault`. Lifetime now
tracks the billing cycle (~30 days + 5-day buffer) rather than the
original 2-year horizon — pre-paid WAL waste on a downsize drops from
months to "at most one cycle's residual." Driven by the discovery that
Walrus's `decrease_storage_pool_unused_capacity_by_percent` returns a
`Storage` reservation receipt rather than WAL, making the original plan
leaky on every downsize.

The retired-object events (`KraterionObjectCreated`,
`KraterionObjectExtended`) were dropped from the Move package and the
TS bindings on 2026-05-19.

---

## 10. Dashboard — full console surface

Built with Next.js 16 App Router + Tailwind + shadcn/ui. Sentence case,
no shadows / gradients, no font-weight ≥ 600, Krater (`#bf4a26`) accent
on stone-300 borders — per `/design-system/README.md`.

### 10.1 Routes shipped

- `/` — landing (separate Vercel project on port 3000)
- `/dashboard` — overview
- `/buckets` — bucket list with per-bucket badges (🔒 / 🌐 / 🧠)
- `/buckets/[id]` — object browser with inspector drawer
- `/buckets/[id]/knowledge` — Knowledge tab (enable modal with model
  pickers + cost estimate, status panel, live search box, "change
  embedding model" / "change chat model" actions, re-index flow)
- `/agents` — list + detail (Configure / Connect / Share / Activity tabs)
- `/keys` — tabbed: S3 access keys + AI provider credentials
- `/billing` — see §9.4
- `/usage` — stacked bar chart + per-meter sparkline table
- `/activity` — unified feed: file events + knowledge events + agent
  tool calls
- `/settings` — account cancellation (`Account.status = 'cancelled'` —
  the demo "cancel subscription" lever) + project basics
- `/admin/*` — B7 pending

### 10.2 Auth and signing flows

- **Sign-in:** "Continue with Google" via **Enoki zkLogin**, backend-
  mediated, per-request scoped. No seed phrases, no wallet UI by
  default.
- **Identity:** every user is a Sui address (zklogin sub'd). Account
  upsert keyed by `zklogin_sub`.
- **Writes:** all on-chain writes are sponsored via Enoki — users
  never hold SUI. Backend builds unsigned PTBs (`tx.toJSON()`); the
  dashboard wallet signs and submits via the kind-bytes wire format
  with a per-request Move-call allow-list.
- **In-browser Seal decrypt** for the file preview path (uses the
  user's zkLogin signature) — this is the read path that *keeps
  working* in the demo's revoke-API moment.

---

## 11. AI provider credentials (P0 — shipped)

Project-scoped `ProviderCredential` table replaces the original per-
request BYO-key model.

- KMS-wrapped at rest (same wrapper as Seal session keys).
- Plaintext held in memory only inside
  `ProviderCredentialService.useDecrypted(project_id, provider, fn)`,
  zeroed after the closure returns.
- Dashboard displays `sk-...{last_4}` with Replace / Remove actions.
- Validation pings `/v1/models` on Save; bad keys return 400 inline.
- Remove flow is type-to-confirm (decisions §2026-05-13).

**Provider support today:** OpenAI only.
**Schema:** `@@unique([project_id, provider])` — additive for Anthropic
/ Cohere / Llama in P1 without migration.

---

## 12. Key decisions made along the way

Selected highlights from the ~70 entries in `/docs/decisions.md`:

### 12.1 Crypto / on-chain
- Buckets are *always* shared objects — no path to owned (2026-05-08).
- Encryption is always on at the byte layer; mode controls policy
  (2026-05-08).
- Per-bucket, not per-file, access policy (2026-05-08).
- No `Clock` parameter anywhere; events have no `timestamp_ms`
  (2026-05-08).
- `PlatformReserve` spawned by `init`, not a follow-up tx
  (2026-05-08).
- Decentralized Seal Committee on testnet (single trust unit,
  threshold 1) (2026-05-08).

### 12.2 Infra and SDK
- Single Prisma schema at repo root, generated client at workspace
  root (2026-05-08).
- TS bindings via `@mysten/codegen`, committed to git so consumers
  don't need the Sui CLI (2026-05-08).
- `Published.toml` + `Move.lock` are the on-chain truth;
  `constants.ts` mirrors at runtime (2026-05-08).
- Bindings auto-regenerate via Turbo on Move source change; deploy
  script enforces sync (2026-05-08).
- Architecture-D: Walrus + Seal wrappers in `packages/`, not in the
  gateway (2026-05-08).
- Gateway is ESM; workspace packages export from `dist/` (2026-05-08).

### 12.3 Gateway / S3
- `CreateBucket` returns 501; bucket creation lives in the dashboard
  (2026-05-08).
- Silent-ignore Range and conditionals; canonical success headers
  (2026-05-08).
- `removeAllContentTypeParsers` + single catch-all buffer parser
  (2026-05-08).
- Drop `S3Object.encryption_envelope`; Seal embeds it in ciphertext
  (2026-05-08).
- Orphan blobs: log on failure; reaper deferred post-hackathon
  (2026-05-08).

### 12.4 AI surface
- Layer an AI/agent surface on S3 (knowledge buckets + MCP)
  (2026-05-12).
- Hybrid BM25 + vector + RRF as the K2 retrieval default
  (2026-05-12).
- MCP server auth: dual model (bearer + OAuth 2.1), shipped in two
  phases (2026-05-12).
- Project-scoped OpenAI credentials replace the global env var
  (2026-05-13 — P0).
- Embedding picker only exposes 1024d; re-index is destructive (P0
  cuts) (2026-05-13).
- P3 ships: Agents resource + OpenAI Chat Completions endpoint;
  `/ask` removed (2026-05-13).
- Agent sub-wallet goes fully on-chain: sponsored grant + per-address
  revoke emulation (2026-05-13).
- Unified bearer API tokens (`kr_live_…` / `kr_test_…`); drop the MCP
  `<AKIA>:<secret>` colon-format (2026-05-13).
- P4 ships: built-in agent tools + per-call audit with on-chain
  receipt (2026-05-13).
- P6 ships: embeddable chat widget (script-tag + Shadow DOM + iframe)
  (2026-05-15).

### 12.5 Billing
- Storage billed as monthly reservation, not metered usage
  (2026-05-19).
- Inline Stripe Elements, not hosted Checkout (2026-05-19).
- `setup_intent.succeeded` + `checkout.session.completed` share one
  handler (2026-05-19).
- Single billing banner with priority logic, not a stack (2026-05-19).
- Share-token egress measured as `completion_tokens × 4`, not HTTP
  byte count (2026-05-19).
- `UsageEvent` retention via DELETE cron, not native partitioning
  (2026-05-19).
- Per-day chart axis is dollars, not raw units (2026-05-19).
- Pool lifetime tracks billing cycle (~1 month), not horizon-based
  (2026-05-19).

---

## 13. What's *not* in the product (deliberate cuts)

For the Jun 21 submission, these are explicitly out:

| Feature | Reason for cut |
|---|---|
| **P1 — Multi-provider abstraction** (Anthropic, Llama, Cohere) | OpenAI-only at submission. P0's schema is provider-tagged for additive landing later. |
| **P2 — Reranker** | Research preserved (`docs/p2-reranker-research.md`); Cohere Rerank 3.5 the chosen post-hackathon path. Cut because it adds a second credential surface and the demo's wow is the Verify trail + Agents, not retrieval precision tweaks. |
| **P5 — Guardrails** (PII / jailbreak / moderation) | Production-shipping concern, not judging concern. P3 stubs `guardrails_id?` so P5 plugs in cleanly later. |
| **1536d / 3072d embedding options** | `KnowledgeChunk.embedding` is `halfvec(1024)`; multi-dim requires schema migration. UI shows "Coming soon." |
| **Transactional re-index swap** | Today's re-index is destructive (chunks dropped, search returns empty until worker drains). Transactional swap is ~1.5 days of schema + query work for prod-traffic-only property. |
| **"Test connection" button** in Add-OpenAI-key modal | Save-time validation hits `/v1/models` already — same outcome, one fewer click. |
| **Live-mode Stripe** | Single env-var flip; deferred until post-submission. |
| **Email / Slack alert delivery** | Channels stubbed; only `log` channel wired. Awaits a provider decision. |
| **Gated mode** (custom Move policies for access) | Original Tier-3 from the implementation plan. Architecture supports it; UI doesn't ship. |
| **Multipart upload, versioning, ACLs (beyond `public-read`), CORS, lifecycle, `CopyObject`** | Plan §2.2 — all out. boto3/aws-cli/rclone happy paths work without them. |
| **Webhook tools for agents** | Schema scaffolds `tool_kind`; built-in tools only at submission. |
| **Cross-bucket federation** | Single-bucket queries match the scoped revoke lever. |
| **Self-custody mode (Tier 3 from plan)** | Only Sovereign + Seal model ships. |
| **Multi-region, HA, caching layer, range optimization** | Hackathon scope. |

---

## 14. Test posture as of 2026-05-19

- **Move tests:** 42/42 passing
- **Move SDK vitest:** 5 unit pass / 2 live-only skipped
- **Gateway boto3 suite:** 36/36 cases passing
- **Control-plane vitest:** 33/33 passing
- **Workspace typecheck:** all `tsc --noEmit` clean (19/19 Turbo tasks
  green)
- **Prisma:** schema matches database (only the documented pgvector
  raw-SQL drift remains)

---

## 15. The 90-second demo arc as it stands today

> *(working version, anchored to what's actually shipped)*

1. **(0:00–0:15)** Dashboard open. Empty knowledge bucket
   `demo-research`. Knowledge toggle flipped on. OpenAI key already
   added at the project level.
2. **(0:15–0:30)** Terminal: `aws s3 cp paper-{1..5}.pdf
   s3://demo-research`. The Knowledge tab shows objects flipping from
   "queued" → "indexed" within seconds. Activity feed scrolls.
3. **(0:30–0:55)** Open the Kraterion **agent** detail page. The
   agent has `demo-research` attached, `kraterion_search` enabled,
   GPT-4o model. Chat: *"What do these papers say about Walrus epoch
   lengths?"* Streaming answer with citations. Click **Verify** on
   a citation → on-chain manifest match in real time.
4. **(0:55–1:10)** Plot twist 1: **Cancel subscription.**
   `Account.status = 'cancelled'`. Gateway rejects new boto3 calls.
   But the SharedBlobs are still on chain — `walrus blob` shows them,
   funded for their remaining epochs. *"The platform leaving doesn't
   take your data."*
5. **(1:10–1:30)** Plot twist 2: **Revoke API access.**
   `revoke_all_api_access(bucket)` Move call. The agent's *next*
   chat tool call fails with `KeyAccessRevoked`. Dashboard
   in-browser file preview *still works* (user's zkLogin signature
   decrypts client-side). *"Kraterion literally cannot decrypt these
   anymore — enforced by Seal's threshold key servers, not by our
   policy."*

The MCP demo (Claude Desktop / Cursor) is a parallel arc available for
judges who ask "how does this work with my agent?"

---

## 16. What changed materially since the original implementation plan

For anyone reading `/docs/implementation-plan.md` and trying to square
it with reality:

- **AI features layered on top** — entire K0–K5 + P0 + P3 + P4 + P6
  workstream is post-plan, captured in `/docs/ai-features-plan.md` and
  `/docs/ai-platform-proposal.md`.
- **`/ask` removed** — subsumed by per-agent OpenAI Chat Completions.
- **Walrus storage pool migration** — objects moved from per-blob
  SharedBlobs to a multi-tenant pool reservation on 2026-05-18.
  Retired the per-object Move events.
- **Bearer token format** — unified `kr_{live,test}_<env>_<...>`
  format; the original `<AKIA>:<secret>` SigV4-shaped MCP token is
  gone.
- **Stripe billing wired** — the original plan said "fake credits UI
  is fine"; the real Stripe pay-as-you-go system shipped through B5,
  weeks ahead of plan.
- **Agent sub-wallets** — every agent has its own on-chain identity,
  not implicit in the original §4 Move surface.
- **Pool lifetime tracks billing cycle** — 2026-05-19 fix to a leaky
  WAL-pre-pay model from the original 2-year horizon plan.
- **OAuth 2.1 + DCR shipped (K3b)** — was a "if K0–K2 + K4 don't
  slip" stretch in the AI plan; it didn't, so it shipped.

---

## 17. Where to look next

- **Tactical state:** `/docs/timeline.md` Status block (updated
  weekly).
- **What just shipped (chronological):** `/docs/progress.md`.
- **Why a thing is the way it is:** `/docs/decisions.md` (~70
  entries, indexed by date).
- **Bugs and gotchas indexed by symptom:** `/docs/runbook.md`.
- **Strategic-feature gap analysis vs Chatbase:**
  `/docs/features/chatbase-comparison-report.md`.
- **The full spec (still authoritative where not superseded):**
  `/docs/implementation-plan.md`, `/docs/ai-features-plan.md`,
  `/docs/ai-platform-proposal.md`, `/docs/monetization-and-billing.md`.

---

## 18. Closing observation

The project hit its "what we're optimizing for" criteria from
`/docs/implementation-plan.md` §1 ahead of schedule. The two plot
twists (cancellation persistence, on-chain revocation) work
end-to-end. The S3 SDK compatibility is past the credibility floor
(36/36 boto3 cases). The AI surface that the Walrus track brief asked
for is shipped and demoable. The substrate (Sui + Walrus + Seal +
zkLogin + Enoki sponsored writes) is wired into every product surface
— there are no "promises" left where mechanics could go instead.

What remains between today and Jun 21 is closing the billing
enforcement loop (B6–B8), polishing the admin pages, and producing
the demo video + submission write-up. The risk profile is low; the
buffer in the calendar (W6/W7) is intact.
