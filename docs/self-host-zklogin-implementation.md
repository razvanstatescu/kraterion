# Self-hosted zkLogin + sponsorship — implementation status (Plan 1)

Branch: `feat/self-host-zklogin-sponsorship`. Drops the Enoki dependency so we
pay no per-seat fee — only real gas. Two halves: **1A** self-sponsored
transactions (our own operator wallet) and **1B** self-hosted zkLogin
(prover + salt + local JWT verification). `@mysten/enoki` is fully removed from
both `apps/control-plane` and `apps/dashboard`.

## What changed

### 1A — Sponsorship via our operator wallet (was Enoki)
- `packages/walrus-client/src/gas-pool.ts` — added a sponsor lease path to
  `GasCoinPool`: `leaseForSponsor()` (longer TTL to span the user round-trip),
  `releaseSponsorLease()` (failure-path refetch), and
  `releaseSponsorLeaseFromEffects()` (deterministic release from tx effects —
  avoids a version-mismatch race). Exposed `gasBudgetMist`.
- `apps/control-plane/src/sui/gas-pool.service.ts` — pass-throughs +
  `isReady()`.
- `apps/control-plane/src/enoki/sponsorship.service.ts` — **rewritten**: builds
  the tx with `sender=user`, `gasOwner=operator`, leases a pool coin, sponsor-
  signs, stashes `{bytes, sponsorSig, gasObjectId, balance}` in Redis keyed by
  digest (5-min TTL), and on execute submits `[userSig, sponsorSig]` via
  `client.core.executeTransaction`. Keeps the `allowedMoveCallTargets` guard.
- Wire contract unchanged (`/v1/buckets/prepare-*` → `{digest, bytes}`,
  `/v1/sponsor/execute` → `{digest, signature}`), so the dashboard needed no
  change on the sponsorship boundary. `sponsored_by` is now `"kraterion"`.

### 1B — Self-hosted zkLogin (was Enoki `getZkLogin` + wallet SDK)
- `apps/control-plane/src/enoki/google-jwt.service.ts` — local Google OIDC
  verification (JWKS/RS256/iss/aud/exp) using only `node:crypto` (no `jose`).
- `apps/control-plane/src/enoki/salt.service.ts` — deterministic per-user salt:
  `HMAC-SHA256(ZKLOGIN_SALT_SEED, iss|aud|sub)` → low 128 bits.
- `apps/control-plane/src/enoki/prover.service.ts` — proxy to the self-hosted
  prover-fe (`ZKLOGIN_PROVER_URL`).
- `apps/control-plane/src/enoki/zklogin.service.ts` — **rewritten**: verify
  locally → `jwtToAddress(jwt, salt, false)` → upsert account (was Enoki).
- `apps/control-plane/src/enoki/zklogin-ceremony.controller.ts` — new
  `POST /v1/auth/zklogin/salt` and `/prove` endpoints for the client ceremony.
- Dashboard: `apps/dashboard/src/lib/zklogin.ts` runs the full ceremony
  (ephemeral key, nonce, Google redirect, salt, proof, signature assembly);
  `auth.ts`, `sponsor.ts`, `RequireAuth.tsx`, `providers.tsx`, `login/page.tsx`
  rewired off the Enoki wallet; new `app/auth/callback/page.tsx` handles the
  OAuth redirect.

### Config / secrets
- New env: `ZKLOGIN_SALT_SEED` (32-byte hex, **permanent**), `GOOGLE_CLIENT_ID`
  (aud the CP validates), `ZKLOGIN_PROVER_URL`. Added to `.env.example`,
  `.env.production.example`, and `apps/dashboard/.env.local.example`;
  `ENOKI_*` removed. A local `ZKLOGIN_SALT_SEED` was generated into `.env`.
- Prover: `infra/zklogin-prover/` — `docker-compose.yml`
  (`mysten/zklogin:prover-stable` + `prover-fe-stable`), `download-zkey.sh`
  (mainnet zkey, checksum-verified), `README.md`.

## What was tested (local testnet)

