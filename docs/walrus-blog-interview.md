# Kraterion × Walrus — blog interview answers

*Draft answers for the Walrus team's blog article. Every Kraterion-specific
claim below is grounded in our own code/docs (file references in footnotes-style
parentheses so we can fact-check before it's published). External facts about
Walrus/Walrus Memory/competitors are cited at the bottom.*

> **Two honesty flags for us before this goes out** (not for the article):
> 1. Our current headline positioning is *"a verifiable runtime for agents,"* with
>    storage as the foundation. The older *"object storage you actually own"* line is
>    still true and is the part most relevant to a Walrus audience — I lean on the
>    storage + Walrus-Memory story here because that's what's most fully shipped.
> 2. The agent-runtime replay/lineage/drop-in-SDK surface is partly built and partly
>    on the roadmap. I've written those as *direction*, not as "done," so we don't
>    overclaim. Shipped-and-real: the S3 gateway on Walrus, the storage-pool vault,
>    Seal encryption + on-chain revocation, knowledge bases, agents with Walrus-Memory
>    tools, MCP, and the indexer.

---

## What you built

### What did you build, and who's it for?

We built **Kraterion** — an S3-compatible storage platform on Walrus, with a
verifiable agent runtime on top. Concretely: you point `boto3`, `aws-cli`, or
`rclone` at us like any S3 bucket, but every file you upload becomes a Walrus blob
registered into *your own* on-chain storage pool, encrypted by default with Seal,
and the platform's access to decrypt or mutate it is delegated through a Move policy
you can revoke in one transaction.

It's for **any developer or startup building with AI — no crypto knowledge required**.
The whole thing is deliberately dressed as a normal dev tool: Google sign-in (zkLogin
under the hood via Enoki), credit-card billing (Stripe), a drop-in S3 API. You get the
ownership and verifiability guarantees of Walrus/Sui/Seal without having to know they're
there.

### What does it do in one sentence — and what does the demo show?

**One sentence:** Kraterion is object storage you actually own — an S3-compatible API
where every file is a Walrus blob in your own on-chain pool, sealed so we can't read it,
and revocable so we *provably* can't read it once you say stop.

**The demo** walks the "own it / revoke it" story end to end:

1. Sign in with Google, point `aws-cli` at the gateway, `aws s3 cp` a file up. It lands
   as a `PooledBlob` inside your project's `KraterionPoolVault` on Sui — you can open
   Walruscan and see it.
2. Flip **Knowledge** on that bucket and it becomes a RAG knowledge base — which
   simultaneously shows up as an **MCP server with 7 tools** you can add to Claude
   Desktop or Cursor.
3. An agent answers a question with a citation you can verify against the exact source
   blob, and uses its **Walrus-Memory** tools to remember and recall facts across runs.
4. The two twists: **cancel your subscription** and your files don't vanish — they're on
   Walrus, owned by your address. **Revoke API access** with one on-chain call and the
   Seal key servers stop releasing the decryption key — not because we promise to stop
   reading, but because the cryptography no longer lets us.

*(Grounded in `docs/one-pager.md`, `apps/landing/src/components/marketing/*`,
`docs/video/video_plan.md` for the 7-tool MCP beat; note our `scripts/demo-*.sh` are
currently stubs, so the demo is driven through the dashboard/CLI, not those scripts.)*

---

## The problem

### What problem did you run into specifically?

**The per-blob economics of storing lots of files on Walrus.** Our first architecture
made every S3 object its own Walrus `SharedBlob` with its own `Storage` resource, paid
~53 epochs (~2 years) upfront in WAL. Three things broke at scale:

- **Renewal gas** is per-blob — extending thousands of files individually is expensive.
- **DELETE stranded prepaid WAL** — you'd already paid two years for storage you were
  throwing away.
- **Walrus's encoded-size floor punishes small files.** At 1000 shards a blob RS2-encodes
  with a fixed per-object cost — `nShards * (nShards*64 + 32) + sliver` — so a 10 KB file
  and a 10 MB file both consume roughly **~64 MB of encoded capacity**. Our storage gauge
  literally read *92% full on a 9%-used pool* because we were dividing encoded bytes by the
  billing quantity — two different units.

*(Grounded in `docs/storage-pool-migration.md` §0 and `docs/decisions.md:3997-4016`;
`getEncodedBlobLength` in `packages/walrus-client/src/index.ts:131-146`.)*

### Had you tried solving it another way first? What happened?

Yes — the SharedBlob-per-object model *was* the first version, and it worked functionally;
it just didn't work economically. We migrated to Walrus's **`StoragePool` + `PooledBlob`**
primitive: one `KraterionPoolVault` per project that wraps a single Walrus `StoragePool`,
funded from a shared on-chain `PlatformReserve`. Now a PUT registers a `PooledBlob` into
the pool (increment), a DELETE frees capacity (every blob is registered `deletable: true`),
and renewal is **one transaction for the whole pool** instead of one per file. The gauge got
fixed to measure encoded-used against the pool's on-chain `reserved_encoded_bytes`, plus a
live object-count line and a `PoolCapacityGuard` that projects the incoming blob's *encoded*
cost and rejects over-capacity uploads with S3 `507 InsufficientStorage` before we ever
touch Walrus.

*(Grounded in `move/kraterion/sources/pool_vault.move`, `docs/storage-pool-migration.md`,
`apps/gateway/src/s3/vault-provisioning.service.ts`.)*

The other curveball worth mentioning: **Sui deactivated the public JSON-RPC endpoint
mid-build** (testnet the week of 2026-07-06). Our whole chain layer read/wrote over
JSON-RPC, so we migrated the entire stack to the **gRPC Core API** — new client, method
renames, and the genuinely hard part, BCS-encoded response shapes instead of tidy JSON.
*(Grounded in `docs/json-rpc-migration.md`, "EXECUTED 2026-07-09".)*

---

## How you solved it (the stack)

### Walk me through your stack — frameworks, orchestration, where Walrus/Walrus Memory fit.

It's a fairly conventional-looking web stack, which is deliberate — the interesting part
is where the chain sits underneath it. On the surface there's a Next.js front end, a set of
Node services behind it, and a Postgres database. What makes it Kraterion is that none of
those hold the source of truth: the real record of what exists lives on Sui, and the files
themselves live on Walrus. The database is a read model — a fast, queryable mirror of on-chain
state — not the system of record.

The services split cleanly by responsibility. One handles the storage hot path: it speaks the
S3 protocol, encrypts each object with Seal before it leaves us, and writes the ciphertext to
Walrus. Another handles everything session-based — accounts, projects, keys, billing, agents —
and reads almost entirely from the mirror rather than talking to the chain directly. A
background service does the opposite direction: it follows the stream of events coming off Sui
and keeps the database in sync, so a write on the storage path shows up as queryable metadata a
moment later. Tying it together is a small on-chain program in Move that defines the primitives
everything else composes against — buckets, the storage pool, the access policy, and the shared
balance that pays for it all.

Walrus is the storage layer in the literal sense: every file ends up as a blob there, reached
through a thin ownership wrapper we put in front of it so that the blob belongs to the user's
project rather than to us. Reads and writes go through Walrus's own relay and aggregator
infrastructure, so we're a coordinator, not a middleman holding your bytes. Walrus Memory sits
one level up, in the agent runtime: it's how an agent remembers things across runs. We expose
memory to the model as a simple remember-and-recall capability, keep each agent's memory
isolated from every other agent's, and — because it's backed by Walrus — that memory stays
owned by the user and portable across model providers, the same ownership principle we apply to
files, extended to what an agent learns.

*(Grounded in `apps/gateway/src/s3/`, `apps/control-plane/src/`, `apps/worker/src/indexer/`,
`packages/walrus-client`, `packages/seal-client`, `apps/control-plane/src/memwal/`, and
`move/kraterion/sources/`.)*

### Why Walrus/WM for this, versus rolling your own or another tool?

Because **ownership and verifiability are the product, not a feature** — and you can't
bolt those on after the fact. If we ran our own storage, we'd be reintroducing exactly the
lock-in and "trust us" privacy we're selling against. Walrus gives three things we couldn't
fake: blobs that are genuinely **owned by the user's address** (so cancelling us doesn't
delete their data), **erasure-coded cost efficiency** (Walrus is ~100× cheaper than
Filecoin/Arweave per the public benchmarks), and **programmable storage tied to Sui
objects** — which is what lets Seal make revocation a *cryptographic* property instead of a
policy. "Revoke access and we literally can't decrypt your bytes" is only true because the
storage and the access policy both live on-chain.

