# Kraterion mainnet deployment — handoff

**Prepared 2026-09-01.** Everything that could be done without real money or an
external account is done and tested. What remains is fundamentally gated on
**real SUI/WAL** (publish + fund) and a few **external signups** (Google OAuth,
Stripe live, DNS). This doc lists exactly what was generated and the precise
manual steps left.

The hard stop: I can't acquire real SUI/WAL, so I could not publish the Move
package or fund the reserve — and the DO app is pointless until that's done.
Everything up to that line is staged.

---

## ✅ Done autonomously (in the repo, tested)

- **Code is network-aware.** `packages/shared/src/constants.ts` now resolves every
  Sui/Walrus/Seal endpoint + object id from `SUI_NETWORK` (server) /
  `NEXT_PUBLIC_SUI_NETWORK` (browser). `walrus-client` + `seal-client` read the
  network (no more hardcoded `network:"testnet"`). Seal mainnet uses the gated
  aggregator `seal-aggregator-mainnet.mystenlabs.com` with the Enoki API key as
  header `x-api-key` and `verifyKeyServers:false` — matching the working inkray
  mainnet setup. Pricing constants are network-aware and de-duplicated (cost-floor
  imports them). Hardcoded testnet refs fixed (dashboard aggregator, worker gRPC
  host, `topup-reserve` coin type). **Testnet dev is unaffected** — verified the
  switch flips correctly and defaults to testnet.
- **Mainnet chain IDs sourced + verified on live mainnet** (see table below).
- **`scripts/setup-mainnet.sh`** — the publish script (swaps Move.toml to mainnet
  addresses, builds/tests, publishes, writes the `*_MAINNET` constant slots +
  the indexer checkpoint). Syntax-checked; run once the deployer is funded.
- **`.do/app.mainnet.yaml`** — mainnet DO app spec (SUI_NETWORK=mainnet,
  STRIPE_MODE=live, new DB/Redis cluster names, `ZKLOGIN_SALT_SEED`/
  `GOOGLE_CLIENT_ID`/`ZKLOGIN_PROVER_URL` added, Enoki removed,
  `deploy_on_push:false`). **doctl-validated.**
- **Secrets + deployer wallet generated** (see below).
- **Tests:** full-repo `typecheck` 19/19; control-plane auth tests 13/13.

## Verified mainnet chain IDs (all checked against live mainnet)

| | |
|---|---|
| Sui gRPC / GraphQL | `fullnode.mainnet.sui.io:443` / `graphql.mainnet.sui.io/graphql` |
| Walrus aggregator / relay | `aggregator.walrus-mainnet.walrus.space` / `upload-relay.mainnet.walrus.space` (both **200** live) |
| Walrus system object | `0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2` |
| Walrus published-at (v3) / original-id | `0x98da433a…` / `0xfdc88f7d…` |
| Walrus staking pool | `0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904` |
| WAL package | `0x356a26eb…` (coinMetadata verified: symbol WAL, decimals 9) |
| Seal committee | `0x686098f1…` (V2, 8 operators, 5-of-8, **permissionless** — no pkg registration) |
| Seal aggregator | `https://seal-aggregator-mainnet.mystenlabs.com` (**gated** — needs Enoki API key as header `x-api-key`; matches working inkray mainnet config) |

Full list also at `~/kraterion-mainnet-deploy/mainnet-chain-ids.txt`.

## Generated values

- **Deployer wallet (fund this):** address
  `0xbd935500b0350b05db3994e1e10a20aefd25abfff73332753698039b7ebed07f`.
  Its private key + the three secrets are in **`~/kraterion-mainnet-deploy/generated-secrets.json`**
  (off-repo, `chmod 600` — never commit it):
  - `KEY_WRAPPING_MASTER_KEY` (32-byte hex — same value on all 3 services)
  - `JWT_SECRET` (32-byte hex)
  - `ZKLOGIN_SALT_SEED` (32-byte hex — **PERMANENT**; never rotate after users exist)
  - `deployer_suiprivkey` (import with `sui keytool import <suiprivkey> ed25519`)

> Prefer your own hardware/KMS key for the deployer/reserve-admin in production —
> the generated one is a hot key, fine for bootstrapping but not ideal long-term.

---

## Manual steps remaining (in order)

### 1. Fund + publish the Move package
- [ ] Fund the deployer `0xbd9355…` with **~0.6 SUI** (real). Import its key
      (`sui keytool import <suiprivkey from the file> ed25519`; `sui client switch --address 0xbd9355…`).
- [ ] `scripts/setup-mainnet.sh --dry-run` (sanity: builds against mainnet addresses),
      then `scripts/setup-mainnet.sh`. It publishes, writes
      `KRATERION_{PACKAGE_ID,UPGRADE_CAP_ID,RESERVE_ID}_MAINNET` into `constants.ts`,
      and prints the **`INDEXER_INITIAL_CHECKPOINT`** value.
