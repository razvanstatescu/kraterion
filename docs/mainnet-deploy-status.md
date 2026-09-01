# Kraterion mainnet — live deploy status

**2026-09-01.** The mainnet deployment is live. Walrus mainnet shipped the
`storage_pool` primitive (v3 pkg `0x98da433a…`), which unblocked the publish.

## ✅ Done (on-chain + infra)

| Thing | Value |
|---|---|
| Move package (mainnet) | `0xcd9329e9693fecbcdb1d505d537e007c08d08f77dc65094cf149bc3018ce3396` |
| PlatformReserve | `0x6759a74f0bdaf5aa245790fef85dc06bc480bcec804bf286760bf026bb8ff132` |
| UpgradeCap | `0x724ef6a057c7146c68dbbf5e59ed20dfeee8c4c985dc507bc93892fec1d799ee` |
| Publish tx / checkpoint | `ChedX3Yu…` / `INDEXER_INITIAL_CHECKPOINT=317510651` |
| Deployer | `0xbd935500…` — after bootstrap: ~6.9 SUI, 200 WAL left |
| Reserve funded | **100 WAL** (operator + indexer authorized as callers) |
| Operator wallet | created in DB (role `pool_operator`), funded 10 SUI |
| Knowledge-indexer wallet | `0xc705f06b…`, funded 3 SUI |
| Mainnet Postgres | `kraterion-db-mainnet` (nyc3) — migrations applied incl. invites |
| Mainnet Redis | `kraterion-redis-mainnet` (nyc3) |
| DO app | `kraterion-mainnet` (id `fe06a33a-9af6-4f1c-9347-80e143bd822f`) — control-plane + worker, **autodeploy from `main`** |
| Control-plane URL | `https://kraterion-mainnet-omtuv.ondigitalocean.app` — `/health` 200, invite endpoints live |
| Dashboard | `https://app.kraterion.com` (Vercel) — bundle now points at the mainnet control-plane; autodeploys from `main` |
| RAZVAN invite | `KRT-RAZVAN`, 50 claims — **validated live on mainnet** (`{"valid":true,"remaining":50}`) ✓ |
| Billing | **disabled** (`BILLING_ENABLED=false`) — free-plan-only, no Stripe keys needed |
| Gas pool | `GAS_POOL_SIZE=6` (operator has 10 SUI; default 16 didn't fit) |

Verified live via API: `/health` → 200, `/v1/invites/system-status` → `{enabled:true}`,
`POST /v1/invites/validate {code:"KRT-RAZVAN"}` → `{valid:true, remaining:50}`.

Build fix along the way: `pnpm-lock.yaml` had stale `@mysten/enoki` entries
(removed from package.json in the self-host work) that broke every
`--frozen-lockfile` build; reconciled (0 packages downloaded).

## Move package note

Move.toml migrated to the new-style (environment-aware) format depending on
`mainnet-contracts/{walrus,wal}` at rev `d46fde7`. 44 Move tests pass; TS
bindings unchanged (kraterion's own ABI is identical). Testnet publishing now
requires the same environment-aware flow (see Move.lock).

## ⚠️ Manual steps to finish full end-to-end

1. **Google OAuth redirect URI (verify for browser sign-in).** The dashboard +
   control-plane both use client `529273428874-…`. The dashboard runs at
   `https://app.kraterion.com` (its domain for 82 days), so the redirect URI
   `https://app.kraterion.com/auth/callback` is *probably already registered* on
   that client — if so, browser sign-in with `KRT-RAZVAN` works end-to-end right
   now. If sign-in fails at the Google redirect, add that exact URI in the Google
   Cloud console (Credentials → the OAuth client → Authorized redirect URIs).
   This is the only step I can't verify without your Google console.
2. **Gateway (S3 uploads) not yet deployed.** It needs its own hostname
   (`s3.kraterion.com`) — App Platform can't route two host-root HTTP services
   without DNS. Add the gateway service to the app + a CNAME once DNS is set.
3. **Prover firewall.** Port `5001` on the prover droplet (`167.71.55.28`) was
   opened to `0.0.0.0/0` so the DO app can reach it. Tighten to a VPC / DO
   egress range for production.
4. **Stripe** is in `test` mode with dummy keys (billing untested). Set live
   keys + webhook when billing is needed.
5. **Custom domains / DNS.** `api.kraterion.com` (control-plane) and
   `s3.kraterion.com` (gateway) CNAMEs to the app; `app.kraterion.com` for the
   dashboard. The app currently serves on its default `…ondigitalocean.app` URL.
6. **Operator SUI is thin** (~10 SUI). Top up for sustained sponsorship load;
   reserve at 100 WAL covers early usage (each new project pool ≈ 1.5 WAL net).

## Secrets

All off-repo in `~/kraterion-mainnet-deploy/generated-secrets.json` (chmod 600).
Mainnet DB/Redis URIs are in the session scratchpad, not committed.
