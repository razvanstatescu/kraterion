# Chatbase × Kraterion — Strategic Feature Gap Analysis

> **Date:** 2026-05-19
> **Author:** Claude (research synthesis)
> **Purpose:** Identify Chatbase features that, when ported through Kraterion's
> Sui + Walrus + Seal substrate, unlock use cases that Chatbase structurally
> cannot serve. Not a port-everything proposal — a hunting list of asymmetric
> wins.
> **Companion docs:** `/docs/implementation-plan.md`, `/docs/ai-features-plan.md`,
> `/docs/ai-platform-proposal.md`, `/docs/monetization-and-billing.md`.

---

## 1. TL;DR

Chatbase is a closed-source, US-data-resident, centrally-trusted "build a
support chatbot from your docs" SaaS doing ~$15M ARR with a small team. It
won by collapsing five jobs into one product: **ingest → retrieve → answer
→ act → embed**. Its moat is execution polish on a commoditized RAG stack;
its ceiling is hard regulated-industry buyers who cannot put customer data
into a US SaaS that controls the key material.

Kraterion already owns the substrate Chatbase lacks: **user-owned, on-chain
encrypted corpora with revocable platform access.** The features worth
porting are the ones where Chatbase's centralized version is good enough for
SMB content marketers but *unusable* for regulated, multi-tenant, or
contractually-sensitive buyers. Those are exactly the buyers Sui + Walrus
+ Seal were built to serve.

**Seven candidates, ranked by leverage:**

| # | Feature | Why our substrate matters | Effort |
|---|---|---|---|
| C1 | **Embeddable chat widget — share token v2** | Already shipped (P6). Upgrade with on-chain spend caps + per-end-user `ChatSession` capability so a customer can prove to *their* end-users what was answered with what corpus. | Small (incremental) |
| C2 | **"Actions" / function tools — webhook + signed receipts** | P4 shipped built-in tools. Add HTTP webhook tools where the call is signed by the agent's sub-wallet and the receipt is a Walrus blob — auditable in a way Chatbase's logs aren't. | Medium |
| C3 | **Lead capture / "Contacts" as on-chain identity objects** | Chatbase's biggest single-use case. Inverting it: leads stay encrypted in the *operator's* bucket, never in Kraterion's DB. The widget operator can prove to a GDPR auditor that no third party (us) ever held PII. | Medium |
| C4 | **Multi-source ingest — Notion, websites, Slack, Drive** | Chatbase ingests from anywhere; corpora are theirs forever. We ingest from anywhere, but every chunk's source is a `SharedBlob` the user can take with them. The portability story is the wedge. | Medium |
| C5 | **White-label / custom-domain mode** | Distribution channel. Agencies build chatbots for clients on Kraterion; each client gets their own Sui sub-wallet — *the agency literally cannot retain client data after offboarding*. This is the unlock for regulated-vertical resellers. | Small–Medium |
| C6 | **Analytics / "Conversation insights"** | Chatbase aggregates conversations centrally. We can ship a privacy-preserving variant: per-bucket query logs encrypted with Seal under a separate identity, decryptable only by the bucket owner. Differential-privacy aggregates served to us; raw logs never leave the user's substrate. | Medium |
| C7 | **Multi-channel deploy (WhatsApp, Slack, widget, voice)** | Each channel = one more agent sub-wallet bound to one bucket. The agent's reach scales without expanding our trust surface. Chatbase has to be trusted across every channel; we don't. | Medium per channel |

The non-obvious takeaways are:

- **Don't copy Chatbase's "Contacts" table verbatim.** Make the contact an
  on-chain object owned by the operator's bucket; that turns the most
  GDPR-hostile feature of Chatbase into a compliance *advantage*.
- **Don't ship a generic "Actions" library.** Ship signed, receipted tool
  calls. That is a Sui-native feature no one else can match.
- **Don't try to out-feature Chatbase on the SMB content-marketer use case.**
  Out-flank it on the regulated, multi-tenant, audited use cases Chatbase
  structurally cannot serve.

---

## 2. What Chatbase actually is (May 2026)