For **Walrus Memory** specifically: agent memory today is trapped in a vendor's database,
tied to one model provider. WM makes it user-owned, portable across OpenAI/Anthropic/etc.,
and verifiable — which is the only version of "agent memory" that fits a platform whose
whole pitch is "you own your data and your logs."

### Is there one integration decision, config choice, or snippet you'd point another builder to?

The one I'd point to is a modeling decision more than a snippet: **use Walrus's pooled-blob
primitive to make Walrus's economics look like the storage economics people already
understand.** It's the choice that made everything else fall into place.

The friction is that Walrus doesn't price storage the way a developer expects. The familiar
mental model — from S3 and every cloud bucket — is "add files, remove files, pay for the
gigabytes you're using this month." Walrus, underneath, is closer to prepaying for a fixed
amount of space for a fixed length of time, per object, with a real cost floor on each one.
If you map that naively, one file to one blob, the bill stops making sense to a normal user:
small files look expensive, deleting a file doesn't refund the space you already paid for, and
keeping things around means renewing each file on its own clock. It's all correct, it's just
not a model anyone outside crypto is used to reasoning about.

Pooled blobs are the bridge. Instead of paying per file, you reserve one pool of capacity for a
user and register their files into it — adding a file consumes some of the pool, deleting one
gives the space back, and you renew the whole pool at once rather than file by file. That single
indirection turns Walrus's native, prepaid, per-object model into a metered resource that
behaves exactly like the pay-for-what-you-use storage people expect, which is what lets us put a
normal per-gigabyte bill in front of it. So the advice to another builder is: don't expose
Walrus's raw economics to your users — pool the storage, and meter the pool.

