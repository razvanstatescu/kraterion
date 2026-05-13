# Sui Overflow 2026 — Timeline

Walrus track. Submission gate is **June 21, 2026**. Today is **May 7, 2026**.

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

- **Current week:** W5 (Dashboard) calendar-wise; functionally past W6.
  Storage path, read path & access, renewal worker, dashboard, and the
  full AI-platform foundation (K0–K5 + P0 of the AI platform proposal)
  have all landed. Running ~3 weeks ahead of plan.
- **Days to submission:** 39
- **Last reviewed:** 2026-05-13
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
  - **Tests / typecheck:** 33/33 Vitest in control-plane, 36/36 boto3
    in gateway, all workspace `tsc --noEmit` clean.
- **Next (locked for submission):** P3 (Agents) + P4 (Function calling)
  → P6 (widget, stretch). **P1 (multi-provider), P2 (reranker), and
  P5 (guardrails) all deferred past Jun 21**, along with three small
  P0 deviations (1536d/3072d embeddings, transactional swap re-index,
  separate "Test connection" button). Scope decisions logged in
  `decisions.md` 2026-05-13 entries ("Hackathon scope cuts…" + the P2
  amendment). P2 research preserved in `docs/p2-reranker-research.md`
  so the post-hackathon round can start with the architecture in hand.
  From W6 onward focus shifts to demo-prep — demo video, README
  rewrite, deployed demo, submission form.

## Cadence

- Update the **Status** block every Monday and after each milestone slip or jump.
- If a week's exit criteria isn't met by its end date, decide: cut scope, push the next phase, or absorb into buffer (W7). Don't silently extend.
- Anything not in `/docs/implementation-plan.md` is out of scope until after Jun 21.
