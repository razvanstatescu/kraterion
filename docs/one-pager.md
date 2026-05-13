# Kraterion

**S3-compatible object storage built for humans and agents — where you actually own the files, and revoking us means we genuinely cannot read them anymore.**

---

## The pitch

Cloud storage today is a great deal until it isn't. Cancel your account, the files disappear. Get locked out, the files are gone. The provider has a bad week, your data is sitting on their servers in the clear. And the AI agents you point at that data? They read it on trust — no way to prove what they actually saw.

Kraterion is storage rebuilt for the world that's coming next. We give developers the S3 API they already build against, and we give their agents a first-class way to read, search, and reason over the same buckets — all on top of a substrate where every file is on-chain, owned by the user, encrypted by default, and our ability to decrypt is a permission the user grants and can yank back with a single transaction.

## Why this matters

Two moments tell the whole story:

- **Cancel your subscription.** Your files don't get deleted. They stay on Walrus, owned by your address. You — or anyone — can keep paying for their storage directly. The platform leaving the picture doesn't take your data with it.
- **Revoke API access.** With one on-chain call, the platform's decryption key stops working. Not because we promise to stop reading — because the cryptography no longer lets us. The threshold key servers refuse to release the key. We literally cannot get your bytes back in the clear.

No centralized cloud provider can technically make either of those guarantees. We can, because Sui, Walrus, and Seal compose to make them enforceable rather than promised.

## For humans

A storage product that behaves like the storage products they already use.

- AWS S3 wire-compatible. `boto3`, `aws-cli`, `rclone`, anything that speaks S3 just works.
- Sign in with Google. No seed phrases, no wallet popup, no extension to install.
- A console that looks and feels like Vercel or Supabase Storage — buckets, drag-and-drop, API keys, usage, activity. Per-file "view on-chain" deep links for the people who want to see the proof.

## For agents

Object storage where the AI layer isn't an afterthought bolted on top — it's a first-class surface.

- Turn any bucket into a knowledge base with one toggle. Hybrid retrieval, configurable embeddings, no infra to stand up.
- Native MCP server. Claude, Cursor, custom agents connect over a single endpoint and get tools for listing, reading, searching, and asking against your buckets — scoped by the same keys and revocation as the rest of the platform.
- Agents as a resource. Define a system prompt, attach knowledge, expose it as an OpenAI-compatible endpoint. Embed it, call it, hand it to another agent.
- **Retrieval you can verify.** Every chunk an agent reads carries an on-chain hash. Anyone — auditor, user, downstream model — can check that what the agent saw is what's actually stored. Not "trust the RAG pipeline." Prove it.

## One wallet per thing that touches your data

No more single all-powerful API key. Every component that reaches into your buckets — an agent, a CI job, a teammate, a third-party integration — gets its own sub-wallet. You grant access per wallet, you can see what each one is doing, and you can revoke any of them on-chain with a single click. Least privilege, on by default, all the way down.

## Where Sui, Walrus, and Seal do real work

- **Walrus** holds the bytes. Each file is wrapped in a `SharedBlob` the user owns — making "cancel doesn't mean delete" mechanical, not policy.
- **Seal** envelope-encrypts every private file by default. Access is gated by an on-chain Move policy the user controls. Revocation is a Sui transaction, not a support ticket.
- **Sui Move** is the glue: a small package binds Walrus ownership and Seal access together, and zkLogin makes the whole thing usable without ever touching a wallet UI.

Three Mysten primitives, each doing a job nothing else on the stack can do, composed into a product a developer can drop in instead of S3.

## The shape of the value

| What every cloud bucket offers | What Kraterion adds |
|---|---|
| You rent space | You own the asset |
| "We pinky-promise" privacy | Cryptographic revocation |
| Vendor lock-in by gravity | Portable by construction |
| AI as an add-on SKU | Agents as a first-class surface |
| Trust the retrieval | Verify the retrieval on-chain |

Storage you can't be locked out of, on a platform that can't lock you in — wired for the humans writing the code and the agents reading the data. That's the wedge.

---

*Sui Overflow 2026 — Walrus track. Built by NanoSoft.*
