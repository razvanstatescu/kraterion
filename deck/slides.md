---
theme: default
title: Kraterion — a verifiable runtime for AI agents
info: Sui Overflow 2026 · Walrus track · 5-minute demo-day pitch
mdc: true
transition: fade
canvasWidth: 1280
class: p0 slide-ink
---

<SlideHook />

<!--
Hook (0:10): "I'm Razvan. This is Kraterion — storage you actually own, where every move an AI agent makes over your data is provable. Here's why that matters."
-->

---
layout: default
class: p0
---

<SlideProblem />

<!--
Problem (0:35): Every company is racing to point AI agents at their data.
[click] But you can't prove what those agents read, kept, or leaked — you trust them on faith.
[click] And the data isn't really yours: your provider owns it, can read it, and if you cancel it vanishes.
[click] Leaving? You pay to get your own data back.
[click] And now regulators are moving — the EU AI Act will require audit trails you can't forge, fines up to 3% of global revenue. Today's tools only give you logs the vendor controls.
-->

---
layout: default
class: p0
---

<SlideSolution />

<!--
Solution (0:35): Kraterion is S3-compatible storage where you actually own the files — and every action an AI agent takes is written as a receipt anyone can verify. Three guarantees no cloud provider can match:
[click] cancel us, and your files stay.
[click] revoke us, and we genuinely cannot read them — enforced by cryptography, not our promise.
[click] leave us, and your files come with you.
Observability tools watch your agents but prove nothing; storage networks know nothing about agents. Kraterion is the only place your data, keys, and audit trail are all yours.
-->

---
layout: default
class: p0 slide-ink
---

<SlideDemo />

<!--
Demo (1:05, narrate over the recorded clip):
"First, ownership. I upload a file with standard AWS tools — Kraterion is a drop-in S3 endpoint. Now I revoke access on-chain, one click. Watch — the same read now fails. We're cryptographically locked out; the file stays, owned by me.
Now agents. I point an AI agent at this bucket and ask a question. It answers using only my data. And here's the part nobody else has — Kraterion just wrote a receipt to the blockchain: exactly which files the agent read. Anyone — me, an auditor, a regulator — can pull that receipt and confirm it was never altered. Revoke the agent, and it goes blind too. Storage you own, agents you can prove — working today."
-->

---
layout: default
class: p0
---

<SlideHow />

<!--
How it works (0:30): Under the hood it's three proven pieces. Your files live on Walrus, so you own them, not us. They're locked with Seal, so only you hold the key. And every action is recorded on Sui as a receipt no one — including us — can forge or erase. Simple to use: it's just S3. Impossible to fake: it's on-chain.
-->

---
layout: default
class: p0
---

<SlideWhy />

<!--
Why Sui (0:20): And this only works on Sui. Walrus gives us storage the user owns. Seal makes revocation cryptographic — not a setting we flip, a key we lose. And Sui records every receipt permanently. No other stack composes all three. Sui-native by necessity, not decoration.
-->

---
layout: default
class: p0
---

<SlideMarket />

<!--
Market (0:35): The timing isn't an accident. A ~$15B storage market is colliding with a ~$12B AI-agent market growing 45% a year — and nobody's built the trust layer between them. The gap: 88% of companies use AI, but only 8% can actually govern it, and most hit an agent-related security incident last year. The buyers are developers escaping cloud lock-in and enterprise AI teams staring down that compliance deadline.
-->

---
layout: default
class: p0
---

<SlideBusiness />

<!--
Monetization (0:30): We make money the way Vercel and Supabase do — product-led and usage-based. Developers start free, self-serve, and we earn more only as their usage grows. No sales gate, no lock-in. That model built Supabase to $170M in revenue and Vercel to $200M. Our storage is recurring, our egress is 9× cheaper than S3, and an on-chain reserve keeps every file funded. A real business, not a grant.
-->

---
layout: default
class: p0
---

<SlideRoadmap />

<!--
Roadmap + GTM (0:20): From here: we harden and audit, then ship to mainnet, and open up programmable access policies. Go-to-market is the wedge itself — adopting Kraterion means changing one URL, so it spreads developer to developer, backed by our Walrus Foundation grant.
-->

---
layout: default
class: p0 slide-ink
---

<SlideClose />

<!--
Close (0:15): Kraterion — storage you can't be locked out of, on a platform that can't lock you in — built for the humans writing the code and the agents reading the data. Thank you.
-->
