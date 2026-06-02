# Kraterion — Unique Flows Proposal

> **Date:** 2026-05-28
> **Author:** Claude (research synthesis)
> **Purpose:** Before we ship new features, recompose the ones we already have
> with the Sui + Walrus + Seal primitives we've already wired up — to land
> flows that are *structurally impossible* for any centralized storage or
> AI SaaS. The brief is utility + innovation + wow + UX, in that order.
> **Companion docs:** `/docs/features/kraterion-state-of-the-app.md` (current
> shipped surface), `/docs/features/chatbase-comparison-report.md` (chatbot
> lens — overlaps with §4 of this doc but focuses on competition rather than
> primitive composition), `/docs/implementation-plan.md`,
> `/docs/ai-features-plan.md`, `/docs/monetization-and-billing.md`.

---

## 1. The thesis

Kraterion's current product is **three layers stacked on one substrate**:
storage (Walrus + Seal), knowledge (pgvector + K5 manifest), agents
(OpenAI-compatible + MCP + sub-wallets). Every layer cleanly uses every
primitive. We have already done the hard work — the on-chain identity,
the encryption envelope, the manifest, the sub-wallets, the sponsored writes,
the verify path are all built and shipping.

Most users will see only the surfaces:

- "I can use boto3 against it" → S3 compatibility.
- "It answers questions over my files" → RAG chatbot.
- "I can wire it into Claude Desktop" → MCP server.

That framing leaves 90% of the substrate latent. Every primitive we've
built can be re-exposed through a different lens to unlock a flow that's
**structurally impossible on AWS / Pinecone / Chatbase / OpenAI**. The
job for the final 33 days is to pick a handful of those flows, surface
them as single buttons in the UI, and let the demo (and the marketing
site) tell the story.

The bar for a flow to make this list: **it would take a centralized
competitor a re-architecture, not a feature build, to match it.**

---

## 2. The primitive inventory (what we actually wield)

Most of these are already wired in production code. A few are wired but
under-exposed in the UI. None of them are theoretical.

### 2.1 Sui primitives

| Primitive | What it gives us | Where it's already wired |
|---|---|---|
| **zkLogin identity** | Every user is a Sui address. No seed phrases. | `Account.zklogin_sub`, Enoki dashboard sign-in. |
| **Sponsored writes** (Enoki) | Users transact without holding SUI. | All on-chain writes from the dashboard. |
| **Move objects as data** | A bucket / an agent / a session is a first-class on-chain resource. | `KraterionBucket`, `KraterionAgent.sub_wallet_address`. |
| **PTB composition** | Atomically chain "create + grant + share" in one tx. | `create_grant_and_share_bucket`. |
| **On-chain events** | Tamper-evident, ordered, timestamped log. | 6 events consumed by the worker indexer. |
| **Sub-wallets as principals** | Each agent / channel / session is a *distinct* on-chain identity. | Agent sub-wallets, KMS-wrapped seed. |

### 2.2 Walrus primitives

| Primitive | What it gives us | Where it's already wired |
|---|---|---|
| **SharedBlob ownership** | The file is the user's, not ours. Survives our shutdown. | Every PUT through the gateway. |
| **Manifest archive pattern** | Arbitrary metadata (K5 chunk hashes) anchored as a blob owned by the bucket. | `KnowledgeManifest` + the Verify button. |
| **Permissionless storage extension** | Anyone can fund anyone's SharedBlob. Bucket survival is not vendor-gated. | `pool_vault::extend`, the renewal worker, the `kraterion-cli` lever. |
| **Multi-tenant pool reservation** | Storage capacity decouples from per-object epochs. | `pool_vault::resize_grow / resize_shrink / extend`. |
| **Independent reads** | A Walrus aggregator can serve our blobs without our involvement. | The public-link route is already a thin proxy; users can swap any aggregator. |

### 2.3 Seal primitives

| Primitive | What it gives us | Where it's already wired |
|---|---|---|
| **Envelope encryption by default** | Bytes are encrypted before they leave the client (or browser). | Every private-mode PUT. |
| **On-chain access policy** (`seal_approve_*`) | Decryption is gated by a Move predicate, not a SaaS flag. | `kraterion::access::seal_approve`. |
| **Threshold key servers** (2-of-3 Mysten testnet) | "We literally cannot decrypt" is enforced by infrastructure outside our perimeter. | Production decryption path. |
| **Identity-Based Encryption** | Anyone can encrypt *under any identity* without coordinating with the recipient. Decryption requires policy approval. | Encryption identity = `[pkg][bucket][object_uuid]`. |
| **SessionKeys with TTL** | Time-bounded delegated reads; cached in Redis. | Gateway decryption path; in-browser preview. |
| **Per-bucket access list** | The set of decryption principals is a Move object field, not a row in our DB. | `KraterionBucket.api_decryption_addresses`. |