- [ ] Rebuild shared: `pnpm -F @kraterion/shared build`.
- [ ] (D1) Strongly consider an audit/review of `reserve.move` + `pool_vault.move`
      before real WAL flows through it.

### 2. Fund the reserve + operator wallets
- [ ] Acquire real **WAL** (exchange, or `topup-reserve.ts` swaps SUI→WAL on-chain).
- [ ] `SUI_NETWORK=mainnet pnpm -F @kraterion/gateway bootstrap` — generates the
      `api_decryption` (operator/sponsor) + `knowledge_indexer` wallets (seeds wrapped
      with the mainnet `KEY_WRAPPING_MASTER_KEY`), funds gateway ~50 SUI /
      indexer ~10 SUI / reserve ~100 WAL (**raise these for real load**), and
      authorizes them on the reserve. The operator wallet address is printed —
      it needs ongoing SUI for gas (sponsorship) + the reserve needs WAL.
- [ ] Verify on-chain: reserve `wal_balance>0`, `authorized_callers` includes both.

### 3. Prover (mainnet)
- [ ] The prover droplet `kraterion-zklogin-prover-mainnet` (`596855103`,
      `167.71.55.28`) is network-agnostic and reusable. For production, put a prover
      **inside the mainnet App Platform VPC** and firewall `:5001` to the backend's
      **private** IP (currently it's open only to your dev IP). Set the app's
      `ZKLOGIN_PROVER_URL` to `http://<prover-private-ip>:5001/v1`.

### 4. External accounts
- [ ] **Google OAuth (mainnet):** create a Web-application client; add redirect URI
      `https://app.<domain>/auth/callback`. Set `GOOGLE_CLIENT_ID` (app spec) +
      `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel).
- [ ] **Stripe live:** get `sk_live_`/`pk_live_`; after the app URL exists, create a
      live webhook → `https://api.<domain>/webhooks/stripe`, set `STRIPE_WEBHOOK_SECRET`;
      run `pnpm stripe:sync` (recreates Products/Prices/Meters in live mode).
- [ ] **Domain/DNS:** confirm the apex is owned; you'll add CNAMEs in step 6.

### 5. Data stores + app
- [ ] `doctl databases create kraterion-db-mainnet --engine pg --version 16 …`
      and `… kraterion-redis-mainnet --engine valkey --version 8 …`.
- [ ] `doctl apps spec validate .do/app.mainnet.yaml` → `doctl apps create --spec .do/app.mainnet.yaml`.
- [ ] Fill the `REPLACE_ME` / `SET` env in the DO dashboard from
      `~/kraterion-mainnet-deploy/generated-secrets.json`:
      `KEY_WRAPPING_MASTER_KEY` (all 3 services, identical), `JWT_SECRET`,
      `ZKLOGIN_SALT_SEED`, `GOOGLE_CLIENT_ID`, `ZKLOGIN_PROVER_URL`,
      `INDEXER_INITIAL_CHECKPOINT` (from step 1), `ADMIN_EMAILS`, the Stripe secrets,
      and **`SEAL_API_KEY`** (gateway; value in generated-secrets.json — the
      Enoki Seal aggregator key. `SEAL_API_KEY_NAME=x-api-key` is already in the spec).
- [ ] The `migrate` PRE_DEPLOY job runs `prisma migrate deploy` automatically.

### 6. Frontend + DNS + verify
- [ ] Vercel mainnet env for `apps/dashboard` (+ codify `apps/landing`): `NEXT_PUBLIC_SUI_NETWORK=mainnet`,
      mainnet `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL`, `NEXT_PUBLIC_CONTROL_PLANE_URL`,
      `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, live `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
      and **`NEXT_PUBLIC_SEAL_API_KEY`** (same Enoki Seal key — browser-side decrypt hits the
      gated aggregator too; these aggregator keys are meant to be client-shipped).
- [ ] DNS: `api`/`mcp` → control-plane, `s3` → gateway, apex/`app` → Vercel.
- [ ] Run the **§6 testing pipeline** from `docs/mainnet-deployment-plan.md` — the
      staged mainnet verification (§6f): health, zkLogin sign-in, first real
      upload (spends WAL), Seal round-trip through the gated aggregator (API key), agent, Stripe meter.

---

## Notes / risks
- `ZKLOGIN_SALT_SEED` is **permanent** — the generated one is fine; just never change it.
- `constants.ts` mainnet Kraterion IDs are empty until `setup-mainnet.sh` fills them —
  mainnet on-chain ops fail loudly until published (by design).
- `setup-mainnet.sh` keeps the testnet-contracts Walrus **source** subtree (same v3
  storage_pool ABI) and only swaps the **addresses** to mainnet. If build/publish
  hits an ABI mismatch, switch `[dependencies].Walrus` subdir to mainnet-contracts.
- Reserve running dry = uploads fail platform-wide → add a low-WAL alert (plan §9).
- Everything above is documented, not executed — no mainnet resources were created.