*(Grounded in `move/kraterion/sources/pool_vault.move` and
`apps/gateway/src/s3/vault-provisioning.service.ts`.)*

---

## The payoff

### What worked better than expected?

- **Reads are basically free.** A single aggregator GET per read, no fanout — the gateway
  stays cheap on the hot path.
- **Seal made "we can't read your data" *real*.** We expected access control to be a
  best-effort policy; instead `seal_approve` runs as an on-chain check that the key servers
  enforce, so revocation is a property of the cryptography, not a promise. That's the demo
  moment that lands every time.
- **The pool model collapsed a genuinely nasty renewal/GC problem into a counter.**

### Anything that surprised you — good or bad — about building on Walrus?

The good surprise was just how *programmable* the storage turned out to be. Coming in, we
thought of Walrus the way you think of any object store — a place to put bytes and get them
back — and expected to build all the interesting logic ourselves, off to the side. What we
found instead is that the storage is a first-class on-chain citizen: we could wrap Walrus's own
storage primitive inside our own Move type, fund it from a shared balance we control, and attach
our own rules about who's allowed to write into it and when access can be pulled — all enforced
on-chain rather than by our servers. That's what let ownership and revocation be real properties
of the system instead of promises in a privacy policy, and it's ultimately what made the whole
product possible. We expected a storage bucket and got something closer to programmable
infrastructure, and that reframing was the best surprise of the build.

### Biggest lesson learned?

**Model the encoded-size economics and the epoch/renewal model *before* you design billing
and UX.** Storage on Walrus is programmable money — encoded capacity and WAL are first-class
constraints, not implementation details. The second lesson: build against the chain's real
transport (gRPC Core API) from day one; the tidy JSON-RPC shapes are going away.

### What would you build next with it? (hypothetical is fine)

- **Quilt** for sub-64 KiB batching, so many-small-files stop paying the per-blob floor.
- Deeper **Walrus Memory** — verifiable, portable agent memory as a real product surface,
  with on-chain session anchoring (`pool_vault::anchor_session` already anchors full agent
  run traces as pooled blobs) so an entire agent run can be replayed against the exact
  Walrus-stored inputs.

