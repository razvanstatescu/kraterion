# Kraterion — Managed CDN Feature Plan

> **Status:** Draft proposal, not committed scope.
> **Companion:** [`/docs/upload-flow-analysis.md`](upload-flow-analysis.md) — origin-side readiness checklist for items 2–6 below.

## Context

A user puts files in a public-read bucket; today they get a single `https://gateway.kraterion.com/public/{bucket}/{key}` URL served by our origin. That works but doesn't scale: one origin, no edge caching, no geo-distribution, no custom domains. The competitive comparison ("vs Cloudflare R2 with Workers, vs Bunny Storage with the BunnyCDN") makes us look like we shipped the storage and forgot the delivery half.

This plan proposes shipping a **Kraterion-managed CDN** — the user flips a per-bucket toggle and gets edge caching + a custom domain without touching a CDN provider themselves. We integrate with one upstream CDN provider, abstract it behind a `CdnService`, and bill the bandwidth.

## Product shape — what the user gets

Per public-read bucket, three tiers of URL:

1. **Auto** (default when CDN is enabled): `https://{bucket}.kraterion.dev/{key}` — issued instantly, no DNS work.
2. **Branded** (post-launch polish): `https://cdn.kraterion.com/{bucket}/{key}` — shared subdomain, useful for non-vanity buckets.
3. **Custom domain** (BYO): `https://assets.acme.com/{key}` — user adds a CNAME to their DNS pointing at our CDN; we provision the cert + edge cert binding.

Dashboard surface:

- A **CDN** tab on the public-bucket detail page with: enable toggle, three URL tiers, custom-domain wizard (CNAME instructions + verification status), small analytics strip (requests, bytes served, cache hit ratio, last 7 days).
- The existing "Copy public URL" button on objects defaults to the CDN URL when CDN is enabled.

## Provider choice

**Recommendation: Cloudflare for SaaS** (Custom Hostnames + Workers + R2-style cache).

| Provider | Why / why not |
|---|---|
| **Cloudflare for SaaS** ✅ | Built exactly for our pattern: tens of thousands of customer domains aliased to one CDN. API for custom hostname provisioning + cert issuance. Generous free egress on standard plans (~$0.04–0.08/GB at scale). Workers for edge auth/signed URLs if needed later. Cache-purge API is one POST. Single-vendor lock-in is real but they're industry standard for this exact problem. |
| **Bunny CDN** | Cheapest ($0.005–0.04/GB), good API. Less mature SaaS-domain story (their "Pull Zones" + custom hostnames work but are not the same first-class product). Worth keeping as a Plan B if Cloudflare costs balloon. |
| **Fastly** | Enterprise-grade VCL/Compute@Edge. Overkill + significantly more expensive. Right answer at much later stage. |
| **AWS CloudFront** | Works but ties us into AWS billing + IAM. Cert provisioning via ACM is per-domain. Custom hostnames at scale is painful (cert quota dance). |
| **Self-hosted (Nginx + Varnish at the edge)** | Adds an ops surface that distracts from product. Don't. |

The abstraction layer (`CdnService`) hides the choice so swapping providers is a focused change later.

## URL strategy

- **Auto subdomain**: requires wildcard cert `*.kraterion.dev`. Cloudflare provisions automatically; one DNS record + one cert. Lowest-friction onboarding.
- **Branded shared**: `cdn.kraterion.com` already in our domain; CDN routes path-style to the right bucket. Useful when the user doesn't want a per-bucket subdomain visible.
- **Custom domain**: Cloudflare for SaaS Custom Hostnames issues a per-customer Universal SSL cert on demand. Customer just adds a CNAME `assets.acme.com → cdn.kraterion.com`; Cloudflare validates via HTTP-01 or TXT, binds the cert, and the URL is live in seconds-to-minutes.

## Architecture — how it slots in

```
end user → Cloudflare edge → (cache hit: respond) │ (miss: origin)
                                                  ▼
                            our gateway (apps/gateway)
                            GET /public/{bucket}/{key}
                                                  ▼
                            Walrus aggregator (encrypted bytes)
                                                  ▼
                            Seal-decrypt (gateway sub-wallet)
                                                  ▼
                            stream plaintext → CF → cached + served
```

**Origin requirements** (in priority order; items already in upload-flow-analysis.md §4):

1. **Byte-range GETs** (`Range: bytes=A-B`). Cloudflare refuses to cache files over its size limit (typically 512 MB) without range support. **Hard blocker** for any file > ~500 MB. Today we send `Accept-Ranges: none`. → from §4 item C4.
2. **Conditional GETs** (`If-None-Match` / `If-Modified-Since`) returning 304. CDN revalidation cheap-path; saves Walrus reads on cache refresh. → §4 item #4.
3. **Strong ETag + Last-Modified headers**. We already have the etag column. → §4 item #2.
4. **Tunable Cache-Control per bucket** (the 5-minute hardcode is wrong for assets that should live a year). → §4 item #3.
5. **CORS headers**. Per-bucket allowlist. → §4 item #6.
6. **Vary on `Accept-Encoding`** so we don't poison the cache with gzip vs identity.
7. **`Cache-Control: public, max-age=N, immutable`** automatically for objects with a content-hash in the key (a heuristic — if the key ends in `.{8+ hex}.{ext}` or matches a Vite/webpack pattern, mark it immutable).