### 2.4 Composed primitives (only Kraterion has these in production)

These are things we've already built that wrap multiple primitives into a
single mechanic. Each is a building block for §4.

| Composed primitive | Pieces | What it lets us do |
|---|---|---|
| **Bucket-as-Move-object** | Sui + Walrus + Seal | Ownership, durability, and policy fused on one resource. |
| **Agent sub-wallet** | Sui + Seal + (KMS) | Per-agent on-chain identity that can be added to / removed from a bucket's access list. |
| **K5 manifest blob** | Walrus + Sui events | Off-chain content (chunk hashes) anchored to the chain in O(1) bytes. |
| **Verifiable chunk** | K5 manifest + hash | A retrieval citation that proves itself against the chain in one HTTP round trip. |
| **Share token** | Postgres + agent sub-wallet | Anonymous-traffic access to a specific agent with on-chain caps. |
| **In-browser Seal decrypt** | zkLogin + Seal | The read path that *keeps working* after platform API revocation — the second demo plot twist. |
| **AgentToolCall audit row** | Sub-wallet signing + `tx_digest` | Per-tool-call on-chain receipt for writes. |

---

## 3. The feature inventory we can recompose (small + large)

A scan of what's shipping today, including the small bits that often get
overlooked in flow design. Items in **bold** are the ones the proposed
flows in §4 lean on hardest.

**Storage layer**

- **S3 SigV4 surface** (PUT, GET, HEAD, DELETE, LIST, public-link, presigned URLs)
- **Per-bucket access mode** (private / public-read, flip at any time)
- **Per-bucket funding gauge** ("Funded through Sep 2026")
- **Sponsored writes via Enoki** (users never hold SUI)
- **Multi-tenant pool reservation** with grow / shrink / extend
- **Soft-delete + on-chain persistence** — DB row gone, SharedBlob still on Walrus
- **Per-object metadata** (`x-amz-meta-*`) flowing through `S3Object` columns

**Knowledge layer**

- **Hybrid retrieval** (BM25 + halfvec(1024) HNSW + RRF, recall@10 ~91%)
- **K5 manifest archived to Walrus**, owned by the bucket
- **Verify button** — hash a returned chunk, prove against the manifest
- **Per-bucket cost estimate** before enable
- **Per-query `hnsw.ef_search` knob** (64 / 96 for search / agent)

**Agent layer**

- **First-class `KraterionAgent` resource** with versioned system prompt
- **OpenAI Chat Completions endpoint** (`/v1/agents/:id/chat/completions`)
- **SSE streaming, tool calling, multi-turn**
- **Six built-in tools** with `AgentToolCall` audit rows + `tx_digest`
- **Per-agent sub-wallet** registered as a bucket decryption principal
- **Per-agent spend caps**
- **Tool picker UI** in the agent-create dialog

**Distribution / access**

- **MCP server** with bearer + OAuth 2.1 + DCR + PKCE + RFC 9728 / 8707
- **Connect panel** with copy-paste Claude Desktop / Cursor / curl configs
- **Embeddable widget** (`/embed/v1.js`, Shadow DOM, iframe)
- **Share tokens** with origin allowlist + daily request cap + daily USD cap
- **Public-link route** `/public/{bucket}/{key}`

**Identity / auth**

- **zkLogin via Enoki** ("Continue with Google")
- **Bearer API tokens** (`kr_live_<env>_<...>` / `kr_test_<...>`)
- **Session JWT** (HttpOnly cookie)
- **Unified `Principal` union** — every controller speaks the same identity type

**Billing**

- **Stripe Elements inline collection**
- **Hourly meter rollups** for 6 metered + 1 licensed product
- **Spend cap + threshold alerts** (50 / 80 / 100%)
- **Pool resize at period boundary**
- **Cost-floor snapshot** (daily SUI + WAL price headroom)

**Observability**

- **Unified Activity feed** (files + knowledge + agent tool calls in one stream)
- **Suiscan deep-links** on every on-chain event
- **Walruscan deep-links** on every blob
- **Per-agent activity tab**

Small features that should not be overlooked when designing flows:

- The **public-link route** is a thin proxy that bypasses the API key path — anyone with a URL can read a public blob.
- The **share token's daily counters** mean we already have a mechanism for capping anonymous traffic against any principal we mint.
- The **per-bucket access list** is a *list*, not a binary flag — we can add or remove specific addresses, not just toggle access.
- The **Move events** are already the source of truth for our indexer — emitting one more event lights up the entire indexer + UI pipeline for free.
- **Encryption is always on at the byte layer** (per the 2026-05-08 decision); bucket "mode" only changes policy. That means **flipping a bucket from public to private after the fact is free** — the bytes are already encrypted; we're just enabling the policy.
- **`KraterionAgent` is a row, but its `sub_wallet_address` is a real on-chain principal** — promoting it to a full Move object is one struct away.

