# Sui Overflow 2026 — Timeline

> **STATUS (2026-09-01): shipped.** Sui Overflow 2026 is over — Kraterion won the
> Walrus track — and the app is now **live on Sui + Walrus mainnet**
> (package `0xcd9329e9…`). The hackathon schedule below is kept as the historical
> build plan; current work is tracked in [`progress.md`](progress.md) and the live
> state in [`mainnet-deploy-status.md`](mainnet-deploy-status.md).

Walrus track. Submission gate was **June 21, 2026**.

## Key dates

| Date | Milestone |
|------|-----------|
| May 7, 2026 | Official launch (today) |
| May 9, 2026 | Orientation & kick-off call |
| May 7 – Jun 21, 2026 | Building period (~6.5 weeks) |
| Jun 21, 2026 | Submission deadline |

## Internal phasing

Working back from Jun 21 with a 1-week buffer for polish, demo video, and submission.

| Window | Focus | Exit criteria |
|--------|-------|---------------|
| May 7 – May 13 (W1) | Foundations | Move package compiles & deploys to testnet; monorepo CI green; Walrus + Seal client wrappers smoke-tested; landing page online |
| May 14 – May 20 (W2) | Storage path | End-to-end PUT object → Walrus SharedBlob owned on-chain → Seal-encrypted; metadata in Postgres |
| May 21 – May 27 (W3) | Read path & access | GET object via gateway with Seal session keys; revocation flow on-chain |
| May 28 – Jun 3 (W4) | Renewal & reliability | BullMQ renewal worker; epoch tracking; failure retries; basic observability |
| Jun 4 – Jun 10 (W5) | Dashboard | Signed-in console: bucket list, object browser, key revocation UI, billing-shape stub |
| Jun 11 – Jun 17 (W6) | Hardening | Security pass on crypto handling; load test gateway; fix top issues; copy & design polish |
| Jun 18 – Jun 21 (W7) | Submission | Demo video, README + architecture doc, deployed demo, submission form |

## Status

- **Current week:** W2 (May 14–20) calendar-wise. Storage-pool migration
  complete; the Stripe pay-as-you-go billing system (B0–B5 of the
  sandbox-only plan) ships fully wired with inline Stripe Elements card
  collection on `/billing`, hourly meter rollups, scheduled
  storage-downgrade processor, and the `BillingBanner` priority logic
  across the (app) shell. Read paths, dashboard, AI platform, K5 manifest
  archive, P3 agents, P4 tools, P6 embed widget all in. Running well
  ahead of the original calendar phasing.
- **Days to submission:** 18
- **Last reviewed:** 2026-06-03
- **Recently shipped (since last review):** P9 Feature 1 (replayable
  agent sessions — canonical trace, session anchor on Sui, replay
  endpoint), Feature 2 (OpenLineage-shaped artifact lineage graph in
  the dashboard), Feature 3 (`memory_remember` / `memory_recall`
  agent tools backed by hosted MemWal — per-agent namespace,
  per-deployment delegate key, six unit tests + a live-relayer
  smoke), and a first-run onboarding card on `/buckets` (focused-
  stepper layout with a background-watermark visual per step;
  redesigned from a 4-card grid after the first pass crowded the
  page). Running well ahead of the original W4–W5 phasing.
- **Status (complete):**
  - **On-chain:** Move package `0x73b1…fa14`, init-spawned reserve, TS
    bindings auto-synced.
  - **Gateway:** full S3 surface, 36/36 boto3 cases green. Bucket sort
    order is byte-wise UTF-8 (Postgres `COLLATE "C"`) matching AWS.
    DELETE now atomically wipes `KnowledgeChunk` alongside the soft-delete.
  - **Indexer (worker):** gRPC checkpoint stream, all 5 active handlers,
    sole writer for `Bucket` / `S3Object`. Lag ≤ 30 s steady-state.
    Embedding processor + manifest archive to Walrus.
  - **Control plane:** auth / projects / API keys / bucket reads /
    sponsored-tx prepare endpoints / Enoki zkLogin / Knowledge endpoints
    (`/search`, `/ask`, `/reindex`, backfill) / MCP server (bearer + OAuth 2.1
    + DCR + RFC 9728) / project-scoped `ProviderCredential` table with
    KMS-wrapped keys.
  - **Dashboard:** full console — buckets list, object browser with
    inspector drawer, public links, sponsored writes via Enoki, keys page
    (tabbed: S3 access keys + AI providers), per-bucket Knowledge tab
    (enable modal with model pickers + cost estimate, separate
    "change embedding model" and "change chat model" actions, re-index
    flow), MCP connect panel (API key + OAuth), Activity feed.
  - **Billing (B0–B5):** Stripe sandbox-mode plan implemented through
    B5. New tables (`BillingAccount`, `MeterEvent`, `UsageDaily`,
    `BYOKDailySpend`, `PendingStorageDowngrade`, `StripeWebhookEvent`,
    `CostFloorSnapshot`). Catalog-as-code with `pnpm stripe:sync`
    (1 licensed storage product + 6 metered products). Inline Stripe
    Elements card collection on `/billing` (Vercel/Supabase shape, no
    redirect). Storage as monthly licensed reservation with on-chain
    `pool_vault::resize_grow` for upgrades + scheduled
    `resize_shrink` at period boundary for downgrades. Hourly meter
    rollups (gateway requests, knowledge byte-seconds, storage
    snapshot for display). 60-s `kraterion-meter-emit` drain pushing
    `MeterEvent` rows to Stripe `/v1/billing/meter_events`.
    `BillingBanner` priority logic mounted across (app) layout.
    Customer Portal kept for deep-link extras (invoice PDFs, tax
    info). Spend-cap + free-band **enforcement** is the B6 followup.
  - **Tests / typecheck:** 33/33 Vitest in control-plane, 36/36 boto3
    in gateway, all workspace `tsc --noEmit` clean.
- **Next (locked for submission):**
  - **B6** — spend-cap + free-band + pool-capacity enforcement at the
    gateway interceptor and agent controller (507 / 429 / 402 with
    `X-Kraterion-Reason` headers). Scaffolds are in place from B1;
    B6 wires the live entitlements Redis cache and the actual gating.
  - **B7** — admin pages (`/admin/billing` list + detail,
    `/admin/cost-floor` graph, sandbox-reset button).
  - **B8** — onboarding flow + `RequiresPaymentMethodGuard` on
    bucket-create / agent-create / knowledge-enable + server-side
    remove-payment-method guard while unbilled usage exists.
  - **Demo-prep** — demo video, README rewrite, deployed demo,
    submission form. Carries the existing "running ahead of
    calendar" buffer; submission gate stays Jun 21.

  **Deferred past Jun 21:** P1 (multi-provider), P2 (reranker),
  P5 (guardrails), plus three small P0 deviations (1536d/3072d
  embeddings, transactional swap re-index, separate "Test connection"
  button). P2 research preserved in `docs/p2-reranker-research.md`.
  Live-mode Stripe promotion (test → live env-var flip) deferred to
  post-submission — not a hackathon-judge concern, single env flag
  away.

## Cadence

- Update the **Status** block every Monday and after each milestone slip or jump.
- If a week's exit criteria isn't met by its end date, decide: cut scope, push the next phase, or absorb into buffer (W7). Don't silently extend.
- Anything not in `/docs/implementation-plan.md` is out of scope until after Jun 21.