A `CdnEdgeReadinessGate` flag turns the new behaviour on; until it's true, the CDN cannot reliably cache us.

## Provisioning flow

```
[Dashboard: "Enable CDN" toggle]
        │
        ▼
POST /v1/buckets/:id/cdn { enabled: true }
        │
        ▼
CP CdnService:
  1. Issue auto subdomain (Cloudflare for SaaS Custom Hostname API
     POST /zones/:zone_id/custom_hostnames { hostname: "<bucket>.kraterion.dev" })
  2. Wait for active status (poll; usually 5–30s)
  3. Write BucketCdnSettings row
        │
        ▼
Dashboard polls /v1/buckets/:id/cdn → shows live URL
```

For custom domain: extra step where user adds a CNAME, CP polls the Custom Hostname's `ssl.status` until `active`, then surfaces "verified ✓" in the dashboard.

## Cache invalidation

Two strategies, both shipped:

- **Default: short TTLs + content-hash URLs.** If the user uploads `app.abc123.js` and overwrites with `app.def456.js`, the URL changes; no purge needed. We document this as the recommended pattern.
- **On-demand: explicit purge.** When the gateway processes a successful PUT to an existing key, or a DELETE, it fires a Cloudflare cache-purge call (single URL purge: `POST /zones/:zone_id/purge_cache { files: [url] }`). Fire-and-forget; failures logged + retried by a worker. Cloudflare's free tier allows 1000 single-file purges per day per zone, plenty for sandbox.

## Billing

New Stripe meter: `cdn_egress_bytes`.

