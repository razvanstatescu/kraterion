# Kraterion — Monetization & Billing System

**Status:** Draft v3 — design doc, not yet implemented
**Author:** generated 2026-05-15; revised same day for pay-as-you-go model and accurate Walrus cost mechanics
**Scope:** Pricing model, usage metering, Walrus cost engineering, Stripe integration, FX safety, user-facing surfaces
**Owners:** TBD — billing is post-hackathon work; this doc is the spec for it

---

## 0. TL;DR

Kraterion bills like DigitalOcean / Cloudflare R2 / AWS: **pure pay-as-you-go**, no plan tiers, no minimums in the marketing sense, no seat fees. You sign up, you use what you use, you get one itemised invoice on the first of the month. Real-time usage tracking, dollar-denominated dashboards, projected end-of-period invoice always visible.

Two structural rules — borrowed from S3-IA and forced on us by Walrus's actual cost mechanics — make sure we never lose money on small or short-lived files:

1. **1 MiB minimum billable object size.** Walrus encodes blobs and bills in whole MiB units; a 100-byte file costs us the same as a 1 MiB file. We bill the same way. (Mirrors S3-IA's 128 KiB minimum.)
2. **90-day minimum storage duration.** Walrus storage is paid upfront in WAL for the full chosen epoch range. We pay 53 epochs (~2 years) upfront per blob to amortise SUI gas; we cannot refund WAL on early delete. So an object deleted before 90 days still bills for 90 days. (Mirrors S3-IA's 30-day minimum / Glacier's 90-day minimum.)

The headline prices: **$0.06/GB-month storage, $0.01/GB egress, $5 per million Class A requests, $0.40 per million Class B requests, $0.10/GB-day knowledge index, $0.01 per platform-key agent message.** Six numbers. Each meter has a tier-1-free band (10 GB-mo storage, 100k Class A, 1M Class B, 50 GB egress, 1 GB-day index, 100 platform messages) so trial usage never bills.

Optional flat add-on: **Team** at $49/project/month for SSO, audit-log export, support SLA, shared spend dashboard, Slack alerts.

The billing stack: **Stripe Billing + Checkout + Customer Portal + Stripe Tax + Stripe Meters** (the post-2024 Meter Events API). One subscription per project, all-metered items, graduated prices with tier 1 = $0.

The single hardest engineering problem is **the Walrus cost model**: blob storage is paid upfront in WAL for N epochs at registration, plus SUI gas per write — and extending costs more SUI gas. Renew too often and gas dominates; renew too late and blobs expire. §3 defines the renewal cadence (53 epochs upfront, sweep monthly, batched PTBs of 200 blobs at a time), the cost-floor formula (35% FX buffer, real per-MiB FROST rates), and the treasury policy (90-day WAL/SUI reserve, daily Pyth oracle snapshot, weekly purchase off USD payouts).

---

## 1. Product context

Kraterion is an S3-compatible storage SaaS where every file is a Walrus `SharedBlob` owned on-chain, Seal-encrypted by default, with platform decryption access delegated through a revocable on-chain Move policy. On top of that primitive sits a knowledge layer (chunked + embedded into pgvector, BM25 + dense hybrid retrieval) and an agent layer (RAG agents with OpenAI-compatible chat completions, share tokens for embedding into third-party sites). See [`/docs/implementation-plan.md`](implementation-plan.md), [`/docs/one-pager.md`](one-pager.md), [`/docs/ai-platform-proposal.md`](ai-platform-proposal.md), [`/docs/ai-features-plan.md`](ai-features-plan.md).

### 1.1 The principal — what we bill

The hierarchy:

```
Account  →  Project  →  Bucket  →  Object
                     →  Agent   →  ShareToken
                     →  ApiKey, ProviderCredential, SubWallet
```

A `Project` owns API keys, OpenAI provider credentials, agents, buckets. **The billing principal is the Project**, not the Account. Rationale: per-project provider credentials already exist, separate prod/staging projects have different consumption shapes, all existing usage tables are project-scoped (`UsageEvent`, `AgentInvocation`, `KnowledgeManifest`, `ShareTokenUsageDay`).

A `BillingAccount` (new table, see §5.4) is attached **one-to-one with `Project`** and holds the Stripe customer reference. Accounts that own multiple projects pay one card per project — same as Vercel teams or Cloudflare accounts.

### 1.2 Billable-surface inventory

| Surface | What it is | Cost driver (us) | Who pays |
|---|---|---|---|
| **Walrus storage (per epoch)** | `encoded_size_MiB × storage_price × epochs_paid` in WAL, upfront at register | 100,000 FROST/MiB-epoch on mainnet, USD-pegged to $0.023/GB-mo | Us, billed via storage meter |
| **Walrus write fee** | `encoded_size_MiB × write_price` in WAL, one-time at register | 20,000 FROST/MiB on mainnet | Us, bundled into Class A meter |
| **SUI gas — register + certify** | Per-blob, on upload | ~0.005–0.01 SUI per op, size-independent | Us, bundled into Class A meter |
| **SUI gas — extend** | Per-blob, on renewal | Same constant per op; PTB-batchable to ~200/tx | Us, bundled into storage meter |
| **Gateway PUT/POST/LIST/DEL** | S3 write requests | Compute, indexer write, Walrus write fee + SUI register gas | Class A meter |
| **Gateway GET/HEAD** | S3 read requests | Compute, Seal decrypt session, Walrus read | Class B meter |
| **Gateway egress** | Bytes leaving our edge | Cloud bandwidth + Walrus fetch | Egress meter |
| **Knowledge index** | `KnowledgeChunk` storage (pgvector + tsvector) | Postgres disk + IO | Index byte-day meter |
| **Knowledge retrieval** | Hybrid BM25 + halfvec search | DB compute | (Free, amortised into index meter) |
| **Agent chat (platform key)** | `/v1/agents/:id/chat/completions` using Kraterion's OpenAI pool | OpenAI tokens we paid for | Per-message meter |
| **Agent chat (BYOK)** | Same endpoint, user's OpenAI key | $0 to us | **Tracked, not billed** |
| **Agent tool calls** | Built-in tools (search/read/write) | Compute, indexer reads | Free; large customers can pay for MCP throughput SLA |
| **Sui transactions (user PTBs)** | Bucket create, grant/revoke API access | SUI gas, sponsored by Enoki today | Enoki today; metered later |
| **Seal key servers** | Decryption session lookups | Free on testnet | TBD on mainnet |
| **Team add-on** | SSO, audit-log export, SLA, shared dashboard | Engineering + support | Flat $49/project-mo |

---

## 2. Walrus cost mechanics (the foundation)

This section is the technical primer that the rest of the doc depends on. If §2 is wrong, the entire billing model is wrong. All numbers below were confirmed against the Walrus Move source in `MystenLabs/walrus`, the [USD-pricing announcement](https://blog.walrus.xyz/announcing-predictable-pricing-in-usd-on-walrus/), and the [Walrus whitepaper](https://docs.wal.app/walrus.pdf).

### 2.1 Walrus charges in *encoded* MiB, rounded up to 1 MiB, paid in WAL upfront for N epochs

Move source extract (`system_state_inner.move`):

```move
const BYTES_PER_UNIT_SIZE: u64 = 1_024 * 1_024;  // 1 MiB

macro fun storage_units_from_size($size: u64): u64 {
    let size = $size;
    size.divide_and_round_up(BYTES_PER_UNIT_SIZE)
}
```

Cost formula (also from Move source):

```
wal_cost_to_register
  = encoded_storage_units × (storage_price_per_unit × epochs_paid + write_price_per_unit)

extend_wal_cost
  = encoded_storage_units × storage_price_per_unit × additional_epochs
  (no write fee on extend)
```

Three things the formula tells us, all critical:

1. **Storage WAL is paid upfront** for the entire chosen `epochs_paid` at register time. There is no "pay per month" mechanism — pay 1 epoch or 53, all upfront.
2. **Encoded size, not raw size.** Walrus's Red Stuff erasure code expands raw bytes by ~4.5–5× plus a per-blob fixed metadata constant. Small blobs (kilobytes) are dominated by the metadata constant; **a 100-byte file pays for 1 MiB of encoded storage** — the minimum unit.
3. **Write fee is one-time** at register, never re-charged on extend.

Mainnet values (per `walrus info` and on-chain System object):

| Variable | Mainnet value | Per |
|---|---|---|
| `storage_price_per_unit_size` | 100,000 FROST | MiB per epoch |
| `write_price_per_unit_size` | 20,000 FROST | MiB |
| `BYTES_PER_UNIT_SIZE` | 1,048,576 (1 MiB) | — |
| Epoch length | 14 days | — |
| `max_epochs_ahead` | 53 | — |
| 1 WAL | 10⁹ FROST | — |
| USD peg | $0.023 / GB / month | (governance-set, periodically updated by storage nodes' price vote) |

### 2.2 SUI gas is constant per operation

From Walrus docs: *"The SUI costs of `register_blob` and `certify_blob` are independent of blob size or epoch lifetime."* Same for `extend`.

A typical Sui PTB runs in the **0.001–0.01 SUI** range. We plan against a conservative **0.01 SUI per upload** (register + certify in one PTB) and **0.01 SUI per extend PTB** which can carry **~200 blobs** in one transaction. We'll pin actuals to `packages/shared/src/constants.ts` after running `walrus info` and a calibration PTB on testnet.

### 2.3 Refund semantics — there is no WAL refund

From `blob.move` Move source: `delete()` returns a `Storage` resource, not WAL. The unspent epochs of storage capacity are reusable for storing another blob of equal-or-smaller encoded size, but they are **not redeemable for currency**. SharedBlobs (Kraterion's wrapper) cannot be deleted at all — they live until the WAL balance runs out.

This is the structural reason we need a **minimum storage duration** policy in §4.2: we paid 53 epochs upfront in WAL; the user can't make us un-pay that.

### 2.4 The renewal cadence trade-off

This is the central engineering decision. Two failure modes:

- **Renew too often** (e.g., 1 epoch at a time): SUI gas dominates. At ~0.01 SUI × $4/SUI = $0.04 per blob per renewal × 26 renewals/year = **$1.04/year per blob** in pure gas. A 1 MB blob costs ~$0.276/year in WAL storage (at $0.023/GB-mo). **Gas is 4× the storage cost.** Catastrophic on small blobs.
- **Renew too late** (e.g., 1 epoch at a time on a long-lived blob with no margin): renewal worker hiccup or network congestion → blob expires → user data loss.

The solution: **pay 53 epochs (~742 days, ~2 years) upfront at register**, then run a renewal worker that sweeps blobs whose `storage_end_epoch − current_epoch < safety_margin_epochs` (we use 4 epochs ≈ 8 weeks safety margin) and batches 200 of them into one PTB.

Cost shape under this strategy:

- **SUI gas at register:** one PTB per upload, ~0.01 SUI ≈ $0.04 at SUI $4
- **SUI gas at renewal:** one PTB per 200 blobs per cycle. A blob registered for 53 epochs is renewed for the first time ~2 years in. Amortised gas per blob per renewal: 0.01 SUI / 200 = 0.00005 SUI ≈ $0.0002. Negligible.
- **WAL storage:** 53 epochs × $0.023/GB-mo × (14/30) days/epoch ≈ **$0.569/GB upfront**, then **$0.569/GB at first renewal 2 years later**.

The trade-off: we pay 2 years of storage cost in WAL on day 1 per blob, but bill the customer monthly in USD. **This is a working-capital problem, not a margin problem** — addressed by treasury policy in §4.5. We need enough WAL reserve to fund 2 years of upcoming-customer storage at any moment, replenished weekly from Stripe payouts.

### 2.5 Quilt — the small-file mitigation (post-launch)

Walrus's **Quilt** batch tool amortises per-blob metadata across multiple files in one batch — Mysten claims 106× cost reduction at 100 KB and 420× at 10 KB. Kraterion's S3 surface allows arbitrarily small objects, so without Quilt we are heavily exposed on small-file workloads. Mitigations in order of preference:

- **v1 (launch):** enforce 1 MiB minimum billable per object, so small files don't hurt us economically (the user pays for what we pay).
- **v2 (post-launch):** integrate Quilt as the storage backend for objects under 64 KiB. Batch 100 small objects per Quilt, store one Walrus blob, index the contents in our gateway metadata. Reduces our true cost on small files without changing the customer-facing price (margin expansion).

Either way, the **customer-facing minimum stays 1 MiB**. Quilt is a cost-of-goods optimisation, not a price reduction.

---

## 3. Renewal strategy in detail

### 3.1 Default policy

For every new blob upload via the gateway:

```
epochs_paid = 53          (mainnet maximum)
deletable   = false       (we use SharedBlob anyway, which can't be deleted)
```

This commits ~$0.57/GB upfront in WAL but reduces renewal gas to a rounding error and gives a 2-year safety buffer.

### 3.2 Renewal worker

Runs as a BullMQ job inside `apps/worker/src/renewal/` (currently a stub directory, fleshed out in Phase B0). One worker, cron-scheduled, sweeping nightly:

```
SELECT blob_object_id, encoded_size, storage_end_epoch
FROM "S3Object"
WHERE storage_end_epoch - :current_epoch < :safety_margin
  AND status = 'active'
ORDER BY storage_end_epoch ASC
LIMIT 200;
```

Per batch:

1. Read current epoch and current WAL price from on-chain System object.
2. Compute total WAL needed: `Σ encoded_size_MiB × 100k FROST × epochs_to_extend` (extend back to 53 epochs ahead).
3. Verify treasury sub-wallet has WAL + SUI reserve to cover. If not, alert + halt.
4. Build one PTB with N×`extend` Move calls, sign with renewal sub-wallet, submit.
5. On success, indexer's `object-extended.handler.ts` picks up the `ObjectExtended` events and increments `S3Object.storage_end_epoch` per blob (already wired today).
6. On failure: retry with smaller batch, then dead-letter, then page.

Safety margin = 4 epochs ≈ 8 weeks. So we always have an 8-week window to fix a stuck renewal worker before any blob expires.

### 3.3 Customer-cancel and delete flow

When a customer:

- **Deletes an object via S3 DELETE.** Mark the row `status='deleted_pending'`, stop counting it toward storage-meter usage at the next hour boundary, **but do not free the WAL on Walrus** — we already paid. The SharedBlob stays alive until its `storage_end_epoch` arrives, then expires naturally. We just stop renewing it.
- **Cancels their subscription / project.** Same as above for every blob in the project. We stop renewing; blobs expire naturally at the end of their currently-paid 53-epoch window. The user has up to ~2 years to come back and re-activate. (Industry-friendly behaviour; aligned with the user-ownership thesis.)
- **Hits hard spend cap.** Uploads stop. **Existing blobs continue to be renewed.** Storage doesn't get evicted on cap breach — only writes block. Reasoning: same as cancel — the user paid for the storage they already have, even if just upfront-by-us; honour it.
- **Stops paying entirely (3+ failed invoices, 60 days past-due).** Stop renewing the project's blobs. Blobs in their currently-paid window stay alive; new uploads blocked; eventually blobs expire on-chain. Email warnings at 30, 45, 60 days past-due — same as a domain registrar.

### 3.4 The 90-day minimum storage duration rule

A customer who uploads 1 TB on Day 1 and deletes it on Day 2 has cost us:

- Walrus WAL: 1 TB × 53 epochs × ~$0.0107/GB-epoch ≈ **$568** committed upfront
- We can never recover that WAL

If we bill purely on GB-month-currently-stored, we'd recognise ~$2 of revenue (1 TB × 1/30 of a month × $0.06/GB-mo) and eat $566.

**The fix:** bill a **minimum of 90 days** for any object. Mechanism:

- On DELETE, instead of stopping the storage meter immediately, **continue billing the object as if it were still stored** until 90 days have elapsed from its upload date.
- We don't keep the bytes in our state machine after delete — just a row in a new `StorageBillingTail` table with `object_id`, `size_bytes`, `upload_date`, `min_bill_until_date = upload_date + 90 days`. The hourly storage-rollup worker adds these phantom rows to the project's GB-month total.
- Communicated to users in the pricing page: "Stored objects bill for a 90-day minimum. Delete sooner; you still pay the remainder."

This recovers our cost. A 1 TB upload-then-delete now bills (1 TB × 3 months × $0.06) = **$184.32** instead of $2. Still a loss against $568 of WAL — but we mostly mitigate by also adding a **1 MiB minimum billable object** and the per-PUT fee covers SUI gas.

### 3.5 Why 90 days, not 53 epochs (~2 years)

If we billed the full 2-year WAL commitment, our pricing would be uncompetitive (no S3-class service bills 2-year minimums). 90 days matches S3-IA / Glacier Flexible Retrieval convention and covers the average-case where customers churn within a few months. The remaining tail risk (someone uploads 1 PB then deletes the next day) is mitigated by:

- Spend cap on the customer side (auto-set or user-set; hard cap blocks the upload at threshold)
- Anti-abuse rate-limit (max 1 TB upload per project per day on Free, scaled by spend cap)
- Stripe Radar fraud checks on the card-on-file

### 3.6 Renewal-cost recovery in the storage meter

The storage meter price ($0.06/GB-mo) must cover:

- Walrus storage at $0.023/GB-mo (upfront in WAL)
- Renewal SUI gas amortised at 0.01 SUI / 200 blobs / 2 years ≈ $0.0000001/blob/month (negligible)
- Register-time SUI gas at $0.04/blob — recovered via Class A request meter (PUT charges $0.005 to cover this)
- WAL/SUI working-capital cost (we hold ~2 years of WAL upfront; that's ~$0.55/GB tied up = ~3% APY opportunity cost on that capital = ~$0.016/GB/year = ~$0.001/GB-mo)
- FX buffer for WAL peg slip and SUI volatility (35%)
- Indexer + Postgres metadata (~$0.001/GB-mo at scale)
- Gross margin (~50%)

See full math in §4.

---

## 4. Cost floor — never lose money

### 4.1 Inputs at today's prices

```
walrus_storage_usd_per_gb_mo  = $0.023                    (governance-pegged, ±10% slip)
register_sui_per_blob          = 0.01 SUI                  ≈ $0.04 at SUI $4
extend_sui_per_200_blobs       = 0.01 SUI                  ≈ $0.04 per batch
working_capital_cost_pct       = 3% APY on locked WAL
indexer_compute_per_gb_mo      = $0.001
postgres_metadata_per_gb_mo    = $0.0005
```

### 4.2 Storage meter cost floor (per GB-month, large-blob regime)

```
walrus_storage                              $0.0230 /GB-mo
working_capital (2yr WAL locked × 3% APY)    $0.0011 /GB-mo
indexer_compute                              $0.0010 /GB-mo
postgres_metadata                            $0.0005 /GB-mo
renewal_gas (amortised, ~zero per GB-mo)     $0.0000 /GB-mo
                                            -----------
raw_cost_floor                              $0.0256 /GB-mo
fx_buffer ×1.35                             $0.0345 /GB-mo
margin ×1.5                                 $0.0518 /GB-mo
margin ×1.75                                $0.0604 /GB-mo  ← ship at $0.06
```

**Headline storage price: $0.06/GB-month** (raised from $0.05 in v2 to give a real 75% gross margin against the fully-loaded cost basis).

### 4.3 Class A (PUT) meter cost floor

Per PUT:

```
walrus_write_fee     = encoded_MiB × 20k FROST × WAL/USD
register_sui_gas     ≈ 0.01 SUI × SUI/USD ≈ $0.04
gateway_compute      ≈ $0.0001 per request
indexer_write        ≈ $0.0001 per request
```

For a 1 MiB blob at current WAL price: write fee ≈ $0.0017. So per-PUT cost ≈ **$0.042**. With 35% FX buffer + margin, we'd need ~$0.08/PUT to fully cover — but that's competitively absurd (AWS is $0.005/PUT).

**Resolution: AWS-style amortisation.** Real-world PUT mixes include large blobs where SUI gas is a tiny fraction of the storage cost we're already billing. The SUI gas per blob is, on average, recovered out of:

- The Class A meter at $5/M ops ≈ $0.005 per PUT
- The 1 MiB minimum billed (every PUT bills at least 1 MiB × $0.06/30 ≈ $0.002/day of storage)
- The 90-day storage minimum on objects that are stored long enough to amortise
- The implicit assumption that average object size is > 1 MiB and average lifetime is > 30 days

Floor check on a realistic workload (avg object 5 MiB, avg lifetime 6 months):

```
per-PUT revenue:
  Class A fee                          $0.005
  Storage on 5 MiB × 6 mo × $0.06/GB-mo $0.0018
                                       -------
                                       $0.0068

per-PUT cost:
  SUI register gas                     $0.04
  Walrus write fee 5 MiB × 20k FROST   $0.0085   (at WAL $0.08)
  Walrus storage 5 MiB × 53 ep upfront $0.026   (recovered in 6 mo × $0.06/GB-mo storage meter revenue)
                                       -------
  non-recoverable per PUT              $0.048

→ negative margin per PUT in this workload
```

**This is a real risk and we need to address it.** Two structural mitigations stack:

1. **PUT minimum size = 1 MiB billed.** A 100-byte PUT still consumes 1 MiB × $0.06/30 ≈ $0.002/day, so over 90-day storage minimum ≈ $0.18 revenue per such PUT. Recovers SUI gas comfortably.
2. **PUT rate-limit on Free tier.** Free band of 100k Class A PUTs gives us 100k × $0.04 SUI = $4,000/mo gas exposure per free user — way too much. Drop Free Class A to **1,000 PUTs/month** and meter the rest. Or require card-on-file for any PUT (Cloudflare R2 does this — free tier 1M Class A but card needed to sign up).

I recommend: **Free Class A = 1,000 PUTs/month, no card required**, then card-on-file to go higher. This caps free-user gas exposure to 1,000 × $0.04 = $40/month per signup — a manageable CAC.

### 4.4 Other meters — quick floor checks

| Meter | Raw cost | × 1.35 FX | × margin | Ship at |
|---|---|---|---|---|
| Class B | ~$0.0001 / op (compute + Walrus read) | — | — | $0.40/M ops (R2-parity) |
| Egress | $0.002 / GB (cloud bandwidth + Walrus fetch) | $0.003 | $0.005 | $0.01/GB |
| Knowledge index | $0.015 / GB-day (Postgres + pgvector storage at scale) | $0.020 | $0.030 | $0.10/GB-day (3× headroom — high margin meter, subsidises storage) |
| Agent message (platform key) | $0.003 / msg (typical RAG-augmented chat with gpt-4o-mini, BYOK gives us cost) | $0.004 | $0.006 | $0.01/msg (1.5× margin — competitive pressure from Chatbase) |

### 4.5 Treasury policy

Three layers, in order of complexity:

**v1 (launch):**

- Maintain **90-day USD-equivalent WAL reserve** — enough to cover 90 days of expected new uploads at peak rate.
- Maintain **30-day SUI reserve** for gas.
- Both sit in dedicated treasury sub-wallets (separate from operational `renewal`, `publisher`, `agent` sub-wallets in `SubWallet`).
- Stripe payouts arrive in USD weekly. A weekly job purchases WAL + SUI on Binance Spot (primary; OTC desk when daily spend > $10k), drips into treasury sub-wallets. Top-up to 90/30-day target.
- **Renewal worker checks treasury balance before each batch** and pauses with a page if it'd drop below 30-day reserve.
- Treasury policy doc lives at [`/docs/treasury-policy.md`](treasury-policy.md) (TODO).

**v2 (≥ $50k MRR):**

- Hedging: perpetual short on WAL on Binance to neutralise treasury holding risk.
- Alternative: lend WAL into a Sui-native lending market for yield while held in reserve.

**v3 (≥ $500k MRR):**

- USD-denominated bulk commitments with Mysten or large storage operators.
- Negotiated WAL OTC desk with a hedge fund counterparty.

### 4.6 Daily cost-floor recompute

Cron at 01:00 UTC:

1. Fetch WAL/USD and SUI/USD prices: **primary** Pyth Network on-chain (Sui native, free reads); **fallback** Switchboard Sui feed; **tertiary** CoinGecko REST. Snapshot all three; if max-min spread > 5% of mid, alert and use the most conservative price for the day's floor.
2. Fetch on-chain `storage_price_per_unit_size` and `write_price_per_unit_size` from Walrus System object (in case governance changes them).
3. Recompute `cost_floor_*` for every meter.
4. Write to `CostFloorSnapshot` (date, meter, oracle_sources_json, walrus_constants_json, cost_floor_usd_micros, fx_buffer_used, customer_price_at_time, headroom_pct).
5. **Alert** if for any meter `customer_price < cost_floor × (1 + fx_buffer)`. Page on-call.
6. **Auto-pause new signups** if headroom drops below 10% for >24h, email founders.

### 4.7 Quarterly price review

```
realised_margin = (sum(customer_revenue) − sum(realised_usd_cost)) / sum(customer_revenue)
```

Per meter. If realised margin < 25%, raise prices on **new signups only** (grandfather existing). If > 60%, consider lowering (after 2 consecutive quarters to avoid yo-yo). Logged in [`/docs/decisions.md`](decisions.md). Price changes at most twice a year, never mid-quarter.

### 4.8 Edge-case guardrails

- **Walrus governance changes `storage_price_per_unit_size`.** Our daily cron picks it up; cost-floor recompute fires; if it pushes margin below 25%, we raise customer price on new signups within 30 days. Grandfather existing.
- **WAL/USD peg breaks** (storage-node consensus failure, etc.). 90-day reserve rides it out. If break persists, "Walrus surcharge" line item on invoices with 30-day notice.
- **SUI 10× pumps in a day.** SUI gas top-ups paused for 6h; human-approve. Renewal worker keeps running on existing SUI float.
- **Customer uploads 100 TB in a day.** Walrus storage commitment for that customer = $57k upfront. **Per-project upload rate limit**: 1 TB/day for non-Team accounts, 10 TB/day for Team, custom for Enterprise. Blocks single-day catastrophic exposure.
- **Customer deletes 100 TB on Day 2.** 90-day minimum recovers ~$540 (vs $57k cost) — large loss. Combined with the 1 TB/day rate limit, max single-day exposure is ~$570 in WAL committed × 30 days = $17k for a worst-case "upload + immediate delete" abuser. Recoverable from the user's card (Stripe Radar block on chargeback; collect on the invoice).
- **Stripe payout delayed.** Treasury has 90 days of reserve; ride through.

---

## 5. Monetization plan — pay-as-you-go

### 5.1 Philosophy

- **No plans, no minimums, no seats.** Sign up free, add a card when you want to exceed the free band, get billed on the first of the month for what you used. DigitalOcean / Cloudflare R2 / AWS shape.
- **Small price surface.** Six numbers. A customer should be able to do mental math on a back-of-envelope ("100 GB × $0.06 = $6") without a calculator. Reject any pricing that needs a spreadsheet.
- **Dollar-denominated everywhere.** No credits, no tokens, no internal currency. The dashboard shows dollars. The invoice shows dollars. The cap is in dollars.
- **Free band for trial.** Tier-1-at-$0 band per meter. No separate "Free plan" — just the same usage-based bill that happens to total $0 at low usage.
- **BYOK for LLMs.** We track OpenAI tokens but never bill them.
- **Spend caps + projection are first-class.** Vercel-class hard caps and projected end-of-period bills, visible from the dashboard root.

### 5.2 Price list

All prices in USD. Each is a graduated Stripe Price; tier 1 is the free band.

| Meter | Free band | Standard rate | Notes |
|---|---|---|---|
| **Storage** | 10 GB-month | **$0.06 / GB-month** | Walrus storage + 53-epoch upfront commitment + renewal. **Bills 1 MiB minimum per object. Bills 90-day minimum storage duration per object** (delete sooner, still pay the tail). |
| **Gateway Class A** (PUT, POST, LIST, DELETE) | 1,000 ops/mo | **$5.00 / 1,000,000 ops** | Bundles SUI gas + Walrus write fee per upload. Free band intentionally tight: each PUT costs us $0.04 in SUI gas. |
| **Gateway Class B** (GET, HEAD) | 1,000,000 ops/mo | **$0.40 / 1,000,000 ops** | Matches Cloudflare R2 ($0.36/1M). |
| **Gateway egress** | 50 GB/mo | **$0.01 / GB** | Walrus fetch + edge bandwidth. Well below AWS ($0.09). |
| **Knowledge index** | 1 GB-day | **$0.10 / GB-day** | Pgvector + tsvector. Half OpenAI Assistants ($0.20/GB-day). |
| **Agent message (platform key)** | 100 msg/mo | **$0.01 / message** | Only when user uses Kraterion's OpenAI pool. BYOK = $0 + tracked. |

That's it. Six numbers plus two structural rules (1 MiB minimum object size, 90-day minimum duration).

Add-ons (orthogonal, optional):

| Add-on | Price | What it includes |
|---|---|---|
| **Team** | $49 / project / month | SSO (SAML/OIDC), audit-log export, support SLA (business hours, 8h response), shared spend dashboard, Slack webhook for alerts, custom domain for share-token widgets, 10 TB/day upload rate limit |
| **Reranker** | $0.005 / query (when P2 ships) | Cohere Rerank 3.5 over hybrid retrieval; opt-in per agent |
| **Enterprise** | Custom | Annual commit pricing, dedicated indexer SLA, custom Move policies, private Seal key servers, BAA / SOC 2 evidence, NET-30 invoicing, custom upload rate limits |

### 5.3 Worked examples

So a customer can sanity-check the model.

**Example A — Solo developer, 50 GB of docs (avg file 2 MiB), 1 agent, 2k messages/mo on their own OpenAI key, 6-month average retention:**

| Line | Calc | $ |
|---|---|---|
| Storage | (50 − 10) GB × $0.06 | $2.40 |
| Class A | 25k PUTs over the month × $5/M (above 1k free) | $0.12 |
| Class B | 200k ops (under free band) | $0.00 |
| Egress | 8 GB (under free band) | $0.00 |
| Knowledge index | (3 − 1) GB × 30 days × $0.10 | $6.00 |
| Agent messages | 2,000 on BYOK | $0.00 (tracked, not billed) |
| **Total Kraterion bill** | | **$8.52 / mo** |
| OpenAI (separate, billed by OpenAI) | tracked in dashboard | ~$3–6 / mo |

**Example B — Small team, 1 TB stored (avg file 8 MiB), 5 agents, 50k messages on platform key, public widget traffic:**

| Line | Calc | $ |
|---|---|---|
| Storage | (1024 − 10) GB × $0.06 | $60.84 |
| Class A | 800k ops × $5/M | $4.00 |
| Class B | 12M ops × $0.40/M | $4.40 |
| Egress | 200 GB × $0.01 | $2.00 |
| Knowledge index | (40 − 1) GB × 30 × $0.10 | $117.00 |
| Agent messages | (50,000 − 100) × $0.01 | $499.00 |
| Team add-on | flat | $49.00 |
| **Total** | | **~$736 / mo** |

**Example C — Heavy production, 10 TB stored, BYOK only, 5M widget messages/mo:**

| Line | Calc | $ |
|---|---|---|
| Storage | (10240 − 10) GB × $0.06 | $613.80 |
| Class A | 20M ops × $5/M | $99.50 |
| Class B | 500M ops × $0.40/M | $199.60 |
| Egress | 4 TB × $0.01 | $40.96 |
| Knowledge index | (500 − 1) GB × 30 × $0.10 | $1,497.00 |
| Agent messages | BYOK | $0.00 |
| Team add-on | | $49.00 |
| **Total** | | **~$2,500 / mo** |

**Example D — Small-file workload (the cautionary case), 200,000 files × 100 KB each = 20 GB raw:**

Without 1 MiB minimum, naive billing: 20 GB × $0.06 = $1.20/mo. **Our actual Walrus cost: 200,000 × 1 MiB × $0.023/GB-mo ≈ $4.69/mo.** We lose $3.49/mo per such customer.

With 1 MiB minimum: 200,000 files × 1 MiB × $0.06/GB-mo = **$11.72/mo**. Now we make $7/mo margin. If we deploy Quilt (v2), our true cost drops back toward $1.20/mo and the customer is still paying $11.72 — margin expansion without a price change.

### 5.4 Competitive positioning

- **Storage $0.06/GB-mo + 1 MiB minimum + 90-day minimum duration**: above R2 ($0.015), above S3 Standard ($0.023), in line with S3-IA effective rate including minimums ($0.0125 + 30-day min + 128 KiB min), justified by on-chain ownership, Seal envelope encryption, integrated knowledge/agent layer, S3 wire-compatibility. The structural minimums match S3-IA/Glacier conventions and are easy to explain.
- **Class A $5/M** matches AWS S3 ($5/M PUT); justified by per-PUT SUI gas reality.
- **Class B $0.40/M** matches R2 ($0.36/M GET). No surprises.
- **Egress $0.01/GB** is well below AWS ($0.09), in line with B2 / Storj.
- **Knowledge index $0.10/GB-day** is half OpenAI Assistants vector-store ($0.20/GB-day). Aggressive entry-point; we own the pgvector infra.
- **Agent messages $0.01/msg** matches Chatbase credits; above pure passthrough; below Voiceflow. BYOK is the escape valve.
- **Versus Tusky** (the only other commercial Walrus front-end): they advertise $1.49/50 GB ≈ $0.030/GB-mo annual, which is **below their actual Walrus cost** of $0.023 + gas + ops. They're either subsidising or counting on customers not filling their quota. We are not chasing them down — our price is defensible.

### 5.5 Free signup, gated billing

- Sign up free with Enoki zkLogin. Project gets `BillingAccount` row with no Stripe customer yet.
- Usage accrues in Postgres (real-time meters). Dashboard shows running total at $0.00 within free bands.
- When user is **about to cross any free band**, dashboard prompts "Add a payment method to keep using Kraterion past free limits."
- If they don't, hard caps engage at exact free band edges (uploads 507, messages 402, etc.).
- Adding a card creates the Stripe Customer + Subscription with all metered items. Usage above the free band bills in real time.
- Class A free band (1k PUTs/mo) is deliberately tight — each PUT costs us $0.04 in SUI gas, so 1k free PUTs = $40/mo CAC per signup, an acceptable upper bound on free-tier abuse.

---

## 6. Stripe integration

### 6.1 Products used

- **Stripe Billing** — subscriptions, prices, invoices
- **Stripe Checkout** — payment-method capture (no subscription product chosen; just card-on-file)
- **Customer Portal** — update card, view invoices, set tax info
- **Stripe Tax** — automatic tax (0.5% of transactions)
- **Stripe Meters** (post-2024) — usage events
- **Stripe Invoicing** — Enterprise only

Not using: `subscription_items.usage_records` (deprecated), Stripe Connect, Treasury, Issuing.

### 6.2 Subscription shape

Every paying project has **one subscription** with **all-metered items, no licensed seat item**:

```
sub_xxx (status: active, $0 base)
├── si_storage      → price_storage      (metered, graduated: 10GB free, then $0.06/GB-mo)
├── si_class_a      → price_class_a      (metered, graduated: 1k free, then $5/M)
├── si_class_b      → price_class_b      (metered, graduated: 1M free, then $0.40/M)
├── si_egress       → price_egress       (metered, graduated: 50GB free, then $0.01/GB)
├── si_kb_index     → price_kb_index     (metered, graduated: 1GB-day free, then $0.10/GB-day)
└── si_messages     → price_messages     (metered, graduated: 100 free, then $0.01/msg)

Optional add-on item (if customer enabled Team):
└── si_team         → price_team         (licensed, $49/mo flat)
```

No seat item. No plan. The subscription is a container for the meters.

### 6.3 Product / Price catalog (Stripe seed)

A single committed, idempotent seed script at `infra/stripe/seed.ts`:

```ts
const products = {
  storage:    'prod_storage',
  class_a:    'prod_gateway_class_a',
  class_b:    'prod_gateway_class_b',
  egress:     'prod_gateway_egress',
  kb_index:   'prod_knowledge_index',
  messages:   'prod_agent_messages',
  team:       'prod_team_addon',
};

await stripe.prices.create({
  product: products.storage,
  currency: 'usd',
  nickname: 'storage_v1',
  lookup_key: 'storage_v1',
  billing_scheme: 'tiered',
  tiers_mode: 'graduated',
  recurring: { interval: 'month', usage_type: 'metered', meter: meters.storage },
  tiers: [
    { up_to: 10, unit_amount_decimal: '0' },        // 10 GB-mo free
    { up_to: 'inf', unit_amount_decimal: '6' },     // $0.06/GB-mo = 6 cents
  ],
});
```

Versioning: prices are immutable. To change pricing, create `storage_v2`, migrate new signups, grandfather existing.

### 6.4 Data model

New Prisma models (additions to `prisma/schema.prisma`):

```prisma
model BillingAccount {
  id                        String   @id @default(cuid())
  project_id                String   @unique
  stripe_customer_id        String?  @unique
  status                    BillingStatus @default(active)
  default_payment_method    String?
  has_payment_method        Boolean  @default(false)
  invoice_email             String?
  tax_id                    String?
  country                   String?
  hard_spend_cap_usd_cents  Int?
  soft_alert_thresholds     Int[]    @default([50, 80, 100])
  team_addon_enabled        Boolean  @default(false)
  upload_rate_limit_gb_per_day Int   @default(1024)  // 1 TB default, raised on Team
  created_at                DateTime @default(now())
  updated_at                DateTime @updatedAt
  project                   Project  @relation(fields: [project_id], references: [id])
  subscriptions             Subscription[]
}

model Subscription {
  id                        String   @id @default(cuid())
  billing_account_id        String
  stripe_subscription_id    String   @unique
  status                    String
  current_period_start      DateTime
  current_period_end        DateTime
  cancel_at_period_end      Boolean  @default(false)
  metadata                  Json?
  billing_account           BillingAccount @relation(fields: [billing_account_id], references: [id])
  created_at                DateTime @default(now())
  updated_at                DateTime @updatedAt
}

model MeterEvent {
  id            String   @id @default(cuid())
  project_id    String
  meter_name    String
  value         BigInt
  identifier    String   @unique
  occurred_at   DateTime
  sent_at       DateTime?
  stripe_status MeterEventStatus @default(pending)
  attempt_count Int      @default(0)
  last_error    String?
  payload       Json?
  @@index([project_id, meter_name, occurred_at])
  @@index([stripe_status, occurred_at])
}

model UsageDaily {
  id                  String   @id @default(cuid())
  project_id          String
  day                 String
  meter_name          String
  value               BigInt
  cost_usd_micros     BigInt   @default(0)
  @@unique([project_id, day, meter_name])
  @@index([project_id, day])
}

model BYOKDailySpend {
  id              String   @id @default(cuid())
  project_id      String
  day             String
  model           String
  input_tokens    BigInt   @default(0)
  output_tokens   BigInt   @default(0)
  cost_usd_micros BigInt   @default(0)
  @@unique([project_id, day, model])
}

model InvoiceSnapshot {
  id                  String   @id @default(cuid())
  stripe_invoice_id   String   @unique
  project_id          String
  status              String
  total_usd_cents     Int
  period_start        DateTime
  period_end          DateTime
  pdf_url             String?
  hosted_invoice_url  String?
  created_at          DateTime @default(now())
}

model StripeWebhookEvent {
  id            String   @id
  type          String
  received_at   DateTime @default(now())
  processed_at  DateTime?
  attempt_count Int      @default(0)
  payload       Json
  last_error    String?
  @@index([type, received_at])
}

model CostFloorSnapshot {
  id                          String   @id @default(cuid())
  day                         String
  meter_name                  String
  wal_usd_micros              BigInt
  sui_usd_micros              BigInt
  walrus_storage_price_frost  BigInt
  walrus_write_price_frost    BigInt
  oracle_sources              Json
  cost_floor_usd_micros       BigInt
  fx_buffer_bps               Int
  customer_price_usd_micros   BigInt
  headroom_pct                Decimal
  alert_fired                 Boolean  @default(false)
  @@unique([day, meter_name])
  @@index([day])
}

model StorageBillingTail {
  // Phantom rows for deleted objects still inside 90-day min-duration window
  id                  String   @id @default(cuid())
  project_id          String
  object_id           String                                // S3Object.id (object may be deleted)
  billed_size_bytes   BigInt                                // max(actual_size, 1 MiB)
  upload_date         DateTime
  delete_date         DateTime
  min_bill_until_date DateTime                              // upload_date + 90 days
  @@index([project_id, min_bill_until_date])
}
```

Existing tables — add columns:

- `AgentInvocation` → `cost_usd_micros BigInt @default(0)`, `cost_price_version String?`, `key_source String` (`'platform' | 'byok'`)
- `KnowledgeManifest` → `cost_usd_micros BigInt @default(0)`, `cost_price_version String?`
- `Project` → `billing_account_id String? @unique`, `current_seat_count Int @default(1)`
- `S3Object` → `billed_size_bytes BigInt` (= `max(size_bytes, 1 MiB)`, set at insert; the column the storage meter reads, not the raw size)

### 6.5 Sign-up & payment-method flow

```
1. User signs up via Enoki zkLogin → Project + BillingAccount created (no Stripe yet)
2. User uses Kraterion within free bands → no Stripe activity, dashboard shows $0
3. User about to cross a free band:
     - Dashboard banner: "Add a payment method to keep going past free limits."
     - Click → server creates Stripe Customer + SetupIntent
     - Stripe Checkout in 'setup' mode collects card
4. checkout.session.completed webhook:
     - Save stripe_customer_id, default_payment_method, has_payment_method=true
     - Create Subscription with all six metered items
     - Invalidate entitlements cache → free band caps lift
5. User keeps using → meter events flow to Stripe in real time
6. End of month: Stripe finalises invoice, charges card, fires invoice.paid
7. We snapshot invoice to InvoiceSnapshot, email receipt
```

If a user wants the Team add-on, dashboard toggles it on → server adds `si_team` subscription item with `proration_behavior: 'create_prorations'`. Same flow off.

### 6.6 Webhooks

Single endpoint `POST /webhooks/stripe` on control-plane. Raw-body signature verification (Fastify body parser exception). Idempotent processing via `StripeWebhookEvent.id` primary key. Async handoff to BullMQ worker (return 200 within 30s).

| Event | Action |
|---|---|
| `checkout.session.completed` | Save card, create Subscription, lift free caps |
| `customer.subscription.created` | Idempotent upsert |
| `customer.subscription.updated` | Sync status, team-addon, period |
| `customer.subscription.deleted` | Mark canceled; project falls back to free-band-only mode; renewal worker keeps renewing existing blobs until their 53-epoch windows expire naturally |
| `invoice.created` / `invoice.finalized` | Snapshot |
| `invoice.paid` | Snapshot, receipt email, reset month counters |
| `invoice.payment_failed` | Dunning banner + email; after 3 days, restrict heavy ops; after 60 days, renewal worker stops renewing this project's blobs |
| `invoice.upcoming` | Optional "you'll be billed $X in 3 days" email if total > $50 |
| `customer.updated` | Sync invoice_email, tax_id |
| `payment_method.attached` / `payment_method.detached` | Sync default_payment_method |
| `billing.meter.error_report_triggered` | Page on-call |

### 6.7 Price migrations

Stripe Prices are immutable. To change pricing:

1. `infra/stripe/seed.ts` creates `storage_v2` Price, marks `storage_v1` archived.
2. New subscriptions use v2. Existing subs stay on v1 (grandfathered).
3. Dashboard banner for grandfathered users.
4. Forced migration only if v1 is loss-making per §4.7 quarterly review, with 60 days' notice.

### 6.8 Customer Portal

Configured via `infra/stripe/portal-config.ts`. Out of the box: update card, view invoices, update tax info, cancel subscription.

What we build on top: usage dashboard, hard spend cap setting, BYOK display panel, Team add-on toggle, upload rate-limit setting, downgrade-with-warning flow.

### 6.9 Tax

Enable Stripe Tax (`automatic_tax: { enabled: true }`) at launch. 0.5% of transactions. Collects VAT/GST/sales-tax across 50+ jurisdictions.

### 6.10 Security

- Stripe secret key in control-plane env only; restricted-key per service if we split webhook ingestion
- Webhook secret in env, rotated yearly
- PCI scope: SAQ A (lowest) — no card data ever touches our infra
- Idempotency keys on all mutating Stripe API calls: `${operation}:${project_id}:${period_bucket}`

---

## 7. Usage tracking architecture

### 7.1 Canonical meter list

| Meter | Unit | Aggregation | Source | Emit cadence | Billed |
|---|---|---|---|---|---|
| `storage_byte_seconds` | byte·second | sum | `S3Object.billed_size_bytes` × time + active `StorageBillingTail` rows | Hourly rollup | Yes |
| `gateway_class_a` | ops | sum | `UsageEvent` (PUT/POST/LIST/DELETE) | Per request, stream batched | Yes |
| `gateway_class_b` | ops | sum | `UsageEvent` (GET/HEAD) | Per request, stream batched | Yes |
| `gateway_egress_bytes` | byte | sum | `UsageEvent.bytes_out` | Per request, stream batched | Yes |
| `kb_index_byte_seconds` | byte·second | sum | `KnowledgeChunk` × time | Hourly rollup | Yes |
| `agent_messages` | message | sum | `AgentInvocation` (status='completed', key_source='platform') | Per chat | Yes |
| `byok_input_tokens` | token | sum | `AgentInvocation.prompt_tokens` (BYOK) | Per chat | **No — display only** |
| `byok_output_tokens` | token | sum | `AgentInvocation.completion_tokens` (BYOK) | Per chat | **No — display only** |
| `byok_embedding_tokens` | token | sum | `KnowledgeManifest.embedding_tokens` | Worker on indexing | **No — display only** |

Storage uses `byte_seconds` (continuous integral). The storage rollup reads two sources:

- Active objects: `SUM(billed_size_bytes × seconds_alive_in_hour)` from `S3Object` WHERE `status='active'`
- Tail objects (in 90-day min-duration window after delete): `SUM(billed_size_bytes × seconds_in_hour)` from `StorageBillingTail` WHERE `min_bill_until_date > now()`

### 7.2 Double-write source-of-truth

Postgres is authoritative for product UX, history, alerts, reconciliation. Stripe Meters is authoritative for billing. Every meter event is written to Postgres first, enqueued in BullMQ, then flushed to Stripe with the row ID as the deterministic identifier.

### 7.3 Emit pipeline

Three speeds:

- **Stream endpoint** for gateway PUT/GET/HEAD/DELETE/LIST and egress. Batched 1k events / 5s, via `POST /v1/billing/meter_event_stream`.
- **Standard endpoint** for agent chat, MCP tool calls. Single event per emit.
- **Hourly rollups** for storage byte-seconds and index byte-seconds.

Deterministic identifiers:

- Per-request: `identifier = "${meter}:${request_log_id}"`
- Per-invocation: `identifier = "${meter}:${agent_invocation_id}"`
- Hourly rollup: `identifier = "${meter}:${project_id}:${hour_iso}"`

24-hour Stripe dedupe window. Retries within 24h are safe; beyond 24h, dead-letter.

### 7.4 BYOK tracking

OpenAI tokens via BYOK tracked in three places:

1. Per-invocation rows — `AgentInvocation` + `cost_usd_micros`, `cost_price_version`
2. Per-manifest rows — `KnowledgeManifest` + same fields
3. Daily rollup — `BYOKDailySpend` per (project, day, model)

Cost imputation uses catalog price **at moment of call** (immune to OpenAI repricing).

### 7.5 Entitlements & quota enforcement

Two layers:

1. **In-request soft check** (Redis-cached, 60s TTL): "is project over hard cap?" If yes, 402 / 429 / 507 with `X-Kraterion-Reason: spend_cap`.
2. **Hourly recompute**: pulls `UsageDaily` for current period, compares to free-band edges + hard cap + upload rate limit, writes to cache.

Hard cap behaviour per surface:

| Surface | Over hard cap | Effect |
|---|---|---|
| Storage | 507 on PUT | Existing blobs unaffected; uploads stop. **Never evict.** |
| Class A | 429 | Writes blocked |
| Class B | 429 | Reads blocked |
| Egress | 429 on GET | Reads blocked at edge |
| Upload rate limit | 429 on PUT (rate-limit specific) | Blocks burst; resets daily |
| Agent (platform) | 402, falls back to BYOK if configured | |
| Knowledge index | Pause embedding queue, alert | Existing index unaffected |

**Walrus blobs are never evicted on cap breach.** Uploads stop; existing data stays; renewal continues until 60 days past-due, then renewal stops and blobs expire on their natural 53-epoch window.

### 7.6 Reconciliation

Nightly cron at 02:00 UTC:

1. For each (project, meter, day-1): sum `MeterEvent.value` WHERE `stripe_status='sent'` vs `MeterEventSummary` from Stripe
2. Drift > 0.1%: log `BillingDriftAlert`, page on-call
3. Drift > 1%: kill-switch new emits for that meter

Plus a **separate cost reconciliation** at 03:00 UTC:

1. Sum WAL spent (read from `SubWalletLedger`, new table tracking on-chain spends) per project per day
2. Convert at the day's WAL/USD oracle snapshot
3. Sum SUI gas same way
4. Compare to revenue recognised (from `UsageDaily.cost_usd_micros`)
5. Per-project margin tracked daily; alerts on any project running > 1 week of negative margin

---

## 8. User-facing surfaces

### 8.1 Pricing page (`apps/landing/pricing`)

Single table, six rows. Headline:

> **Pay for what you use. No plans, no minimums in the marketing sense.**
> **Two structural rules:** stored objects bill for at least 1 MiB and at least 90 days, because Walrus's on-chain economics require it. Worked examples below.

Then six rows, free bands, prices, and a clearly-labelled "Why minimums?" expandable that links to a short explainer (1 MiB = Walrus's minimum unit; 90 days = we pay your storage 2 years upfront in WAL and need a window to recoup). Calculator at bottom.

Sentence case, no shadows, no gradients, no font weight ≥ 600 per [`/design-system/`](../design-system/).

### 8.2 Dashboard `/settings/billing`

Single screen. Panels:

- **Current period** — running total in dollars, projected end-of-period, days remaining
- **Payment method** — last 4, "update" → portal
- **Spend cap** — slider, saved to `BillingAccount.hard_spend_cap_usd_cents`
- **Upload rate limit** — read-only on Free (1 TB/day), configurable on Team (up to 10 TB/day)
- **Alerts** — 50/80/100% + email + Slack webhook
- **Team add-on** — toggle
- **Invoices** — table from `InvoiceSnapshot`
- **Tax info** — link to portal

### 8.3 Dashboard `/usage`

Transparency flagship. Layout:

- **This period summary**: total Kraterion bill + projected end-of-period; separate OpenAI BYOK figure
- **Per-meter cards** (grid of 6): used / free_band bar, dollar value, daily sparkline
- **Per-object minimums callout**: when applicable, show "$X.XX of your storage bill comes from objects under 1 MiB billed at the 1 MiB minimum" and "$Y.YY from objects deleted but still in 90-day min-duration window" — full transparency about the structural rules
- **BYOK section**: model breakdown, tokens × price snapshot, daily chart
- **Drill-downs**: per-agent, per-bucket, per-share-token
- **Export CSV**
- **Footer**: cost-floor headroom indicator ("Our cost basis today: $0.035/GB-mo; you pay $0.06") — optional trust-builder

### 8.4 In-app alerts

- Banner at 50/80/100% thresholds
- Banner on payment failing
- Banner when about to cross free band
- Banner over hard cap
- Banner on upload rate-limit hit
- Email + optional Slack webhook at thresholds

---

## 9. Implementation phases

Post-hackathon. None ships before Sui Overflow submission.

### Phase B0 — foundation (2 weeks)
- Prisma model additions including `StorageBillingTail`, `SubWalletLedger`, `CostFloorSnapshot`
- `S3Object.billed_size_bytes` column set at upload time = `max(actual, 1 MiB)`
- Pin Walrus constants in `packages/shared/src/walrus-constants.ts` from live `walrus info`
- Token-cost imputation on `AgentInvocation` + `KnowledgeManifest`
- Daily rollup workers
- Stripe seed + portal config scripts
- Cost-floor recompute cron with Pyth/Switchboard/CoinGecko fallback chain

### Phase B1 — renewal worker hardening (2 weeks)
- Implement 53-epoch-upfront register at upload (gateway change)
- Build batched-PTB renewal worker at `apps/worker/src/renewal/` (cron-scheduled)
- Treasury balance check before each batch
- `StorageBillingTail` row insertion on DELETE
- Hourly storage rollup includes both `S3Object` and `StorageBillingTail`

### Phase B2 — read-only usage dashboard (1 week)
- `/usage` route with per-meter cards
- BYOK section live
- Per-object-minimums callout
- No Stripe writes yet — pure observability

### Phase B3 — Stripe wiring (2 weeks)
- Webhook endpoint, idempotent handler, BullMQ worker
- Setup-mode Checkout
- Subscription creation on card-attach
- Customer Portal launch
- Meter emit pipeline (stream, standard, hourly)
- Reconciliation crons (billing drift + cost margin)

### Phase B4 — caps & enforcement (1 week)
- Hard cap & free-band enforcement at gateway/chat/indexing
- Upload rate limit at gateway
- Spend cap UI
- Soft alert emails + Slack
- Dashboard banners

### Phase B5 — Team add-on + SSO (2 weeks)
- Team toggle
- SAML/OIDC (WorkOS or BoxyHQ)
- Audit log export endpoint
- Shared dashboard view

### Phase B6 — treasury automation (1 week)
- Weekly Stripe-payout → Binance Spot WAL/SUI purchase job
- Sub-wallet replenishment automation
- Treasury alerts and dashboards

### Phase B7 — Enterprise rails (1 week)
- HubSpot/Pipedrive pipeline
- Stripe Invoicing flow
- Annual prepay + committed-spend discounts
- BAA / SOC 2 evidence

### Phase B8 — Quilt small-file optimisation (1 week, post-launch)
- Detect objects under 64 KiB at upload
- Buffer and batch via Quilt every 5 minutes
- Margin expansion without price change

### Phase B9 — polish (ongoing)
- Pricing page + calculator
- Marketing site
- Cost-floor transparency footer
- Quarterly price review automation

**Total ballpark: 13–15 weeks of one full-time engineer to ship the whole system.** Phase B2 (read-only dashboard) is the highest-ROI first user-visible ship.

---

## 10. Open questions

1. **Free band sizing on Class A.** 1k PUTs/mo feels tight but caps free-tier gas exposure to $40/signup. Alternative: card-on-file required to PUT at all (R2 model). Need to test funnel impact.
2. **Quilt deployment urgency.** If early customers are small-file-heavy (NFT metadata, IoT samples), Quilt becomes Phase B0 not B8. Need usage telemetry post-launch.
3. **Annual prepay discount.** Pay-as-you-go doesn't naturally offer annual. For Team and Enterprise, prepaid USD credits with 10–15% discount (Cloudflare-style). Defer to B7.
4. **Walrus governance changes.** If `storage_price_per_unit_size` doubles overnight, we need policy: absorb up to 30 days, then customer surcharge with 30-day notice. Codify in [`/docs/decisions.md`](decisions.md).
5. **SharedBlob vs Blob deletable.** Currently using SharedBlob (cannot be deleted). On gateway DELETE, blob stays alive; we just stop renewing. Alternative: use deletable Blob, recover Storage resource on delete, fuse into a "storage pool" we draw from for new uploads. Reduces WAL upfront cost but adds significant complexity. Defer.
6. **BYOK pricing for tools.** When tool execution triggers metered events (storage/index), don't double-meter. Keep tools "free" as their cost is captured at the data plane.
7. **Refund policy.** No refunds, prorated credits on cancellation. Industry standard.
8. **Per-object pricing transparency.** Should we expose the per-object cost breakdown in S3 HEAD responses (custom header `X-Kraterion-Storage-Cost: $0.00007/day`)? Could be a developer-tools differentiator.
9. **Reranker pricing.** Keep at $0.005/query opt-in; let users see the cost of accuracy.
10. **What if Walrus mainnet pricing changes from $0.023?** Cron alerts when oracle-observed cost > 90% of customer price for 7 consecutive days. Pricing review fires within 30 days.
11. **PUT-rate-limit anti-abuse.** Should be per-project AND per-account (an attacker can spin up many projects). Defer logic until we see real abuse signals.
12. **Quilt and S3-compat semantics.** Quilt batches multiple files into one Walrus blob — but each S3 object still needs an individual addressable identity. Our metadata layer (gateway) handles this transparently; the customer never sees Quilt boundaries. Implementation detail, not contract change.

---

## 11. References

### Walrus (confirmed)
- [Announcing predictable pricing in USD on Walrus](https://blog.walrus.xyz/announcing-predictable-pricing-in-usd-on-walrus/) — $0.023/GB/month USD-pegged
- [Walrus whitepaper / Red Stuff encoding](https://arxiv.org/html/2505.05370v2)
- [MystenLabs/walrus on GitHub](https://github.com/MystenLabs/walrus) — Move source for `system_state_inner.move`, `blob.move`, `shared_blob.move`, `storage_resource.move`, `encoding.move`, `redstuff.move`
- [Quilt batch storage announcement](https://www.walrus.xyz/blog/introducing-quilt) — 106×–420× cost reduction for small files
- [Walrus cost calculator (official)](https://costcalculator.wal.app/)

### Mainnet Walrus constants (pin these in code)
- `storage_price_per_unit_size`: **100,000 FROST / MiB / epoch**
- `write_price_per_unit_size`: **20,000 FROST / MiB**
- `BYTES_PER_UNIT_SIZE`: **1,048,576 (1 MiB)**
- Epoch length: **14 days mainnet, 1 day testnet**
- `max_epochs_ahead`: **53 mainnet**
- 1 WAL = 10⁹ FROST

### Industry comparables
- AWS S3: $0.023/GB-mo Standard, $0.005/1k Class A, $0.0004/1k Class B, $0.09/GB egress
- AWS S3-IA: 128 KiB min object, 30-day min duration, $0.0125/GB-mo
- AWS Glacier: 40 KiB min object, 90-day or 180-day min duration
- Cloudflare R2: $0.015/GB-mo, $4.50/M Class A, $0.36/M Class B, zero egress
- Backblaze B2: $0.006/GB-mo, $0.01/GB egress (free up to 3× storage)
- DigitalOcean Spaces: $5/mo base for 250 GB + 1 TB transfer, $0.02/GB-mo overage
- OpenAI Assistants vector store: $0.20/GB-day
- Tusky (Walrus front-end): $1.49/50 GB ≈ $0.030/GB-mo annual — below their own cost; not a sustainable benchmark

### Stripe
- Meters API: 1k events/sec standard, 10k events/sec stream, 24h identifier dedupe
- Stripe Tax: 0.5% of transactions

### Oracles
- Pyth Network (Sui native): WAL/SUI USD feeds, on-chain, free reads
- Switchboard (Sui native): secondary
- CoinGecko REST: tertiary fallback

Numbers accurate as of 2026-05-15. Re-confirm against live `walrus info` and oracle prices before publishing or pricing on mainnet.
