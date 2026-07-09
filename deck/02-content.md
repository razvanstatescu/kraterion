# Slide copy + demo shot list (v1 draft)

Voice: plain, confident, benefit-led. Sentence case everywhere (brand law). On-screen text is minimal — the words below the fold are **spoken**, not printed. Narration is written to ~140 wpm to hit each slide's budget. Total target ≈ 4:55.

Legend: **On-screen** = what the judge sees · **Say** = narration · *Note* = build/visual/source.

---

## 1 · Hook — 0:10
**On-screen:**
> # Kraterion
> the trust layer for AI agents and your data

**Say:**
"I'm Razvan. This is Kraterion — storage you actually own, where every move an AI agent makes over your data is provable. Here's why that matters."

*Note: full-bleed brand slide, logo + one line. No sub-bullets.*

---

## 2 · Problem — 0:35
**On-screen:**
> ## you're trusting AI agents blindly
> - you can't prove what they read or leaked
> - your provider owns your files — and can read them
> - soon, you'll be *required* to prove it

**Say:**
"Every company is racing to point AI agents at their data. But you can't prove what those agents actually read, kept, or leaked — you're trusting them on faith. And the data isn't really yours: cancel your cloud account and the files vanish; the provider can read them anytime; leaving means paying to get your own data back. Now regulators are moving — the EU AI Act will require audit trails you can't forge, with fines up to three percent of global revenue. And today's tools? They only give you logs the vendor controls."

*Source: EU AI Act Art. 12 (`research-competition-regulatory.md` §2). Egress lock-in (`research-market.md` §2).*

---

## 3 · Solution — 0:35
**On-screen:**
> ## own your files. prove every agent action.
> - cancel us → your files stay
> - revoke us → we *can't* read them
> - leave us → your files come with you

**Say:**
"Kraterion is S3-compatible storage where you actually own the files — and every action an AI agent takes is written as a receipt anyone can verify. Three guarantees no cloud provider can match: cancel us, your files stay. Revoke us, and we genuinely cannot read them — enforced by cryptography, not our promise. Leave us, your files come with you. Observability tools watch your agents but prove nothing. Storage networks know nothing about agents. Kraterion is the only place your data, your keys, and your audit trail are all yours."

*Source: three twists (`research-technical.md` §4); competitive one-liner (`research-competition-regulatory.md` §1).*

---

## 4 · Demo — 1:05  (recorded video, narrated live)
**On-screen:** the video. Caption bar bottom-left names the current beat.

**Say (over the cuts):**
"Let me show you. First, ownership. I upload a file with the standard AWS tools — Kraterion is a drop-in S3 endpoint. Now I revoke access on-chain, one click. Watch — the exact same read now fails. We are cryptographically locked out; the file stays, owned by me.
Now the agents. I point an AI agent at this bucket and ask a question. It answers, using only what's in my data. And here's the part nobody else has — Kraterion just wrote a receipt to the blockchain: exactly which files the agent read. Anyone — me, an auditor, a regulator — can pull that receipt and confirm it was never altered. Revoke the agent, and it goes blind too. Storage you own, agents you can prove — working today."

*Shot list below. Record against a migrated/self-hosted RPC — public testnet writes are down (`research-technical.md` ⚠️).*

---

## 5 · How it works — 0:30
**On-screen:** one diagram, three labeled blocks (benefit-first):
> **your files → Walrus** — you own them
> **locked with → Seal** — only you can unlock
> **every action → Sui** — a receipt no one can forge

**Say:**
"Under the hood it's three proven pieces. Your files live on Walrus, so you own them, not us. They're locked with Seal, so only you hold the key to unlock them. And every action gets recorded on Sui as a receipt no one — including us — can forge or erase. That's it. Simple to use: it's just S3. Impossible to fake: it's on-chain."

*Note: animate the three blocks in sequence. No code, no arrows-of-doom.*

---

## 6 · Why Sui — 0:20
**On-screen:**
> ## this only works on Sui
> owned storage · cryptographic revocation · unforgeable receipts

**Say:**
"And this only works on Sui. Walrus gives us storage the user owns. Seal makes revocation cryptographic — not a setting we flip, a key we lose. And Sui records every receipt permanently. No other stack composes all three. This is Sui-native by necessity, not decoration."

*Source: why-only-Sui (`research-technical.md` §4).*

---

