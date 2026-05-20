# Kraterion — Upload-to-Bucket Flow Analysis

## Context

The current upload path works end-to-end (SigV4 → encrypt → on-chain register → Walrus relay → on-chain certify → indexer ack → 200) and the dashboard wraps it with a drag-and-drop UI + per-file progress. But across the recent sessions we've seen the gaps in person: a 28 KB file consumes 63 MiB of pool capacity, the indexer-ack wait is the wall-clock cost users feel, the queue panel has no cancel/retry, and there's no rate-limit anywhere in the gateway.

This document inventories the current implementation, calls out the load-bearing gaps, compares to S3 / R2 / tus, and proposes a prioritized improvement list grouped by impact × effort. It is **diagnostic + roadmap**, not a single feature spec. After approval, individual items get their own scoped plans.

---

## 1. Current state, in one page

### Backend (gateway PUT path)
Source: [apps/gateway/src/s3/objects.write.controller.ts](apps/gateway/src/s3/objects.write.controller.ts), [apps/gateway/src/main.ts](apps/gateway/src/main.ts)

| # | Step | Where | Notes |
|---|---|---|---|
| 1 | SigV4 verify | `Sigv4Guard` | Reuses presigned-URL header |
| 2 | Validate (Content-Length, MD5, reserved keys) | controller:160-173 | Rejects `_kraterion/*` namespace |
| 3 | Bucket + project + `api_access_granted` lookup | controller:183-206 | One PG query |
| 4 | Lazy vault provisioning | `VaultProvisioningService` | First PUT per project blocks ~10s on chain |
| 5 | Seal-encrypt full body in memory | `getSealClient().encrypt()` | No streaming; 2 GiB cap |
| 6 | Compute blob id + root hash locally | controller:237-242 | Walrus client helper |
| 7 | Overwrite detection (lookup old `S3Object`) | controller:248-261 | For atomic delete in PTB2 |
| 8 | **PTB1** (`sendUploadRelayTip` + `pool_vault::register_blob`) | controller:269-318 | Tip MUST be slot 0 |
| 9 | **POST to Walrus upload-relay** | controller:336-391 | 3 attempts, 500/1500 ms backoff |
| 10 | **PTB2** (`certify_blob` + optional `delete_blob` of old) | controller:393-457 | Atomic overwrite |
| 11 | Wait for `S3Object` row (indexer ack) | `waitForS3Object` | 250 ms poll, **15 s timeout**, returns 503 on timeout |
| 12 | Patch `metadata` column | controller:468-473 | Direct PG write |
| 13 | Emit `UsageEvent` + Redis class_a counter | `usage.interceptor.ts` | Fire-and-forget |
| 14 | 200 with ETag + x-amz-request-id | controller:475 | — |