- **Tracked at**: Cloudflare Analytics API pulled daily by a new worker (`cdn-usage-rollup.processor.ts`, mirrors `share-token-egress-rollup`).
- **Priced at**: $0.02/GB (1.5× our raw download-bandwidth rate; covers Cloudflare's $0.04–0.08/GB pass-through with margin). Revisit when we have real usage.
- **Free band**: 5 GB/mo (a tenth of the download-bandwidth band — CDN is opt-in so the free band shouldn't be a giveaway).
- **Cost-floor**: cost-floor processor gains a new entry comparing our $0.02/GB ship price vs Cloudflare's invoiced rate.

The existing **download bandwidth** meter measures bytes served from our origin only. With CDN enabled, most traffic never hits the gateway, so it'll naturally drop — that's the customer's win. The two meters don't overlap.

## Dashboard surface

- **Bucket detail page** gains a CDN tab next to Knowledge.
- **Toggle + status**: `enabled` + provisioning state ("issuing certificate", "verifying CNAME", "live").
- **URLs**: three rows with copy buttons.
- **Custom domain wizard**: step-by-step CNAME instructions, live verification status.
- **Analytics strip**: 7-day requests, bytes served, cache hit ratio. Pulled from Cloudflare Analytics API; falls back to "—" if quota exhausted.
- **Cache settings**: max-age slider (1 minute → 1 year), "force immutable for hashed filenames" toggle.

The `/usage` page gains a `CDN bandwidth` row in the meter table once any project has emitted the meter.

## Implementation phases

| Phase | Scope | Duration |
|---|---|---|
| **C0** — Origin readiness | Items 1–7 from §architecture/origin requirements. Most are in upload-flow-analysis.md Tier A; pull them forward. | 2–3 days |
| **C1** — `CdnService` + provider abstraction | Cloudflare client wrapper, `BucketCdnSettings` schema, enable/disable endpoints. Hard-coded to one CF account + zone. Auto subdomain only. | 2 days |
| **C2** — Cache invalidation | Purge call on PUT-overwrite + DELETE. Retry queue for failed purges. | 1 day |
| **C3** — Custom domain | Cloudflare Custom Hostnames API integration, dashboard wizard, polling for cert status. | 2 days |
| **C4** — Dashboard CDN tab | UI, analytics fetch, copy-URL affordances, cache settings UI. | 2 days |
| **C5** — Billing | `cdn_egress_bytes` Stripe meter, `cdn-usage-rollup.processor.ts`, catalog + sync, cost-floor entry, dashboard /usage row. | 2 days |
| **C6** — Shared `cdn.kraterion.com` subdomain | Path-style routing for users who don't want a per-bucket subdomain. Optional v1 polish. | 1 day |

**Total: ~12 days** for end-to-end CDN with billing. C0 is the gating prerequisite.

## What we explicitly don't build in v1

- **Image transformations / resizing / format conversion** — Cloudflare Polish + Image Resizing is a paid add-on; ship as a Phase-2 feature once asked for.
- **Video streaming / HLS / DASH** — needs origin-side range + segmenting; revisit when there's a real video use case.
- **Edge functions** (signed URL validation, hotlink protection, geo block) — Workers are powerful but the v1 product is "make my files faster", not "build a CDN platform".
- **Multi-region origins** — single origin until the gateway itself is geo-distributed.
- **WAF / DDoS protection** — Cloudflare gives us this for free at the edge; we just don't expose it as a configurable surface.
- **Per-customer Cloudflare account** — single shared account is fine until billing or quota force the split.
- **Private-bucket CDN** — structurally incompatible with Seal envelope encryption (caching plaintext at edge breaks the access model). Document the limitation; recommend client-side decryption for the in-browser case.

## Data model additions

```prisma
model BucketCdnSettings {
  bucket_id           String   @id
  enabled             Boolean  @default(false)
  // Issued auto subdomain: `<bucket-slug>.kraterion.dev`. Set by the
  // provisioning call to Cloudflare; null until the Custom Hostname
  // becomes active.
  auto_hostname       String?  @unique
  // Optional BYO. User adds CNAME → we provision cert via Cloudflare
  // Custom Hostnames. Status mirrored from CF.
  custom_hostname     String?  @unique
  custom_hostname_status String?   // pending | active | failed
  custom_hostname_cf_id  String?   // Cloudflare Custom Hostname ID
  // Cache knobs.
  max_age_seconds     Int      @default(300)
  immutable_for_hashed Boolean @default(true)
  // CORS allowlist; empty array = `*`.
  cors_origins        String[] @default([])
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt
  bucket Bucket @relation(fields: [bucket_id], references: [id])
}

model CdnDailyUsage {
  // Pulled daily from Cloudflare Analytics API. One row per (bucket, day).
  id           String @id @default(cuid())
  bucket_id    String
  project_id   String
  day          String   // YYYY-MM-DD
  requests     BigInt @default(0)
  bytes_served BigInt @default(0)
  cache_hit_ratio Float @default(0)
  @@unique([bucket_id, day])
  @@index([project_id, day])
}
```

## Critical files (where work lands)

- New: `apps/control-plane/src/cdn/cdn.service.ts` — Cloudflare client wrapper
- New: `apps/control-plane/src/cdn/cdn.controller.ts` — enable/disable/custom-domain endpoints
- New: `apps/control-plane/src/billing/cdn-usage-rollup.processor.ts` — daily CF Analytics pull
- New: `apps/dashboard/src/app/(app)/buckets/[id]/cdn/page.tsx` — CDN tab UI
- Modified: `apps/gateway/src/s3/object-bytes.service.ts` — emit per-bucket Cache-Control, ETag, range support
- Modified: `apps/gateway/src/s3/public.controller.ts` — handle conditional GETs + range
- Modified: `apps/control-plane/src/billing/catalog.ts` — add `cdn_egress_v1` price + meter
- Modified: `prisma/schema.prisma` — two new models above

## Verification

1. **Manual end-to-end:**
   - Enable CDN on a public test bucket via dashboard.
   - `curl -I https://<bucket>.kraterion.dev/<key>` → confirm `CF-Cache-Status: MISS`, then second call → `HIT`.
   - Overwrite the file via dashboard upload → confirm purge → next curl shows new bytes.
   - Add a custom domain → verify cert provisions → curl the custom domain.
2. **Automated:**
   - Worker test: hit the cache-purge fake server, confirm retry on 5xx.
   - E2E in CI: a `pnpm -F @kraterion/gateway smoke:cdn` that exercises range, conditional, and CORS on a known-public bucket.
3. **Billing sanity:**
   - Stripe sandbox sync creates `cdn_egress_v1` price.
   - Synthetic 100 GB via the CF Analytics fake → `CdnDailyUsage` row + `MeterEvent` emitted → invoice preview in Customer Portal shows the new line.

## Open product calls (decide before C1 starts)

1. **CDN as a free feature or paid add-on?** Free unlocks user adoption; paid covers Cloudflare invoices. Recommend: free up to 5 GB/mo egress, then metered at $0.02/GB.
2. **One-click enable vs explicit pricing acceptance?** If free tier, one-click. If immediately metered, show pricing confirmation before enabling.
3. **Default subdomain shape**: `<bucket>.kraterion.dev` or `<bucket>.kr.app` or another short root domain? Affects the wildcard cert purchase.
4. **Custom hostname pricing.** Cloudflare for SaaS bills custom hostnames at $0.10/hostname/mo on standard plans. At 1000 hostnames that's $100/mo. We either absorb it (eat margin) or pass it through ($1/mo per custom domain). Recommend: absorb on the first custom domain per project; charge on the second.
5. **Single vs split Cloudflare account.** Start single. Split when we cross 10k zones or hit account-wide rate limits.