## 7 · Market + who adopts — 0:35
**On-screen:**
> ## a $15B market, colliding with a $12B one
> object storage ~$15B+ · AI agents ~$12B @ ~45%/yr · AI governance → $5.6B
> **88% of companies use AI. 8% can govern it.**

**Say:**
"The timing isn't an accident. A fifteen-billion-dollar storage market is colliding with a twelve-billion-dollar AI-agent market growing forty-five percent a year — and nobody's built the trust layer between them. Here's the gap: eighty-eight percent of companies now use AI, but only eight percent can actually govern it, and most hit an agent-related security incident last year. The buyers are developers escaping cloud lock-in and enterprise AI teams staring down that compliance deadline."

*Source: `research-market.md` §1–2. Say "roughly", not false precision.*

---

## 8 · Monetization + sustainability — 0:30
**On-screen:**
> ## we monetize like Vercel and Supabase
> free tier → pay-as-you-go · grow when the customer grows
> Supabase ~$170M ARR · Vercel ~$200M ARR — same motion

**Say:**
"We make money the way Vercel and Supabase do — product-led and usage-based. Developers start free, self-serve, and we earn more only as their usage grows. No sales gate, no lock-in. That model built Supabase to a hundred-seventy-million in revenue and Vercel to two hundred million. Our storage is recurring by nature, our egress is nine times cheaper than S3, and an on-chain reserve keeps every file funded. It's a real business, not a grant."

*Source: `research-market.md` §3.*

---

## 9 · Roadmap + go-to-market — 0:20
**On-screen:**
> ## where it goes
> testnet → mainnet (post-audit) · programmable access policies · Walrus Sites
> go-to-market: drop-in S3 = change one URL

**Say:**
"From here: we harden and audit, then ship to mainnet, and open up programmable access policies. Go-to-market is the wedge itself — adopting Kraterion means changing one URL, so it spreads developer to developer, backed by our Walrus Foundation grant."

*Source: `research-product.md` §6–7.*

---

## 10 · Close — 0:15
**On-screen:**
> # storage you can't be locked out of
> # a platform that can't lock you in
> kraterion · built by the maker behind Inkray & CoinDrip

**Say:**
"Kraterion: storage you can't be locked out of, on a platform that can't lock you in — built for the humans writing the code and the agents reading the data. Thank you."

*Source: one-pager close; credibility one-line (`research-product.md` §8). No team slide.*

---

# Demo shot list (record these clips → `assets/video/`)
Target ~60–65s total, cut to match narration. Muted; narrate live. Keep one static screenshot fallback per clip.

| # | Clip | Shows | Command / UI | Status |
|---|---|---|---|---|
| A | **Upload** | drop-in S3 | `aws s3 cp report.pdf s3://mybucket/ --endpoint-url …` succeeds | ✅ (needs migrated RPC for on-chain write) |
| B | **Revoke → read fails** | ownership/kill-switch | dashboard "revoke access" (signs `revoke_all`) → `aws s3 cp s3://mybucket/report.pdf .` now **AccessDenied / decrypt fails** | ✅ Move+Seal path |
| C | **Agent answers** | agents + RAG | ask the agent a question (dashboard chat or OpenAI SDK / MCP) → cited answer | ✅ |
| D | **On-chain receipt** | verifiability (the money shot) | open the anchor tx in a Sui explorer → highlight `KraterionSessionAnchored` → `trace_hash` + `walrus_blob_id` | ✅ (emission needs migrated RPC) |
| E | **Replay verifies** | tamper-evidence | `GET /v1/runs/:txDigest/replay` → "sha256 matches on-chain hash ✓" | ✅ verify mode |
| F | **Revoke agent → blind** | revocation on agents | revoke → agent read now fails | ✅ |

*Recording prerequisite (blocker): resolve the JSON-RPC→gRPC transport so on-chain writes land (finish migration, self-host an RPC, or pre-capture the anchor tx and narrate over it). See `research-technical.md` §5.*

---

## Open questions before final polish
1. **Traction:** any real user/waitlist/design-partner signal to add to slide 4 or 7? (You mentioned none yet — leave capability-led if so.)
2. **Hook line:** "the trust layer for AI agents and your data" vs. a punchier alt (e.g. "own your data. prove your agents.") — pick in build.
3. **Demo recording:** which path for the RPC blocker? Decides when we can shoot.
