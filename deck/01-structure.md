# Slide structure — v3 (story-first, non-technical jury)

5:00 hard cap. ~10 slides, recorded demo as the centrepiece. Budget ~4:50 for buffer.
**This is a pitch, not a tech talk.** Jury is likely non-technical. Build around a story; let the technical parts (Sui/Walrus/Seal) appear as *evidence*, not the frame. All six Sui-required points covered, tagged **[REQ]**.

## Narrative spine (the one throughline)
> Every company is racing to point AI agents at their data — but you can't see what those agents actually did with it, and you don't even own the data they're reading. Kraterion makes both **provable**: you truly own your files, and every agent action leaves a receipt anyone can verify. It's the trust layer for the agent era — and it only works because of Sui.

Emotional arc: **tension (you're trusting blindly) → relief (now you can verify) → proof (watch it) → why it's defensible (Sui) → who wants it → where it goes.**

## Tone & framing rules
- Plain language, benefits over mechanisms. Say "you get a receipt anyone can verify," not "SHA-256 canonical-JSON anchored on-chain."
- One idea per slide, big type, minimal text. No architecture jargon on-screen.
- Technical depth lives in exactly **two light slides** (5 "how it works" + 6 "why Sui") plus what the demo *shows* — always framed as an outcome.
- Have the deep technical facts ready for **Q&A**, not on the slides (`research-technical.md`).
- Brand: design tokens only; no pure black/white, no weight ≥600, no shadows/gradients, sentence case.

## Slides
| # | Slide | Time | Story beat / covers | Notes |
|---|---|---|---|---|
| 1 | **Hook / Title** | 0:10 | Set the frame | "Kraterion — the trust layer for AI agents and your data." One line, one image. |
| 2 | **Problem** [REQ] | 0:35 | Tension | Two fears, plainly: you point AI agents at sensitive data and can't prove what they read or leaked; and your cloud provider owns your files, can read them, and can lock you out. **Why now:** regulators are about to *require* audit trails you can't forge (EU AI Act Art. 12; fines up to €15M / 3% of global turnover, 2026–2028) — and today's tools give you logs the vendor controls. No tech on-screen. |
| 3 | **Solution** [REQ] | 0:35 | Relief | Kraterion in benefit terms: storage you truly own + every agent action provable + revoke us and we genuinely can't read it. Value = trust you can *verify*, not trust you're asked to *extend*. Differentiation line: "observability tools watch your agents but prove nothing; storage networks hold your data but know nothing about agents; hyperscalers own your data, keys and logs — Kraterion is the only place all three are yours and verifiable by anyone." |
| 4 | **Demo video** | 1:05 | Proof | Recorded, narrated live. Open visceral: upload a file → revoke on-chain → we're locked out. Then expand: point an agent at your data → it answers → show the on-chain receipt of exactly what it read → replay proves it wasn't altered. Benefit narration throughout. |
| 5 | **How it works** [REQ tech] | 0:35 | Make it credible | ONE simple, benefit-labeled diagram: your files live on **Walrus** (you own them) · locked with **Seal** (only you can unlock) · every action recorded on **Sui** (a receipt no one can forge). That's the whole "technical implementation" a non-technical judge needs. |
| 6 | **Why Sui** [REQ] | 0:20 | Why it's defensible | Plain: none of this is possible without Sui — owned storage (Walrus), cryptographic revocation (Seal), tamper-proof receipts (Sui). Answers the #1 judge question directly. |
| 7 | **Market + who adopts** [REQ] | 0:35 | How big, who feels the pain | Layered TAM: **object storage ~$15B+** (double-digit CAGR) × **AI agents ~$12B @ ~45% CAGR** × **AI governance $750M→$5.6B**. The gap we fill: **88% of orgs use AI, only 8% can govern it; 88% hit an AI-agent security incident last year.** Who: devs escaping S3 lock-in (a 100TB exit ≈ $8k in egress) + enterprise AI teams under compliance pressure. |
| 8 | **Monetization + sustainability** [REQ] | 0:30 | A proven business model | "**We monetize like Vercel & Supabase**" — product-led + usage-based: free tier → pay-as-you-go, grow only when the customer's usage grows, no sales gate. Proof the model works: **Supabase ~$170M ARR / 1.7M devs, Vercel ~$200M ARR.** Our egress is **~9× cheaper than S3**; BYOK agent messages are $0 to us. Sustainable: recurring storage + the on-chain renewal engine; near-zero CAC (change one URL). |
| 9 | **Roadmap + go-to-market** [REQ] | 0:25 | Where it goes | Path to production: testnet → mainnet (after audit); programmable access policies next; Walrus Sites. GTM: developer-led via the S3 wedge; Walrus Foundation grant continuation. |
| 10 | **Close** | 0:15 | Land it | Restate the one-liner + three guarantees (cancel → files stay · revoke → we can't read · migrate → files come with you) + one-line credibility (maker behind Inkray/CoinDrip/SuiDevHub) + CTA. |

**Total ≈ 4:55** (10+35+35+65+30+20+35+30+20+15s). ~5s buffer under the hard cap; if long in rehearsal, trim slide 2 or 7 first.

## Verifiability — how to say it to non-technical judges (headline mechanism)
Underneath (for Q&A, `research-technical.md` §2A): agent run → canonical trace → SHA-256 → Seal-encrypt → Walrus → on-chain `anchor_session` / `KraterionSessionAnchored{trace_hash,…}`; replay checks `sha256(trace)==on-chain hash`.
**On stage, say:** "Every time an agent touches your data, Kraterion writes a receipt to the blockchain. Later, anyone — you, an auditor, a regulator — can pull that receipt and prove exactly what the agent read, and that no one changed the record afterward."
- Honesty guardrails (keep for Q&A): we prove *what was read / what tools ran / trace integrity* — **not** that the AI "reasoned correctly." Replay has documented fidelity gaps.
- Deployed pkg (testnet): `0x6eabb85ec3085a8e8af32094d242eef5d063f510ae5d26cd241de680128036d3`.

## ⚠️ Demo must be recorded (infra reality)
Public testnet JSON-RPC retired week of 2026-07-06; only the indexer is on gRPC. Live on-chain writes (PUT signing, anchoring, revoke) are broken on public testnet until the JSON-RPC→gRPC migration lands. → Record against a migrated/self-hosted RPC or narrate a pre-captured anchor tx. This is why we chose recorded video.

## Decisions (locked 2026-07-09)
1. **Framing:** story-first pitch for a non-technical jury; tech as evidence, not spine.
2. **Positioning:** verifiable runtime for AI agents (storage-on-Walrus = the wedge).
3. **No team slide** — solo; track record = one-line credibility close.
4. **Tooling:** Slidev (installed; pnpm 10.16.1 so the release-age guard is active).
5. **Demo:** fully recorded video, embedded locally, narrated live; static screenshot fallback per clip.
6. **Demo opening:** visceral storage-revoke first (~10s), then expand to agent auditability.
7. **Proof:** working product on testnet (capability-led). No fabricated usage metrics.
