# Kraterion — Monetization & Billing System

**Status:** Draft v1 — design doc, not yet implemented
**Author:** generated 2026-05-15
**Scope:** Pricing model, usage metering, Stripe integration, entitlements, user-facing surfaces
**Owners:** TBD — billing is post-hackathon work; this doc is the spec for it

---

## 0. TL;DR

Kraterion sells three things layered on top of user-owned Walrus storage:

1. **Storage & gateway access** (the S3 surface) — metered like any object-storage SaaS.
2. **Knowledge bases** (indexing + retrieval over the user's stored docs) — metered on index size and queries.
3. **Agents** (chat + tools + share-token widgets) — metered on messages.

Because every user already brings their own OpenAI key (`ProviderCredential`, KMS-wrapped per-project), **we do not bill the LLM passthrough**. OpenAI bills the user directly. We **track** every token they spend through us so they get one unified dashboard, but we don't take a markup on tokens. Our revenue is a **flat seat fee + metered platform consumption** (storage, requests, vector-index GB-day, agent messages).

The billing stack is **Stripe Billing + Checkout + Customer Portal + Stripe Tax + Stripe Meters** (the post-2024 meter-events API, not the deprecated `usage_records` endpoint). A single subscription per project carries one licensed seat item and four–five metered items. Source of truth is **double-written**: Postgres for the product (real-time, history, alerts), Stripe Meters for billing.

Four plans: **Free** (10 GB / 100 messages / 1 agent), **Pro** ($20/seat/mo, 250 GB included), **Team** ($75/seat/mo, 2 TB included, SSO, audit logs), **Enterprise** (sales-led, custom). Walrus on-chain costs are paid by the user's `PlatformReserve` for Free/Pro and bundled into Team+; we never pass raw WAL volatility to a customer.

---

## 1. Product context

Kraterion is an S3-compatible storage SaaS where every file is a Walrus `SharedBlob` owned on-chain, Seal-encrypted by default, with platform decryption access delegated through a revocable on-chain Move policy. On top of that primitive sits a knowledge layer (chunked + embedded into pgvector, BM25 + dense hybrid retrieval) and an agent layer (RAG agents with OpenAI-compatible chat completions, share tokens for embedding into third-party sites). See [`/docs/implementation-plan.md`](implementation-plan.md), [`/docs/one-pager.md`](one-pager.md), [`/docs/ai-platform-proposal.md`](ai-platform-proposal.md), [`/docs/ai-features-plan.md`](ai-features-plan.md).

### 1.1 The principal — what we bill

The hierarchy today is:

```
Account  →  Project  →  Bucket  →  Object
                     →  Agent   →  ShareToken
                     →  ApiKey, ProviderCredential, SubWallet
```

A `Project` owns API keys, OpenAI provider credentials, agents, buckets. **The billing principal is the Project**, not the Account. Rationale:

- Per-project provider credentials already exist — token usage is naturally project-scoped.
- A founder may have separate prod / staging / personal projects with very different consumption shapes.
- Multi-account-per-project (teams) is the natural growth path — a project plan can have N seats.
- All existing usage tables (`UsageEvent`, `AgentInvocation`, `KnowledgeManifest.embedding_tokens`, `KnowledgeQuery`, `ShareTokenUsageDay`) already reference project-scoped entities.

A `BillingAccount` (new table, see §6.1) is attached **one-to-one with `Project`** and holds the Stripe customer reference. Accounts that own multiple projects pay one card per project — same as Vercel teams, Cloudflare accounts.

### 1.2 Billable surfaces inventory

Every revenue and cost surface in the platform. Each is mapped later to a meter or a flat fee.

| Surface | What it is | Cost driver | Who pays today |
|---|---|---|---|
| **Walrus storage** | `S3Object.size_bytes` × epochs | WAL per MiB per epoch + write fee | Platform's `PlatformReserve` (free → loss) |
| **Walrus renewal** | Worker extends epochs near expiry | SUI gas + WAL top-up | Platform sub-wallets |
| **Gateway PUT** | S3 write requests | Compute, indexer write, Walrus write fee | Platform |
| **Gateway GET** | S3 read requests | Compute, Seal session decrypt, Walrus read | Platform |
| **Gateway HEAD/LIST/DELETE** | Metadata + listing | DB compute | Platform |
| **Knowledge indexing** | Embed user docs into pgvector chunks | OpenAI embedding tokens + DB storage | User's OpenAI key (we pay DB) |
| **Knowledge retrieval** | Hybrid (BM25 + halfvec) search | DB compute + reranker (P2) | Platform |
| **Index storage** | `KnowledgeChunk` rows + vectors | Postgres disk | Platform |
| **Agent chat** | `/v1/agents/:id/chat/completions` | OpenAI chat tokens + tools | User's OpenAI key (we pay tools) |
| **Agent tool calls** | Builtin tools (search/read/write) | Compute, indexer reads | Platform |
| **Share-token widget hits** | Public widget conversations | Same as agent chat, anonymous | User's OpenAI key |
| **MCP server (K3b)** | Streamable HTTP MCP traffic | Compute, OAuth | Platform |
| **Sui transactions** | User-initiated PTBs | SUI gas | Enoki sponsorship today; user later |
| **Seal key servers** | Decryption session lookups | Mysten testnet free now; mainnet TBD | Platform |

Two categories of cost: **platform-borne** (storage, DB, compute, key servers, gas) — these we mark up and bill. **User-borne** (OpenAI tokens via BYOK) — these we just track, never bill. The dashboard shows both lines so the user sees a single number for "what Kraterion cost me this month."

---

## 2. Monetization plan

### 2.1 Pricing philosophy

Three guiding constraints:

1. **No surprise bills.** Vercel-class spend caps from day one. Soft alerts at 50/80/100% and a hard cap that the user sets per project. Storage that's already on-chain doesn't get evicted on cap breach, but uploads stop and indexing pauses.
2. **Transparent meters.** Dollar-denominated dashboards, not credits. Show projected end-of-period invoice (industry-standard UX feature; OpenAI / Modal / Vercel all do this).
3. **BYOK for LLMs, fixed for platform.** Token markup is a race to the bottom; platform value (decentralized ownership, S3 compat, hybrid retrieval, on-chain audit) is differentiated. Don't dilute the pitch by competing with Chatbase on $/message.

### 2.2 Plans

Four tiers — three self-serve via Stripe Checkout, one sales-led via Stripe Invoicing.

#### Free — "Try the whole product"

- **Price:** $0
- **Seats:** 1
- **Storage:** 10 GB included, no overage (uploads blocked at cap)
- **Gateway requests:** 100k Class A (PUT/LIST) + 1M Class B (GET/HEAD) per month
- **Egress:** 50 GB/mo (Walrus quilts + gateway combined)
- **Agents:** 1 active agent, 100 messages/mo via Kraterion-managed key, unlimited with BYOK
- **Knowledge:** 5 GB indexed (chunk storage); BYOK embedding tokens
- **Share tokens:** 1, public web widget only
- **MCP:** enabled, 1k tool-calls/mo
- **Walrus epochs:** Platform-funded for the lifetime of the free account (we eat the WAL cost as a CAC; capped at 10 GB this is bounded)
- **Support:** community Discord, docs

The free tier is sized to **demo the full product end-to-end** (upload docs, build an agent, embed it). Matches Cloudflare R2's 10 GB / Pinecone Starter free tiers — generous enough for credibility, tight enough to force conversion at modest real usage.

#### Pro — "Solo builder / small team"

- **Price:** $20 / seat / month (annual: $200/seat — 2 months free)
- **Seats:** 1–5, additional seats prorated
- **Storage:** **250 GB included, $0.018/GB-month overage**
- **Gateway requests:** 5M Class A + 50M Class B / month included; $4 per million Class A overage, $0.40 per million Class B overage
- **Egress:** 1 TB/mo included, $0.01/GB overage
- **Agents:** unlimited, **2,000 platform-key messages/mo included**, $0.01/message overage; BYOK unlimited
- **Knowledge:** 100 GB index included, $0.20/GB-day above quota (matches OpenAI Assistants vector-store rate)
- **Share tokens:** unlimited; per-token daily request + spend caps already in `AgentShareToken`
- **MCP:** unlimited tool-calls
- **BYOK passthrough:** OpenAI tokens tracked, never billed by us; full per-token attribution in dashboard
- **Walrus epochs:** bundled — we hedge WAL price internally; user sees flat GB-month
- **Support:** email, 48h response

#### Team — "Scale-up / production workload"

- **Price:** $75 / seat / month (annual: $750/seat)
- **Seats:** 5+ enforced minimum
- **Storage:** **2 TB included, $0.014/GB-month overage**
- **Gateway:** 50M Class A + 500M Class B included; same overage rates as Pro
- **Egress:** 10 TB/mo included
- **Agents:** unlimited, 25,000 platform-key messages/mo included
- **Knowledge:** 1 TB index, $0.15/GB-day overage
- **SSO** (SAML, OIDC), **audit log export** (already in `UsageEvent`, `AgentInvocation`), **custom domain for share-token widgets**
- **Spend caps + budget alerts** with Slack/PagerDuty integration
- **Support:** business hours, 8h response, shared Slack channel
- **Compliance:** SOC 2 Type II evidence pack (when ready)

#### Enterprise — "Contact us"

Sales-led. Triggers in-app to surface "Contact sales":
- > 25 seats
- > 10 TB stored for 2 consecutive months
- Customer asks SSO / SOC2 / DPA / BAA / custom retention / private Seal key servers / dedicated indexer
- > $5k/mo projected spend

Delivered via **Stripe Invoicing** (`collection_method: 'send_invoice'`, `days_until_due: 30`), ACH / wire / card, custom Prices, optional committed-spend discounts (annual prepay → 15–25% off list).

Enterprise gets things self-serve plans don't:
- Per-region Walrus storage pinning (where available)
- Bring-your-own Seal key servers (or third-party threshold quorum)
- Custom Move policies for bucket access (the gated mode deferred from the hackathon scope)
- Reserved indexer throughput SLA
- Custom embedding model (Cohere, Voyage, self-hosted)
- Reranker tier (Cohere Rerank 3.5 / Jina) on Knowledge — also see [`/docs/p2-reranker-research.md`](p2-reranker-research.md)

### 2.3 Competitive positioning

This pricing is **deliberately bracketed by R2/B2 on the bottom and the Box-AI / Glean tier on the top**. Reasoning:

- **Storage axis ($0.018/GB-mo Pro overage).** Above Cloudflare R2 ($0.015) and Backblaze B2 ($0.006), below AWS S3 Standard ($0.023). The premium is justified by: on-chain ownership, Seal encryption at rest, integrated knowledge/agent layer, S3 wire-compatibility. We are *not* trying to be the cheapest storage; we are trying to be the only storage where the user provably owns the bytes.
- **Egress.** Zero egress is the post-2022 standard (R2, Tigris, Wasabi). We give a generous included egress per plan; overage at $0.01/GB is well below AWS ($0.09/GB) but above pure zero-egress players. We can move to zero-egress once Walrus fetch is fully on the gateway side and we control the read path's cost.
- **AI message axis ($0.01/message Pro overage with our key).** Compare Chatbase ($0.0099–0.015 per credit), Voiceflow ($50/2k = $0.025/msg), Intercom Fin ($0.99/**resolution** — different unit). We're priced like Chatbase but with full source attribution and an open standards stack (MCP, OpenAI-compatible chat).
- **BYOK strategy.** Cursor, Raycast, T3.chat — all the credible AI tools have BYOK with **the same seat price**. The seat fee buys the platform; the key buys the inference. Don't apologise for this; lean into it.

### 2.4 Pricing page (the externalised version)

The actual marketing page can show three cards (Free / Pro / Team) with Enterprise as the fourth "Contact us" card. Hide overage rates behind a "see full pricing" expandable; the headline numbers should be the included quotas. A live calculator that takes "I have X TB of docs and Y users" and outputs a recommended plan is high-ROI for conversion (Cloudflare and Vercel both do this).

---

## 3. Usage tracking architecture

This section defines **what we track, where it lives, how it flows to Stripe, and how it surfaces to the user.** Token tracking happens whether or not we bill for those tokens — they're a product feature, not just a billing artifact.

### 3.1 Meters (the canonical list)

Each meter has: a stable name (used as Stripe Meter `event_name`), the unit, the aggregation, the data source, and the emit point.

| Meter name | Unit | Agg | Source | Emit point | Billed? |
|---|---|---|---|---|---|
| `storage_byte_seconds` | byte·second | sum | `S3Object` rows × time | Hourly cron rollup | Yes |
| `gateway_class_a_requests` | request | sum | `UsageEvent` PUT/POST/LIST/DELETE | Per gateway request (stream) | Yes |
| `gateway_class_b_requests` | request | sum | `UsageEvent` GET/HEAD | Per gateway request (stream) | Yes |
| `gateway_egress_bytes` | byte | sum | `UsageEvent.bytes_out` | Per gateway request (stream) | Yes |
| `knowledge_index_byte_seconds` | byte·second | sum | `KnowledgeChunk` token×size × time | Hourly rollup | Yes |
| `agent_messages` | message | sum | `AgentInvocation` (status='completed', model in PLATFORM_KEYED) | Per chat completion | Yes |
| `mcp_tool_calls` | call | sum | `AgentToolCall` via MCP path | Per tool call | Yes (Team+ only) |
| `seats` | seat·month | n/a | `subscription_item.quantity` | Subscription update | Yes (licensed) |
| `byok_input_tokens` | token | sum | `AgentInvocation.prompt_tokens` (BYOK) | Per chat completion | **No — display only** |
| `byok_output_tokens` | token | sum | `AgentInvocation.completion_tokens` (BYOK) | Per chat completion | **No — display only** |
| `byok_embedding_tokens` | token | sum | `KnowledgeManifest.embedding_tokens` | Worker on indexing | **No — display only** |

**Why `byte_seconds` for storage** instead of GB-months: storage is a continuous integral, not a snapshot. A file uploaded on day 28 of the month shouldn't count as a full GB-month. Stripe Meters lets us emit byte-seconds and convert at Price time (`unit_amount` on a Price denominated per GB-month is just `byte_seconds × 1e9 × 30.4375 × 86400` arithmetic; we shape the Price tiers in that unit). This is the same trick AWS S3 uses internally.

For storage and index meters, **hourly rollups** (not per-event) avoid emitting one event per `S3Object` per second. The worker reads `S3Object` and `KnowledgeChunk` at 00:00, 01:00, ... 23:00 UTC and emits one event per project per meter per hour with the integral of bytes × 3600.

### 3.2 The "track even when not billed" channel

OpenAI tokens via BYOK are **never sent to Stripe**, but we keep three things:

1. **Per-invocation rows** — already exist (`AgentInvocation.prompt_tokens` / `.completion_tokens`, `KnowledgeManifest.embedding_tokens`).
2. **Dollar cost imputation** — using the static `price_per_m_tokens_usd` catalog in `packages/shared/src/models.ts`, compute `cost_usd_micros = tokens × price / 1e6` at invocation time and write to a new column `AgentInvocation.cost_usd_micros`. Store the **price snapshot** in `AgentInvocation.cost_price_version` so model price changes don't retroactively rewrite history.
3. **Daily rollup** — a new `BYOKDailySpend` table (project_id, day, model, input_tokens, output_tokens, cost_usd_micros) for fast dashboard reads.

This is the part that lets the dashboard say "you spent **$12.83** on OpenAI this month through Kraterion (charged directly to your card by OpenAI)" — even though we never touched the money.

### 3.3 Source of truth — double write

```
[event happens]
      │
      ▼
[Postgres write]  ◀── source of truth for product UX, history, alerts
      │
      ▼
[BullMQ enqueue]
      │
      ▼
[Stripe Meter emit] ◀── source of truth for billing
      │
      ▼
[mark row as billed_at]
```

Rationale (industry-standard; Stripe themselves recommend this pattern):

- **Latency.** Meter Event Summaries lag by minutes under load. Real-time UI can't wait.
- **Retention.** Stripe retains meter events but querying per-project historical breakdowns at second resolution is not its strength.
- **Resilience.** Stripe outages (rare, but happen) can't block writes — usage just queues.
- **Reconciliation.** Nightly cron sums Postgres for a given day and compares to `MeterEventSummary` for the same window. Alert on drift > 0.1%. (See §3.7.)
- **Non-billing logic.** Soft caps, hard caps, per-agent breakdowns, per-bucket spend — all read from Postgres.

### 3.4 Emit pipeline

Three speeds, depending on the meter's volume:

**A. Stream endpoint (high-volume).** Gateway PUT/GET/HEAD. Volume could be millions/day. Batched 1k events per `POST /v1/billing/meter_event_stream`, flushed every 5 seconds or when buffer fills. Requires a `meter_event_session` (cached, 15-min TTL, refreshed automatically).

**B. Standard endpoint (medium-volume).** Agent chat, MCP tool calls. Single event per emit, no batching, posted from the request lifecycle.

**C. Hourly rollups.** Storage byte-seconds, index byte-seconds. A worker queries Postgres for `SUM(size_bytes × seconds)` per project for the hour just ended, posts one event per project per meter.

Identifiers are deterministic, not random:
- Per-request meters: `identifier = "${meter_name}:${request_log_id}"`
- Per-invocation: `identifier = "${meter_name}:${agent_invocation_id}"`
- Hourly rollups: `identifier = "${meter_name}:${project_id}:${hour_iso}"`

The 24-hour Stripe dedupe window combined with deterministic identifiers means **a worker crash mid-flush is safe** — retries hit the dedupe and no-op. Beyond 24h, the worker dead-letters and pages an operator rather than re-posting (would double-bill).

### 3.5 Schema additions

New Prisma models. Names follow project conventions (snake_case columns, camelCase models, `cuid()` IDs).

```prisma
model BillingAccount {
  id                String   @id @default(cuid())
  project_id        String   @unique
  stripe_customer_id String  @unique
  status            BillingStatus @default(active) // active | past_due | unpaid | canceled
  default_payment_method String?
  invoice_email     String?
  tax_id            String?
  country           String?
  hard_spend_cap_usd_cents Int?   // user-set, null = unlimited
  soft_alert_thresholds Int[]    @default([50, 80, 100])
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt
  project           Project  @relation(fields: [project_id], references: [id])
  subscriptions     Subscription[]
}

model Subscription {
  id                    String   @id @default(cuid())
  billing_account_id    String
  stripe_subscription_id String  @unique
  plan_code             String   // 'free' | 'pro' | 'team' | 'enterprise'
  status                String   // mirror of Stripe status
  current_period_start  DateTime
  current_period_end    DateTime
  cancel_at_period_end  Boolean  @default(false)
  trial_end             DateTime?
  seat_count            Int      @default(1)
  metadata              Json?
  billing_account       BillingAccount @relation(fields: [billing_account_id], references: [id])
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt
}

model MeterEvent {
  id            String   @id @default(cuid())
  project_id    String
  meter_name    String
  value         BigInt
  identifier    String   @unique  // sent as Stripe identifier
  occurred_at   DateTime
  sent_at       DateTime?
  stripe_status MeterEventStatus @default(pending) // pending | sent | adjusted | failed
  attempt_count Int      @default(0)
  last_error    String?
  payload       Json?    // any extra dimensions for our own analytics
  @@index([project_id, meter_name, occurred_at])
  @@index([stripe_status, occurred_at])
}

model UsageDaily {
  // Pre-aggregated for fast dashboard reads
  id          String   @id @default(cuid())
  project_id  String
  day         String   // YYYY-MM-DD UTC
  meter_name  String
  value       BigInt
  cost_usd_micros BigInt @default(0)   // platform-billed cost (after free tier)
  @@unique([project_id, day, meter_name])
  @@index([project_id, day])
}

model BYOKDailySpend {
  id          String   @id @default(cuid())
  project_id  String
  day         String
  model       String           // 'gpt-4o-mini', 'text-embedding-3-small', etc.
  input_tokens  BigInt @default(0)
  output_tokens BigInt @default(0)
  cost_usd_micros BigInt @default(0)
  @@unique([project_id, day, model])
}

model InvoiceSnapshot {
  // Cached copy of Stripe invoice for our UI; Stripe is source of truth
  id              String   @id @default(cuid())
  stripe_invoice_id String @unique
  project_id      String
  status          String
  total_usd_cents Int
  period_start    DateTime
  period_end      DateTime
  pdf_url         String?
  hosted_invoice_url String?
  created_at      DateTime @default(now())
}

model StripeWebhookEvent {
  id          String   @id  // Stripe event id, e.g. 'evt_...'
  type        String
  received_at DateTime @default(now())
  processed_at DateTime?
  attempt_count Int @default(0)
  payload     Json
  last_error  String?
  @@index([type, received_at])
}

enum BillingStatus { active past_due unpaid canceled }
enum MeterEventStatus { pending sent adjusted failed }
```

Existing tables that need columns:

- `AgentInvocation`: add `cost_usd_micros BigInt @default(0)`, `cost_price_version String?`, `key_source String` (`'platform' | 'byok'`).
- `KnowledgeManifest`: add `cost_usd_micros BigInt @default(0)`, `cost_price_version String?`.
- `Project`: add `billing_account_id String? @unique`, `plan_code String @default('free')`, `current_seat_count Int @default(1)`.

### 3.6 Quota & entitlement enforcement

Reads happen at two layers:

1. **In-request soft check** (cached, 60-sec TTL in Redis): "is this project over its hard cap?" If yes, reject with a `402 Payment Required` for paid surfaces or fall back to BYOK for AI surfaces. Cache key: `entitlements:${project_id}`.
2. **Hourly recompute** (worker): pulls current period's `UsageDaily` per meter, compares to the plan's included quota + hard cap, writes the result back into the cache.

Entitlements are derived from a static plan catalog (`packages/shared/src/billing/plans.ts`):

```ts
export const PLANS = {
  free:  { storage_gb: 10,   gateway_class_a: 100_000,     /* ... */ },
  pro:   { storage_gb: 250,  gateway_class_a: 5_000_000,   /* ... */ },
  team:  { storage_gb: 2048, gateway_class_a: 50_000_000,  /* ... */ },
} as const;
```

When a webhook updates a subscription, we read `metadata.plan_code` off the Stripe Subscription (we set this at Checkout) and write it to `Project.plan_code`. Don't reverse-engineer plan from Stripe Price IDs; carry the plan_code through as canonical metadata. (We could use Stripe **Entitlements API** here, which is the 2025 release — worth evaluating but not adopting blindly; metadata + our own catalog gives us more control.)

**What "over cap" does per surface:**

| Surface | Over hard cap | Over plan quota (no hard cap) |
|---|---|---|
| Storage | PUT rejected with 507 | Overage billed |
| Gateway requests | 429 | Overage billed |
| Egress | 429 on GET | Overage billed |
| Agent (platform key) | Fall back to BYOK if configured, else 402 | Overage billed |
| Agent (BYOK) | n/a — user pays OpenAI directly | n/a |
| Knowledge indexing | Pause queue, alert user | Overage billed |

Note that storage already on Walrus **is never evicted on cap breach** — that would violate the user-ownership thesis. Uploads stop; bytes stay; renewal keeps running (we eat the WAL cost if the user doesn't pay, until 60 days past-due, then renewal stops and blobs expire naturally — same warning behavior as a domain registrar).

### 3.7 Reconciliation

A nightly cron at 02:00 UTC:

1. For each (project, meter, day-1):
   - Sum `MeterEvent.value` WHERE `stripe_status='sent'` AND `occurred_at IN [day-1]`
   - Fetch `MeterEventSummary` from Stripe for the same window
   - Compute drift
2. If drift > 0.1% of value: write `BillingDriftAlert` row, page on-call
3. If drift > 1%: also halt new emits for that meter (kill-switch) until manually cleared

This catches: identifier collisions, partially-flushed batches, Stripe-side accept-but-not-aggregate bugs, time-window straddling.

---

## 4. Stripe integration

### 4.1 Products used

- **Stripe Billing** — subscriptions, prices, invoices
- **Stripe Checkout** (hosted) — signup, plan upgrade
- **Customer Portal** — cancel, switch plan, update card, view invoices
- **Stripe Tax** — automatic tax (0.5% of transactions; flat no-brainer)
- **Stripe Meters** (post-2024 API) — usage events, not the deprecated `usage_records` on subscription items
- **Stripe Invoicing** — Enterprise only, `collection_method: 'send_invoice'`

Explicitly **not** using:
- `subscription_items.usage_records` — deprecated, replaced by Meters
- Stripe Connect — we aren't a marketplace
- Stripe Issuing / Treasury — out of scope
- Stripe Entitlements — evaluate later; for now we run entitlements off our own plan catalog driven by webhook-set `metadata.plan_code`

### 4.2 Product / Price catalog

In Stripe (test + live, managed by an idempotent seed script committed to the repo, not the dashboard — `infra/stripe/seed.ts`):

```
Products:
  prod_seat            "Kraterion seat"
  prod_storage         "Storage (byte·second)"
  prod_gateway_class_a "Gateway Class A requests"
  prod_gateway_class_b "Gateway Class B requests"
  prod_egress          "Gateway egress bytes"
  prod_knowledge_index "Knowledge index (byte·second)"
  prod_agent_messages  "Agent messages (platform key)"
  prod_mcp_tool_calls  "MCP tool calls"

