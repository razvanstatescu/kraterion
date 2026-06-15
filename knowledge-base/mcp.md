# MCP (Model Context Protocol)

Kraterion is a **Model Context Protocol server**. Connect Claude Desktop, Cursor,
Zed, or any MCP client and your assistant can browse buckets, search knowledge,
and invoke agents directly — over your own data.

## Endpoint

The server lives at **`https://mcp.kraterion.com/mcp`** and speaks the
**Streamable HTTP** transport. It's **stateless** — each request stands on its
own, so there's no session to keep alive.

## Authentication

Two ways to authenticate:

- **OAuth 2.1 with dynamic client registration (DCR).** Clients that support it
  register themselves and walk you through sign-in — no key to paste.
- **Bearer token.** Pass a `kr_live_…` bearer token in the `Authorization`
  header.

S3 keys are **not** accepted on MCP.

## Add to a client

In Claude Desktop, add Kraterion to your MCP servers config. The OAuth flow
registers the client automatically:

```json
{
  "mcpServers": {
    "kraterion": {
      "url": "https://mcp.kraterion.com/mcp",
      "auth": {
        "type": "oauth",
        "dcr": true
      }
    }
  }
}
```

## The seven tools

| Tool | Args | Does |
|---|---|---|
| `kraterion_list_buckets` | — | List your buckets. |
| `kraterion_list_objects` | `bucket`, `prefix?`, `limit?` | List object keys in a bucket. |
| `kraterion_search` | `bucket`, `query`, `top_k?` | Hybrid search over a knowledge bucket. |
| `kraterion_invoke_agent` | `agent_id`, `input`, `model?` | Call a configured agent and get its answer. |
| `kraterion_read_object` | `bucket`, `key` | Read an object (up to 1 MiB). |
| `kraterion_write_object` | `bucket`, `key`, `content`, `content_type?` | Write an object (up to 5 MiB). |
| `kraterion_get_manifest` | `bucket`, `key` | Fetch an object's knowledge manifest. |

The set includes `kraterion_invoke_agent`, so a client can **defer to a
fully-configured agent** rather than orchestrating retrieval itself.

## Example tool call

Once connected, ask your assistant something that needs your data — it calls the
tools for you. Under the hood, a tool call is a JSON-RPC request with a bearer
token:

```bash
curl -X POST https://mcp.kraterion.com/mcp \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "kraterion_search",
      "arguments": { "bucket": "my-bucket", "query": "refund window", "top_k": 5 }
    }
  }'
```

## Common questions

**Which clients work?** Any MCP client — Claude Desktop, Cursor, Zed, and others.

**Do I need an API key for OAuth?** No — with OAuth 2.1 + DCR the client registers
itself and signs you in. Bearer tokens are the alternative for clients that prefer
a static credential.

**Why are read/write capped at 1 MiB / 5 MiB?** Those are the MCP tool limits for
inline content; for large objects use the S3 API (up to 2 GiB) — see
[s3-buckets.md](s3-buckets.md).
