# Dropping Enoki on mainnet — zkLogin + sponsored tx for the price of gas

**Goal:** don't pay Enoki's $120/mo seat fee on mainnet. Ideally keep the exact same
UX (Google sign-in, users never touch SUI) and pay **only the real gas** we already
have to pay.

**Bottom line:** yes, this is doable, and the preferred path keeps the self-custody
value prop intact. Enoki is only doing two separable jobs for us, both of which have
first-party, self-hostable replacements. The single biggest de-risker: **we're
launching mainnet fresh, with a new DB and no existing users**, so the one genuinely
hard part of leaving Enoki (salt/address continuity) simply doesn't apply — we choose
our own scheme on day one.

---

## What Enoki actually does for us today (grounded)

Only two apps import `@mysten/enoki` (`apps/control-plane`, `apps/dashboard`). It does
exactly two things:

1. **zkLogin proving + address derivation.**
   - Server: `apps/control-plane/src/enoki/zklogin.service.ts:90` — `client.getZkLogin({ jwt })`
     verifies the Google JWT and returns the user's Sui `address`.
   - Client: `apps/dashboard/src/app/providers.tsx:56-88` (`registerEnokiWallets`) runs the
     whole client-side zkLogin ceremony (ephemeral key, nonce, OAuth popup, proof) inside
     the Enoki wallet; `apps/dashboard/src/lib/auth.ts:42-76` just reads `session.jwt`.