**Limits & constants:**
- Body limit `2 GiB + 1 MiB` ([main.ts:11-18](apps/gateway/src/main.ts#L11-L18)). Walrus accepts 13 GiB but chunked-Seal isn't built.
- `MAX_PUT_BYTES = 2 GiB`. Single-shot only.
- No multipart, no resumable, no byte-range GETs (`Accept-Ranges: none`).
- Pool-capacity guard + spend-cap guard are **scaffolded but log-only** today (B6 turns them into 507/429).
- No rate limiting anywhere.

### Frontend (dashboard upload UX)
Source: [apps/dashboard/src/components/buckets/Uploader.tsx](apps/dashboard/src/components/buckets/Uploader.tsx), [apps/dashboard/src/lib/objects.ts](apps/dashboard/src/lib/objects.ts)

| Aspect | Today | Notes |
|---|---|---|
| Entry points | Drag-and-drop overlay + Upload button | Bridge via `window.__kraterionOpenUploader` |
| Multi-file | ✓ via `<input multiple>` | No folder support (`webkitdirectory` not set) |
| Path | CP → `POST /v1/objects/prepare-upload` returns SigV4 headers → direct XHR to gateway | Secret never leaves CP |
| Presigned URL TTL | **5 min** (SigV4 skew tolerance) | Hardcoded in `presign.service.ts:224` |
| Progress | Per-file 4 px bar, XHR `upload.progress` events | Krater accent |
| Concurrency | **Unbounded** — every queued file fires in parallel | Browser limit is the only ceiling |
| Cancellation | `AbortController` exists in state, **no button** | Dead code today |
| Retry | None — failed items just sit | Manual dismiss only |
| Client size check | **None** — accepts any size, fails server-side | Confusing UX on a 5 GB drop |
| Optimistic list | Queue item appears immediately; file list waits for indexer (~30 s) | React Query refetch on success |
| Auto-clear done | After 5 s, based on ID timestamp | Brittle (`Uploader.tsx:152`) |
| Folder upload | ✗ | Browsers ignore directories in `e.dataTransfer.files` without `webkitGetAsEntry` |
| Collision warning | ✗ — overwrite is silent | AWS Console asks before overwriting |
| Inline preview | ✗ | Only icon by MIME family |
| Persistence across refresh | ✗ — refresh kills the queue | Big-file killer |

### Cross-cutting
- **Worker queues**: BullMQ exists, but **only embeddings + manifest-archive** use it. The PUT path is fully synchronous.
- **Walrus encoding overhead**: 4.5–5× + 1 MiB floor (`/docs/monetization-and-billing.md`). Acknowledged but no Quilt batching yet.
- **Orphan PooledBlob risk**: relay-fail or PTB2-fail logs `ORPHAN POOLED BLOB` but no automated reaper.
- **No idempotency key**: Two concurrent PUTs to same key both register new blobs; last one wins; first becomes orphan if PTB2 delete fails.
- **No rate limit**: a misconfigured loop can saturate gateway + drain the WAL reserve.
- **MIME**: trusts client `Content-Type` header — no sniffing.

---

## 2. Industry standards — where everyone else is

| Capability | AWS S3 | Cloudflare R2 | Backblaze B2 | tus.io | **Kraterion today** |
|---|---|---|---|---|---|
| Single PUT max | 5 GiB | 5 GiB | 5 GiB | n/a | **2 GiB** |
| Multipart upload | 5 MiB–5 GiB per part, up to 10 000 parts, **5 TiB total** | yes (same shape) | "large file" API | n/a | **none** |
| Resumable upload | via multipart (re-PUT a single part) | same | same | **native protocol** | **none** |
| Byte-range GET | yes | yes | yes | n/a | **none** (`Accept-Ranges: none`) |
| Presigned PUT | yes, configurable TTL | yes | yes | n/a | yes (5 min) |
| Direct browser upload | yes (CORS + presigned) | yes | yes | yes | yes |
| Client SDK retries | exponential w/ jitter, parallel parts | same | same | spec-defined | **none** (relay-side only) |
| Transfer Acceleration / edge | yes (S3-TA) | natively edge | n/a | n/a | n/a (one origin) |
| Conditional writes | `If-Match` / `If-None-Match` | yes | n/a | n/a | **none** |
| Object versioning | yes | yes | yes | n/a | n/a (single live version) |
| Server-side encryption | SSE-S3 / SSE-KMS | SSE-S3 | SSE-C | n/a | **yes (Seal — strictly stronger)** |
| Rate limiting | per-bucket request quotas + tenant burst | per-account | per-key | n/a | **none** |
| Upload from URL | no | yes (Worker) | no | n/a | n/a |
| Small-file batching | no (per-object min charge) | no | no | n/a | **Quilt planned, not built** |

**Read:** Kraterion sits above S3 on cryptographic story (Seal envelope + on-chain ownership) but **below S3 on operational ergonomics** (no multipart, no resumable, no rate-limits, no conditional writes). Closing that gap is the heart of this analysis.

---

## 3. Issues — ranked by likelihood-of-hurt

### 🔴 P0 — affects every user, every upload
1. **No multipart for files > 2 GiB.** Today we just reject. Users with one big video / archive can't onboard.
2. **15 s indexer-ack timeout returns 503 even when the chain succeeded.** During backfill (we saw it twice this session) or transient indexer lag, customers see "Storage commit succeeded on-chain but the indexer hasn't caught up". They retry → second PTB1 spends WAL again. **WAL leak under indexer latency.**
3. **Unbounded dashboard concurrency.** Drag 50 files → 50 simultaneous XHRs → 50 simultaneous gateway PUTs → 50 simultaneous Seal encrypts → memory spike on gateway, no fairness across tenants.
4. **No client-side size gate.** User picks a 4 GB file → waits 30 s for the gateway to reject it.
5. **Small-file Walrus overhead (28 KB → 63 MiB on chain) without Quilt.** Hits the free tier ceiling absurdly fast; visible in the dashboard "0 MB used of 500 MB" the user is paying for.

### 🟠 P1 — frustrating but workaround-able
6. **No cancel button.** AbortController is wired but invisible.
7. **No retry on failed item.** User has to drag the file again.
8. **No collision warning.** Silent overwrite. AWS Console asks; we should too.
9. **No queue persistence.** Refresh during a 2 GiB upload = start over.
10. **Orphan PooledBlobs from relay-fail / PTB2-fail not reaped.** They sit on chain consuming pool capacity until expiry.
11. **No rate limiting.** Loud client can DoS gateway / drain reserve.
12. **Folder upload missing.** Users drag a directory, get nothing.

### 🟡 P2 — quality-of-life
13. **Auto-clear done items uses ID-as-timestamp.** Brittle; sort by upload-finished time instead.
14. **No preview before upload.** Especially for images, a 16 px MIME icon isn't enough.
15. **Vault provisioning blocks first PUT for ~10 s.** Could be done eagerly at project create or in the background after sign-up.
16. **No upload-from-URL.** Common ask for migration ("import my S3 bucket").
17. **Indexer ack ↔ React Query gap.** File appears 30 s after PUT 200. Optimistic list update would smooth this.

---

## 4. Recommended improvements — sequenced by impact × effort

### Tier A — Quick wins (≤ 1 day each, no architectural shift)

| # | Change | Where | Impact |
|---|---|---|---|
| A1 | **Client-side size check.** Show "max 2 GiB per file" error before XHR fires. | `Uploader.tsx` `addFiles` | Saves 30 s of misleading retry |
| A2 | **Cancel button per queued file.** Wire the existing AbortController. | `Uploader.tsx` queue panel | Standard expectation; ~30 min |
| A3 | **Retry button on failed items.** Re-call `runUpload(item)` after exponential backoff. | `Uploader.tsx` | Removes drag-again friction |
| A4 | **Cap dashboard concurrency at 3.** Simple semaphore around `runUpload`. | `Uploader.tsx:104` | Stops 50-file storm on browser + gateway |
| A5 | **Collision warning modal.** Before PUT, HEAD the key; if 200 → "Overwrite X?" dialog. | `objects.ts` + new ConfirmModal | One round-trip, matches S3 Console |
| A6 | **Folder upload via `webkitGetAsEntry`.** Drag-a-folder support; preserve path prefix. | `Uploader.tsx` drop handler | Significant UX upgrade |
| A7 | **Auto-clear: use finished-at timestamp, not id parsing.** | `Uploader.tsx:152` | Removes a foot-gun |
| A8 | **Per-PUT timing log on gateway.** Emit elapsed ms per step (encrypt/PTB1/relay/PTB2/wait). | `objects.write.controller.ts` | Observability for issue 2 + 5 |
| A9 | **Rate-limit guard on gateway PUT** (`@fastify/rate-limit` per project_id, 100/min default). | gateway main + guard | Cheap DoS defense |

### Tier B — Medium investments (1–3 days)

| # | Change | Effort | Impact |
|---|---|---|---|
| B1 | **Eager vault provisioning** at project-create time (in background, doesn't block sign-up). First PUT no longer pays the 10 s tax. | 1 day | Removes biggest cold-path latency |
| B2 | **Indexer-ack: stop blocking PUT 200.** Two options: (a) raise timeout to 30 s + tighten poll to 100 ms; (b) **return 202 with a `Location: /v1/objects/:id` and let the dashboard poll**. Option (b) is more correct; needs a tiny status endpoint. | 1-2 days | Kills WAL-leak-on-retry |
| B3 | **Optimistic dashboard list.** Show the file with a pending pill the moment PUT returns 200 (or 202), regardless of indexer state. | 1 day | "I uploaded it, where is it?" disappears |
| B4 | **Orphan PooledBlob reaper.** Daily worker job that finds `PooledBlob` rows in DB with `status='registered'` but no certify event after N minutes, calls `delete_blob` on chain. Refunds the pool. | 1 day | Closes the WAL hole permanently |
| B5 | **Queue persistence in `sessionStorage`.** Save the in-flight queue; on refresh, resume the un-finished items with their abort-controllers fresh. | 1 day | Saves big uploads from accidental refresh |
| B6 | **Light "preparing upload" telemetry.** Per-PUT structured log line with project, bucket, size, elapsed, outcome — emit at the end of the controller, consumed by `/admin/uploads` later. | 0.5 day | Forensics for support |
| B7 | **Quilt batching for small files.** Background worker batches recently-uploaded objects < 64 KiB into a single Walrus blob and rewrites their `walrus_blob_id` pointers. The §2.5 docs claim 106× cost cut at 100 KB. | 3 days | Fixes the small-file billing trap |

### Tier C — Strategic bets (≥ 3 days, architectural)

| # | Change | Effort | Impact |
|---|---|---|---|
| C1 | **Multipart upload** (`CreateMultipartUpload` / `UploadPart` / `CompleteMultipartUpload`). Each part is its own PooledBlob; complete builds a manifest object. Lifts the 2 GiB cap. **Requires chunked-Seal envelopes (we don't have them).** Significant Move-side work (manifest-of-parts struct). | 5-7 days | Unblocks >2 GiB use cases; opens parallel-part uploads on the SDK side |
| C2 | **tus.io resumable protocol** as a parallel endpoint family. Big-file safety net independent of multipart. Wraps multipart internally. | 4 days | Network-resilient uploads |
| C3 | **Conditional writes** (`If-Match` / `If-None-Match`). Atomic create-only + safe overwrite-by-ETag. Combined with optimistic concurrency this is the foundation for any future shared-bucket / multi-writer story. | 2 days | Correctness primitive |
| C4 | **Byte-range GETs.** Symmetric to multipart; required for video / large-file previews. Walrus aggregator already supports range reads — just plumb. | 2 days | Future preview surface |
| C5 | **CP-side `POST /v1/objects/import-from-url`.** Worker job fetches the URL, encrypts, uploads. Migration play. | 2 days | "Move my S3 bucket here" hook |

### Tier D — Stop-the-bleeding (do now regardless)

- D1 — **The indexer-ack 503 has cost us WAL twice in two days.** Either bump the timeout aggressively + add jitter on dashboard retry, OR ship B2 (return 202) this week. Pick one before another customer sees it.
- D2 — **The unbounded-concurrency × no-rate-limit combo** is a footgun the moment a real user with a folder of 200 files shows up. A4 + A9 together are < 1 day of work.

---

## 5. Recommended sequencing (4-week shape)

If everything were on the table, I'd run it in this order:

**Week 1 — quick wins + stop-the-bleeding (5 days)**
- A1 size gate, A2 cancel, A3 retry, A4 concurrency cap, A5 collision warn, A7 auto-clear fix
- A8 per-PUT timing logs + A9 rate-limit
- D1: bump indexer timeout to 30 s with jitter — interim until B2

**Week 2 — observability + UX completeness (5 days)**
- A6 folder upload
- B3 optimistic list (drops "where's my file" support pings)
- B5 queue persistence
- B6 structured upload telemetry
- B1 eager vault provision

**Week 3 — correctness + plumbing (5 days)**
- B2 PUT returns 202 + status endpoint (kills WAL leak)
- B4 orphan PooledBlob reaper
- C3 conditional writes (`If-Match` / `If-None-Match`)

**Week 4 — strategic (≈ 1 week or punt)**
- B7 Quilt small-file batching, OR
- C1 multipart (pick one — both touch the gateway hot path).

After Week 4, C2 / C4 / C5 / D-series get scheduled against next quarter's roadmap.

---

## 6. Critical files (where work lands)

- [apps/gateway/src/s3/objects.write.controller.ts](apps/gateway/src/s3/objects.write.controller.ts) — the PUT hot path (every Tier-B/C item touches this)
- [apps/gateway/src/main.ts](apps/gateway/src/main.ts) — body limits, rate-limit registration, Fastify config
- [apps/gateway/src/indexer-wait/wait-for-row.ts](apps/gateway/src/indexer-wait/wait-for-row.ts) — the 15 s polling logic (target of B2 / D1)
- [apps/gateway/src/billing/pool-capacity.guard.ts](apps/gateway/src/billing/pool-capacity.guard.ts) + [spend-cap.guard.ts](apps/gateway/src/billing/spend-cap.guard.ts) — already scaffolded; B6 turns them live (separate plan)
- [apps/control-plane/src/objects/presign.service.ts](apps/control-plane/src/objects/presign.service.ts) — signed-URL TTL config + future presigned-multipart entrypoints
- [apps/dashboard/src/components/buckets/Uploader.tsx](apps/dashboard/src/components/buckets/Uploader.tsx) — every dashboard-side improvement
- [apps/dashboard/src/lib/objects.ts](apps/dashboard/src/lib/objects.ts) — `usePrepareUpload`, `uploadWithProgress` — the wire layer
- [apps/worker/src/embeddings/embeddings.service.ts](apps/worker/src/embeddings/embeddings.service.ts) — pattern for queue-driven background work (B4, B7, C5 reuse)

---

## 7. Verification approach (when items ship)

For each improvement, the test shape is the same:

- **Tier A items** — visual regression in the dashboard upload queue + a Playwright test that drives drag-and-drop with N files and asserts the new behaviour (cancel button visible, retry restores progress, collision warning fires).
- **Tier B / C items** — end-to-end via `pnpm -F @kraterion/gateway smoke`: extend the existing pool-roundtrip script to cover the new path. For B2 (202 + status endpoint) add an explicit test for the indexer-lag case (artificially delay the indexer, confirm PUT still succeeds + dashboard polls for completion).
- **Cross-cutting** — once A8/B6 logs land, every change can be measured by per-PUT elapsed-ms histograms before/after.

---

## 8. What this analysis explicitly does NOT decide

- Whether to do multipart (C1) or Quilt (B7) first — both touch the gateway hot path. Need a product call on "do we want > 2 GiB support, or do we want to fix the small-file billing trap first?".
- Whether to ship the optimistic-list (B3) before fixing the underlying indexer-ack issue (B2). B3 hides the symptom; B2 fixes the cause. Recommend B2 first if budget is tight.
- Rate-limit thresholds (A9). 100/min is a placeholder. Real numbers come from telemetry, which we don't have yet — ships in A8.

---

## 9. Open questions for follow-up scoped plans

When the user picks a tier / item to execute, each one becomes its own plan with:
- Move-side ABI changes (C1 only)
- Schema migrations (B4 needs a `PooledBlob.last_register_at` index; B7 needs a `QuiltMembership` table)
- Stripe metering implications (B7 changes how class_a maps to actual bytes — billing semantics need a doc update)
- Dashboard wire-type changes (B2 changes PUT response shape)

None of those are scoped here. This document is the **map**, not the **mission**.
