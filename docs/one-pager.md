# Kraterion

**S3-compatible object storage built for humans and agents — where you actually own the files, and revoking us means we genuinely cannot read them anymore.**

---

## The pitch

Cloud storage today is a great deal until it isn't. Cancel your account, the files disappear. Get locked out, the files are gone. The provider has a bad week, your data is sitting on their servers in the clear. And the AI agents you point at that data? They read it on trust — no way to prove what they actually saw.

Kraterion is storage rebuilt for the world that's coming next. We give developers the S3 API they already build against, we give their agents a first-class way to read, search, and reason over the same buckets, and we sit the whole thing on a substrate where every file is on-chain, owned by the user, encrypted by default, and our ability to decrypt is a permission the user grants and can yank back with a single transaction.

## What we shipped — three layers, one substrate

Three product pillars, all live, all wired into the same on-chain identity and revocation model.

### 1. S3-compatible object storage on Walrus

The bottom layer is a faithful AWS S3 implementation that speaks SigV4 over the wire — `boto3`, `aws-cli`, `rclone`, and anything else built against S3 just works against Kraterion. PUT, GET, LIST, HEAD, DELETE, presigned URLs, public links, all of it.

Under the hood, every object is a Walrus `SharedBlob` that the user owns on Sui. Bytes are Seal envelope-encrypted by default before they ever hit a publisher. A custom Move package binds blob ownership, encryption identity, and access policy together. A renewal worker keeps SharedBlobs funded so storage doesn't lapse silently.

**Web2 equivalent:** S3 + KMS + IAM.
**What Sui / Walrus / Seal add:** the files are _yours_, not ours — cancellation doesn't delete them, and our access is a permission you can revoke on-chain rather than a promise you have to trust.

### 2. Knowledge bases over any bucket

Flip one toggle on a bucket and it becomes a queryable knowledge base. Files are decrypted, extracted (text, code, JSON, PDF), chunked, embedded, and indexed with industry-standard hybrid retrieval (BM25 + vector with reciprocal rank fusion). Pluggable embedding models with per-bucket cost estimates. A `/search` endpoint, a chat endpoint, and a query log behind it.

The kicker: the index manifest itself is archived to Walrus and its hash committed on-chain. Every retrieved chunk carries a verifiable hash. Click "Verify" in the console and watch a search hit prove itself against the chain in real time.

**Web2 equivalent:** Pinecone / OpenSearch / a managed RAG product.
**What Sui / Walrus / Seal add:** verifiable retrieval. The first RAG product where you can cryptographically prove what the AI actually read. Same on-chain revocation lever gates search, chat, and MCP uniformly.

### 3. Agents as a first-class resource

Define an agent — system prompt, attached knowledge, tools, model — and it gets its own OpenAI Chat Completions–compatible endpoint. Function calling is in. Multi-turn conversations are in. Streaming is in. Anything that speaks the OpenAI client SDK speaks to a Kraterion agent.

The whole platform is also exposed over a native MCP server with bearer-token and OAuth 2.1 + DCR auth, so Claude Desktop, Cursor, and any other MCP-compatible client get tools for listing, reading, searching, and invoking agents against your buckets out of the box.

**Web2 equivalent:** OpenAI Assistants / DigitalOcean Gradient AI / a self-hosted RAG agent.
**What Sui / Walrus / Seal add:** every agent runs through its own sub-wallet — a verifiable on-chain identity that the user grants and revokes per agent. Agents inherit the storage layer's "we literally cannot read your bytes after revocation" guarantee, end to end.

## Why this matters — the two demo moments

- **Cancel your subscription.** Your files don't get deleted. They stay on Walrus, owned by your address. You — or anyone — can keep paying for their storage directly. The platform leaving the picture doesn't take your data with it.
- **Revoke API access.** With one on-chain call, the platform's decryption key stops working. Not because we promise to stop reading — because the cryptography no longer lets us. The threshold key servers refuse to release the key. We literally cannot get your bytes back in the clear.

No centralized cloud provider can technically make either of those guarantees. We can, because Sui, Walrus, and Seal compose to make them enforceable rather than promised.

## One wallet per thing that touches your data

No more single all-powerful API key. Every component that reaches into your buckets — an agent, a CI job, a teammate, a third-party integration — gets its own sub-wallet, with a real on-chain identity. You grant access per wallet, you can see what each one is doing, and you can revoke any of them on-chain in a click. Least privilege, on by default, all the way down.

## Web2 process, Web3 spine

The product feels like a modern cloud platform. The mechanics underneath are what make the guarantees possible.

| Industry standard           | How Kraterion delivers it                                 | What the Sui stack adds                                          |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| AWS S3 SigV4 API            | Drop-in for `boto3`, `aws-cli`, `rclone`                  | Every object is a user-owned Walrus `SharedBlob`                 |
| OAuth sign-in               | "Continue with Google" via zkLogin                        | Identity is a Sui address, not a session cookie                  |
| KMS / BYOK encryption       | Seal envelope encryption, on by default                   | Revocation enforced by threshold key servers, not policy         |
| IAM least-privilege         | One sub-wallet per component                              | Every grant and revoke is a verifiable on-chain transaction      |
| Gasless onboarding          | Enoki-sponsored writes                                    | Users transact without ever holding SUI                          |
| Audit log                   | Activity feed with deep links to Walruscan / Sui Explorer | The audit log _is_ the chain — un-forgeable, un-backdateable     |
| Hybrid RAG retrieval        | One-toggle knowledge base per bucket                      | Every retrieved chunk verifies against an on-chain manifest hash |
| OpenAI Chat Completions API | Per-agent OpenAI-compatible endpoint                      | Each agent is a revocable on-chain identity                      |
| MCP server                  | Native MCP for any compatible client                      | Same Sui-rooted permission model as the rest of the platform     |

Familiar surface, un-fakeable spine. Developers don't have to learn anything new to get started; the chain shows up exactly where promises used to live.

## The shape of the value

| What every cloud bucket offers | What Kraterion adds             |
| ------------------------------ | ------------------------------- |
| You rent space                 | You own the asset               |
| "We pinky-promise" privacy     | Cryptographic revocation        |
| Vendor lock-in by gravity      | Portable by construction        |
| AI as an add-on SKU            | Agents as a first-class surface |
| Trust the retrieval            | Verify the retrieval on-chain   |
| One all-powerful API key       | One sub-wallet per principal    |

Storage you can't be locked out of, on a platform that can't lock you in — wired for the humans writing the code and the agents reading the data. That's the wedge.
