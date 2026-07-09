# Market, adoption & monetization source material

Web research, 2026-07-09. Figures vary by analyst — ranges given, headline pick **bolded**. Cite on slides only the bolded, defensible ones. Sources at bottom.

## 1. Market size — a layered TAM (four converging markets)
Kraterion sits at the intersection of storage + AI-agent trust. Tell it as layers, biggest relevant number first.

- **Cloud object storage:** ~**$15B (2024)**, growing double-digit (~12–16% CAGR) to ~$25B by 2032–2035. Broader cloud storage: $380B by 2031 (17.1% CAGR). → the core "storage you own" market.
- **Decentralized storage:** ~**$8–9B (2025) → ~$70B by 2034**, ~23–27% CAGR. → the wedge we ride (Walrus).
- **AI agents:** ~**$12B (2026), ~45% CAGR**; Gartner: **40% of enterprise apps will embed AI agents by end-2026** (from <5% in 2025); agentic AI could drive 30% of enterprise-app revenue (>$450B) by 2035. → the demand tailwind.
- **AI governance / trust:** **$750M (2024) → $5.6B by 2030, ~40% CAGR.** → the budget line our verifiability plugs into.

**One-line framing:** "A $15B+ storage market and a $12B, 45%-CAGR agent market are colliding — and nobody's built the trust layer between them."

## 2. Why users adopt — the pain (PMF drivers)
The trust gap is real and quantified:
- **57% of orgs run AI agents in production; 49% run 10+.** (agents are here, at scale)
- **~2/3 cite security/risk as the #1 barrier to scaling agentic AI** — ahead of regulation.
- **88% of orgs hit at least one AI-agent security incident in the last 12 months** (data leakage 50%).
- **88% use AI, but only 8% have a comprehensive AI-governance framework.** ← the killer gap stat.
- 38% distrust AI-vendor security; **33% fear vendor lock-in.**
- Gartner: **by 2028, 50% of orgs will adopt zero-trust data governance** as unverified AI data grows. → we ARE zero-trust data governance.

**Storage-side pain (the S3 wedge):**
- AWS S3 egress = **$0.09/GB just to get your own data out**; egress is 6–12% of cloud bills; **a 100TB migration ≈ $8–9k in egress fees alone** — deliberate lock-in.
- Kraterion egress ~**$0.01/GB (~9× cheaper)** AND the files are yours (no exit tax).

**Who adopts:** (1) developers already building on S3 who want out of lock-in; (2) enterprise AI teams under compliance pressure who need to *prove* what their agents did.

## 3. Monetization — "Vercel / Supabase style" (PLG + usage-based)
Kraterion's `knowledge-base/pricing.md` already IS this model; name it after proven winners so a jury instantly gets it.

**The model:** product-led growth + usage-based metering. Developers self-serve, start on a generous **free tier**, and we earn more only as their usage grows — no sales gate, no seats, no lock-in. Land-and-expand.

**It's proven at scale (comps):**
- **Supabase: ~$170M ARR (May 2026)**, up from ~$30M end-2024 (250% YoY); **1.7M+ developers**; ~40% of recent YC batches; 60% of new databases now launched by AI tools.
- **Vercel: ~$200M ARR (May 2025)**, up from $144M end-2024.
- Both are usage-based, developer-first, bottoms-up. Same motion we're running.

**Kraterion meters (from pricing.md):** storage $0.06/GB-mo (500MB free) · reads $0.40/M (1M free) · writes $5/M · egress $0.01/GB (50GB free) · knowledge index $0.10/GB-day · agent messages BYOK = **$0 to us** (you pay your model provider). No tiers, no minimums, no cancellation fees.

**Why it's sustainable:** storage = recurring by nature; the on-chain renewal engine (PlatformReserve) keeps files funded; margins improve as decentralized-storage cost falls. The wedge (drop-in S3) has near-zero CAC — developers change one URL.

## 4. Deck usage
- **Slide 7 (Market + adoption):** layered TAM (storage $15B+ / agents $12B @45% / governance→$5.6B) + the "88% use AI, 8% govern it" gap + who feels it.
- **Slide 8 (Monetization):** "We monetize like Vercel & Supabase" — PLG + usage-based; Supabase $170M ARR / 1.7M devs, Vercel $200M ARR as proof the model works; egress 9× cheaper; sustainable via recurring storage + renewal engine.
- **Slide 9 (Roadmap + GTM):** testnet→mainnet (audit); programmable policies; developer-led GTM via S3 wedge + Walrus grant.

## Sources
- Cloud object/cloud storage size: https://www.skyquestt.com/report/cloud-object-storage-market · https://www.verifiedmarketresearch.com/product/cloud-object-storage-market/ · https://www.globenewswire.com/news-release/2026/05/19/3297727/0/en/Cloud-Storage-Market-Surges-to-380-15-billion-by-2031-CAGR-17-1.html
- Decentralized storage: https://marketintelo.com/report/decentralized-storage-market · https://www.verifiedmarketreports.com/product/decentralized-cloud-storage-solutions-market/
- AI agents: https://www.marketsandmarkets.com/Market-Reports/ai-agents-market-15761548.html · https://www.gartner.com/en/newsroom/press-releases/2026-04-07-gartner-forecasts-supply-chain-management-software-with-agentic-ai-will-grow-to-53-billion-in-spend-by-2030
- AI governance: https://www.grandviewresearch.com/industry-analysis/ai-governance-market-report · https://www.marketsandmarkets.com/Market-Reports/ai-governance-market-176187291.html
- Adoption / trust gap: https://guptadeepak.com/ai-agent-observability-evaluation-governance-the-2026-market-reality-check/ · https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/tech-forward/state-of-ai-trust-in-2026-shifting-to-the-agentic-era · https://www.informatica.com/blogs/cdo-insights-2026-ai-adoption-accelerates-but-trust-and-governance-lag-behind.html · https://www.gartner.com/en/newsroom/press-releases/2026-01-21-gartner-predicts-by-2028-50-percent-of-organizations-will-adopt-zero-trust-data-governance-as-unverified-ai-generated-data-grows
- Egress / lock-in: https://spendark.com/blog/cloud-egress-costs-guide/ · https://egresscost.com/
- Monetization comps: https://sacra.com/c/supabase/ · https://sacra.com/research/supabase-at-70m-arr-growing-250-yoy/ · https://devgraphiq.com/supabase-statistics/