Prices (graduated tiers, tier 1 = $0 up to plan quota):
  price_pro_seat            licensed, $20/mo
  price_team_seat           licensed, $75/mo
  price_pro_storage         metered, graduated, tier1=$0 to 250GB-mo, tier2=$0.018/GB-mo
  price_team_storage        metered, graduated, tier1=$0 to 2TB-mo, tier2=$0.014/GB-mo
  ... (analogous for each meter × plan)
```

Plan = a curated *set* of these prices, expressed in the seed script. Free has no Stripe subscription at all (the project exists in Postgres with `plan_code='free'` and no `BillingAccount`). When a free user upgrades, Checkout creates the BillingAccount + Stripe Customer + Subscription with all Pro prices.

### 4.3 Provisioning flow (sign-up → first invoice)

```
1. User clicks "Upgrade to Pro" in dashboard
2. Server creates Stripe Checkout Session:
     - mode: 'subscription'
     - customer_creation: 'always' (or 'use_existing' if BillingAccount exists)
     - line_items: all Pro prices, seat with quantity = current_seat_count
     - automatic_tax: { enabled: true }
     - tax_id_collection: { enabled: true }
     - allow_promotion_codes: true
     - metadata: { project_id, plan_code: 'pro' }
     - success_url, cancel_url
3. User completes Checkout (Stripe-hosted)
4. Webhook checkout.session.completed → server:
     - Upsert BillingAccount(project_id, stripe_customer_id)
     - Upsert Subscription(stripe_subscription_id, plan_code='pro', ...)
     - Set Project.plan_code = 'pro'
     - Invalidate entitlements cache
     - Fire welcome email