---

## 4. The composed flows

Five tiers. Each tier is named for what it optimizes for. Within each, flows
are listed by demo wow per engineering day.

### Tier 1 — Submission-ready (≤ 5 days each, ship before Jun 21)

These add genuine new moments to the 90-second demo without touching
substrate code. Each is a *recombination* of existing primitives, not a new
feature.

---

#### F1 — Verifiable Conversation™ (transcripts as Walrus blobs)

**The flow:**

End a chat with the agent → the gateway packs the transcript (messages + tool
calls + citation hashes used + model + temperature + agent version) into a
JSON blob → Seal-encrypts under the bucket's identity → PUTs to Walrus as a
new `SharedBlob` owned by the bucket → returns a permalink
`kraterion://session/<id>` rendered as a QR code in the chat UI.

Anyone holding the permalink (and a granted decryption capability — by default
the operator's address) can later open it and see exactly what the AI said,
**with each citation linking to the manifest hash that proves what the AI
read**. The transcript blob's existence (and its owner) is verifiable
on-chain; its bytes are not visible to us.

**Primitives composed:**

- Seal envelope (transcript ciphertext)
- SharedBlob ownership (operator owns the conversation, not us)
- K5 manifest hashes (citation rows carry the chunk hashes already)
- The existing in-browser Seal decrypt path (the same one that powers the
  file preview after revoke)

**Why no one else can do this:**

Chatbase, Pinecone, OpenAI all log conversations on their servers. The best
they can offer is "trust our logs." Kraterion can offer **end-user-verifiable
transcripts whose contents the platform cannot read** — the receipt is signed
by infrastructure outside our control. For insurance, medical triage, legal
advice, financial guidance bots, this is the difference between "we have logs"
and "this is what was said, provable to a regulator."

**UX surface:**

- New "Save as receipt" button at the end of each chat session (default on for
  share-token sessions — see F2).
- A `/receipts` view in the dashboard listing every saved transcript, with
  search, expiry, and a "share with…" button that mints a decryption
  capability for a specific Sui address (F4).
- The widget's chat ends with "*Download a verifiable copy of this
  conversation*" — a single button that grants the visitor a one-time
  decryption capability to *their own copy*.

**Effort:** ~3 days. Reuses K5 archive path; transcript JSON shape is small;
the chat handler already has the message array.

**Demo plot twist:** at the end of the demo, "and by the way — here's the
encrypted transcript of the conversation we just had, on Walrus. Click
'Verify' on any citation. Click 'Download.' I can revoke our access right
now and *you can still open this on the next page.*"

---

#### F2 — Signed tool-call receipts (the missing P4 webhook piece, but more)

**The flow:**

A webhook tool fires. The control plane builds a canonical request envelope
(`{agent_id, tool_id, session_id, url, method, body_hash, called_at}`),
**signs it with the agent's Sui sub-wallet**, and sends it in
`X-Kraterion-Signature`. The full receipt (request + response, with body
hashes) is PUT as a Seal-encrypted Walrus blob owned by the bucket. The
receiving service can verify the signature against the on-chain
`KraterionAgent` and prove the call was made by that agent — not by us
spoofing on the agent's behalf.

**Primitives composed:**

- Agent sub-wallet (signing key)
- Walrus SharedBlob (receipt archive)
- Seal envelope (receipt confidentiality)
- The existing `AgentToolCall` audit table (carries `receipt_blob_id`)

**Why no one else can do this:**

Centralized chatbot platforms can produce logs *they* signed. They cannot
produce a receipt signed by *the agent itself* (the agent has no identity).
That's the upgrade from "we have logs" to "this is what the agent did,
non-repudiably."

**UX surface:**

- Existing Tools picker in the agent-create dialog gains a "webhook" kind.
- The Activity feed grows a "View receipt" link per webhook call — clicking
  it surfaces the Walruscan + Suiscan deep links.
- The webhook recipient's docs page ("How to verify a Kraterion call") shows
  three lines of TypeScript that verify the signature against
  `https://api.sui.io/getObject?id=<agent_addr>`.

**Effort:** ~4 days. Tool kind already scaffolded.

**Demo moment:** the agent calls a webhook → we open the receiving service's
logs → point at `X-Kraterion-Signature` → run the verifier script → show "this
call was made by agent `0xabc…` at this timestamp, signed by Ed25519 key,
non-repudiable." Then revoke the agent's access on chain and try again —
the next call still signs but the receiving service can detect the agent's
on-chain status is `revoked`.

---

#### F3 — Audit-grade activity export

**The flow:**

User clicks "Export audit pack" on `/activity`. The control plane assembles
a JSON pack (every event in the selected period with full Suiscan / Walruscan
links, every share token, every tool call, every key rotation, every bucket
visibility flip), uploads it as a Walrus blob owned by the project, and shows
a single share link.

**Primitives composed:**

- Activity feed (already unified across files / knowledge / agents)
- Walrus PUT (we PUT the export itself as a blob)
- Sui events (every line in the pack carries a real on-chain transaction)

**Why no one else can do this:**

A SOC2 / GDPR / ISO27001 audit needs evidence the operator can defend. AWS
CloudTrail is evidence the operator + AWS can defend; the auditor still has
to trust AWS. A Kraterion audit pack carries on-chain transaction IDs that
the auditor can independently verify — *neither party is the source of truth
for the events themselves.*

**UX surface:**

A single "Export" button on `/activity` with a period selector. Add a
checkbox "Anchor on chain" that publishes the pack's hash via a small Move
event for tamper-evidence; the auditor can grep for that event later.

**Effort:** ~2 days.

**Bonus:** this is the audit story we tell every enterprise prospect for
the next year. The hackathon demo gets to flash a pack URL on screen.

---

### Tier 2 — Substrate-deep flows (1–2 weeks each, post-submission flagship material)

Flows that demand a new Move struct or two but unlock product surfaces no
SaaS competitor can match.

---

#### F4 — Decryption capabilities ("share this with my auditor / lawyer / journalist")

**The flow:**

Operator picks a bucket → "Share with…" → enters a Sui address (or pastes a
zkLogin user's resolved address) → picks scope (whole bucket / prefix /
specific object) → picks TTL (1 hour / 1 day / 7 days / custom) → optional
"single-use" toggle → clicks Grant.

Under the hood: a Move call adds the recipient's address to the bucket's
`api_decryption_addresses` with metadata bound to a new `Capability` Move
object that carries `scope`, `expires_at`, `revoked_at?`. The recipient
gets a deep link they open with their own zkLogin; Seal lets them decrypt
the granted slice.

When TTL elapses (or operator clicks revoke), an off-chain process emits
the `revoke_all_api_access` + `grant(survivors)` move. The capability
object is updated.

**Primitives composed:**

- Bucket-as-Move-object (we already have the access list)
- Per-bucket access list (already a list, not a flag — we just expose the
  add/remove primitive)
- zkLogin (the recipient identifies via Google)
- The existing sponsored-tx flow (recipient never holds SUI)

**Why no one else can do this:**

The closest thing in S3 is a presigned URL — a 7-day max, untraceable secret
that anyone with the URL can use. The Kraterion capability is **identity-
bound** (only that address can decrypt), **scoped** (bucket / prefix /
object), **revocable on chain** (every grant is a tx), and **auditable**
(the grant + revoke are both events). This is the access-control story
regulated industries have wanted for a decade.

**UX surface:**

- "Share with…" button on every bucket page, every file inspector drawer.
- New `/sharing` view: incoming + outgoing capabilities, with TTL countdown.
- The recipient sees a hosted page: "Acme Corp granted you read access to
  `quarterly-reports/Q3-2026.pdf`. Sign in with Google to open." (zkLogin)
- A "Revoke" button next to each grant in the operator's list; revocation
  is a single signed PTB.

**Effort:** ~6 days. Move struct + entry function, control-plane endpoints,
recipient-side page, capability index in the dashboard.

**Why this is the post-hackathon flagship:** every enterprise prospect's
first question is "how do I share?" Today our answer is "presigned URL,
2 hours, untraceable secret." With F4, our answer is "identity-bound,
revocable on chain, full audit trail." That's a different sales motion.

---

#### F5 — Time-locked content (Seal-native embargoes)

**The flow:**

PUT an object with `x-amz-meta-kraterion-unlock-at: 2026-08-01T08:00:00Z`.
The gateway encrypts under a Seal identity that includes the unlock
timestamp; the `seal_approve_timelock` predicate checks the chain's
current epoch against the unlock — decryption fails until the epoch passes.

After unlock, decryption proceeds normally. The bytes were always available
on Walrus; they just couldn't be read.

**Primitives composed:**

- Seal IBE (encryption identity carries the timestamp)
- A new `seal_approve_timelock` Move predicate (small)
- Walrus persistence (the bytes are pre-positioned for the unlock moment)

**Use cases:**

- Press release embargoes (publish to journalists at noon, world at 12:01).
- Earnings reports (lockup until market open).
- Legal disclosure / litigation hold release.
- Will-and-testament style scheduled disclosure ("if I'm inactive for
  90 days, this unlocks").
- **Agent memory expiration** (memories Seal-encrypted with a 30-day
  unlock-back-to-no-one identity that expires the memory).

**UX surface:**

- PutObject API just works (S3 metadata header).
- Dashboard file inspector shows a 🔒-with-clock badge + countdown.
- Knowledge layer respects unlock — chunks from a still-locked object are
  excluded from retrieval until they unlock (the index already keys on
  `s3_object_id`; we add a simple gate).

**Effort:** ~5 days. New Move predicate, gateway PUT wiring, dashboard badges.

**Wow factor:** this is "Seal does this natively but no one is using it for
storage UX yet." We can be the first.

---

#### F6 — Drop boxes (encrypt-without-coordination contact forms)

**The flow:**

Operator creates a "drop box" for a bucket → gets a URL to share. Anyone
on the web can hit that URL, fill a form (name / email / message / file
attachment), and **the form's submit handler Seal-encrypts in the
browser** under the bucket's identity before POSTing. The gateway sees
ciphertext only; the operator decrypts in their dashboard.

This is the lead-capture / contact-form / whistleblower-tip / journalist-
intake flow, end-to-end without us ever holding plaintext PII.

**Primitives composed:**

- Seal IBE (anonymous user encrypts under bucket identity without us
  bootstrapping a key)
- The existing widget infra (Shadow DOM iframe; we add a form mode)
- Share tokens (the URL is one)
- Walrus PUT via gateway (encrypted submission lands as a normal object)
- The in-browser Seal decrypt path (operator reads in dashboard)

**Why no one else can do this:**

To match this, a centralized form vendor would need to give every customer
their own KMS — at which point the vendor still has KMS access. Seal's
threshold key servers give us the same property *without* per-customer key
management. The operator can prove to their GDPR auditor that no third
party (us) ever held a plaintext submission.

**UX surface:**

- "Drop box" tab on a bucket. Configure fields (text / email / file /
  multi-line). Get a URL + embeddable snippet.
- "Submissions" view shows incoming items as decrypted-on-click in browser.
- Form template library (contact / whistleblower / job application /
  feedback) ships with three or four out of the box.

**Effort:** ~5 days. Form renderer in the widget package, encrypt-side JS
(reuses `seal-client` package), submissions view in dashboard.

**Demo angle:** "this is GDPR-compliant lead capture where the *vendor cannot
read the leads* — physically, not just contractually."

---

### Tier 3 — Agent and knowledge as on-chain resources

These promote things currently sitting in Postgres (agents, knowledge
manifests, sessions) to first-class Sui objects. Each one opens a flow that
existing SaaS architectures cannot match because the *resource itself* is
on-chain.

---

#### F7 — Agent as a Move object (portable, transferable, sellable)

**The flow:**

Today `KraterionAgent` is a row with a sub-wallet column. Promote it to a
**`KraterionAgent` Move object** that wraps:

- `owner` (Sui address)
- `sub_wallet_address`
- `name`, `model_id`, `system_prompt_hash`, `attached_buckets[]`, `tools[]`
- `created_at_epoch`, `last_modified_epoch`

The Postgres row becomes a *replica* of the on-chain truth, not the source
of truth. The dashboard already knows how to read Sui RPC for the access
list — we extend that pattern.

Unlocked flows:

- **Transfer an agent** to another Sui address. Useful for handing an agent
  to a client, or for selling one outright.
- **Clone an agent** under a new sub-wallet — for testing variants without
  touching production. Cloned agent inherits prompt + bucket list,
  separately revocable.
- **Archive an agent** by transferring it to the null address — soft-delete
  with on-chain finality.
- **Multi-owner agents** via shared ownership (Sui-native).

**Primitives composed:**

- Move object as data
- Sponsored transfer txs
- Existing sub-wallet plumbing

**Why no one else can do this:**

Chatbase / OpenAI Assistants / etc. all hold the agent in their DB. Transfer
is "export config, import elsewhere" — fragile, lossy, no continuity of
identity. A Move-object agent has *the same on-chain identity* before and
after transfer. Spend caps, tool histories, sub-wallet — all follow.

**UX surface:**

- "Transfer" button on agent detail. Paste recipient address. One-tap
  sponsored tx.
- "Clone" button creates a sibling agent with a fresh sub-wallet (operator
  is asked to re-grant the new sub-wallet to the attached buckets — could
  be one combined PTB).
- Activity feed shows transfer events.

**Effort:** ~7 days. Move module + migration of the agent row to be a
mirror of an on-chain object; substantial but mostly mechanical.

**Why this matters for the Walrus Foundation pitch:** AI agents as **on-chain
transferable resources** is the kind of primitive the Walrus team is
explicitly looking for. It also opens up "agent marketplaces" / "agent NFTs"
as a long-term play without us having to build a marketplace ourselves —
any Sui marketplace can list them.

---

#### F8 — Public knowledge bases / Public agents (Sui-native HuggingFace Spaces)

**The flow:**

Operator marks a bucket "public-knowledge" → the bucket's contents are public
(unencrypted) and its agent is anonymously accessible at
`https://kraterion.com/k/<bucket_handle>`. Anyone on the web (no signup, no
key) can chat with the agent over that public corpus.

Operator can configure:

- A **funding pool** the public agent draws from (with hard daily $ cap; we
  already have spend-caps).
- An **allowlist of models** (e.g., only `gpt-4o-mini`, no premium).
- A **prompt** + system instructions.
- An optional Stripe-checkout tip jar that other users can fund to keep
  the public agent's funding pool topped up.

Every public agent has:

- A **verifiable corpus** (anyone can hash the source files via Walrus and
  prove what the agent reads).
- A **verifiable answer trail** via Verify and F1.
- An **auditable on-chain identity** (the sub-wallet).

**Primitives composed:**

- Public-mode buckets (already shipped)
- Permissionless Walrus extension (anyone can fund the pool)
- Agent sub-wallet (the public agent's wallet is the funding target)
- Share tokens (the public URL is a self-renewing share token under the hood)
- F1 / F3 (every conversation is verifiable, every action auditable)

**Use cases:**

- "Ask my book" — author drops their book + research, mints a public agent,
  shares the link with readers.
- "Ask this protocol" — DAO mints a public agent over their docs; anyone
  on the web can query.
- "Ask the codebase" — open-source maintainer mints a public agent over
  their repo (combine with the eventual GitHub source connector).
- "Ask this dataset" — research lab publishes a dataset and lets the world
  query it through Kraterion's verifiable RAG.

**Why no one else can do this:**

ChatGPT custom GPTs require a ChatGPT Plus login. HuggingFace Spaces don't
have native RAG over user-owned encrypted storage. Open WebUI doesn't have
verifiable retrieval. *And none of them are anonymous-fundable* — the
Walrus extension primitive lets a community keep a public agent alive
without us in the loop.

**UX surface:**

- "Make this bucket public-knowledge" toggle in bucket settings (only
  available for public-read buckets — natural gate).
- The public URL renders a hosted chat page with the agent's name, the
  bucket's content list (public files), and a tip jar.
- "Top up the agent" button calls a sponsored `pool_vault::extend` against
  the agent's wallet.
- Dashboard analytics show traffic, top queries (anonymized aggregates),
  funding-pool burn rate.

**Effort:** ~5 days mostly UI + one new entry function (`fund_agent_pool`).

**Demo wow:** type a query on a public page → see citations to Walrus
blobs → click Verify → walk through to chain → "and the agent itself is
**also** on chain — here's its wallet on Suiscan."

---

#### F9 — Bring-your-own-blob (Kraterion as a meta-layer over the Walrus ecosystem)

**The flow:**

User pastes a Walrus blob ID into a bucket → "Register" → Kraterion stores
the metadata mapping (`s3_key` → existing `walrus_blob_id`) without
re-uploading. The blob can be read through the S3 surface, indexed by the
Knowledge layer, queried by agents.

For private blobs, the user attests (via a signed message from the blob
owner) that the bucket's access policy applies; the Knowledge layer can
then decrypt and index.

For public blobs (e.g., already-published Walrus content from any other
app — Inkray, Tusky, Walrus Sites, MemWal exports), registration just
links the metadata.

**Primitives composed:**

- Walrus SharedBlob (the blob exists; we just point at it)
- The existing S3 surface (works the same once mapped)
- Bucket-as-Move-object (the registration is a Move call adding the blob
  to the bucket's manifest)

**Why this is positioning, not just a feature:**

Today every Walrus app is its own island. MemWal stores agent memory.
Inkray stores publishing artifacts. Tusky stores files. Each app sees only
its own corner. **Kraterion as a meta-RAG layer** can index any of them —
*if* we have read permission. The Walrus Foundation is explicitly looking
for AI products that build *on top of* the network rather than fragment it.

This flow is how we position Kraterion as "the AI layer for the entire
Walrus ecosystem," not just "another storage app on Walrus."

**UX surface:**

- "Register existing blob" action in the bucket page, alongside upload.
- Paste blob ID → fetch metadata → preview MIME / size → confirm map.
- For private blobs: signing-prompt flow (the blob owner signs a message
  granting Kraterion's bucket the read).

**Effort:** ~4 days. Mostly metadata wiring; the gateway path is unchanged.

**Demo angle:** "this isn't just storage — it's the AI layer for *every*
Walrus app. Take a blob from Inkray, register it here, and now you have
verifiable RAG over Inkray articles."

---

### Tier 4 — Composed flows for the long game (worth describing in the pitch deck but not building before Jun 21)

Flows that demand more work than the submission window allows, but each
is a Sui + Walrus + Seal-native answer to a question the centralized world
struggles with. Worth name-dropping in the pitch deck and the post-hackathon
roadmap.

---

#### F10 — Dead-man's switch / inheritance

A `KraterionBucket` can carry a `beneficiary?` field. If the bucket's owner
is inactive (no signed tx) for N epochs, anyone can call
`claim_for_beneficiary(bucket)` → ownership transfers. Useful for:

- Journalists with sensitive sources (file unlocks to a successor if they
  go dark)
- Solo creators / founders (continuity of access for designated heirs)
- Litigation hold (a court-appointed beneficiary inherits if the operator
  is incapacitated)

Effort: ~5 days. Move predicate + UI.

---

#### F11 — Multi-party computation buckets

Multiple parties contribute to a bucket. Each carries its own encryption
identity. An agent operates only on the *intersection* of granted accesses.
Use case: drug discovery collaboration where each company contributes data
but the agent's outputs are bounded by who granted what.

Effort: ~10 days; needs Move work on per-party identity binding.

---

#### F12 — Agent constellations with shared memory

A "constellation" of N agents share a memory bucket. Each writes to its own
prefix; each can read everything. Use cases: multi-step research workflows,
coordinated customer-support escalation chains, code-review pipelines where
each agent (planner / coder / tester) contributes notes to a shared bucket.

Constellation membership is on-chain; revoking one agent doesn't break the
others.

Effort: ~7 days. Mostly orchestration glue; the per-agent sub-wallet
primitive does the heavy lifting.

---

#### F13 — Verifiable AI receipts as a paid product surface

Open up F1 + F2 (verifiable transcripts + signed tool receipts) as a
*standalone* API that any AI product can call. They use their own LLM and
their own data; Kraterion stamps the receipt onto Walrus + Sui. Pricing:
per-receipt micro-fee.

This is "Stripe for AI audit." It rides on top of every flow F1 and F2
already build for our own product. The Walrus Foundation will love this
because it's a generic AI primitive *on Walrus*, not just an app.

Effort: ~7 days. Mostly API hardening + a developer portal page.

---

## 5. UX principles for surfacing these

The single biggest UX challenge: each of these flows touches on-chain
mechanics that traditional cloud users have never seen. We've already
proven (with the existing Verify button and the zkLogin sign-in) that we
can hide the chain entirely until the *one moment* where exposing it adds
trust. Some principles, distilled from what already works:

### 5.1 Make the chain manifest as a single button

The existing **Verify** button is the canonical example. The user sees one
button. Behind it, a Walrus fetch + a Sui RPC + a hash recompute. The user
never sees the layers. We should pattern-match this for every flow:

- F1's verifiable transcript: one **Share verified copy** button at end of chat.
- F2's tool receipt: one **View receipt** link in the activity feed.
- F3's audit pack: one **Export audit pack** button on `/activity`.
- F4's capabilities: one **Share with…** button per bucket.
- F5's time-lock: one badge with a countdown, no exposed cryptography.
- F6's drop box: visitor sees a normal form; encryption happens in browser
  before submit.

### 5.2 Make on-chain status visible *only* when something changed

The dashboard already does this well — the funding gauge says "Funded
through Sep 2026," not "Last `extend` tx digest is 0x…". We surface the
**outcome**, not the mechanism. Same approach for capabilities ("Expires
in 6 days, 3 hours"), transcripts ("Sealed on chain"), receipts ("Signed
by agent `acme-support-bot`").

### 5.3 Treat "verifiable" as opt-in, not always-on

Not every user wants to think about Walrus blob IDs. Default the verification
moments to **collapsed by default, one click to expand** — same pattern as
"On-chain details" on file inspectors today.

### 5.4 The address bar is a feature

A `kraterion://session/<id>` permalink, a `https://kraterion.com/k/<handle>`
public-agent URL, a capability hosted page — every flow should produce a
**single shareable URL** that a non-Kraterion user can paste into Discord /
Slack / Twitter / email. URLs are how trust scales; we should pre-bake the
share affordance into every flow.

### 5.5 Two layers in the marketing site

The landing site should have a "How it works" page that's *normal SaaS
copy* up front, with a "Show the cryptographic guarantees" expandable
section underneath. The two-tier disclosure mirrors what the dashboard
does and lets us pitch both to the senior engineer and to the auditor
on the same page.

---

## 6. Sequencing recommendation

Calendar today: **2026-05-28, 24 days to Jun 21 submission gate.** We have
W6 / W7 buffer plus the ahead-of-schedule cushion. Realistic engineering
window for new flows is ~14 days, leaving room for B6–B8, demo video,
README rewrite, and submission package.

**For the submission demo (target: 12–14 engineering days):**

| Order | Flow | Days | Why |
|---|---|---|---|
| 1 | **F1 — Verifiable Conversation** | 3 | Adds Plot Twist 3 to the demo arc. Highest demo wow per day. |
| 2 | **F2 — Signed tool-call receipts** | 4 | The missing P4 webhook piece, but turned into a Sui-native primitive. Pairs perfectly with F1 in the demo. |
| 3 | **F3 — Audit-grade activity export** | 2 | Cheap. Shows up in the demo as a 5-second flash but is the headline of the enterprise pitch. |
| 4 | **F6 — Drop boxes** | 5 | The "GDPR-impossible-for-others" angle. Visible product surface beyond chat. |

Total: ~14 days. Demo arc becomes:

> Upload PDFs → Knowledge bot answers with citations → Verify a citation
> on chain → agent calls a webhook tool → point at the receipt on Walrus
> and verify the agent's signature → end chat → download the verifiable
> transcript → revoke API access on chain → next chat fails, but the
> transcript permalink **still works** → export an audit pack of the
> whole session → done.

That arc includes **five things no centralized competitor can match**, all
ridden on primitives we already have. Each is a moment that takes 5
seconds of demo time and produces a 5-minute conversation with a judge.

**Post-submission (the SaaS runway):**

| Order | Flow | Why first |
|---|---|---|
| 5 | **F4 — Decryption capabilities** | The "how do I share?" question every prospect asks. Replaces presigned URLs entirely. |
| 6 | **F8 — Public knowledge bases** | Distribution channel — every public agent is a marketing surface. |
| 7 | **F5 — Time-locked content** | Niche but high-signal for press, finance, legal verticals. |
| 8 | **F7 — Agent as Move object** | Foundation-pleasing primitive; opens agent marketplace possibility. |
| 9 | **F9 — Bring-your-own-blob** | Positions Kraterion as the meta-layer over the Walrus ecosystem — critical defense if the Foundation ships their own hosted storage product. |

**Long game (post-2026 Q3):**

F10 (dead-man's switch), F11 (MPC buckets), F12 (agent constellations),
F13 (Verifiable AI receipts as a paid API).

---

## 7. What this does *not* propose

To stay honest about the discipline:

- **No new substrate.** Everything in §4 uses Sui + Walrus + Seal as they
  exist on testnet today. No alternative chains, no other key infra, no
  L2s.
- **No new providers.** OpenAI stays the only LLM provider through
  submission. P1 (multi-provider) remains post-submission.
- **No CDN work.** The CDN plan (C0–C6 in `cdn-feature-plan.md`) is ~12
  days that doesn't compose with any of the flows above. Defer.
- **No new external integrations** (no WhatsApp, no Slack, no Notion sync).
  Each was tempting; each is several days that lights up one channel
  rather than recomposing what we already have. Hold for post-submission.
- **No new SDK.** F1–F6 are all server-side composites. The TypeScript
  SDK surface stays where it is.
- **No new pricing surface.** F13 (verifiable receipts as paid API) is a
  Tier 4 idea precisely because it would need a new pricing line; not for
  this submission.

---

## 8. Closing observation

Looking at what we've built — bucket as Move object, agent as on-chain
sub-wallet, manifest as Walrus blob, transcript as encrypted bytes, share
token as anonymous principal, verify button as one-click proof — we have
a complete vocabulary of *user-owned, verifiable, revocable* primitives.
The product today exposes that vocabulary through three nouns (Storage,
Knowledge, Agents). The flows above are **different sentences in the same
vocabulary** — each one is mostly UX work and a small bit of glue Move,
not new substrate.

The bet for the final stretch is: **don't add a fourth product layer.
Compose the three we have into half a dozen flows no centralized
competitor can match**, and let the demo show four or five of them
back-to-back. That's the version of the pitch that lands the Walrus
track and lays the foundation for a real SaaS.

The Foundation is interested in AI on Walrus. The flows above are AI on
Walrus. The differentiator they will not be able to replicate, even with
their own hosted publisher, is the **substrate-deep composition**:
not "an AI feature on Walrus storage" but "a vocabulary of verifiable
agent primitives where the storage is just one of them."

That's the moat.

---

## Sources / inputs

- `/docs/features/kraterion-state-of-the-app.md` (2026-05-20 snapshot of
  shipped surface)
- `/docs/features/chatbase-comparison-report.md` (overlaps with §4 F1, F2,
  F6, F8; cited where direct)
- `/docs/implementation-plan.md` (spec; primitives intentionally built)
- `/docs/ai-features-plan.md` (K-track + P-track plan; what's shipped vs
  deferred)
- `/docs/monetization-and-billing.md` (pricing surface; spend cap mechanic
  used in F4, F8)
- `/docs/decisions.md` (~70 entries; design decisions that make these
  flows possible — especially 2026-05-08 always-encrypted, 2026-05-13
  agent-sub-wallets, 2026-05-19 pool-lifetime-tracks-billing-cycle)
- `/docs/progress.md` (what is concretely shipped — every flow checked
  for "primitive already wired")
- `prisma/schema.prisma` (table shapes; capability / receipt / drop box
  fit additively)
- Live Move package on testnet at `0x73b1…fa14`