| Check | Result |
|---|---|
| 1A self-sponsored bucket-create on testnet, 3× | ✅ 3/3 on-chain success, gas paid by operator wallet |
| 1A after full Enoki removal | ✅ still passes |
| Gas-coin version-mismatch race | ✅ fixed via effects-based release |
| 1B JWT verify (valid / tampered / wrong-aud / expired) | ✅ real RS256 crypto |
| 1B salt determinism + uniqueness + <2^128 | ✅ |
| 1B address derivation + server/client parity | ✅ |
| zkLogin `/salt` + `/prove` endpoints mounted | ✅ wired (reject bad input) |
| Prover images pullable + compose valid | ✅ |
| Full-repo typecheck (19 tasks) | ✅ |

Test scripts: `pnpm -F @kraterion/control-plane sponsor:smoke` and
`… zklogin:probe`.

## What still needs a real run (can't be done headlessly)

1. **Browser OAuth end-to-end** — a real Google sign-in needs a configured
   Google OAuth client (redirect URI `<origin>/auth/callback`) + the matching
   `GOOGLE_CLIENT_ID` on both apps. The server derivation is proven; the browser
   ceremony is implemented + typechecked but not run.
2. **Live proof generation** — run `infra/zklogin-prover/download-zkey.sh`
   (~1.5 GB) + `docker compose up`, set `ZKLOGIN_PROVER_URL`, then a real login
   exercises `/prove`. (Images are pulled; the zkey download was not run here.)

## Deployed prover (DigitalOcean)

The zkLogin prover is **network-agnostic** — the same binary + `zkLogin-main.zkey`
(the real ceremony key) prove for both testnet and mainnet, so one instance
serves both. It currently backs local testnet dev and is the mainnet prover.

| Resource | Value |
|---|---|
| Droplet | `kraterion-zklogin-prover-mainnet` · id `596855103` · **167.71.55.28** · fra1 · `s-4vcpu-8gb` (~$48/mo) · ubuntu-24-04 |
| Firewall | `kraterion-zklogin-prover-mainnet` (id `1e78b0d8-87a8-42b7-bca5-d3652d116fe0`) — inbound tcp 22 + 5001 from `81.196.141.109/32` only |
| SSH key | `kraterion-zklogin-provisioner` (id `59017789`); private key in the session scratchpad |
| Prover | docker compose at `/opt/zklogin-prover`; zkey 588 MB sha256 `6a78c7d4…`; `prover-fe` on `:5001`, backend "Server ready", idle ~1.3 GB / 8 GB |
| CP wiring | `ZKLOGIN_PROVER_URL="http://167.71.55.28:5001/v1"` in `.env` |

Notes:
- The firewall is pinned to my current IP `81.196.141.109`. If your IP changes,
  update it: `doctl compute firewall add-rules 1e78b0d8-… --inbound-rules "protocol:tcp,ports:5001,address:<newip>/32"`.
- The correct zkey download is git-LFS (`infra/zklogin-prover/download-zkey.sh`,
  now fixed): `git lfs pull --include zkLogin-main.zkey` → rename to `zkLogin.zkey`.
  The old `download-zkey.sh` URL 404s; a missing file makes Docker create the
  mount as a **directory** and the prover segfaults (exit 139) — that's the
  failure we hit and fixed.
- **Teardown** (stops the ~$48/mo charge):
  `doctl compute droplet delete 596855103` ·
  `doctl compute firewall delete 1e78b0d8-87a8-42b7-bca5-d3652d116fe0` ·
  `doctl compute ssh-key delete 59017789`.

For mainnet, run the same on a droplet inside the App Platform VPC and point the
control-plane at its **private** IP (`http://<private-ip>:5001/v1`), not public.

## Notes / decisions to lock
- `ZKLOGIN_SALT_SEED` is permanent — pick once at mainnet launch; changing it
  changes every user's address. Fresh mainnet DB means no migration concern.
- `maxEpoch` window: dashboard uses +10 epochs testnet / +2 mainnet.
- The old `enoki` module/dir name is retained for now (services renamed inside);
  a follow-up can rename the directory to `auth`/`zklogin`.