5. Webhook customer.subscription.updated → server keeps Subscription row in sync
6. Webhook invoice.paid → server creates InvoiceSnapshot
```

### 4.4 Webhook handling

A single endpoint `POST /webhooks/stripe` on control-plane, registered with all the events listed below.

**Critical patterns:**

- **Raw-body verification.** Fastify needs a content-type-aware raw-body plugin; the Nest adapter must not parse JSON before signature check. We already have a custom `main.ts` — add a body parser exception for this route.
- **Idempotent processing.** Persist `event.id` in `StripeWebhookEvent` table on receipt with `processed_at=null`. Reject duplicates (`event.id` is the primary key). Process inside a transaction; set `processed_at` on success.
- **Process async.** Webhook returns 200 immediately after persisting; a BullMQ worker handles the row. Stripe expects sub-30s responses or it retries; doing work synchronously is brittle.

Events we handle:

| Event | Handler action |
|---|---|
| `checkout.session.completed` | Provision BillingAccount + Subscription, set plan, invalidate cache |
| `customer.subscription.created` | Idempotent upsert (in case Checkout flow doesn't fire first) |
| `customer.subscription.updated` | Update plan / seat count / status; if status moves to `past_due`, surface UI banner |
| `customer.subscription.deleted` | Move project to `plan_code='free'`, stop new uploads if over free quota, send email |
| `invoice.created` | Snapshot to `InvoiceSnapshot` (status='draft') |
| `invoice.finalized` | Update snapshot, capture PDF URL |
| `invoice.paid` | Update snapshot, send receipt, reset period-based caches |
| `invoice.payment_failed` | Start dunning UI (banner + email), restrict heavy operations after 3 days |
| `invoice.upcoming` | Send "you'll be billed $X in 3 days" email if `total > $50` (configurable) |
| `customer.subscription.trial_will_end` | Send "trial ends" email |
| `billing.meter.error_report_triggered` | Page on-call — meter events are malformed |
| `customer.updated` | Sync invoice_email, tax_id |
| `payment_method.attached` / `payment_method.detached` | Sync default_payment_method |

### 4.5 Customer Portal

Configure via `infra/stripe/portal-config.ts` (committed, idempotent). Surface in dashboard at `/settings/billing` via:

```ts
const session = await stripe.billingPortal.sessions.create({
  customer: billingAccount.stripe_customer_id,
  return_url: `${APP_URL}/settings/billing`,
});
return { url: session.url };
```

Out of the box (good enough for v1):
- Update payment method ✓
- View / download invoices ✓
- Cancel subscription (end of period) ✓
- Update billing address, tax ID ✓
- Switch between configured plans (Pro ↔ Team) ✓

What we build ourselves:
- **Usage dashboard** (Portal doesn't show real-time usage)
- **Seat management** (invite teammates UI; Portal can only change quantity, not invite)
- **Hard spend cap setting** (a Kraterion-specific field, lives in `BillingAccount`)
- **Plan comparison page** with calculator
- **Downgrade-with-warning flow** ("you'll lose X — proceed?")
- **Free tier signup** (no Stripe involvement)
- **BYOK display panel** (OpenAI spend tracked, not billed)

### 4.6 Pricing / plan migrations

Prices in Stripe are effectively immutable. To change pricing:

1. Create a new Price under the existing Product (`infra/stripe/seed.ts` writes the new one; keeps the old).
2. Update the seed catalog to mark the old Price `lookup_key` archived.
3. **Grandfather**: existing subscribers stay on the old Price until they manually upgrade or until a flag-flip date.
4. New signups get the new Price.

For forced migrations (rare; only if pricing was actually broken):

```ts
await stripe.subscriptions.update(sub.id, {
  items: [
    { id: oldItemId, deleted: true },
    { price: newPriceId, /* tax_rates, etc. */ },
  ],
  proration_behavior: 'create_prorations', // or 'none' if you don't want to hit the card
});
```

For non-urgent migrations, prefer **subscription schedules** to switch at the next renewal — no proration drama.

### 4.7 Edge cases

- **Trials.** Pro offers a 14-day trial via `trial_period_days: 14`. Meter events accrue during trial but aren't invoiced. Trial-end email at T-3 days.
- **Coupons / promotion codes.** Allow at checkout (`allow_promotion_codes: true`). For mid-cycle redemption, add a Kraterion endpoint that calls `subscriptions.update` to attach a discount.
- **Annual / monthly toggle.** Separate Prices. Switch via `subscriptions.update` with `proration_behavior: 'always_invoice'` for upgrades (charge now), `'none'` for downgrades (credit at next renewal — industry standard, don't refund mid-cycle).
- **Seats.** When a teammate joins, bump `quantity` on the seat subscription_item; `proration_behavior: 'create_prorations'`. When they leave, `'none'` (no mid-cycle refund). Seat-count enforcement is in our auth layer, not Stripe.
- **Multi-currency.** Defer past v1. When ready: `currency_options` on each Price.

### 4.8 Security

- Stripe API keys: secret key in the control-plane env only; restricted-key per service if we later separate webhook ingestion. Never on dashboard / gateway.
- Webhook secret in env, rotated yearly.
- PCI scope: Stripe Checkout + Portal keeps us **SAQ A** (lowest), no cardholder data ever touches our infra.
- Webhook endpoint **public** (Stripe IPs documented but they recommend signature verification over IP allowlist).
- Idempotency keys on all mutating Stripe API calls — derive from operation + actor (`upgrade:${project_id}:${ts_bucket}`).

---

## 5. User-facing surfaces

### 5.1 Pricing page (marketing site, `apps/landing`)

Four cards, sentence case throughout per design system rules: Free, Pro, Team, Enterprise. Each card shows headline price + 4–5 most important inclusions. "See full pricing" expandable revealing the meter table. Live calculator: storage GB slider + agent messages slider + seats counter → estimated monthly bill across plans, recommended plan highlighted.

Tied to the [design system at `/design-system/`](../design-system/) — no shadows, no gradients, no font weight ≥ 600. Use existing brand palette + type tokens.

### 5.2 Dashboard billing settings (`apps/dashboard`)

New route `/settings/billing` with these panels:

- **Plan** — current plan card, "Upgrade" / "Downgrade" CTAs, seat count, "Manage in Stripe" link to portal
- **Payment method** — last 4, "update" link to portal
- **Spend cap** — Kraterion-native, value in USD, slider, save → write to `BillingAccount.hard_spend_cap_usd_cents`
- **Alerts** — email + Slack/webhook destination for 50/80/100% notifications
- **Invoices** — table from `InvoiceSnapshot`, PDF + hosted-URL links
- **Tax info** — link to portal

### 5.3 Usage dashboard (`apps/dashboard`, `/usage`)

The flagship transparency feature. Layout:

- **This period summary** (top): total Kraterion bill so far + projected end-of-period (extrapolated linearly from days-elapsed), and a separate OpenAI BYOK total ("$12.83 charged directly by OpenAI"). Two numbers, never mixed.
- **Per-meter cards** (grid): each one is a horizontal bar of `used / included`, dollar value, mini sparkline of daily usage. Cards: Storage, Gateway requests (Class A + B), Egress, Knowledge index, Agent messages, MCP tool calls.
- **BYOK section** (separate band): breakdown by model (`gpt-4o-mini`, `text-embedding-3-small`, etc.), tokens × price snapshot, daily chart.
- **Per-agent breakdown** (drill-down): which agent is consuming what.
- **Per-bucket breakdown**: which bucket is the storage / index / gateway hot-spot.
- **Per-share-token breakdown** (already in `ShareTokenUsageDay`): for embedded widgets.
- **Export CSV**: full usage data for a period.

This is the killer feature for trust. Reuse R2 / Vercel / Modal conventions: dollar-denominated, projection visible, per-meter visibility, history available.

### 5.4 In-app alerts & warnings

- Banner when soft-alert threshold crossed
- Banner when payment failing
- Banner when over hard cap (with "raise cap" button → portal)
- Email at 50/80/100% (configurable thresholds)
- Slack webhook / generic webhook for Team+ plans

### 5.5 Reporting OpenAI tokens to the user (BYOK section)

Even though we don't bill the tokens, the user wants one place to see "what did Kraterion cost me this month." This is a competitive advantage versus a fragmented stack where they have to log into OpenAI's dashboard separately.

The BYOK section shows:

- **Total OpenAI cost (Kraterion-imputed)** for the current period, with a disclaimer: "charged by OpenAI to your card on file with them. Computed at the prices in effect when each call was made."
- **By model**: `gpt-4o-mini: 14.2M input tokens · 2.1M output tokens · $4.27` etc.
- **By feature**: how much from agent chat vs knowledge indexing vs guardrails (when P5 lands)
- **Daily chart** with the toggle to view tokens or dollars

The data flows from `AgentInvocation.cost_usd_micros` and `KnowledgeManifest.cost_usd_micros`, pre-aggregated into `BYOKDailySpend`.

We **do not** sync with OpenAI's billing API even if available — privacy, complexity, and our numbers will be exact-to-tokens (we have the call records); OpenAI's billing aggregates differently. Display ours with a clear "computed from your usage" footnote.

---

## 6. Implementation phases

Not for the hackathon. Post-launch sequencing:

### Phase B0 — foundation (1–2 weeks)
- New Prisma models (BillingAccount, Subscription, MeterEvent, UsageDaily, BYOKDailySpend, InvoiceSnapshot, StripeWebhookEvent)
- Stripe seed script (`infra/stripe/seed.ts`) for products / prices / portal config
- Token-cost imputation on `AgentInvocation` and `KnowledgeManifest` (new columns + emit at call site)
- Daily rollup workers (storage byte-seconds, BYOK)

### Phase B1 — read-only usage dashboard (1 week)
- `/usage` route, all panels, no billing yet
- BYOK section live (already have the data, just need to surface it)
- Reuse existing activity feed components

### Phase B2 — Stripe wiring (2 weeks)
- Webhook endpoint + idempotent handler
- Checkout flow for Pro
- Customer Portal launch
- Meter emit pipeline (stream for gateway, standard for chat, hourly for storage/index)
- Reconciliation cron

### Phase B3 — entitlements (1 week)
- Quota checks in gateway + chat + indexing
- Spend cap UI
- Soft-alert emails
- Plan banners + upgrade prompts

### Phase B4 — Team plan + SSO (2 weeks)
- Seat management UI
- SAML/OIDC integration (use WorkOS or BoxyHQ rather than rolling our own)
- Audit log export (already in `UsageEvent`, just need export endpoint)

### Phase B5 — Enterprise rails (1 week)
- Sales pipeline (HubSpot / Pipedrive)
- Stripe Invoicing flow
- Custom prices via dashboard escape hatch
- Annual billing + committed-spend discounts

### Phase B6 — polish (ongoing)
- Pricing page + calculator
- Marketing site updates
- Documentation
- Pricing experimentation infrastructure

Total ballpark: **7–9 weeks of one engineer's full-time work** to ship the whole system. Phase B1 (usage dashboard, no billing) is the highest-ROI first ship — gives users transparency, builds toward billing later, doesn't commit to a pricing model before validation.

---

## 7. Open questions

Items to resolve before the seed script lands:

1. **Walrus cost pass-through.** Do we want a "Walrus-passthrough" SKU at-cost for Enterprise customers who'd rather see Walrus mechanics directly? Pros: aligned with the ownership thesis. Cons: complicates the UX.
2. **Annual prepay discount %.** "2 months free" (16.6%) is the conventional rate but 20% is competitive in this space. Need to model CAC and churn assumptions.
3. **Whether to ship our own embedding/inference (vs. BYOK-only).** Pro plan's "2,000 platform messages/mo included" implies we run a small pool of our own OpenAI capacity. Cleaner alternative: BYOK-mandatory for v1, no platform key at all. Cuts cost-of-goods to zero on inference, but free tier becomes weaker.
4. **Stripe Entitlements API adoption.** New in 2025; declarative feature flags driven by Price metadata. Worth a real evaluation in Phase B3 — could replace our hand-rolled plan catalog if it's flexible enough.
5. **Spend cap legal disclaimer.** Hard caps mean we sometimes lose money (Walrus costs accrue regardless of whether the user uploaded). Need clear ToS language that grace-period rules limit our exposure to ~60 days of WAL renewal beyond cap.
6. **Free tier abuse.** Per-account vs per-email vs per-Sui-address rate-limiting. Stripe-side fraud signals via Radar even for Free signups (require card on file? Cloudflare-style "free but tied to a card" gating?).
7. **Refund policy.** Default: no refunds, prorated credits on cancellation. Common in SaaS; pre-commit before first Pro signup.
8. **Cohere / reranker pricing inheritance.** When P2 ships, do we eat reranker cost or meter it? Lean: bundle into Team+ as a quality differentiator, never as a separate meter.

---

## 8. Reference — research sources

- AWS S3 pricing (us-east-1, late 2025): $0.023/GB-mo Standard, $0.09/GB egress.
- Cloudflare R2: $0.015/GB-mo, zero egress, $4.50 / 1M Class A, $0.36 / 1M Class B.
- Backblaze B2: $0.006/GB-mo, free egress up to 3× storage.
- Wasabi: $6.99/TB-mo flat, 90-day minimum retention.
- Storj DCS: $4/TB-mo + $7/TB egress.
- Filebase: $5.99/TB-mo (IPFS/Sia/Skynet backends).
- Pinecone Serverless: ~$0.33/GB-mo vectors + read/write.
- OpenAI Assistants vector store: $0.20/GB/day — single most useful comparable for our knowledge index meter.
- Vectara: 50 MB + 15k queries free, $25/mo + $2.50/1k queries scale.
- Chatbase: $19 → $399 tiered, ~$0.01/msg credit.
- Intercom Fin: $0.99 / resolution (different unit, premium framing).
- Cursor / Raycast / T3.chat: BYOK same seat price as managed-key — confirms BYOK doesn't lower seat price.
- Stripe Meters: rate limit 1k events/sec standard, 10k events/sec stream; 24h identifier dedupe window; replacement for deprecated `usage_records`.
- Stripe Tax: 0.5% of transactions.

Numbers are accurate as of January 2026 cutoff. Confirm live pricing before publishing the marketing site or seed script.
