# Pricing & Billing

Kraterion is **pure pay-as-you-go**: every billable resource has a **generous
monthly free band** and a **flat per-unit rate** above it. No flat tiers, no
minimums, no cancellation fees, and no cliff jumps when you cross a threshold —
the rate at 1 GB is the same as at 1 TB.

## The meters

Billed per project, per month. Each meter has a free band, then a flat rate:

| Resource | What it measures | Free band | Then |
|---|---|---|---|
| **Storage** | Object bytes stored, averaged over the month | 500 MB / mo | $0.06 / GB-month |
| **Reads** | GET / HEAD / LIST operations on the S3 API | 1M ops / mo | $0.40 / M ops |
| **Writes** | PUT / DELETE operations on the S3 API | 1k ops / mo | $5.00 / M ops |
| **Egress** | Bytes leaving the edge | 50 GB / mo | $0.01 / GB |
| **Knowledge index** | Indexed chunks + vector embeddings, by GB-day | 1 GB-day / mo | $0.10 / GB-day |
| **Agent messages** | Chat completions via your own model key (BYOK) | — | $0 to Kraterion |
| **Public-link egress** | Bytes served through embed-widget share tokens | — (billed from byte 1) | $0.01 / GB |

## Egress: cheap, not free

Egress is **$0.01/GB** with a **50 GB free band** every month — about **9× cheaper
than AWS S3's** standard internet egress ($0.09/GB), and a flat rate above the
free band rather than a tier-curve. You won't get hit by a surprise cliff because
a post sent you traffic.

Why not $0 like Cloudflare R2? R2 cross-subsidizes egress from Cloudflare's CDN
business. Kraterion doesn't have that lever — every read pulls from a distributed
storage network and runs a cryptographic check to unseal the object, both of
which cost real money. $0.01/GB covers the infra cost honestly while staying
roughly an order of magnitude under AWS.

## BYOK for agents

Kraterion runs agent chat completions through **your own model provider** (OpenAI,
Anthropic, etc.) — you bring the key. Kraterion bills you **$0 for the agent call
itself**; you pay your model provider directly at their published per-token rates.
Agent invocations are still tracked in your audit log either way.

## No trial, because you start free

There's no separate trial — every project starts under the free band on every
meter. A static portfolio, docs bucket, or weekend experiment fits inside the free
bands and costs **$0 indefinitely**. A card is only required when usage crosses a
metered threshold.

## Leaving

Run rclone, aws-cli, or any S3 client against your bucket and pull every byte. No
proprietary export, no exit fee on top of standard egress. Your objects are
content-addressed in the underlying Walrus network, so you can even pull them
directly without going through Kraterion at all.

## Common questions

**How is storage measured?** Logical bytes stored, averaged over a billing month.
First 500 MB free. Indexed knowledge chunks are billed separately on the Knowledge
index meter — no double-billing.

**Are there volume discounts / custom regions / educational pricing?** Yes for
education and non-profits (write to hello@kraterion.com from an institutional
email); for volume or custom regions, contact hello@kraterion.com.

**Does the knowledge layer change my storage bill?** Knowledge chunks/vectors are
metered on the Knowledge index meter ($0.10/GB-day, 1 GB-day free), not the
storage meter.

> Rates current as of the testnet preview and subject to change. Always confirm
> live rates on the pricing page at kraterion.com/pricing.
