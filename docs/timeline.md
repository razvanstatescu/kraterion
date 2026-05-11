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

- **Current week:** W3 (Dashboard) — running ~2 weeks ahead of plan.
  Phases 0–6 of the gateway, the indexer, all 4 phases of the control
  plane (auth + projects + API keys + read views + sponsored PTB
  builders + Enoki zkLogin), and Phase A of the dashboard have all
  landed.
- **Days to submission:** 43
- **Last reviewed:** 2026-05-09
- **Status (complete):**
  - **On-chain:** Move package `0x73b1…fa14`, init-spawned reserve, TS
    bindings auto-synced.
  - **Gateway:** full S3 surface, 36/36 boto3 cases green. Bucket sort
    order is byte-wise UTF-8 (Postgres `COLLATE "C"`) matching AWS.
  - **Indexer (worker):** gRPC checkpoint stream, all 5 active handlers,
    sole writer for `Bucket` / `S3Object`. Lag ≤ 30 s steady-state.
  - **Control plane:** auth / projects / API keys / bucket reads /
    4 sponsored-tx prepare endpoints / sponsor execute / Enoki
    zkLogin. Live Enoki sponsorship round-trip verified on testnet
    (tx `25k2…rUdJ`).
  - **Dashboard (Phase A):** Next.js 16 App Router, providers tree
    (Query → Sui → Enoki register → Wallet → Toast), 14 console-kit
    primitives ported to typed React, design tokens shipped to the
    browser. Boots in 186 ms; `/`, `/buckets`, `/keys` all 200.
  - **Tests / typecheck:** 33/33 Vitest in control-plane, 36/36 boto3
    in gateway, 4/4 workspace typecheck.
- **Next:** Dashboard Phases B–H — sign-in (Enoki Google OAuth → CP
  session), read views, sponsored writes (gas-free via Enoki), object
  I/O via CP-signed presigned URLs, access keys page + quickstart
  snippets, demo twists (cancel-subscription + revoke-API), optional
  browser-side Seal decryption.

## Cadence

- Update the **Status** block every Monday and after each milestone slip or jump.
- If a week's exit criteria isn't met by its end date, decide: cut scope, push the next phase, or absorb into buffer (W7). Don't silently extend.
- Anything not in `/docs/implementation-plan.md` is out of scope until after Jun 21.