### What would you tell another builder just starting out?

Design your product without compromising the primitives underneath it. The hard part of
building on this stack isn't wiring up Walrus, Seal, or Sui — it's building a smooth,
familiar-feeling product on top *without* quietly giving back the guarantees that made you
choose them. Those compromises are tempting and they creep in: holding the keys yourself
because it's simpler, letting the off-chain mirror drift into becoming the real source of truth,
adding a custodial shortcut "just for now." Each one is a small UX win that hollows out the
thing you're actually selling, and by the time you notice, ownership and verifiability have
become marketing claims your architecture can't back. So treat the primitives as constraints you
design *around*, not obstacles you design *past* — every convenience should be reachable with the
guarantee still intact end to end, from the user's file all the way down to what's enforced
on-chain. If a feature can only exist by breaking the primitive, that's a signal to find a
different design, not to break the primitive. Getting that discipline right is most of the work,
and it's what separates something genuinely built on the stack from something that just touches
it.

---

## What's next

### What are your next steps with the product?

Three phases, in order: mainnet, then private access, then public access. Mainnet is the big
one — moving off testnet and onto real, production storage so the ownership we've been
demonstrating stops being a demo and starts being something you can actually trust with the files
that matter. From there we're opening the doors deliberately rather than all at once. Private
access comes first: an invite-only phase where we bring on a focused group of early builders,
work closely with them, and harden the platform under real usage before we widen it — the people
in that first cohort get to shape what the product becomes. Public access is where it opens to
everyone, general availability with the rough edges sanded down and the confidence that comes
from having run it in anger first. It's a measured rollout on purpose; when your whole pitch is
that people can trust you with their data, you earn that trust one careful step at a time rather
than by throwing the gates open on day one.

### Are there any competing products? If so, what differentiates you from them?

Not really a direct one. The closest was Tusky, another Walrus-native storage product, and
they've since wound down — so on Walrus itself there isn't anyone doing the specific thing we do
right now: an S3-compatible front door to storage you own, with encryption and revocation built
in and an agent layer on top.

Zoom out and there are plenty of players, they're just solving different problems. In the broader
decentralized-storage world you have the likes of Filecoin, Arweave, and Storj — but those lean
toward cold archival, permanent storage, or an S3 experience over a curated node network; they're
adjacent to us, not head-to-head. And in the web2 world the incumbents are the classic clouds,
which are excellent but a fundamentally different bargain: you rent the space, they hold the keys,
and the lock-in is by gravity. So the way we frame it isn't "we're a better anyone" — it's that
we sit in a gap nobody else is standing in: the familiarity and ergonomics of web2 object storage,
with the ownership, verifiability, and revocable access that only this stack can actually
guarantee.

---

## Sources (external facts)

- [Walrus Memory / MemWal SDK — Crypto Briefing](https://cryptobriefing.com/walrus-memwal-sdk-ai-agent-memory/)
- [Walrus Memory enables AI agents to "actually learn about us" — Decrypt](https://decrypt.co/369895/walrus-memory-enables-ai-agents-to-actually-learn-about-us-mysten-labs-co-founder)
- [Walrus pitches MemWal as decentralized storage for AI agent memory — Blocks & Files](https://www.blocksandfiles.com/ai-ml/2026/03/31/walrus-pitches-memwal-as-decentralized-storage-for-ai-agent-memory/5213479)
- [Celebrating one year of Walrus — Sui blog](https://blog.sui.io/celebrating-walrus-one-year-anniversary/)
- [Announcing Walrus — Mysten Labs](https://www.mystenlabs.com/blog/announcing-walrus-a-decentralized-storage-and-data-availability-protocol)
- [Filecoin vs Arweave vs Walrus — dev.to](https://dev.to/vrushali_sontakke_c216ea7/filecoin-vs-arweave-vs-walrus-which-decentralised-storage-protocol-should-you-use-48d0)
- [Tusky — decentralized storage & E2E encryption](https://tusky.io/) · [Tusky ts-sdk](https://github.com/tusky-io/ts-sdk)
- [Tusky shutting down: how to retrieve your data](https://docs.tusky.io/) (planned shutdown; public aggregator through 2026-01-19)
