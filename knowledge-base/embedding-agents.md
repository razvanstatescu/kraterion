# Embedding Agents (share tokens & website widget)

Put an agent on **your own website** without exposing your account credentials. A
**share token** is a separate, narrowly-scoped key you can safely put in
client-side code, and a single script tag renders a chat widget.

## Share tokens

Mint a share token for an agent. The token (`kr_share_…`) is shown **once**. It
only works for **that one agent**, only from the **origins you allow**, and only
within its **daily caps**.

```bash
curl -X POST https://api.kraterion.com/v1/agents/<agent_id>/share-tokens \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "marketing-site",
    "allowed_origins": ["https://example.com"],
    "max_requests_per_day": 1000,
    "max_spend_usd_per_day": 5,
    "cite_sources": true
  }'
```

A share token is much weaker than a `kr_live_` bearer token by design — it can
only invoke the one agent it was minted for, so a leaked embed token can't touch
the rest of your account.

## Origin allowlist

Every request is checked against `allowed_origins` using the browser's `Origin`
header. List the **exact origins** (`https://host`) where the widget is allowed to
run; calls from anywhere else are **refused**. This is what keeps a leaked embed
token from being usable on a different site.

## Daily caps

Two limits bound exposure:

- `max_requests_per_day` (default **1000**)
- `max_spend_usd_per_day` (default **5**)

When either is reached, the agent **stops answering through that token** until the
next day. Adjust a token with `PATCH /v1/share-tokens/:id`, or kill it with
`POST /v1/share-tokens/:id/revoke`.

## Script tag

Drop the token into a single script tag on your page to render the chat widget:

```html
<script
  src="https://app.kraterion.com/embed.js"
  data-token="kr_share_..."
  async
></script>
```

## Citing sources

With `cite_sources` on (the default), embedded answers **show where they came
from**, using the same citation data the agent produces from knowledge manifests.
Turn it off for a plain conversational widget.

## Billing note

Bytes served through embed-widget share tokens are billed on the **Public-link
egress** meter — `$0.01/GB`, from the first byte, separate from your monthly
50 GB egress free band. Agent chat completions themselves run on your own model
key (BYOK), so Kraterion bills $0 for the model call. See [pricing.md](pricing.md).

## Common questions

**Is it safe to put the token in front-end code?** Yes — that's the point. A share
token is origin-locked, agent-scoped, and capped. Still, treat it like a public
key: anyone can read it, but it only works from your allowed origins and within
its caps.

**Can one token serve multiple agents?** No — a share token is minted for exactly
one agent.

**How do I shut down an embed immediately?** Revoke the share token
(`POST /v1/share-tokens/:id/revoke`); it stops working right away.
