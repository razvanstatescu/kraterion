# API Keys & Authentication

How you sign in, and the two kinds of credentials Kraterion uses. Picking the
right credential depends on which surface you're calling.

## Signing in

You sign in to the dashboard with **Google**. Under the hood, **zkLogin** turns
that login into a Sui account using a zero-knowledge proof — there's no seed
phrase or wallet extension, and Kraterion never sees a private key. The dashboard
session is how you create projects, buckets, agents, and keys.

For programmatic access you use one of the two credential types below.

## Two credential types

- **S3 keys** — AWS-style access key / secret pairs used to **sign** requests to
  the storage API with SigV4.
- **Bearer tokens** — `kr_live_…` / `kr_test_…` strings used for the **REST
  control API**, **agent chat**, and **MCP**.

They are **not interchangeable**. An S3 key won't work on a bearer endpoint, and a
bearer token won't sign an S3 request.

## S3 keys

An S3 key is an access key id starting with **`AKIA`** (20 characters) plus a
**40-character secret**. You use it to sign requests to `s3.kraterion.com` with
**SigV4**, exactly like an AWS key. (Service in the signing scope = `s3`; region
is ignored.) See [s3-buckets.md](s3-buckets.md).

## Bearer tokens

A bearer token goes in an `Authorization: Bearer …` header. Use it for:

- control-plane REST endpoints (buckets, knowledge, agents),
- the agent chat API,
- and MCP.

The `kr_live_` and `kr_test_` prefixes tell you which **network** the token is
bound to (live vs test).

## Generating

Create either type from the dashboard, or over the API. **The secret (or token) is
returned once at creation time and never again** — store it somewhere safe.

```bash
# S3 key (AKIA + secret)
curl -X POST https://api.kraterion.com/v1/projects/<project_id>/api-keys \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "name": "uploader" }'
# → { "api_key": { "access_key_id": "AKIA..." }, "secret": "..." }

# Bearer token
curl -X POST https://api.kraterion.com/v1/projects/<project_id>/api-keys/bearer \
  -H "Authorization: Bearer kr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "name": "backend" }'
# → { "token": "kr_live_...", "network": "testnet" }
```

## Revoking

Revoke any key with `POST /v1/api-keys/:id/revoke`. A revoked key stops working
**immediately** for new requests.

## Which key goes where

| Surface | Host | Credential |
|---|---|---|
| S3 storage API | `s3.kraterion.com` | **S3 key**, SigV4 |
| REST control API + agent chat | `api.kraterion.com` | **Bearer token** |
| MCP | `mcp.kraterion.com` | **Bearer token** (or OAuth) |

There's also a third, narrower credential for one specific job: **share tokens**
(`kr_share_…`) used to embed a single agent on a website — see
[embedding-agents.md](embedding-agents.md).

## Common questions

**I lost my secret — can I get it again?** No. Secrets and tokens are shown once at
creation. Generate a new key and revoke the old one.

**Can one bearer token be used for both the API and MCP?** Yes — a `kr_live_`
bearer token works for the REST control API, agent chat, and MCP. It does **not**
work for the S3 storage API (that needs an S3 key).

**What's the difference between `kr_live_` and `kr_test_`?** The prefix indicates
the network the token is bound to (live vs test). They aren't interchangeable
across networks.
