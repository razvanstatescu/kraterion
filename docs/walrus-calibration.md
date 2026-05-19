# Walrus storage_pool baseline calibration

**Date:** 2026-05-18
**Network:** Sui testnet
**Walrus published-at:** `0x849e95d2718938d66c37fb91df76d72f78526c1864c339bac415ce8ecda2d8cc` (v3)
**System object:** `0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af`
**Deployer:** `0xedbab07ff09790b85c17c694f0799998f12ce27a6000808864f36e08c27bf6c2`
**Pool created:** `0x68b7b90c4b0bb877ef7ad52069c423dd674471c30ffafcccb6c0428556dda396`

## Why this exists

Phase A of the storage-pool migration ([docs/storage-pool-migration.md](storage-pool-migration.md)) requires real gas numbers for the Walrus pool primitives before we commit to the wrapper module and gateway refactor. Walrus docs say these are size-independent and ~constant but never publish numbers.

## Measurements

All values in MIST (1 SUI = 10^9 MIST).

| Step | Net cost | Computation | Storage | Rebate | Tx |
|---|---:|---:|---:|---:|---|
| `create_storage_pool` | 6736724 | 1470000 | 118871600 | 113604876 | [`37NRT9b1JE…`](https://suiscan.xyz/testnet/tx/37NRT9b1JE2rH1CrnrFpC8FXNNETCMPDcS3JA6PqBHux) |
| `increase_storage_pool_capacity` | 2658716 | 1470000 | 118871600 | 117682884 | [`4ezdxTLyP7…`](https://suiscan.xyz/testnet/tx/4ezdxTLyP7fuFyWDm1ZtwxQC36N6ZEsBFHd1KruWzWUV) |
| `extend_storage_pool` | 2658716 | 1470000 | 118871600 | 117682884 | [`9A7FYwQdnR…`](https://suiscan.xyz/testnet/tx/9A7FYwQdnRsyKAymvCSEwAmyAaDx4u8yK6EaLo37sRap) |
| `decrease_unused_capacity_by_percent` | 2866632 | 1310000 | 8192800 | 6636168 | [`3yPjpEERBu…`](https://suiscan.xyz/testnet/tx/3yPjpEERBuiT5aZFTAddfRXWtT7ZWFNwV2iG5MSTbjZm) |

## Notes per step

- **create_storage_pool** — pool=0x68b7b90c4b0bb877ef7ad52069c423dd674471c30ffafcccb6c0428556dda396; capacity=1048576; epochs=2
- **increase_storage_pool_capacity** — +1048576 bytes
- **extend_storage_pool** — +1 epochs
- **decrease_unused_capacity_by_percent** — -50%; recovered_storage=0x234d9a66681947bd4a77e90c67df6f03407cef54f97ec9fd2e32b73cabb45a11

## What's NOT measured here

- `register_pooled_blob` / `certify_pooled_blob` / `delete_pooled_blob` / `burn_expired_pooled_blob` — these require real Walrus blob encoding + storage-node quorum certificates. Measured end-to-end in Phase K once the pool_vault.move wrapper and gateway PUT pipeline are wired.

## Wrapper overhead estimate

Our `kraterion::pool_vault::*` entry functions add a thin overhead on top of these baselines:
- 1× `reserve::assert_caller_authorized` — single vector membership check
- 1× `reserve::pull_wal` + `coin::destroy_zero` (for fee-bearing ops) — Balance arithmetic + coin destroy
- 1× `&mut KraterionPoolVault` borrow — adds one shared-object input to the PTB

Expect ~10–20% additional gas per call on top of these baselines. Phase K will measure exact.

## How to rerun

```bash
pnpm -F @kraterion/gateway exec tsx scripts/walrus-pool-baseline.ts
```

Requires: active Sui CLI keypair on testnet, ≥1 WAL + ≥0.5 SUI in the deployer wallet.
