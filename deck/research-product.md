# Product / business source material (grounded in repo docs)

Mined 2026-07-09 from the project's own docs. Facts cited to doc + section. **Do not invent numbers.**

> **Positioning (locked 2026-07-09):** lead with **"verifiable runtime for AI agents"** — the current framing (`one-pager.md`, `progress.md` 2026-06-18: *"a runtime for agents you can audit"*). S3-on-Walrus storage is the foundation/wedge, not the headline. **Solo project — no team slide** (per Razvan's instruction), but the track record is still usable as credibility.

## 1. Problem
- Two-part structural pain (`implementation-plan.md` §13.1): providers *(1) delete your files when you cancel, (2) read your files whenever they want.*
- Current, agent-era expansion (`one-pager.md`): *"Cancel your account, the files disappear. Get locked out, the files are gone. The provider has a bad week, your data is sitting on their servers in the clear. And the AI agents you point at that data? They read it on trust — no way to prove what they actually saw."*
- The agent-runtime problem: you can't prove what an AI agent actually read/did over your data. Trust-based, unauditable.

## 2. Solution + value prop
- Current headline (`one-pager.md`): *"S3-compatible object storage built for humans and agents — where you actually own the files, and revoking us means we genuinely cannot read them anymore."*
- Three pillars (all shipped per `progress.md`/`timeline.md`):
  1. **S3-compatible storage on Walrus** (own the files) — the wedge.
  2. **Knowledge bases / RAG over any bucket** — *"the first RAG product where you can cryptographically prove what the AI actually read."*
  3. **Agents as a first-class resource** — per-agent OpenAI-compatible endpoint + native MCP server, *"every agent runs through its own sub-wallet."*
- Cross-cutting: *"one sub-wallet per thing that touches your data"* — least-privilege, every grant/revoke an on-chain tx.
- Three guarantees no provider can match (`implementation-plan.md` §14.2): cancel→files persist; revoke→we can't read; migrate→files come with you.
- Strongest moment: on-chain revocation enforced by **Seal threshold key servers, not by Kraterion** (§2.6).

## 3. Target users + PMF
- Wedge = **S3 drop-in**: boto3, aws-cli, rclone "just work" (`one-pager.md`; §6.6). No new SDK to learn.
- Users: developers already on S3 + **AI agents / agent developers** reading over the same buckets.
- Frictionless onboarding: "Continue with Google" via zkLogin, Enoki-sponsored gasless writes — users never hold SUI (`one-pager.md`, §2.1).

## 4. Business model / monetization — CURRENT (`knowledge-base/pricing.md`)
Pure pay-as-you-go; generous free band + flat per-unit rate; no tiers/minimums/cancellation fees.

| Resource | Free band | Rate above |
|---|---|---|
| Storage | 500 MB/mo | $0.06 / GB-month |
| Reads (GET/HEAD/LIST) | 1M ops/mo | $0.40 / M ops |
| Writes (PUT/DELETE) | 1k ops/mo | $5.00 / M ops |
| Egress | 50 GB/mo | $0.01 / GB (~9× cheaper than S3's $0.09) |
| Knowledge index | 1 GB-day/mo | $0.10 / GB-day |
| Agent messages (BYOK) | — | $0 to Kraterion (pay your model provider) |

- Billing built: Stripe pay-as-you-go (sandbox) through B5 — inline Elements, hourly meter rollups, metered products. Live-mode = one env flag, deferred post-submission.
- ⚠️ Old flat-tier margins (§11.2: ~44% gross margin, break-even ~1,500 Pro) are pegged to superseded pricing — recompute before quoting.

## 5. Sustainability
- Storage = inherently recurring revenue.
- **Renewal worker (live):** BullMQ worker scans blobs/pools near expiry, batch-extends (~50/PTB), funded from a single **`PlatformReserve`** WAL pot (`decisions.md` 2026-05-08). Pricing bakes in ~12 months prepaid WAL runway per file (§11.2).
- Portability as a feature: after cancellation files persist on-chain; user/anyone can keep funding storage directly via Walrus `shared_blob::fund`/`extend`.
- On-chain pool ops measured < 0.007 SUI (~$0.018) each, size-independent (`progress.md` 2026-05-18, `walrus-calibration.md`).

## 6. Roadmap / path to production
- **Testnet → mainnet:** currently Sui + Walrus **testnet only**; Move package unaudited/testnet-only; mainnet gated on audit (~$15–25k) in "Phase 1 mainnet beta" (§4.5).
- Roadmap slide (§14.2 slide 8): mainnet beta · Stripe live billing · **gated mode (custom Move policies)** · Walrus Sites integration · self-custody mode · enterprise dedicated publishers.
- Gated mode = the headline post-hackathon programmability differentiator; explicitly cut from v1 (§16.1, CLAUDE.md).
- Submission deadline: **Jun 21, 2026** (build ran ahead of schedule; `timeline.md`).

## 7. Go-to-market
- Developer-led: the S3 drop-in wedge IS the GTM; auto-generated boto3/aws-cli/rclone quickstarts on API-key creation (§2.1, §9.2).
- Ecosystem: landing page, demo video (#1 deliverable), X/Walrus X-Space, **Walrus Foundation continuation grant** (ask $50–80K, positioned as continuation of Inkray).
- Full 8-surface marketing site built (`progress.md` 2026-05-20).
- NOT FOUND: paid acquisition / sales motion / CAC strategy.

## 8. Credibility (NO team slide — solo — but track record is fair game)
- Operator: NanoSoft Technology SRL; solo builder (Razvan Statescu).
- Track record (§14.2 slide 9): **Inkray ($80K Walrus grant) · Storewave (Walrus Haulout winner) · CoinDrip (Sui Overflow 2025 winner) · 10+ Sui dev programs · SuiDevHub founder.**
- Walrus Foundation relationships; 4 shipped `seal_approve_*` patterns in Inkray → claimed head start on Seal.

## 9. Where we are now (status — substantially complete, ahead of schedule)
- On-chain: Move pkg on testnet (`0x73b1…fa14`), `PlatformReserve`, `pool_vault.move` (KraterionPoolVault wrapping Walrus StoragePool), 42/42 Move tests.
- Gateway: full S3 surface, 36/36 boto3 cases green; Seal envelope encryption default.
- Worker/indexer: gRPC checkpoint stream, sole DB writer, lag ≤ 30s; embedding processor + manifest archive to Walrus.
- Control plane: zkLogin (Enoki), projects, API keys, sponsored tx, Knowledge endpoints (`/search`, `/ask`, `/reindex`), **MCP server** (bearer + OAuth 2.1 + DCR + RFC 9728), KMS-wrapped provider creds.
- Dashboard: full console (buckets, object browser + inspector, public links, keys, Knowledge tab, MCP connect, Activity feed).
- AI platform: knowledge bases (hybrid BM25+vector+RRF, **on-chain-verifiable manifests**); agents (OpenAI-compatible, function-calling, streaming); embeddable chat widget; **MemWal** agent memory; **replayable agent sessions with on-chain session anchors**.
- Both demo twists wired (cancellation persistence + on-chain revocation).
- Tests: 33/33 control-plane Vitest, 36/36 boto3 gateway, all `tsc --noEmit` clean.

## Terminology note
Docs say `SharedBlob`; current code uses **`PooledBlob` / `KraterionPoolVault` wrapping Walrus `StoragePool`**. Use current terms with judges.

## Untapped docs worth a deeper read for content
`docs/ai-platform-proposal.md`, `docs/kraterion-strategy-v3.md`, `docs/monetization-and-billing.md`, `docs/website-plan.md`.
