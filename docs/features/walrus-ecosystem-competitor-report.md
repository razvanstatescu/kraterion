# Walrus ecosystem — competitor & adjacent-app landscape

> **Snapshot date:** 2026-05-20
> **Author:** Claude (web research synthesis)
> **Purpose:** Map every shipped or shipping app on the Walrus stack that
> overlaps with Kraterion's surface — S3-compatible storage, file vaults,
> AI-agent storage / memory — so we know who we're sharing the Walrus
> track with and where our wedge holds.
> **Scope:** Storage and AI-memory products that *use Walrus as their
> primary data layer*. Excluded: pure protocol/infra plays (Walrus
> Foundation, Sui RPC providers), and Walrus-as-CDN consumers (TradePort,
> 3DOS, Itheum) where Walrus is a backend detail, not the product.

---

## 1. TL;DR

The Walrus ecosystem in May 2026 has **two crowded segments** and **one
emerging one** that overlap with Kraterion:

1. **S3-compatible decentralized storage** — Nami Cloud is the
   mature commercial leader; WalruS3 is a small open-source MIT effort;
   SuiS3 is a local CLI tool; an *official* Mysten S3 gateway has been
   in PR since July 2025 and could absorb the open-source segment.
2. **Encrypted file vaults / privacy storage** — Tusky (formerly Akord)
   is the production-grade consumer player; OpenTusk is the agent-
   focused private-beta cousin.
3. **AI-agent memory layer** — MemWal (Walrus Foundation, Mar 25 2026)
   is the official primitive; Kraterion and OpenTusk are the only
   third-party apps in this space.

**The competitive map for Kraterion:**

- We do **not** compete with MemWal — different layer (we are an
  S3-shaped corpus index; MemWal is semantic memory). MemWal in fact
  reinforces our story.
- We **do** overlap with Nami Cloud on the S3 surface, but Nami is
  positioned as horizontal cloud-infra-on-Walrus (storage + deploy +
  RPC + nodes); we are vertically integrated *storage → knowledge base
  → agents*. The agent layer is our differentiator vs Nami.
- We **directly overlap** with OpenTusk on the agent-storage thesis.
  OpenTusk is the most aligned competitor; differences in §3.4.
- We do not overlap with Tusky on consumer file sharing.
- The Mysten S3 gateway PR is a wildcard — see §6.

**Defensive positioning to lean into:**

- We are the only one with **on-chain verifiable retrieval** (the
  K5 manifest hash → on-chain Verify button). Nobody else ships this.
- We are the only one whose **per-agent identity is an on-chain
  sub-wallet** with sponsored grant/revoke (MemWal has identity at
  the user level, not per-agent).
- We are the only one shipping **OpenAI Chat Completions-compatible
  agent endpoints** + **MCP + bearer + OAuth 2.1 DCR** in the same
  product.

---

## 2. Map of the landscape

```
                ┌──────────────────────────────────────┐
                │  Pure storage / S3 gateway segment   │
                ├──────────────────────────────────────┤
                │  ▲ Commercial      Nami Cloud        │
                │  │                 Mysten S3 (PR)    │
                │                                      │
                │  ▼ Open-source     WalruS3 (Chainbase)│
                │                    WalruS3 (DeKaiju) │
                │                    SuiS3 (CLI)       │
                └──────────────────────────────────────┘

                ┌──────────────────────────────────────┐
                │  File vaults / consumer privacy      │
                ├──────────────────────────────────────┤
                │  Tusky (ex-Akord)   ← consumer + API  │
                │  Tusky TS-SDK       ← library         │
                │  iWalrusSDK         ← iOS-only        │
                └──────────────────────────────────────┘

                ┌──────────────────────────────────────┐
                │  AI / agent storage & memory         │
                ├──────────────────────────────────────┤
                │  MemWal (Walrus Foundation)          │
                │  OpenTusk           ← closest rival   │
                │  Kraterion          ← us              │
                └──────────────────────────────────────┘
```

---

## 3. Detailed competitor profiles

### 3.1 Nami Cloud — the mature commercial player

