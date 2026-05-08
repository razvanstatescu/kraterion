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

- **Current week:** W2 (Storage path) — May 14 to May 20 (currently
  running ahead — Phase 5 landed during W1)
- **Days to submission:** 44
- **Last reviewed:** 2026-05-08
- **W1 status (complete):** Move package + bindings + Prisma + crypto
  pipeline + full S3 surface (bucket + object read + object write)
  green. Phases 0–5 of the gateway build done.
  - On-chain: Move package `0x5dfc…64db`, init-spawned reserve, TS
    bindings auto-synced.
  - Off-chain crypto: smoke test round-trips encrypt → register →
    upload-relay → certify+wrap → aggregator-read → decrypt.
  - HTTP: gateway is ESM, boots clean under `node dist/main.js`.
    GetObject/HeadObject/PutObject/DeleteObject all wired to the
    encrypt + on-chain pipeline. ListObjectsV2 is a 501 stub awaiting
    Phase 6.
  - 15/15 workspace typecheck green. 33/33 Move unit tests + 7/7 SDK
    tests + **24/24 boto3 cases** green (Phase-3 bucket level,
    Phase-4 read path conformance, Phase-5 write path conformance).
  Next: Phase 6 — ListObjectsV2 implementation (paginated key listing
  with prefix + delimiter), DeleteBucket-with-objects, then Phase 7
  polish (`/public/*`, `x-amz-meta-*` pass-through, `If-None-Match`
  → 304).

## Cadence

- Update the **Status** block every Monday and after each milestone slip or jump.
- If a week's exit criteria isn't met by its end date, decide: cut scope, push the next phase, or absorb into buffer (W7). Don't silently extend.
- Anything not in `/docs/implementation-plan.md` is out of scope until after Jun 21.
