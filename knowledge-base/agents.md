# Agents

An agent is a **saved configuration you talk to over an OpenAI-compatible API**.
It carries its own instructions, model, the buckets it can see, and the tools it
can call — and its access to your storage is on-chain and revocable.

## What an agent is

Rather than wiring a model, a retrieval pipeline, and a tool layer yourself, you
describe the agent once and Kraterion runs it. On each turn it can **search** the
attached buckets, **read and write** objects, **recall memory**, and answer with
**citations**. The same agent is reachable from your backend, from a website
embed, and from MCP clients.

## Configuration

These are the fields you set when creating or updating an agent:

| Field | Type | Notes |
|---|---|---|
| `name` | string, 1–64 chars | Required. Identifies the agent. |
| `description` | string, ≤ 280 chars | Optional human-readable note. |
| `system_prompt` | string, ≤ 8 KiB | Required. The agent's instructions. Callers cannot override it. |
| `model` | string | The chat model the agent runs, e.g. `gpt-4o-mini`. |
| `temperature` | number, 0–2 | Optional sampling temperature. |
| `max_tokens` | number, ≤ 8192 | Optional cap on completion length. |
| `top_k` | number, 1–32 | How many knowledge chunks to retrieve per turn. |
| `bucket_ids` | string[] (uuid) | Buckets the agent may read, search, and write. |
| `tools` | string[] | Which built-in tools the agent may call. |

Because the caller can't override `system_prompt`, an embedded or shared agent
behaves the way you configured it, no matter what a user types.

## Create an agent

Create agents in the dashboard, or over the API with a bearer token:

```bash
curl -X POST https://api.kraterion.com/v1/projects/<project_id>/agents \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "handbook-bot",
    "description": "Answers from the company handbook",
    "system_prompt": "Answer questions using the handbook. Cite your sources.",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "top_k": 8,
    "bucket_ids": ["<bucket_id>"],
    "tools": ["kraterion_search", "kraterion_read_object"]
  }'
```

List, fetch, update, and delete with the matching endpoints:
`GET /v1/agents?project_id=…`, `GET /v1/agents/:id`, `PATCH /v1/agents/:id`,
`DELETE /v1/agents/:id`.

## Talking to an agent (chat)

Agents speak an **OpenAI-compatible chat API**, so you can point an OpenAI SDK at
Kraterion and call your agent like any chat model:

```
POST https://api.kraterion.com/v1/agents/<agent_id>/chat/completions
Authorization: Bearer kr_live_...
```

The agent retrieves from its attached buckets, calls its enabled tools, and
returns an answer (with citations when knowledge is involved).

## Sub-wallet & grants

Each agent is issued **its own on-chain identity** — a `sub_wallet_address` —
separate from the gateway and from your other agents. For the agent to read a
**private** bucket, that sub-wallet has to be **granted access on-chain**, the
same revocable mechanism the platform uses for itself.

This makes an agent's reach **explicit and auditable**: you can see, per bucket,
whether a given agent is allowed in.

```bash
curl https://api.kraterion.com/v1/agents/<agent_id>/grants \
  -H "Authorization: Bearer kr_live_..."
# → per-bucket grant status for this agent's sub-wallet
```

## Revoke vs delete

- **Revoke** (`POST /v1/agents/:id/revoke`) flips the agent's status to *revoked*:
  the chat endpoint refuses new requests, but the record and its history stay for
  audit.
- **Delete** removes the agent entirely.
- To cut an agent off from **one specific bucket** without retiring it, revoke
  that bucket's **on-chain grant** instead.

## Built-in tools (the `tools` field)

Agents can be given any of the built-in tools, including: `kraterion_search`
(hybrid knowledge search), `kraterion_read_object`, `kraterion_write_object`,
`kraterion_list_buckets`, `kraterion_list_objects`, `kraterion_get_manifest`,
and the memory tools `memory_remember` / `memory_recall`
(see [agent-memory-and-sessions.md](agent-memory-and-sessions.md)).

## Common questions

**What models can an agent use?** You bring your own model provider key (BYOK).
Kraterion runs the chat completion through your provider; it bills you $0 for the
agent call itself — you pay your model provider directly.

**Can a user change the agent's instructions?** No. `system_prompt` is fixed by
the agent owner and can't be overridden by the caller.

**How do I expose an agent publicly?** Mint a share token and drop it on your site
— see [embedding-agents.md](embedding-agents.md).