- **URL:** [nami.cloud](https://nami.cloud/) · docs: [docs.nami.cloud](https://docs.nami.cloud/)
- **What it is:** Horizontal "decentralized cloud platform" on Sui +
  Walrus. Five products under one roof:
  1. **Nami Storage** — S3-compatible API on Walrus
  2. **Nami Deploy** — git/CLI app deploy (Vercel-shaped) with SSL/CDN/scaling
  3. **Railgun** — accelerated file storage (low-latency CDN over Walrus)
  4. **Node Service** — RPC + indexer
  5. **Validator services** — staking ops (claims 100M+ assets staked)
- **Featured by Walrus Foundation:** Yes — published case study on
  walrus.xyz blog ("Nami Cloud Delivers High-Performance Cloud
  Services to Streamline Adoption on Walrus") and Raptor Group
  marketing ("first publisher & S3-compatible decentralized storage
  solution on Walrus"). Strong validation.
- **S3 surface:** Documented at
  [docs.nami.cloud/api-reference/storage/authentication](https://docs.nami.cloud/api-reference/storage/authentication).
  Authentication, Bucket Operations, Object Operations all covered.
  S3-tools compatible.
- **Performance angle:** Claims 5–10 second decentralized uploads
  reduced to "a few hundred milliseconds." Aggressive caching layer.
- **Encryption / access control:** Integrated with **Seal**
  (encryption + on-chain access control). Privacy-preserving compute
  is on their roadmap copy but specifics not in the public docs.
- **Auto-renewal:** Auto-extends Walrus storage epochs on the user's
  behalf — same primitive Kraterion's renewal worker provides.
- **Pricing:** Footer says "© 2026"; pricing page exists but specifics
  weren't surfaced in the public summary. They market a "zero-cost
  migration experience" but per-GB costs are not loud.
- **Identity / auth:** zkLogin supported via their SDK ecosystem.
- **Status:** Production; presents like a real cloud company. Has a
  team page, RootData entry, partner logos (Sui, Mysten).
- **Differentiators they emphasize:** S3 compatibility + zero migration
  friction + caching for centralized-cloud-feel performance + the
  multi-product cloud-platform pitch.
- **Where Kraterion beats them:**
  - **Agent layer.** Nami has no agents-as-resource, no MCP server, no
    OpenAI-compatible endpoints, no embeddable widget.
  - **Verifiable retrieval.** No knowledge-base layer at all in their
    product surface; nothing to verify.
  - **Per-component sub-wallets.** Their access model is the standard
    user-keyed Sui address; we ship one sub-wallet per agent / channel /
    reseller principal.
- **Where they beat us:**
  - **GTM maturity.** Real partner logos, real pricing page, real
    auto-renewal claim. We are still in submission mode.
  - **Breadth of cloud surface.** Deploy + RPC + nodes is a much
    bigger product footprint than we have.
  - **Performance claim** (caching layer). We haven't built a caching
    tier; direct aggregator reads only.

**Posture for Kraterion:** *Different layer of the stack.* Nami is
horizontal cloud infrastructure; Kraterion is vertical AI-agent
storage. If Nami ships agents, we are in a fight; today we are not.

---

### 3.2 Tusky (formerly Akord) — consumer file privacy on Walrus

- **URLs:** [tusky.io](https://tusky.io/) · app at
  [app.tusky.io](https://app.tusky.io/vaults) · docs at
  [docs.tusky.io](https://docs.tusky.io/about/about-tusky) ·
  TS SDK at [github.com/tusky-io/ts-sdk](https://github.com/tusky-io/ts-sdk)
- **What it is:** Privacy-first consumer file storage and sharing on
  Walrus. Direct end-user product (think pCloud / Mega.nz / Dropbox
  competitor), plus an open-source TS-SDK for developers.
- **History:** Rebranded from **Akord** (Arweave-era project) when
  they migrated to Walrus. Walrus Foundation published a "Tusky
  Builds Privacy-First Web3 File Storage on Walrus" case study.
- **Features:**
  - End-to-end encrypted private vaults + public vaults
  - Magic links (passworded, expiry, upload-limit, view-only or
    upload-allowed)
  - File import from Google Drive + Dropbox
  - Two encryption-key modes: self-hosted (max control) or
    password-protected on-device (Tusky-hosted backup)
  - 24-word backup-phrase recovery
  - Replication: 5× redundancy on Walrus
  - Media gallery UI
- **TS SDK status:** v0.41.0 (Nov 2025). 270 releases, 24 stars,
  7 forks, Apache-2.0. Currently under security review with a
  formal audit planned.
- **Auth:** Sui wallet or API key.
- **Pricing:** From [tusky.io/pricing](https://tusky.io/pricing):
  free tier (1 GB), paid plans starting at **$1.49/mo for 50 GB**,
  up to 5 TB. Fiat + crypto (SUI, SOL) accepted.
- **Status:** Production. Real users. Real revenue.
- **Where Kraterion beats them:**
  - **Developer / agent surface.** Tusky is consumer-first; no
    OpenAI-compatible endpoints, no MCP, no embeddable agent widget,
    no knowledge base. The TS SDK is *building blocks*, not a
    platform.
  - **S3 compatibility.** Tusky speaks its own API; boto3 does not
    work against it. We are drop-in.
  - **Agents-as-a-resource model.** Tusky has no agent primitive.
- **Where they beat us:**
  - **Polish + maturity** on the consumer file-sharing experience.
  - **Brand momentum** from Akord-era users.
  - **Fiat payment integration** at the consumer tier with SOL +
    SUI as crypto options (we are USD-only via Stripe).
  - **Audit and SDK release cadence** (270 releases).

**Posture for Kraterion:** *Different buyer.* Tusky sells to humans
sharing files; Kraterion sells to developers shipping agents. There
is little real overlap once you peel back "both store on Walrus
encrypted." Friendly neighbors, not direct competitors.

---

### 3.3 OpenTusk — agentic storage for AI (closest rival)

- **URLs:** [opentusk.ai](https://opentusk.ai/) · docs at
  [docs.opentusk.ai](https://docs.opentusk.ai/)
- **Pitch (theirs):** "Agentic storage for AI" — encrypted,
  decentralized backend on Walrus, agent-first.
- **Status:** **Beta, invite-only.** "Offering a limited number of
  access codes."
- **What it is:** A vault-shaped product for AI agents:
  - **Archive** — upload artifacts (markdown, PDFs, transcripts, JSON,
    reports) to encrypted vaults
  - **Recall** — agents retrieve files on demand without re-pasting
  - **Evolve** — session summaries sync back to the vault
- **Vault model:** Per-user encrypted vaults; shared vaults with
  on-chain access control by Sui address; public vaults for
  unauthenticated sharing; invite codes with scoped credentials for
  agent onboarding; soft-delete + restore + lifecycle tracking.
- **MCP integration:** **34 MCP tools** documented (the source page
  for the homepage says "30+"; docs say 34). Targets Claude Code,
  Claude Desktop, Cursor, OpenClaw. They are clearly betting on MCP
  as the primary surface — same call we made.
- **Other surfaces:** TypeScript SDK, CLI, webhooks, SSE.
- **Encryption:** Seal Whitelist protocol on Sui; server claims
  zero plaintext access; supports offline decryption for DR.
- **Payments:** **Stripe billing** + crypto payment options (WAL,
  SUI, USDC).
- **Pricing:**
  - **Pay-per-Upload (default):** No monthly fee. Per-file WAL
    token cost. 1 GB total storage, 100 MB max file size.
  - **Developer:** $9/mo
  - **Scale:** $49/mo
  - **Enterprise:** $499/mo
- **Storage model:** Hot cache for instant access + async sync to
  Walrus.
- **What they emphasize:**
  - Agent-first by construction (not a port from a consumer product)
  - Invite codes for agent onboarding with scoped credentials
  - Multi-agent coordination within one owner account
  - Disaster-recovery offline decryption

**Direct comparison vs Kraterion:**

| Dimension | OpenTusk | Kraterion |
|---|---|---|
| **Surface for agents** | 34 MCP tools, SDK, CLI | 6 MCP tools + 6 built-in agent tools + OpenAI Chat Completions endpoint + REST + S3 |
| **S3 compatibility** | ❌ Custom API only | ✅ Full boto3 / aws-cli / rclone surface (36/36 cases) |
| **Knowledge base / RAG** | ❌ File vault only — no embeddings, no retrieval, no verifiable manifest | ✅ Hybrid BM25 + vector + RRF + on-chain Verify |
| **First-class Agents resource** | ❌ Vaults only | ✅ KraterionAgent w/ on-chain sub-wallet, attached buckets, tools, OpenAI-compatible endpoint |
| **Embeddable widget for end-users** | ❌ | ✅ Script-tag + Shadow DOM + iframe, share tokens |
| **Encryption** | Seal Whitelist on Sui | Seal envelope (private/public modes) + per-agent on-chain grant/revoke |
| **MCP auth** | (Not specified) | Bearer + OAuth 2.1 + PKCE + DCR + RFC 9728 |
| **Pricing** | $0 / $9 / $49 / $499 + pay-per-upload | Stripe pay-as-you-go (storage as monthly licensed; ops as metered) |
| **Status** | Beta invite-only | Submission build, demo-able end-to-end |
| **Differentiation moat** | "More MCP tools, simpler vault metaphor" | "Verifiable retrieval + per-agent sub-wallet identity + S3 drop-in" |
| **Built on** | Walrus + Sui + Seal | Walrus + Sui + Seal |

**Where they might beat us:**
- **MCP tool surface breadth** — 34 tools vs our 12 (6 MCP + 6 agent).
  Their docs read like they built an entire vault filesystem as MCP
  calls; we are scoped to the storage + knowledge primitives.
- **Vault sharing UX.** Invite-code scoping for agents is a clean
  pattern; ours is API keys + share tokens + sub-wallet grants.
- **Beta-narrowed focus.** They aren't trying to be S3 *and* agents
  *and* knowledge *and* billing — they're trying to be the best
  agent-vault on Walrus.

**Where we beat them:**
- **The Knowledge layer.** They have no embedding, no vector index,
  no retrieval, no Verify button. An agent on OpenTusk does
  `list_files`/`download_file` and runs RAG locally; an agent on
  Kraterion does `search(bucket, query)` and gets verified chunks.
- **S3 compatibility.** Existing customer toolchains drop in;
  OpenTusk requires SDK adoption.
- **Per-agent on-chain identity.** Our sub-wallet model is sharper
  than their invite-code scoping for audit and revocation.
- **Three layers in one product.** Storage + knowledge + agents
  + widget all unified vs. their vault-only.

**Posture for Kraterion:** *The single direct competitor.* The demo
arc must clearly distinguish — the Verify button, the boto3 drop-in,
and the per-agent revoke Move call are the three moments where we
diverge visibly.

---

### 3.4 MemWal — Walrus Foundation's own AI memory primitive

- **Source:** Multiple announcements; representative coverage at
  [blocksandfiles.com](https://www.blocksandfiles.com/ai-ml/2026/03/31/walrus-pitches-memwal-as-decentralized-storage-for-ai-agent-memory/5213479)
  and [decrypt.co](https://decrypt.co/365834/agentic-memory-walrus-takes-on-ais-next-big-bottleneck).
- **What it is:** A developer **SDK + backend relayer** for storing
  encrypted long-term memory records for AI agents on Walrus. Data on
  Walrus; ownership and access on Sui.
- **Launched:** **March 25, 2026.** Beta.
- **Maintainer:** Walrus Foundation (with Mysten Labs PM publicly
  associated).
- **Features:**
  - Structured "memory spaces" — durable, purpose-built containers
  - Verifiability, availability, portability, shareability claims
  - Plugin for **OpenClaw** and **NemoClaw**
  - Model-agnostic — explicit pitch that you can swap OpenAI ↔
    Anthropic ↔ etc. without re-keying memory
- **Architecture:** Agent → MemWal SDK → relayer → Walrus (data) + Sui
  (ownership/access).
- **What MemWal *is not*:**
  - Not an S3 gateway
  - Not a RAG / retrieval system (it's *semantic memory*, key-value-ish
    "agent wrote a thought, agent recalls it")
  - Not a multi-tenant SaaS — it's a primitive for builders
- **Posture for Kraterion:** *Adjacent, not competitive.* This is the
  framing the AI features plan already takes — "Kraterion's wedge is one
  layer up: drop any files into a bucket, get a verifiable, agent-
  queryable knowledge base." MemWal is great for "what did the agent
  decide last Tuesday"; Kraterion is for "what does the user's PDF
  corpus say about X." Different jobs. MemWal validates the entire
  agent-memory-on-Walrus thesis we built the AI plan around.

**Why this is good news for us:** A foundation-blessed primitive in
the same neighborhood normalizes the category to judges. We point at
MemWal in the pitch — "MemWal is the semantic-memory primitive; we are
the corpus + retrieval layer; complementary."

---

### 3.5 WalruS3 — open-source S3 gateway (two forks)

- **Maintainers:** Chainbase Labs ([github.com/chainbase-labs/WalruS3](https://github.com/chainbase-labs/WalruS3))
  and a fork at DeKaiju ([github.com/DeKaiju/WalruS3](https://github.com/DeKaiju/WalruS3)).
- **What it is:** "Lightweight S3-compatible object storage service
  using Walrus as the backend storage engine and PostgreSQL for
  metadata management." Forked from `johannesboyne/gofakes3` (the
  Go S3 mock library).
- **Features:**
  - PUT / GET / DELETE / LIST basic S3 ops
  - Postgres metadata
  - Modern web UI for bucket/file browsing
  - Docker deployment
  - Data migration tool to pull from existing S3 sources
  - Testnet + mainnet config
- **Encryption:** None documented. **No Seal integration.** This is a
  meaningful gap vs Kraterion / Nami / Tusky / OpenTusk.
- **Status:**
  - Latest release: **v0.1.1 (Sep 2, 2025)**
  - 10 stars, 1 fork (small)
  - Primarily Go (93.8%)
  - MIT license
- **Posture for Kraterion:** *Not a real competitor.* This is a
  hobbyist-grade open-source project with no encryption, minimal
  traction, and ~8 months of inactivity. Useful as **reference
  implementation** if we ever need to crib a Go-side S3 wire
  detail, but no commercial threat.

---

### 3.6 SuiS3 — local CLI shim

- **URL:** [github.com/siphonelee/SuiS3](https://github.com/siphonelee/SuiS3)
- **What it is:** A local CLI that wraps Walrus's flat blob model in
  an AWS-S3-style command syntax. Stores hierarchy/metadata as Sui
  objects so the user gets a familiar `aws s3 cp` ergonomic.
- **What it is not:** A gateway. A SaaS. A multi-user system. There is
  no remote server; SuiS3 is a single-developer convenience layer over
  the Walrus + Sui CLIs.
- **Posture for Kraterion:** *Not a competitor.* It's a power-user CLI,
  not a hosted product. We could even *recommend* it to power users
  who don't want a hosted gateway.

---

### 3.7 Tusky TS-SDK (separate from Tusky.io)

The [tusky-io/ts-sdk](https://github.com/tusky-io/ts-sdk) is the
public client library for tusky.io's hosted backend, *not* a self-
hostable platform. It's a building block consumed by Tusky's own app
and third-party developers building against Tusky's API. Same posture
as §3.2 — different buyer; not a direct competitor.

---

### 3.8 iWalrusSDK — iOS-only blob SDK

A native iOS SDK for upload / download / streaming binary blobs over
Walrus. Useful for native mobile apps; not a product, not a backend.
No overlap with Kraterion.

---

## 4. Feature matrix (head-to-head)

| Feature | Kraterion | Nami Cloud | Tusky | OpenTusk | WalruS3 | MemWal |
|---|---|---|---|---|---|---|
| **S3 (SigV4, boto3/aws-cli/rclone)** | ✅ 36/36 | ✅ | ❌ | ❌ | ✅ basic | ❌ |
| **Encryption by default (Seal)** | ✅ envelope | ✅ Seal | ✅ E2E | ✅ Seal Whitelist | ❌ | ✅ |
| **On-chain user ownership** | ✅ SharedBlob | ✅ | ✅ | ✅ | partial (Sui IDs, no SharedBlob) | ✅ |
| **On-chain revocation lever** | ✅ `revoke_all_api_access` Move call | partial (Seal-bound) | partial | partial | ❌ | ✅ access via Sui |
| **Knowledge base / RAG over bucket** | ✅ K0–K5 | ❌ | ❌ | ❌ | ❌ | ⚠ semantic memory only |
| **Verifiable retrieval (on-chain manifest)** | ✅ unique | ❌ | ❌ | ❌ | ❌ | ⚠ memory record verifiable but not "retrieved chunks vs corpus" |
| **First-class Agents resource** | ✅ KraterionAgent | ❌ | ❌ | ⚠ vault-shaped | ❌ | ⚠ SDK only |
| **OpenAI Chat Completions endpoint per agent** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Built-in agent tools (function calling)** | ✅ 6 + scaffolded webhook | ❌ | ❌ | partial via MCP | ❌ | ❌ |
| **MCP server (Streamable HTTP)** | ✅ 12 tools | ❌ | ❌ | ✅ 34 tools | ❌ | ⚠ OpenClaw/NemoClaw plugin |
| **MCP OAuth 2.1 + DCR + RFC 9728** | ✅ | ❌ | ❌ | ? | ❌ | ❌ |
| **Embeddable widget for end-users** | ✅ Shadow DOM + share token | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Per-agent on-chain sub-wallet** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **zkLogin sign-in (no seed phrases)** | ✅ Enoki | ⚠ via SDK | ⚠ wallet too | ? | ❌ | ⚠ via agent identity |
| **Sponsored writes (gasless)** | ✅ Enoki | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Stripe billing (fiat)** | ✅ inline Elements + meters | ⚠ early | ✅ + crypto | ✅ + crypto | ❌ | ❌ |
| **Auto-renew Walrus storage** | ✅ pool renewal | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Production status** | Submission-ready demo | Production | Production | Beta invite-only | v0.1.1 hobbyist | Beta (Mar 2026) |
| **Open source** | Will be | ❌ (SDK only) | partial (SDK) | ❌ | ✅ MIT | ⚠ SDK |

⚠ = partial / via dependency / different shape  ·  ? = not surfaced publicly

---

## 5. Where each competitor goes when they grow

Educated guesses based on their current shape and public roadmaps:

- **Nami Cloud** has every incentive to bolt on a knowledge / AI layer
  to leverage their existing storage customers. Their "Railgun" name
  hints at performance-first work, not AI-first; but a year from now,
  Nami + an AI-features acquisition is the most likely competitive
  threat that displaces our S3 wedge.
- **Tusky** stays consumer. They already pivoted once (Akord → Walrus);
  another pivot to enterprise/AI is unlikely. They could add Tusky-
  hosted RAG over their vaults as a Pro plan add-on; would still be
  a different buyer.
- **OpenTusk** is the one to watch. They will keep adding MCP tools.
  If they add embeddings + retrieval + an OpenAI-compatible endpoint,
  the head-to-head becomes a fight on every dimension. Our six-week
  lead and the verifiable-retrieval mechanic must compound before
  they catch up.
- **MemWal** is a primitive, not a product. The Walrus Foundation
  will keep growing it; third-party apps will build on it (including,
  plausibly, *us* — a future Kraterion agent could store its session
  memory in MemWal and its document corpus in Kraterion buckets).
- **WalruS3** stays a hobbyist project unless Chainbase Labs decides
  to commercialize it. No signal in that direction.
- **MystenLabs/walrus official S3 PR** — see §6.

---

## 6. The wildcard: Mysten Labs' official S3 gateway

A PR ([github.com/MystenLabs/walrus](https://github.com/MystenLabs/walrus/pulls))
opened **July 5, 2025** adds an S3 gateway directly inside the Walrus
reference implementation. Status as of May 2026: still a PR, not
merged.

**Risks if this lands:**
- Becomes the canonical "free S3 on Walrus" — undercuts our S3 surface
  as a differentiator at the protocol layer.
- Open-source projects like WalruS3 and SuiS3 are subsumed.
- Nami Cloud's S3 product becomes commoditized.
- Tusky / OpenTusk are unaffected (different surface).
- **Kraterion is partially affected** — our S3 wedge becomes "we have
  S3 *and* the agent stack *and* verifiable retrieval", not "we have
  S3 at all."

**Mitigation already baked into our positioning:** Kraterion's pitch
was never "we are the only one who can do S3 on Walrus." It was always
"S3 + Sui ownership + Seal revocation + knowledge base + agents."
The official S3 gateway *helps* us by normalizing the category and
proving the surface is real; we win on the layers above.

The right call when this lands is to *celebrate it* in our README
("compatible with Mysten's official Walrus S3 PR shape") and lean
harder on the agent + Verify story.

---

## 7. Where Kraterion's wedge holds up — restated

After this scan, the seven candidates from
`docs/features/chatbase-comparison-report.md` still hold. The Walrus
ecosystem comparison adds two refinements:

1. **The Verify button is even more strategically valuable than I
   thought.** Nobody — not Nami, not OpenTusk, not Tusky, not MemWal,
   not Chatbase — ships verifiable retrieval. It's a category of one.
   Lean into it harder in the demo and the README.
2. **Per-agent on-chain identity is the second moat.** MemWal has
   agent identity at the user level; OpenTusk uses invite codes.
   Kraterion's sub-wallet-per-agent + sponsored grant + per-address
   revoke emulation is sharper than anything else shipping. Section
   3.3 of the Chatbase report (C2 signed webhook receipts) compounds
   from there.

The competitive risk profile is comfortable for the submission. The
post-hackathon attention belongs on OpenTusk's MCP-tool surface (do we
have enough tools to be the obvious agent-builder default?) and on
whether Nami announces an AI layer.

---

## 8. Open questions

1. **Should we cite MemWal explicitly in the pitch deck?** Their
   existence validates the agent-storage thesis. The risk is judges
   conflating us with them. The opportunity is judges seeing two
   complementary primitives and reading us as the natural app layer
   above MemWal.
2. **OpenTusk demo footprint.** How visible is their beta to Sui
   Overflow judges? If they enter the same track with a slick demo,
   the visual contrast with our knowledge layer needs to be
   instantaneous.
3. **Nami Cloud relationship.** They have a real GTM team. Worth a
   conversation post-hackathon — there is room for an integration
   ("Nami for S3 + Kraterion for the agent layer") rather than a
   competition.
4. **Official Mysten S3 PR.** Worth a short conversation with the PR
   author at the kickoff call to read the room on landing timing. If
   it merges before Jun 21, we want to mention it positively in the
   submission.
5. **WAL token payment.** Tusky, OpenTusk, and MemWal all accept WAL
   directly. We are USD-via-Stripe only. Is adding WAL settlement
   worth a P9-shaped follow-up? Probably yes for crypto-native
   buyers; probably no for enterprise.

---

## 9. Sources

### Direct product pages
- [Nami Cloud](https://nami.cloud/)
- [Nami Cloud docs — Storage API](https://docs.nami.cloud/api-reference/storage/authentication)
- [Walrus Foundation case study: Nami Cloud](https://www.walrus.xyz/blog/nami-cloud-builds-cloud-infra-on-walrus)
- [Raptor Group on Nami Cloud](https://www.raptorgroup.com/news/introducing-first-publisher-s3-compatible-decentralized-storage-solution-on-walrus/)
- [Tusky](https://tusky.io/) · [Tusky pricing](https://tusky.io/pricing) · [Tusky docs](https://docs.tusky.io/about/about-tusky) · [Tusky on Walrus Foundation](https://www.walrus.xyz/blog/tusky-storage-solution-walrus) · [Tusky TS-SDK](https://github.com/tusky-io/ts-sdk)
- [OpenTusk](https://opentusk.ai/) · [OpenTusk docs](https://docs.opentusk.ai/)
- [WalruS3 (Chainbase Labs)](https://github.com/chainbase-labs/WalruS3) · [WalruS3 (DeKaiju fork)](https://github.com/DeKaiju/WalruS3)
- [SuiS3 (siphonelee)](https://github.com/siphonelee/SuiS3)

### MemWal coverage
- [Blocks & Files — Walrus pitches MemWal for AI agent memory](https://www.blocksandfiles.com/ai-ml/2026/03/31/walrus-pitches-memwal-as-decentralized-storage-for-ai-agent-memory/5213479)
- [Decrypt — Agentic Memory: Walrus Takes On AI's Next Big Bottleneck](https://decrypt.co/365834/agentic-memory-walrus-takes-on-ais-next-big-bottleneck)
- [GN Crypto — MemWal SDK announcement](https://www.gncrypto.news/news/walrus-memwal-sdk-encrypted-verifiable-agent-memory/)
- [BloomingBit — MemWal launch](https://en.bloomingbit.io/feed/news/111155)

### Ecosystem context
- [Walrus.xyz news](https://www.walrus.xyz/news)
- [Walrus testnet → mainnet announcement](https://www.mystenlabs.com/blog/walrus-public-testnet-launches-redefining-decentralized-data-storage)
- [Walrus whitepaper](https://docs.wal.app/walrus.pdf)
- [awesome-walrus directory](https://github.com/MystenLabs/awesome-walrus)
- [Walrus official repo + PRs](https://github.com/MystenLabs/walrus/pulls)
- [TradePort × Walrus](https://www.mystenlabs.com/blog/tradeport-stores-move-chain-based-data-on-walrus)
- [Walrus Haulout hackathon](https://www.walrus.xyz/haulout)
