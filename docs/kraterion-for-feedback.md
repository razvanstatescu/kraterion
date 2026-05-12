# Kraterion — Brief for Sui & Walrus Teams

> One-page summary for feedback. Submission target: Sui Overflow 2026, Walrus track.

## The idea

**S3-compatible object storage for humans and agents — where the user owns the files, and the platform's access can be revoked with one click.**

Kraterion is a drop-in replacement for AWS S3 with two audiences treated as first-class:

- **For humans / developers:** same SDKs (boto3, aws-cli, rclone), same API, same dashboard ergonomics as Vercel Blob or Supabase Storage.
- **For agents:** the same buckets are reachable through a hosted MCP server. Any agent — Claude Desktop, Cursor, Cline, custom SDK code — connects with one config line and gets read, write, search, and `ask` over the user's data, scoped to a single API key.

Under the hood, every object is a Walrus SharedBlob owned on-chain by the user, encrypted by default with Seal, and the platform's access is delegated through a Move policy the user controls. Same bucket, same ownership model, same revocation lever — whether the caller is a Python script or a Claude agent.

## Feels exactly like the web2 platforms developers already use

A deliberate choice that shapes every product decision: **zero crypto literacy required to use Kraterion.** Developers should not need to know — or care — that Sui, Walrus, or Seal are involved unless they want to.

- **Sign in with Google** via zkLogin. No wallets, no seed phrases, no extension installs. No "connect wallet" button anywhere in the flow.
- **No tokens, no gas, no faucets.** The platform sponsors all on-chain operations. Users pay in fiat (Stripe-style billing in the production model; mocked for the hackathon).
- **Industry-standard terminology.** Buckets, objects, API keys, SigV4, access keys, secret keys, MCP servers, OAuth 2.1 — the same vocabulary every developer already knows. Nothing renamed for crypto-native flavor.
- **Industry-standard auth.** SigV4 for S3 clients (works with boto3 / aws-cli / rclone unchanged), Bearer tokens + OAuth 2.1 + PKCE + DCR for MCP (matches Linear / Stripe / GitHub dual-auth pattern), session cookies for the dashboard.
- **Dashboard ergonomics modeled on Vercel and Supabase.** File browser, API key page with quickstart snippets, usage and activity tabs, settings. The on-chain story is visible to users who care (Walruscan deep-links, Sui Explorer links on every object) but invisible to users who don't.

The pitch isn't "use crypto storage." The pitch is "use S3 — and by the way, you actually own your files now."

## How it works (in plain terms)

1. **User signs in with Google** (zkLogin — no wallet UI, no seed phrases).
2. **A bucket is a Sui shared object.** Creating a bucket mints a `KraterionBucket` on-chain, owned by the user. The platform is granted a delegated decryption right via Move policy.
3. **Every upload becomes a SharedBlob.** The gateway encrypts the file with a fresh AES key, wraps that key with Seal under the bucket's identity, writes ciphertext to Walrus, and wraps the result in a SharedBlob owned by the user's bucket.
4. **Reads go through the gateway**, which uses its delegated Seal access to decrypt on the fly and stream bytes back — identical to S3.
5. **The same bucket is agent-ready.** Flip a per-bucket toggle and the platform auto-indexes objects on upload (chunks + embeddings in pgvector; a per-object **indexing manifest archived as a SharedBlob on Walrus** for verifiability). Agents reach the bucket through:
   - **MCP** (hosted, Streamable HTTP) — `kraterion.search`, `ask`, `read_object`, `write_object`, `list_objects`, `get_manifest`.
   - **REST** — `/v1/buckets/:id/search`, `/ask`, plus the full S3 surface.
   - **SigV4** — unchanged. Agents that already speak S3 work with no changes.

The agent path is not a separate product. It's the same bucket, the same API key, the same revocation lever — exposed through the protocols agents actually use.

## What makes Kraterion structurally different from S3 — and from every other "S3 on Walrus"

S3-compatible on the outside. Structurally different on the inside. **Five properties no centralized object store can offer at the same time**, each delivered by one of the three primitives doing real work:

- **Sovereign — the user owns the data, not us.** Every object is a Walrus SharedBlob owned by the user's on-chain bucket. If Kraterion disappears tomorrow, users still have their data: any Walrus aggregator can serve it, anyone can renew it, and no migration is required. **Provider lock-in is structurally impossible.** *(Walrus)*
- **Confidential by default — and the platform doesn't hold the keys.** Files are AES-encrypted; the AES key is Seal-wrapped under the bucket's on-chain identity. The gateway holds a *delegated* decryption right gated by Move policy, never a custodial key. There is no master key that, if compromised, exposes user data. *(Seal + Sui)*
- **Revocable — one Move call and the platform goes blind.** Flip `api_access_granted` on the bucket and the gateway's next decryption attempt fails. **Not a policy promise enforced by a TOS — a cryptographic fact enforced by the network.** Most importantly: revocation cuts humans and agents simultaneously, because they're gated by the same on-chain flag. *(Sui Move policy + Seal)*
- **Auditable — every meaningful action is a chain fact.** Bucket creation, access grants, revocations, blob registrations, indexing-manifest publications — all on-chain events with Walruscan and Sui Explorer deep-links. Users (and their compliance teams) get a tamper-evident audit log they didn't have to build. *(Sui)*
- **Verifiable retrieval — not just verifiable storage.** When an agent retrieves a chunk, the citation links to an **indexing manifest archived as a SharedBlob owned by the user's bucket** — embedding model id, chunk boundaries, content hashes, source blob id. The knowledge base is reproducible from on-chain artifacts even if our database is wiped. Agents don't just see *what* — they see *how it was indexed* and *who can prove it.* *(Walrus + Seal)*

This is the point: **remove any one of Sui, Walrus, or Seal and the value prop collapses.** Without Walrus, no sovereignty or portability. Without Sui, no user-owned policy and no audit trail. Without Seal, no revocable confidentiality. This is the three-primitive composition used as the *mechanism*, not as a sticker — exactly what the Walrus track brief asks for.

## The three moments that sell it

Three things happen in the demo that **cannot happen on AWS S3, GCS, R2, or any "S3 on Walrus" wrapper without the same three primitives composed the same way:**

1. **Cancel the subscription → the user still has everything.** The platform stops paying for renewal; the user's SharedBlobs remain on Walrus. Any aggregator can serve them. **The user doesn't even have to migrate** — they already own the storage.
2. **Revoke API access → the platform literally cannot read the data.** One Move call flips a flag. The gateway's next decryption attempt fails. Search and `/ask` start returning 403. Re-grant restores access without re-indexing. This is not "we promise not to look" — **we couldn't look if we wanted to.**
3. **Every agent retrieval comes with on-chain provenance.** Each cited chunk links to its Walrus manifest blob — proof of which model embedded it, which boundaries were used, which source it came from. Verifiable RAG, owned by the user, gated by the same revocation lever.

## Why this is the right project for the Walrus track

The 2025 Walrus track brief asked for **deep integration with programmable storage** and explicitly called out **agents, verifiable memory, and artifact-driven workflows**. Kraterion isn't a project that puts files on Walrus — it's a project where Walrus + Sui + Seal *are* the product, on the surface agents and humans already use:

- The wedge is structural, not cosmetic. Most "S3 on Walrus" entries land on a custodial design with public files because it's simpler — judges scoring on the rubric will see Kraterion using all three primitives doing actual work in concert.
- The agent angle aligns with the Walrus narrative on agent memory and verifiable retrieval, but Kraterion's shape is **object-storage-first, not memory-first**. Humans (or human-controlled tools) upload files through S3; agents read them back with semantic search, citations, and on-chain provenance. The bucket is authored by the user; the agent is a consumer. We see this as a complementary surface to memory-SDK primitives like MemWal — MemWal gives agents a place to write and recall their own thoughts, Kraterion gives them a place to read what the user already has — and we'd expect a real agent stack to use both for different reasons.
- The demo's plot twists — cancel-and-keep-everything, revoke-and-platform-goes-blind, verifiable-retrieval-via-Walruscan — work because of the three-primitive composition, and they hit harder on a knowledge-base surface than a file-list surface.