Chatbase ([chatbase.co](https://www.chatbase.co/)) is the canonical example
of a product that won by being boringly excellent at the simple version of
a problem the entire market was overcomplicating. Founded 2023 by Yasser
Elsaid; small team; grew to multimillion-dollar ARR primarily on
content-marketing-driven SMB inbound.

### 2.1 The five-step product

The whole platform reduces to one user journey:

1. **Ingest** — drag-drop files, paste URLs to crawl, connect Notion, paste
   raw text, or upload Q&A pairs. The product trains a "chatbot" on this
   corpus. RAG under the hood; presented as "training."
2. **Configure** — set persona, model, tone, fallback text, language. Hosted
   models include GPT-4o, Claude family, Llama variants; "compare models"
   tooling.
3. **Test** — in-platform playground. Show citations on hover.
4. **Deploy** — embed widget on website (one-line script), or push to
   WhatsApp, Messenger, Instagram, Slack, custom domain (chatbot.example.com).
5. **Act / Analyze** — chatbot can invoke prebuilt actions (Calendly, Stripe,
   Slack, Zendesk, "Collect Leads") or arbitrary HTTP webhooks. Dashboard
   shows conversations, lead capture rate, message volume, top intents.

### 2.2 Pricing — the shape that matters

Source: [chatbase.co/pricing](https://www.chatbase.co/pricing). The plan
ladder is credit-based, with hard knowledge-base size caps:

| Plan | $/mo | Msg credits | KB size | Members | Notable gates |
|---|---|---|---|---|---|
| Free | $0 | 50 | 400 KB | 1 | Deleted after 14d idle |
| Hobby | $32 | 500 | 10 MB | 2 | Unlimited agents, basic analytics |
| Standard | $120 | 4,000 | 20 MB | 3 | Help desk, voice, telephony, API |
| Pro | $400 | 15,000 | 40 MB | 5 | Adv analytics, source suggestions, tickets-as-source |
| Enterprise | custom | — | — | — | SSO, white-label, audit logs, custom roles |

Add-ons: **$40 / 1,000 extra credits**, **$300/yr** per extra agent,
**$118/yr** to remove "Powered by Chatbase" branding. Custom domain is a
~$199/mo add-on per other sources.

### 2.3 Integrations — exhaustive list as of May 2026

**Pre-built Actions (the LLM can call these directly):**
- Calendly / Cal.com — bookings
- Stripe — invoice lookup, subscription updates
- Zendesk (Sunshine) — escalate, create ticket
- Slack — alerts, channel pings
- Web search (Tavily under the hood)
- Collect Leads (built-in form-as-tool)
- Custom Action — any HTTP API with a JSON schema

**Deployment channels:**
- Embeddable web widget
- WhatsApp Business
- Messenger
- Instagram DMs
- Slack
- WordPress / Shopify plugins
- Custom domain (subdomain + iframe)

**Ingestion sources:**
- File upload (PDF, DOCX, TXT, CSV, MD)
- Website crawl (with sitemap + JS rendering)
- Notion workspace sync
- Raw text paste
- Q&A pairs (structured)
- Zendesk tickets-as-source (Pro)

**CRM / workflow:**
- Zapier (the universal escape hatch)
- ViaSocket
- Direct integrations: HubSpot, Salesforce, Intercom, Pipedrive,
  Freshdesk, Zoho Desk

### 2.4 Security posture

From [chatbase.co/security](https://www.chatbase.co/security) and the DPA:

- SOC 2 Type II, GDPR (with SCCs for EU transfers)
- Encryption at rest and in transit (vanilla TLS + KMS-style)
- Role-based access in workspace
- Per-domain embed allowlist
- Per-IP rate limits
- Customer data **not** used for model training
- **All data processed in the US.** No EU residency option (in 2026).
- No customer-managed key (CMK) option.
- No "the platform cannot read this" guarantee. Chatbase by design must
  decrypt and read every byte to embed it.

This is exactly the surface Kraterion's substrate inverts.

### 2.5 What Chatbase *can't* do — structural ceiling

These are not roadmap items they're slow on. They're outside their
architecture:

1. **Prove to a third party that the operator's data was not retained.**
   Chatbase logs, embeddings, and the ingested corpus all sit on Chatbase
   servers. Cancelling a subscription destroys access; it doesn't prove
   non-retention.
2. **Operate in jurisdictions that forbid US data residency.** German
   healthcare, French defense, Swiss private banking — none can use
   Chatbase regardless of how good the product is.
3. **Issue a tamper-evident chat receipt.** A regulated buyer (insurance,
   broker-dealer, medical triage) cannot point at a Chatbase log and say
   "this is the conversation that happened" with cryptographic confidence.
4. **Let an end-user verify the source of an answer independently.**
   Citations link back to internal Chatbase URLs; the chain of custody
   from "operator's PDF" → "this quoted sentence" is on Chatbase's word.
5. **Cleanly transfer a chatbot between operators.** The corpus, prompts,
   leads, and conversation history are locked into Chatbase's tables.
   "Exit" means downloading a CSV and starting over elsewhere.
6. **Run an agency model where the agency provably cannot read client
   data after offboarding.** Same root cause: Chatbase holds the keys.

Every one of these is a Sui + Walrus + Seal-shaped hole.

---

## 3. What Kraterion already has (May 2026)

Per the progress log and the AI features plan, this is concretely shipped
and demoable today:

- **S3-compatible gateway** with SigV4, end-to-end with boto3/aws-cli/rclone.
- **Per-bucket on-chain ownership** — every file is a `SharedBlob` the user
  owns. Cancelling subscription doesn't lose files (`KraterionBucket` Move
  module + sub-wallet renewal worker).
- **Seal envelope encryption by default** with on-chain `seal_approve_private`
  policy. Platform's decryption is a *delegation*, not custody. Revoking
  via `revoke_all_api_access` cuts platform reads — Seal threshold key
  servers enforce this, not us.
- **Knowledge layer (K0–K5 shipped):**
  - pgvector + HNSW + tsvector hybrid retrieval (BM25 + vector + RRF).
  - `KnowledgeManifest` archived as a Walrus SharedBlob owned by the
    bucket — **verifiable retrieval** is unique to us in the RAG space.
  - The dashboard's "Verify" button hashes a returned chunk and proves
    it matches the on-chain manifest.
- **Agents resource (P3 shipped):** `KraterionAgent` with system prompt,
  model, attached buckets, tools, OpenAI-compatible
  `POST /v1/agents/:id/chat/completions`. Each agent has its own Sui
  sub-wallet registered as an on-chain decryption principal — revocation
  is a Move call, not a flag flip.
- **Function calling (P4 shipped):** six built-in tools wired into the
  agent loop with per-call `AgentToolCall` audit rows and on-chain
  `tx_digest` capture for writes. **Webhook tools not yet shipped.**
- **MCP server (K3a shipped, K3b OAuth pending):** Streamable-HTTP at
  `/mcp` with bearer auth; Claude Desktop / Cursor / Cline plug in
  directly.
- **Embeddable widget (P6 shipped):** `/embed/v1.js` mounts a Shadow-DOM
  launcher → iframe → agent chat. Share tokens with origin allowlist,
  daily request cap, daily USD spend cap. Anonymous-traffic protections
  in the chat handler.
- **Billing system (just merged in current branch `billing`):** see
  `/docs/monetization-and-billing.md`. Share token egress is in the
  current uncommitted migration.

Notably **not yet** shipped that Chatbase has:

- Website / Notion / external-source ingest (we only accept S3 PUTs).
- Lead capture / contacts.
- Multi-channel deploy beyond the widget (no WhatsApp / Slack / Messenger).
- Per-agent webhook tools (only built-in tools land in P4).
- White-label / custom-domain for the widget.
- Guardrails (P5 deferred).
- Conversation analytics beyond `KnowledgeQuery` + `AgentToolCall` audit.

---

## 4. The asymmetric-win matrix

Every Chatbase feature falls into one of three boxes. We should only build
in the third one.

| Box | Description | Examples | Action |
|---|---|---|---|
| **A** | Chatbase does well; our substrate doesn't change the value. | Persona presets, "compare models" UI, drag-drop ingest, sentiment analysis on conversations. | **Don't build.** This is feature parity that buys us nothing. |
| **B** | Chatbase does well; our substrate *would* change the value, but the gap is too narrow to justify the engineering. | Stripe action, Calendly action — useful but every chatbot ships these. | **Defer.** Easy webhook tool (C2) covers these. |
| **C** | Chatbase structurally can't do this; our substrate makes it the natural shape. | Verifiable retrieval (already shipped); signed tool receipts; tenant-key-isolated lead capture; provable non-retention on offboarding. | **Build these.** Each is a thing no other chatbot platform can offer. |

The seven candidates in §1 are all Box C. The rest of this document
details each one.

---

## 5. Candidate features, in priority order

### C1 — Widget v2: per-end-user `ChatSession` capability + on-chain spend caps

**What Chatbase does:** Widget tracks anonymous-visitor sessions in their
DB. Spend caps are a soft per-agent setting. Conversation history sits
on Chatbase forever.

**The Kraterion shape:**

Each widget chat session mints a short-lived **`ChatSession`** Move object
owned by the *bucket*, not the agent. The session object carries:
- `agent_id`, `bucket_id`, `share_token_id`
- `created_at`, `expires_at` (typical TTL: 1 hour)
- `spend_cap_usd` (locked at mint, denominated against a project budget object)
- `consumed_usd` (incremented by the gateway on each LLM call)
- `transcript_blob_id?` — when the session closes, the gateway uploads the
  full chat transcript as a Seal-encrypted Walrus blob, owned by the
  bucket. The session object is updated with the blob id.

**Why this is impossible for Chatbase:**
- The end-user (or their auditor) can `walrus get` the transcript blob by
  ID and verify integrity *without trusting Kraterion*.
- The widget operator can hand the end-user a one-time decryption capability
  ("here's what we said to you, signed and timestamped"), useful for
  insurance, legal, medical, fintech support.
- Spend caps are *enforced on-chain*. The gateway can't quietly overspend
  the operator's budget because the cap is a property of the session
  object, not a row in a Postgres table the gateway owns.

**Effort:** ~3 days. Move module addition (one new struct + entry function),
gateway wiring on widget chat open/close, transcript upload reuses the
existing K5 manifest archive path.

**Dependencies:** widget (P6) shipped; nothing else.

---

### C2 — Webhook tools with signed receipts (the missing P4 piece)

**What Chatbase does:** "Custom Action" — point at a URL, paste a JSON
schema, the LLM can call it. Chatbase logs the request/response on their
servers. The operator's customer has no way to verify what was sent on
their behalf.

**The Kraterion shape:**

Extend `AgentTool.kind = "webhook"` (the column already scaffolds this).
For each webhook call:

1. The control plane builds a canonical request envelope:
   ```json
   {
     "agent_id": "...",
     "tool_id": "...",
     "session_id": "...",
     "url": "https://...",
     "method": "POST",
     "body_hash": "<sha256>",
     "called_at": "..."
   }
   ```
2. The envelope is **signed by the agent's Sui sub-wallet** (Ed25519). The
   signature is sent in the outbound request as an `X-Kraterion-Signature`
   header alongside the agent's Sui address. The receiving service can
   verify the signature against the on-chain `KraterionAgent` object and
   prove the call was made by *that specific agent* — not by Kraterion
   spoofing on the agent's behalf.
3. The full request + response (with body hashes, not bodies) is stored
   as an `AgentToolCallReceipt` Walrus blob, owned by the bucket. The
   `AgentToolCall` row carries the blob id.
4. **The webhook target can challenge.** A skeptical compliance officer
   can later say "show me the receipts for every webhook call in the past
   30 days from agent X" — and the operator can produce a list of Walrus
   blob IDs whose existence proves the calls happened and whose hashes
   prove what was sent.

**Why this is impossible for Chatbase:**
Chatbase's logs are claims by Chatbase. The signed receipt makes the
agent — not the platform — the speaking party. This is the difference
between "we have logs" and "this is what was said, signed by the
authorized party, timestamped on a public ledger."

**Use cases unlocked:**
- **Healthcare triage bots** calling an EHR API: signed receipts satisfy
  HIPAA audit requirements *better than the EHR's own logs* because the
  speaking party is cryptographically identified.
- **Fintech reconciliation bots** writing to a ledger: every write
  carries a non-repudiable receipt that the bank can settle disputes
  against.
- **Multi-party automation:** if Agent A writes to System B which writes
  to System C, the chain of receipts forms an audit trail that no
  centralized chatbot platform can match.

**Effort:** ~4 days. Webhook executor in `apps/control-plane/src/agents/`,
sub-wallet signing helper (already have the primitive), receipt blob
uploader (reuse K5 path), schema add for `AgentToolCallReceipt` (or
extend `AgentToolCall` with `receipt_blob_id`).

**Dependencies:** P4 shipped; nothing else.

---

### C3 — Lead capture as bucket-scoped, Seal-encrypted contact objects

**What Chatbase does:** The "Collect Leads" action prompts the chatbot to
ask for email/phone/name and stores the lead in Chatbase's `contacts` table.
The operator views leads in a dashboard; can export CSV. Leads are
co-mingled across all of Chatbase's customers in their database; isolation
is enforced in software.

**The Kraterion shape:**

A **`Contact`** is a JSON blob written to the operator's *bucket*
(under a reserved prefix like `__contacts/<uuid>.json`), Seal-encrypted
under the bucket's normal access mode. The widget operator sees contacts
via a dashboard pane that lists objects under that prefix and decrypts
them in-browser using the operator's zkLogin signature — the same
mechanic the dashboard already uses for file previews.

**Critical property:** When an end-user submits their email in the chat
widget, **the email is encrypted in the browser before it ever reaches
Kraterion**. The gateway sees ciphertext + a Seal envelope keyed under
the bucket's identity. We never hold plaintext PII on the lead-capture
path.

**Why this is impossible for Chatbase:**
- The operator can prove to *their* GDPR auditor that no third party
  (Kraterion) ever held the lead PII in cleartext.
- "Right to be forgotten" deletes are a `DeleteObject` against the
  bucket — the lead is gone from Walrus (eventually, when funding lapses)
  and gone from us immediately.
- An auditor can verify the on-chain `KraterionBucket` doesn't grant
  decryption to Kraterion's address (because the operator revoked it),
  yet the leads are still there for the operator. **No SaaS chatbot
  can offer this property.**

**Use cases unlocked:**
- **EU SMBs** that today rule out Chatbase because of US data residency.
- **B2B sales** where the lead list is the most valuable asset and the
  operator doesn't want it sitting in another SaaS's table.
- **Legal/medical intake** where the *conversation transcript itself*
  becomes a contact-attached document (combining C1 + C3).

**Effort:** ~5 days. Browser-side Seal encrypt of form submission (reuse
the dashboard's Seal SDK path), reserved bucket prefix conventions in the
gateway, dashboard "Contacts" view, lead-collection prompt template +
agent tool. Form schema is just JSON.

**Dependencies:** widget (P6), agent tools (P4). No Move changes.

---

### C4 — Multi-source ingest with per-source provenance manifests

**What Chatbase does:** "Sources" tab lets the user point at a website,
Notion workspace, or files. Chatbase crawls / syncs / extracts and trains
the chatbot. Re-sync is manual or scheduled. Source attribution surfaces
as citation URLs.

**The Kraterion shape:**

A new resource — **`IngestionSource`** — owned by a bucket, of `kind`:
- `website` (crawl with sitemap + JS render)
- `notion` (workspace sync)
- `gdrive` (folder)
- `github` (repo, branch-pinned)
- `slack` (channel sync)
- `s3` (existing — the default)

For each source, the worker periodically pulls content and **PUTs each
extracted document as a normal S3 object under a reserved prefix
(`__sources/<source_id>/...`)**. From there the existing knowledge
pipeline (K1) picks it up. Every chunk's manifest (K5) carries the
`source_id` and a `source_provenance` block — for a website crawl, that
includes the URL, the HTTP `ETag`, the `Last-Modified`, and the
fetch-time signature of the crawler's sub-wallet.

**Why our substrate matters here:**
- The crawled HTML / Notion page / Slack message is a `SharedBlob` on
  Walrus, owned by the user's bucket. **If we shut down, the corpus
  doesn't die** — the user can rebuild the index from their on-chain
  blobs against any other RAG system that speaks Walrus.
- Source provenance is a *signed* on-chain artifact. If a chatbot
  answers "your refund policy says X" citing a Notion page, the
  operator can prove the Notion page said X at the time of indexing,
  not just at the time of the user-visible citation. This is the
  Verify button extended one hop upstream.
- The "delete source" operation soft-deletes the manifest but the
  underlying Walrus blobs persist — the user can produce an audit
  trail of "what content existed at what time" indefinitely.

**Why this is hard for Chatbase to match:** Chatbase can crawl, but they
can't sign the crawl artifact in a way the user can independently
verify. They could *log* the ETag — but that's their word again. The
on-chain signature is the upgrade.

**Effort:** ~7 days for first three connectors (website, Notion, GitHub).
Each subsequent connector is ~1–2 days. Shape: a `SourceConnectorModule`
in the worker, one BullMQ queue per connector kind, dispatcher hits the
existing gateway PUT endpoint — no new privileged paths.

**Dependencies:** P0 (provider credentials) for any LLM-rewriting we want
to do on ingest; otherwise none.

---

### C5 — White-label / custom domain mode for agencies

**What Chatbase does:** Paid add-on ($199/mo + branding removal $118/yr)
removes "Powered by Chatbase" and lets the user CNAME a subdomain. The
widget still talks to chatbase.co under the hood; the chrome is hidden.

**The Kraterion shape (the agency unlock):**

A new resource — **`Reseller`** — that owns a **set of `Project`s**
(today projects are owned by an `Account`). Each reseller-managed project
gets:

1. A custom domain on the dashboard (`storage.acme.com` → CNAME →
   `acme.kraterion.com`). Standard.
2. A custom domain on the embed widget (`chat.acme.com` → CNAME → our
   widget host). Standard.
3. **A reseller-isolated Sui sub-wallet hierarchy.** The agency does not
   share the platform's API decryption address with their clients. Each
   reseller mints its own per-client API decryption sub-wallet, registers
   it on the client's bucket, and *can revoke itself* with a Move call
   when offboarding. The client retains the bucket; the reseller proves
   non-retention by showing the on-chain revocation transaction.
4. Optional: a separate Stripe Connect account so the agency bills its
   own clients (post-billing).

**Why this beats Chatbase white-label:**

Chatbase's white-label is **chrome-deep**. The agency still depends on
Chatbase holding all client data. When the agency loses a client, the
client's data sits on Chatbase indefinitely until the agency clicks
delete — and the client has no way to verify it's gone.

Kraterion's white-label is **substrate-deep**. The agency provably
cannot read the client's data after the offboarding Move call lands on
chain. **This is the wedge for regulated-vertical agencies** — law firms,
medical practice IT consultants, banking back-office automation shops.
They can offer their clients chatbot/RAG services *without* their
clients having to trust the agency's data handling.

**Use cases unlocked:**
- **Legal-tech consultancies** building intake bots for law firms.
- **Healthcare IT** building patient-facing FAQ bots for clinics.
- **Banking automation shops** building internal support agents for
  back-office teams.

**Effort:** ~6 days. Reseller model + cascading admin permissions in the
control plane, custom-domain proxy at the edge (Cloudflare Workers fits
well), reseller sub-wallet bootstrap in the existing `bootstrap-gateway`
shape, dashboard "Agency" tier UI.

**Dependencies:** none on the technical side; billing maturity matters
since the value prop is "I resell this."

---

### C6 — Privacy-preserving conversation analytics

**What Chatbase does:** "Advanced analytics" — message volume, top intents,
sentiment distribution, lead conversion funnel, model-comparison A/B. All
served from queries against Chatbase's central transcripts table.

**The Kraterion shape:**

Two-layer architecture:

1. **Raw transcripts** are encrypted under the bucket's Seal identity
   (per C1 — `transcript_blob_id` on `ChatSession`). The operator
   decrypts in-browser to inspect a specific conversation. **We cannot
   read these.**
2. **Aggregate counters** are emitted *during* the chat — counts of
   messages, tool calls, tokens consumed, intent labels (if a classifier
   is run before encryption) — and written to a normal Postgres table.
   No PII; structurally bounded. The dashboard's analytics tab is served
   from this table.

For the operator who wants deep conversation insights (top topics,
unanswered queries) we offer an opt-in **"Conversation Insights" job**:

- Operator clicks "Run insights for last 7 days."
- A worker process *temporarily* holds a Seal session key for the bucket
  (granted by the operator's zkLogin in-browser), decrypts the transcripts,
  runs the analysis, writes the **summary** (not the transcripts) back to
  the bucket as a new Walrus blob, then zeroes the session key.
- The session key is bounded in time and scope by Seal's own
  mechanics — we cannot exfiltrate it.

**Why our substrate matters:** Chatbase's analytics are "trust us."
Kraterion's are "we mathematically can't see the raw data unless you
hand us a session key for this specific job, and the result is signed
into a blob you own."

**Use cases unlocked:**
- **Customer-data-residency-sensitive verticals** (EU, healthcare,
  finance) get real chatbot analytics without raw data leaving their
  control surface.
- **Bug bounty / red-team scenarios** where leaked logs are an attack
  surface: there is no central transcript store to compromise.

**Effort:** ~4 days for the aggregate counter path, +3 days for the
opt-in insights job. The latter reuses the worker's existing
Seal-session-key-acquisition pattern.

**Dependencies:** C1 (transcripts as blobs), C3 (for intent / topic
labels).

---

### C7 — Multi-channel deploy: agent-per-channel via sub-wallets

**What Chatbase does:** One chatbot can be deployed to widget + WhatsApp +
Slack + Messenger + Instagram + custom subdomain. Each channel routes
through Chatbase; messages land in a unified conversation view.

**The Kraterion shape:**

Each channel deployment is a **`ChannelBinding`** — a row in the DB and a
sub-wallet on Sui, registered as an additional `api_decryption_address`
on the agent's attached buckets. The binding carries:

- `channel_kind`: `widget`, `whatsapp`, `slack`, `email`, `voice`...
- `agent_id`
- `external_id`: the WhatsApp number, Slack workspace id, etc.
- `sub_wallet_address`
- `share_token` (for widget) or platform-specific bot credentials

**Revocation is per-channel.** If WhatsApp gets compromised tomorrow, the
operator clicks "Revoke WhatsApp channel" → Move call removes that
specific sub-wallet from the bucket's `api_decryption_addresses`. The
widget keeps working. Slack keeps working. **No SaaS chatbot offers
per-channel cryptographic revocation.**

**Why now matters:** WhatsApp Business and Slack are where actual money
chatbots happen. Web widgets are demo-friendly but enterprise pilots
need WhatsApp.

**Effort per channel:**
- WhatsApp (Twilio or Meta direct): ~5 days.
- Slack: ~3 days (we already have a sub-wallet pattern; Slack's bot
  framework is well-trodden).
- Email (inbound parse + reply): ~4 days.
- Voice (Twilio + Whisper STT + TTS): ~7 days. Stretch; high demo value
  but operational complexity.

**Dependencies:** P3 agents, P4 tools, C1 sessions ideally.

---

## 6. What we deliberately don't copy

| Chatbase feature | Why we skip |
|---|---|
| **"Train your own model"** — fine-tuning per chatbot | Off-strategy. Same reason DO's GPU droplets are out (per ai-platform-proposal.md §4). Inference is not our COG. |
| **In-platform model comparison** ("see GPT-4o vs Claude") | Cute but every dev runs this themselves once. Doesn't move the needle. |
| **Sentiment heatmaps over conversations** | C6 covers the on-substrate version. Don't copy the polished version that requires reading raw chats centrally. |
| **"Help desk" mode** (ticketing inbox, agent assignment, SLAs) | Real engineering surface, low strategic upside. Chatbase competes with Zendesk here; we shouldn't. The Zendesk *integration* (tool/action) is enough. |
| **Voice / telephony as a managed surface** | Tempting but: (a) the regulatory surface around recorded calls is massive, (b) demo value vs. effort is poor in 6–8 weeks. Optional C7 add-on post-hackathon. |
| **Custom-CSS widget themes / pixel-perfect branding** | Box A. We've already shipped Shadow-DOM widget with brand-token consistency; "more themes" doesn't change the value story. |
| **Source suggestions** (Chatbase reads conversations and suggests gaps) | Requires reading conversations centrally — incompatible with our C6 posture. |
| **Affiliate program / partner directory** | GTM motion, not product. Worth doing later; nothing to build now. |

---

## 7. Sequencing recommendation

Reading against `/docs/timeline.md` and the current state (W3, billing
just merged, submission gate 2026-06-21 = ~33 days out), and against the
explicit goal of an Overflow demo that hits the Walrus track's
"agent thesis":

**For the hackathon submission (next ~5 weeks):**

1. **C2 — Webhook tools with signed receipts.** Highest demo value per
   day. Plugs into existing P4 infra. Adds a moment in the demo where
   we point at a Walruscan-linked tool receipt and say "this is what
   the agent did, signed and timestamped, immutable." That's a Plot
   Twist 3.
2. **C1 — Widget v2 session capability + transcript blob.** Two days on
   top of P6. Lets the demo end on "and here's the encrypted transcript
   of the conversation you just had — only the operator can decrypt it."
3. **C3 — Encrypted lead capture (browser-side Seal).** ~5 days. Strong
   for the closing pitch: "lead capture without the lead leaving your
   wallet."

Total ~12 days. Demo arc:

> Upload PDFs → Knowledge bot answers questions citing Walrus blobs (existing
> Verify button) → user fills lead form, encrypted in browser → agent
> calls webhook to operator's CRM, receipt signed by agent's sub-wallet
> and archived on Walrus → "now revoke the agent on chain" → next chat
> message fails, but the operator can still decrypt the transcript and
> lead → click receipt's Walruscan link to prove the CRM call really
> happened.

That arc is impossible for Chatbase. Every single one of those moments is
a Move call or a Seal envelope away from Chatbase being unable to match.

**Post-hackathon (the SaaS runway):**

4. **C5 — White-label / agency mode.** The bizdev unlock. Sells against
   Chatbase's $199/mo white-label add-on with a fundamentally stronger
   value prop. Bring on 1–3 regulated-vertical agency design partners.
5. **C7 — WhatsApp + Slack channels.** WhatsApp first; it's where the
   enterprise pilots actually live.
6. **C4 — Multi-source ingest (website, Notion, GitHub first).** Once
   we want to compete on "drag-drop your docs" content marketing, this
   is the table stakes.
7. **C6 — Privacy-preserving analytics.** Sells against Chatbase's
   "Advanced analytics" Pro-tier feature for the same buyers C5 brings
   in.

---

## 8. Open questions for Razvan

1. **Is the agency / reseller motion (C5) on-strategy for NanoSoft, or
   should Kraterion stay a direct-sell product through 2026?** The
   answer changes whether C5 is the post-hackathon flagship or a year-2
   feature.
2. **Voice / telephony (C7 stretch) — yes or no in 2026?** The regulatory
   weight of call recording in EU + US is non-trivial; doing it well
   means having a story for HIPAA-track recordings. Worth a separate
   decision.
3. **Do we hold a strong opinion on which CRM gets the first webhook
   tool template (C2)?** HubSpot is the developer-friendly choice;
   Salesforce is the enterprise-credibility choice. Picking one
   shapes the canonical demo.
4. **Per-end-user identity story.** C1's `ChatSession` is currently
   anonymous-visitor-keyed. Do we want to extend it to support
   zkLogin-identified end-users for the use cases where the operator
   wants to know "this was the same person across three sessions"?
   That is a meaningful additional surface; worth scoping separately.
5. **Conversation analytics scope (C6).** Are we building this for our
   own dashboard or as an exposed product surface that the operator
   sells onward? The latter is more interesting strategically and harder
   technically.

---

## 9. Closing observation

Chatbase's success is a proof point that the **wrapper** around RAG is the
product, not the RAG. Their corpus ingestion is unremarkable. Their
retrieval is unremarkable. Their LLM choice is unremarkable. They won
because they shipped the five-step journey (ingest → configure → test →
deploy → act) with no rough edges and an extraordinarily aggressive
content-marketing engine.

Kraterion has every piece of that journey *already wired* — Knowledge
ingest (K1), agents (P3), tools (P4), widget (P6), MCP (K3a). The
substrate underneath is where we diverge: Sui ownership, Walrus
durability, Seal revocability. The seven candidates above are the
features that turn "we have a chatbot platform too" into "we have a
chatbot platform that does things no SaaS architecturally can."

The submission demo should hit at least C1 + C2 + C3. The post-hackathon
year should pick C5 as the GTM unlock.

---

## Sources

- [Chatbase homepage](https://www.chatbase.co/)
- [Chatbase pricing](https://www.chatbase.co/pricing)
- [Chatbase docs](https://www.chatbase.co/docs)
- [Chatbase security](https://www.chatbase.co/security)
- [Chatbase privacy policy](https://www.chatbase.co/legal/privacy)
- [Chatbase DPA](https://www.chatbase.co/legal/dpa)
- [Chatbase Stripe Action docs](https://www.chatbase.co/docs/user-guides/chatbot/actions/stripe-action)
- [Chatbase custom domains docs](https://www.chatbase.co/docs/developer-guides/custom-domains)
- [Chatbase Zapier integrations](https://zapier.com/apps/chatbase/integrations)
- [Chatbase GDPR announcement](https://www.chatbase.co/blog/gdpr-compliant)
- [Chatbase RAG explainer](https://www.chatbase.co/blog/rag-from-scratch)
- [Chatbase review (Chatimize)](https://chatimize.com/reviews/chatbase/)
- [Chatbase review (Lindy)](https://www.lindy.ai/blog/chatbase-review)
- [Chatbase review (SiteGPT)](https://sitegpt.ai/blog/chatbase-review)
- [Chatbase review (Apify)](https://use-apify.com/blog/chatbase-review-ai-chatbot-builder)
- [Chatbase review 2026 (Featurebase)](https://www.featurebase.app/blog/chatbase-pricing)
- [Eesel comparison](https://www.eesel.ai/blog/chatbase-ai-review-2025-features-pricing-and-top-alternatives)
- [Promptfoo Chatbase red-team writeup](https://www.promptfoo.dev/docs/guides/chatbase-redteam/)
