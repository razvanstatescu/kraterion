# Agent Memory & Sessions

An agent can **remember facts across conversations**, and its activity is grouped
into **sessions** that are anchored on-chain — so a run can be pointed to and
verified later.

## Memory tools

Enable the `memory_remember` and `memory_recall` tools to give the agent a
**private memory namespace**. The model decides when to save something worth
keeping and when to look it back up; each agent's memory is **its own**, scoped to
that agent.

```json
{
  "name": "support-bot",
  "system_prompt": "Help customers. Remember preferences they tell you.",
  "model": "gpt-4o-mini",
  "bucket_ids": ["<bucket_id>"],
  "tools": ["kraterion_search", "memory_remember", "memory_recall"]
}
```

Memory is durable storage the agent writes to and reads from over time — useful
for remembering a user's preferences, prior decisions, or context that should
carry between separate conversations.

## Sessions

When an agent has at least one attached bucket, its invocations are grouped into a
**session**. List them to see when a session opened, how many invocations it
holds, and its current status:

```bash
curl https://api.kraterion.com/v1/agents/<agent_id>/sessions \
  -H "Authorization: Bearer kr_live_..."
# → [{ id, status, opened_at, last_activity_at,
#       invocation_count, tx_digest, ... }]
```

## On-chain anchoring

A session **flushes when it goes idle** and anchors its state on-chain, producing
a transaction digest (`tx_digest`). That digest is a **durable,
third-party-verifiable handle** to what the agent did during the session — not
just a row in Kraterion's database. You can also end a session explicitly with
`POST /v1/agents/:id/sessions/:sessionId/end`.

## Replay

Because a session carries the **model**, the **retrieved chunks** (by content
hash), and the **tool calls** it made, its record is enough to **reconstruct what
happened** and why an answer came out the way it did. The `tx_digest` is the
anchor you reference when you need to point at a specific run.

This is what makes Kraterion agents auditable: a run isn't an opaque API call,
it's a reproducible record tied to an on-chain anchor.

## Common questions

**Is memory shared between agents?** No — each agent has its own private memory
namespace. One agent can't read another's memory.

**What's the difference between memory and knowledge?** Knowledge is a searchable
index over the files in a bucket (your documents). Memory is what an agent chooses
to write down for itself across conversations (facts, preferences, context).

**Why anchor sessions on-chain?** So a specific run can be cited and verified by a
third party later — the `tx_digest` is a tamper-evident handle, independent of
Kraterion's own database.
