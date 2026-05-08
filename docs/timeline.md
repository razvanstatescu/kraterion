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

- **Current week:** W1 (Foundations) — May 7 to May 13
- **Days to submission:** 44
- **Last reviewed:** 2026-05-08
- **W1 status:** Move package live on testnet
  (`0x5dfc…64db`) with `init`-spawned PlatformReserve. TS bindings
  auto-synced (4 modules incl. reserve). Prisma schema migrated.
  Walrus + Seal client wrapper packages shipped (`@kraterion/walrus-client`
  and `@kraterion/seal-client`) configured with Architecture D + the
  Decentralized Seal Committee. `@mysten/seal` 1.1.3, `@mysten/walrus`
  1.1.6, `@mysten/sui` 2.16.2. 33/33 Move unit tests + 7/7 SDK tests
  green; 15/15 workspace typecheck tasks green. Remaining W1 work:
  bootstrap script + smoke test (Phase 2), then SigV4 + S3 ops in W2.

## Cadence

- Update the **Status** block every Monday and after each milestone slip or jump.
- If a week's exit criteria isn't met by its end date, decide: cut scope, push the next phase, or absorb into buffer (W7). Don't silently extend.
- Anything not in `/docs/implementation-plan.md` is out of scope until after Jun 21.