2. **Sponsored transactions** (so users don't need SUI).
   - Server: `apps/control-plane/src/enoki/sponsorship.service.ts` — `createSponsoredTransaction`
     / `executeSponsoredTransaction`.
   - The only tx types sponsored are the seven **user-signed bucket-lifecycle calls** built
     in `apps/control-plane/src/buckets/prepare/prepare.service.ts` (create bucket, grant/revoke
     API access, set visibility). Everything the gateway/worker do on-chain (blob register/
     certify, pool vault create/extend, renewals) is **already platform-signed and
     platform-paid** through our own gas pool — Enoki isn't involved there at all.

Two facts that make replacement cheap:

- **`@mysten/sui` (which ships `@mysten/sui/zklogin`) is already a dependency in every app**
  — `getZkLoginSignature`, `jwtToAddress`, `generateNonce`, `genAddressSeed`, etc. are
  installable with **no new packages**; they're just not imported yet.
- **We already run a gas station.** `packages/walrus-client/src/gas-pool.ts` (`GasCoinPool`,
  Redis-coordinated coin leases) + `apps/control-plane/src/sui/operator-keypair.service.ts`
  (the `api_decryption` operator wallet) already sign and pay gas for platform txs. The only
  thing missing for self-sponsorship is a *gas-owner ≠ sender* dual-signature path (we always
  sign single-signer today).

---

## The de-risker: fresh mainnet = no salt migration

A zkLogin address is derived from `(iss, aud, sub) + user_salt`. Enoki owns that salt and
never exposes it, so *migrating existing users* off Enoki would change everyone's address and
break every on-chain object they own (`zklogin.service.ts:105-113` even hard-refuses an address
mismatch). **On a fresh mainnet launch there are no existing users**, so we define the salt
scheme ourselves at launch and every address is correct from the first sign-in. This removes
the only truly hard blocker. (Decision to lock before launch: our salt strategy is permanent —
see Plan 1.)

---

## Cost comparison

| | Enoki (today) | Plan 1 (self-host) | Plan 2 (drop zkLogin) |
|---|---|---|---|
| Recurring fee | **$120/mo flat** | $0 SaaS | $0 SaaS |
| Sponsorship cost | gas + Enoki fee | **real gas only** | **real gas only** |
| Extra infra | none | 1 small prover VM (+ trivial salt service in-process) | none |
| Self-custody value prop | ✅ | ✅ preserved | ⚠️ weakened (platform holds keys) |
| Rewrite size | — | moderate (mostly dashboard) | small |

The prover is the only new fixed cost in Plan 1, and it's modest: **a ZK proof is generated
once per login, not per transaction** (a proof is valid until its `maxEpoch`, i.e. days on
mainnet), so one small Linux/amd64 instance serves many users and doesn't scale per-seat.

---

## Plan 1 — Self-host (recommended: keeps the value prop, pays only gas)

Two independent swaps. They can ship in either order; the sponsorship swap alone already
kills most of the Enoki dependency and can land first.

### 1A. Sponsorship → our own operator wallet (pay only gas)

We already fund the operator wallet with SUI and lease its gas coins through `GasCoinPool`.
Sponsoring a user's zkLogin tx is the standard Sui sponsored-tx pattern: the user is the
`sender`, our operator wallet is the **gas owner**, both sign.

Steps:
1. Add a **sponsor-sign path** to the gas layer. Today `GasCoinPool.execute()` is single-signer
   (`packages/walrus-client/src/gas-pool.ts:239-274`). Add a sibling that: leases a coin, sets
   `sender = user address` + gas owner = operator + `setGasPayment([lease])`, returns the tx
   bytes, and later takes the user's signature, adds the **operator's sponsor signature**, and
   submits both. (This `gasOwner ≠ sender` + dual-signature path is the one primitive we don't
   have yet — grep confirms zero `setGasOwner` usage today.)
2. Replace `SponsorshipService` (`apps/control-plane/src/enoki/sponsorship.service.ts`) with a
   thin service over that path. Keep the **same allow-list guardrail** it has today
   (`allowedMoveCallTargets`) so a sponsored tx can only call our package's functions.
3. `prepare.service.ts` (`:445-478`, the `sponsor()` tail) and the `POST /v1/sponsor/execute`
   controller keep their **exact wire shape** (`{ digest, bytes }` out, `{ digest, signature }`
   in) — only the implementation behind them changes. The dashboard's `useSponsoredTx`
   (`apps/dashboard/src/lib/sponsor.ts`) needs **no change** if we preserve that contract.

Cost: real gas only, from a wallet we already top up. This is the core of the goal.

### 1B. zkLogin proving → self-hosted prover + salt service

Stand up the same components Enoki runs internally:

1. **Prover** (Mysten's images): run `mysten/zklogin` **prover** (internal) + **prover-fe**
   (public) via Docker; download the mainnet Groth16 zkey from the
   `sui-foundation/zklogin-ceremony-contributions` script and verify its b2sum. Linux/amd64;
   size the box for the witness generation (budget ~8–16 GB RAM — validate against the current
   image). One instance is plenty since proving is per-login.
2. **Salt service** — trivial and runs in-process in the control-plane: derive a deterministic
   per-user salt, e.g. `salt = HMAC(SALT_MASTER_SEED, iss|aud|sub)` (16 bytes), with
   `SALT_MASTER_SEED` a new mainnet secret alongside `KEY_WRAPPING_MASTER_KEY`. Deterministic
   derivation means we never have to store per-user salt, and addresses are reproducible
   forever. **This seed is permanent — losing/rotating it changes every address.**
3. **Dashboard** — replace `registerEnokiWallets` with the standard ceremony using the already-
   present `@mysten/sui/zklogin`: generate an ephemeral keypair + randomness + `nonce`
   (bound to a `maxEpoch`), run plain Google OIDC with that nonce, get the ID token, fetch salt
   from our endpoint, derive the address (`jwtToAddress`), POST the JWT to our prover-fe for the
   proof, and assemble signatures with `getZkLoginSignature`. This is the **bulk of the work** —
   the client ceremony that lives entirely inside the Enoki SDK today
   (`providers.tsx:56-88`, `lib/auth.ts`, `lib/sponsor.ts` signing).
4. **Server** — `zklogin.service.ts` swaps `client.getZkLogin` for **local JWT verification**
   (JWKS via `jose`) + our own salt+address derivation, then the same `Account` upsert. Today
   the JWT is decoded-but-not-verified (`zklogin.service.ts:20-22`) because Enoki verified it —
   we add real verification here.

Optional zero-fixed-cost start: Mysten's public dev prover exists, but it's rate-limited and
not guaranteed for production — treat self-hosting as the production path, not the public prover.

### What changes / what doesn't (Plan 1)

- **Unchanged:** `Account`/`Project`/`Bucket` schema, the gateway blob path, Seal, the Move
  package, billing, the whole platform-signed side. `sui_address` stays a real user-owned
  zkLogin address, so ownership + Seal revocation are untouched.
- **Changed:** the dashboard login/signing flow (most of the effort), `zklogin.service.ts`
  (verify locally + derive salt), `sponsorship.service.ts` → operator-sponsor path, plus new
  prover infra and a `SALT_MASTER_SEED` secret. Delete `enoki-client.service.ts` and the
  `@mysten/enoki` dep from both apps.
- **Effort:** moderate. Server side is small and well-scoped; the dashboard zkLogin ceremony is
  the real work. No schema migration.

---

## Plan 2 — Drop zkLogin entirely, platform-managed keys (smallest rewrite)

If we ever want *zero* extra infra (no prover at all) and the smallest code change, we drop
zkLogin and issue a **platform-managed wallet per account** — the same pattern we already use
for sub-wallets.

Steps:
1. Keep Google sign-in as **plain OIDC**; verify the ID token server-side (JWKS). `zklogin_sub`
   becomes the Google `sub` (schema unchanged).
2. On first sign-in, generate an `Ed25519Keypair`, wrap the seed with `KEY_WRAPPING_MASTER_KEY`,
   and store it as a `SubWallet` (exactly like `operator-keypair.service.ts` loads today);
   `Account.sui_address` = that wallet's address.
3. The seven user-signed bucket-lifecycle txs become **platform-signed** by that account wallet,
   gas paid by the existing `GasCoinPool.execute()` **as-is** (sender = signer = gas owner, so
   no sponsor/dual-sig path needed at all).
4. Dashboard: delete `registerEnokiWallets` and the client-side signing in `useSponsoredTx`; the
   prepare/execute endpoints just build → sign → submit server-side. This *removes* dashboard
   code rather than adding it.

- **Cost:** real gas only; **no prover, no salt service, no new VM**.
- **Rewrite size:** small — mostly deletions + one keypair-per-account service.
- **Trade-off (why it's Plan B):** the platform now custodies the user's signing key (KMS-
  wrapped). Blobs are still owned by the user's address and Seal revocation still works, but it
  is no longer non-custodial self-sovereign zkLogin — the platform *can* sign as the user. That
  directly dents the "you own it, we can't act for you" value prop, which is why Plan 1 is
  preferred.

---

## Recommendation

Go **Plan 1**, and ship it in two independent PRs:

1. **Sponsorship first (1A).** Biggest immediate win, smallest surface, reuses infra we already
   run, and turns sponsored-tx cost into pure gas. After this, the only remaining Enoki
   dependency is proving.
2. **Self-hosted zkLogin (1B).** Stand up the prover + salt service, move the ceremony into the
   dashboard, verify JWTs locally. Then delete `@mysten/enoki`.

That leaves the recurring cost as **actual gas + one small prover VM** — no $120/mo seat, and
the self-custody story intact. Keep Plan 2 in the back pocket as the fallback if the dashboard
ceremony work or the prover ops turn out heavier than we want for launch.

### Decisions to lock before building

- **Salt scheme** (deterministic HMAC vs. stored-per-user) — permanent once users exist.
- **`maxEpoch` window** for zkLogin proofs (how long a login stays valid before re-proving).
- **Sponsor wallet funding + alerting** — real SUI now; low-balance alert so sponsorship can't
  silently fail (same discipline as the WAL reserve in the mainnet plan).
- Whether to use our in-house sponsor path (1A) or deploy `MystenLabs/sui-gas-pool` as a
  separate service — in-house is less infra and reuses the operator wallet; the Mysten gas pool
  is the battle-tested option if we outgrow it.

---

## Sources (self-host infra)

- [Set up a proving service for zkLogin — Sui blog](https://www.sui.io/blog/proving-service-zklogin) (prover + prover-fe Docker, mainnet zkey download)
- [zkLogin salt server architecture — Sui blog](https://blog.sui.io/zklogin-salt-server-architecture/)
- [zkLogin technical reference — Sui docs](https://docs.sui.io/sui-stack/zklogin-integration/zklogin)
- [Sui Gas Pool (open source) — repo](https://github.com/MystenLabs/sui-gas-pool) · [announcement](https://www.sui.io/blog/sui-gas-pool-scaling-gas-payments)
- [Sponsored transactions — Sui docs](https://docs.sui.io/concepts/transactions/sponsored-transactions)
