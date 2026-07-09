# Competitive differentiation + regulatory "why now"

Web research, 2026-07-09. Sources at bottom.

## 1. Competitive landscape — three camps, and the gap between them
Kraterion's whole thesis: nobody sits at the intersection of **storage + access control + verifiable agent audit**. Each camp owns one piece and structurally can't do the others.

### Camp A — AI observability (Langfuse, LangSmith, Arize, Helicone, Braintrust)
- What they do: tracing, evals, monitoring, drift/alerts for LLM/agent apps.
- Structural limits: **centralized** and built for request/response, **retrofitted** to agents via session IDs. The logs are **the vendor's own records** — not independently verifiable, not tamper-evident, not cryptographically tied to identity. (Search for their "tamper-proof" capabilities returned nothing — they don't market it because they don't have it.)
- They **don't store your data** or **enforce access** — they observe. You still need S3 + KMS underneath.
- **Kraterion's edge:** the trace is anchored on-chain (SHA-256 `trace_hash`), so an auditor/regulator can independently verify what an agent read AND that the record wasn't altered after the fact. Langfuse/LangSmith structurally can't offer that (`research-technical.md` §2A).

### Camp B — decentralized storage (Filecoin, Arweave, Storj, Walrus)
- **Filecoin:** massive/cheap cold bulk, but slow — not hot-data S3-drop-in UX.
- **Arweave:** pay-once-store-forever *permanence* — a liability for private/mutable app data (can't delete; wrong shape for encrypted per-user data).
- **Storj:** the closest — S3-compatible, AES-256, ~$0.004/GB. But it's storage only: **no programmable on-chain access policy, no threshold-encryption revocation, no agent/verifiability layer.**
- **Walrus:** fast hot storage, erasure-coded, up to ~100× more cost-efficient than Filecoin/Arweave; purpose-built as the S3 replacement. **Kraterion builds ON Walrus — not a competitor.**
- **Kraterion's edge:** we're not another storage network; we productize Walrus + Seal access control + an on-chain verifiable agent runtime. Storage players don't build the trust/agent layer.

### Camp C — the incumbent baseline: S3 + KMS + CloudTrail
- Gives you storage + encryption + an audit log — but: **the provider holds the keys** (can read your data), **CloudTrail is the provider's own log** (they control it; not independently verifiable to a third party), and **you don't own the data** (egress lock-in, ~$8k to exit 100TB).
- **Kraterion's edge:** you hold decryption via Seal (provider can't read after revoke), the audit trail lives on-chain (independently verifiable, not provider-controlled), and files are portable/owned.

### The one-liner (for slide + Q&A)
> "Observability tools watch your agents but can't prove anything and don't hold your data. Storage networks hold your data but know nothing about agents. Hyperscalers hold your data *and* your keys *and* your logs. Kraterion is the only place where the storage, the access, and the audit trail are all owned by you — and verifiable by anyone."

## 2. Regulatory "why now" — the audit-trail mandate is arriving (2026–2028)
This turns "nice to have" into "about to be required." Perfect urgency for slide 2 + slide 7.

- **EU AI Act (Reg. 2024/1689), Article 12 — record-keeping/logging:** high-risk AI systems must **automatically log operation across the lifecycle** enabling **full reconstruction of behavior**; deployers must **retain logs ≥6 months**. Articles 12 & 13 = decision traceability & audit compliance.
- **Penalties:** up to **€15M or 3% of global turnover** (Tier 2).
- **Timeline (imminent, still moving):** high-risk obligations were set for **2 Aug 2026**; the Digital Omnibus provisionally moved **standalone high-risk to 2 Dec 2027** (embedded-in-products to 2 Aug 2028). Either way, the compliance wave is **2026–2028** — enterprises are preparing now.
- **The gap the regs expose = exactly what we fill:**
  - "AI accesses regulated data under a **service account / API key, and no log records which individual directed the access**" — cited as the most common enterprise compliance gap. → Kraterion's **per-agent sub-wallet** binds every access to a distinct on-chain identity.
  - "**Policy documentation without technical evidence of enforcement is insufficient**" under the EU AI Act, HIPAA, and the US Treasury's Financial Services AI Risk framework. → Kraterion gives **cryptographic proof of enforcement**, not a policy PDF.
  - Regulators want "full reconstructability… and a complete audit trail of every relevant interaction," logs conforming to "recognised standards." → Kraterion's tamper-evident, replayable, independently-verifiable trace is a **stronger** form than a provider-controlled log.

### Honesty guardrail (keep for Q&A)
Don't claim "EU AI Act certified/compliant." Say: **"built for the audit-trail obligations regulators are now mandating"** — Kraterion provides the technical substrate (verifiable logs, identity-bound access, provable enforcement) that makes compliance *demonstrable*. Compliance is the deployer's responsibility; we make it possible to prove.

## 3. Where this plugs into the deck
- **Slide 2 (Problem):** add the "why now" beat — "regulators are about to require audit trails you can't forge (EU AI Act Art. 12, fines up to 3% of global turnover), and today's tools give you logs the vendor controls." Raises stakes without tech.
- **Slide 3 or 6:** drop the competitive one-liner (observability watches / storage holds / hyperscalers own it all / Kraterion = owned + verifiable).
- **Slide 7 (Market + adopts):** the regulatory mandate is the adoption forcing-function for enterprise AI teams; pairs with the "88% use AI, 8% govern it" gap.
- **Q&A kit:** the three-camp matrix + the "we're not competing with Walrus, we productize it" line + the "not certified, but we make compliance provable" guardrail.

## Sources
- Observability: https://www.digitalapplied.com/blog/agent-observability-platforms-langsmith-langfuse-arize-2026 · https://agenticcareers.co/blog/ai-agent-observability-stack-2026 · https://mlflow.org/top-5-agent-observability-tools/
- Storage comparison: https://www.securities.io/decentralized-storage-filecoin-arweave-storj-comparison/ · https://heybeluga.com/articles/walrus-protocol-filecoin-arweave-storage/ · https://blockeden.xyz/blog/2026/01/10/walrus-protocol-sui-decentralized-storage-wars/
- EU AI Act Art. 12: https://artificialintelligenceact.eu/article/12/ · https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12 · https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/ · https://www.asqav.com/blog/posts/eu-ai-act-audit-trail-requirements · https://aigovernancedesk.com/eu-ai-act-articles-12-13-decision-traceability/
- AI audit-trail/provenance compliance: https://zylos.ai/research/2026-05-01-ai-agent-governance-compliance-2026/ · https://www.kognitos.com/blog/ai-audit-trail-requirements-2026-checklist/ · https://promethium.ai/guides/ai-agent-data-governance-enterprise-playbook-2026/
