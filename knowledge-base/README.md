# Kraterion — Product Knowledge Base

This folder holds one Markdown file per major Kraterion feature. It's written to
be uploaded into a Kraterion bucket and indexed as Knowledge, so an agent can
answer questions about the product with accurate, citable passages.

> Status: **testnet preview** (Sui Overflow 2026). Sui, Walrus, and Seal all run
> on their public testnets. Tokens and storage are testnet-only for now.

## What Kraterion is

Kraterion is **S3-compatible object storage with ownership and encryption built
in**. Every file you store is:

- **Encrypted by default** at the gateway with Seal — what lands in storage is
  ciphertext. Nobody holds your plaintext at rest.
- **Stored on Walrus**, a decentralized storage network, and kept renewed so it
  doesn't lapse.
- **Owned on-chain by you** — each bucket is an object on the Sui blockchain that
  records your account as its owner. The platform operates the bucket on your
  behalf but cannot change who owns it.
- **Revocable** — the platform's ability to decrypt your data is granted by an
  on-chain policy you can revoke in a single transaction.

On top of storage, you can turn any bucket into a searchable **Knowledge** index
and build **AI agents** over your data — reachable from your backend over an
OpenAI-compatible API, from your website as an embeddable widget, or from any
**MCP** client (Claude Desktop, Cursor, Zed).

## The surfaces (hostnames)

| Host | Purpose |
|---|---|
| `kraterion.com` | Marketing site + docs |
| `app.kraterion.com` | Dashboard (signed-in console) |
| `api.kraterion.com` | REST control API + agent chat + OAuth |
| `s3.kraterion.com` | S3-compatible storage gateway |
| `mcp.kraterion.com/mcp` | Model Context Protocol server |

## How you sign in

Sign in with Google. Under the hood, **zkLogin** turns that login into a Sui
account using a zero-knowledge proof — there's no seed phrase or wallet extension
to install, and Kraterion never sees a private key. The account is yours; the
login is just how you reach it.

## Feature index

- **[encryption-and-ownership.md](encryption-and-ownership.md)** — the core
  model: encrypted by default, owned on-chain, revocable access, durable storage,
  seedless sign-in. Start here to understand *why* Kraterion behaves the way it
  does.
- **[s3-buckets.md](s3-buckets.md)** — the S3-compatible storage API: buckets,
  supported operations, size caps, public buckets, errors.
- **[knowledge.md](knowledge.md)** — turning a bucket into a searchable,
  citable index for RAG.
- **[agents.md](agents.md)** — configuring AI agents over your data and calling
  them via an OpenAI-compatible API.
- **[agent-memory-and-sessions.md](agent-memory-and-sessions.md)** — persistent
  agent memory and on-chain-anchored sessions you can replay.
- **[embedding-agents.md](embedding-agents.md)** — putting an agent on your own
  website with a scoped, capped share token.
- **[mcp.md](mcp.md)** — connecting Claude Desktop / Cursor / any MCP client.
- **[api-keys-and-auth.md](api-keys-and-auth.md)** — the two credential types
  (S3 keys vs bearer tokens) and where each is used.
- **[pricing.md](pricing.md)** — pay-as-you-go meters, free bands, and BYOK for
  agents.
