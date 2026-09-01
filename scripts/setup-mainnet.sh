#!/usr/bin/env bash
#
# setup-mainnet.sh — publish the Kraterion Move package to Sui MAINNET, capture
# the package id + upgrade cap + PlatformReserve, and write them into the
# `*_MAINNET` slots in packages/shared/src/constants.ts. Also records the
# publish checkpoint for the indexer.
#
# Differences from setup-testnet.sh:
#   - MAINNET: no faucet. The deployer MUST already hold real SUI (~0.5 SUI).
#   - Swaps move/kraterion/Move.toml `[addresses].walrus`/`.wal` to the mainnet
#     Walrus original-id + WAL package (backs up Move.toml first).
#   - Writes KRATERION_{PACKAGE_ID,UPGRADE_CAP_ID,RESERVE_ID}_MAINNET.
#
# Idempotent: refuses to re-publish if KRATERION_PACKAGE_ID_MAINNET is already
# set, unless --force. Re-publishing orphans the previous package + reserve on
# mainnet (real value) — see /docs/runbook.md before using --force.
#
# Usage:
#   scripts/setup-mainnet.sh            # publish + update constants
#   scripts/setup-mainnet.sh --dry-run  # build + estimate gas, don't publish
#   scripts/setup-mainnet.sh --force    # ignore existing mainnet package id

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOVE_DIR="$REPO_ROOT/move/kraterion"
MOVE_TOML="$MOVE_DIR/Move.toml"
CONSTANTS_FILE="$REPO_ROOT/packages/shared/src/constants.ts"
DEPLOY_ARCHIVE_DIR="$REPO_ROOT/deploy"
GAS_BUDGET="500000000"  # 0.5 SUI; mainnet publishes are heavier than testnet

# Mainnet Walrus addresses (verified on-chain 2026-09-01).
MAINNET_WALRUS_ORIGINAL_ID="0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77"
MAINNET_WAL_PACKAGE_ID="0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59"

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '3,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n -2; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m  error:\033[0m %s\n' "$*" >&2; exit 1; }

bold "▸ pre-flight"
command -v sui >/dev/null || die "sui CLI not found (brew install sui)"
command -v jq  >/dev/null || die "jq not found (brew install jq)"
[[ -f "$MOVE_TOML" ]] || die "Move.toml missing at $MOVE_TOML"
[[ -f "$CONSTANTS_FILE" ]] || die "constants.ts missing"

EXISTING=$(grep -E '^export const KRATERION_PACKAGE_ID_MAINNET' "$CONSTANTS_FILE" \
  | sed -E 's/.*= "([^"]*)".*/\1/' || true)
if [[ -n "$EXISTING" && "$FORCE" -ne 1 && "$DRY_RUN" -ne 1 ]]; then
  die "KRATERION_PACKAGE_ID_MAINNET already set ($EXISTING). Re-publishing orphans the
       existing package + reserve on mainnet (real value). Pass --force only if intentional."
fi

bold "▸ network"
ACTIVE_ENV=$(sui client active-env 2>/dev/null || true)
if [[ "$ACTIVE_ENV" != "mainnet" ]]; then
  info "switching to mainnet (was: ${ACTIVE_ENV:-<unset>})"
  sui client switch --env mainnet >/dev/null
fi
DEPLOYER=$(sui client active-address 2>/dev/null | tr -d '"')
[[ -n "$DEPLOYER" ]] || die "no active address — import the funded deployer key first"
info "active env:    mainnet"
info "deployer addr: $DEPLOYER"

# No faucet on mainnet — require real SUI. sui CLI ≥ 1.78 changed the shape:
# `{ gasCoins: [...], addressMistBalance: N }`. Older CLIs returned a flat
# array of coins. Handle both: prefer addressMistBalance, else sum the coins.
BAL=$(sui client gas --json 2>/dev/null | jq -r '
  if type=="object" then
    (.addressMistBalance // ([.gasCoins[]?.mistBalance // .gasCoins[]?.balance | tonumber] | add) // 0)
  else ([.[].mistBalance // .[].balance // 0 | tonumber] | add // 0) end')
info "balance:       $BAL MIST (~$(echo "scale=3; $BAL/1000000000" | bc 2>/dev/null || echo '?') SUI)"
(( BAL >= GAS_BUDGET )) || die "deployer under-funded: need ≥ $GAS_BUDGET MIST. Fund $DEPLOYER with real SUI."

# --- swap Move.toml addresses to mainnet (backup first) ---
bold "▸ Move.toml → mainnet addresses"
cp "$MOVE_TOML" "$MOVE_TOML.pre-mainnet.bak"
sed -E -i.bak "s|^(walrus = \")[^\"]*(\")|\1${MAINNET_WALRUS_ORIGINAL_ID}\2|" "$MOVE_TOML"
sed -E -i.bak "s|^(wal = \")[^\"]*(\")|\1${MAINNET_WAL_PACKAGE_ID}\2|" "$MOVE_TOML"
rm -f "$MOVE_TOML.bak"
grep -qE "^walrus = \"${MAINNET_WALRUS_ORIGINAL_ID}\"" "$MOVE_TOML" || die "failed to set walrus address"
grep -qE "^wal = \"${MAINNET_WAL_PACKAGE_ID}\"" "$MOVE_TOML" || die "failed to set wal address"
info "walrus = $MAINNET_WALRUS_ORIGINAL_ID"
info "wal    = $MAINNET_WAL_PACKAGE_ID"
warn "Move.toml still uses the testnet-contracts source subtree (v3 storage_pool). If"
warn "build/publish fails on ABI, switch [dependencies].Walrus subdir to mainnet-contracts."

bold "▸ build + test"
( cd "$MOVE_DIR" && sui move build >/dev/null ) || die "sui move build failed"
if ! ( cd "$MOVE_DIR" && sui move test >/tmp/kraterion-mainnet-move-test.log 2>&1 ); then
  cat /tmp/kraterion-mainnet-move-test.log >&2; die "sui move test failed — refusing to publish"
fi
info "move builds + tests pass"

bold "▸ ts bindings"
pnpm --filter @kraterion/kraterion-move-sdk run generate >/tmp/kraterion-mainnet-codegen.log 2>&1 \
  || { cat /tmp/kraterion-mainnet-codegen.log >&2; die "bindings codegen failed"; }
pnpm --filter @kraterion/kraterion-move-sdk run typecheck >/tmp/kraterion-mainnet-tc.log 2>&1 \
  || { cat /tmp/kraterion-mainnet-tc.log >&2; die "bindings typecheck failed"; }
info "bindings regenerated + typecheck clean"

if [[ "$DRY_RUN" -eq 1 ]]; then
  bold "▸ dry-run publish (no broadcast)"
  ( cd "$MOVE_DIR" && sui client publish --dry-run --gas-budget "$GAS_BUDGET" "$MOVE_DIR" )
  bold "✓ dry-run complete (Move.toml left with mainnet addresses; restore with $MOVE_TOML.pre-mainnet.bak if needed)"
  exit 0
fi

bold "▸ publish to mainnet"
mkdir -p "$DEPLOY_ARCHIVE_DIR"
RAW_LOG=$(mktemp /tmp/kraterion-mainnet-publish.XXXXXX.json)
if ! ( cd "$MOVE_DIR" && sui client publish --gas-budget "$GAS_BUDGET" --json "$MOVE_DIR" ) \
      2> >(grep -v 'warning' >&2) > "$RAW_LOG"; then
  cat "$RAW_LOG" >&2; die "sui client publish failed"
fi
jq -e . "$RAW_LOG" >/dev/null 2>&1 || { head -c 500 "$RAW_LOG" >&2; die "publish output not valid JSON"; }
STATUS=$(jq -r '.effects.status.status' "$RAW_LOG")
[[ "$STATUS" == "success" ]] || { jq -r '.effects.status.error // "(unknown)"' "$RAW_LOG" >&2; die "publish status: $STATUS"; }

PACKAGE_ID=$(jq -r '.objectChanges[]? | select(.type=="published") | .packageId' "$RAW_LOG")
UPGRADE_CAP=$(jq -r '.objectChanges[]? | select(.type=="created" and .objectType=="0x2::package::UpgradeCap") | .objectId' "$RAW_LOG")
TX_DIGEST=$(jq -r '.digest' "$RAW_LOG")
RESERVE_ID=$(jq -r --arg pkg "$PACKAGE_ID" '.objectChanges[]? | select(.type=="created" and .objectType==($pkg + "::reserve::PlatformReserve")) | .objectId' "$RAW_LOG")
[[ -n "$PACKAGE_ID" && "$PACKAGE_ID" != "null" ]] || die "could not extract packageId"

ARCHIVE="$DEPLOY_ARCHIVE_DIR/mainnet-$(date +%Y-%m-%dT%H%M%S)-$TX_DIGEST.json"
cp "$RAW_LOG" "$ARCHIVE"; rm -f "$RAW_LOG"
info "package id:  $PACKAGE_ID"
info "upgrade cap: ${UPGRADE_CAP:-(none)}"
info "reserve id:  ${RESERVE_ID:-(none)}"
info "tx digest:   $TX_DIGEST"
info "archived →   ${ARCHIVE#$REPO_ROOT/}"

bold "▸ write mainnet constants"
sed -E -i.bak "s|^(export const KRATERION_PACKAGE_ID_MAINNET = \")[^\"]*(\";.*)$|\1${PACKAGE_ID}\2|" "$CONSTANTS_FILE"
sed -E -i.bak "s|^(export const KRATERION_UPGRADE_CAP_ID_MAINNET = \")[^\"]*(\";.*)$|\1${UPGRADE_CAP}\2|" "$CONSTANTS_FILE"
sed -E -i.bak "s|^(export const KRATERION_RESERVE_ID_MAINNET = \")[^\"]*(\";.*)$|\1${RESERVE_ID}\2|" "$CONSTANTS_FILE"
rm -f "$CONSTANTS_FILE.bak"
grep -qE "KRATERION_PACKAGE_ID_MAINNET = \"${PACKAGE_ID}\";" "$CONSTANTS_FILE" || die "failed to write constants"
info "wrote KRATERION_{PACKAGE_ID,UPGRADE_CAP_ID,RESERVE_ID}_MAINNET"

bold "▸ indexer checkpoint"
PUBLISH_CHECKPOINT=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  PUBLISH_CHECKPOINT=$(sui client tx-block "$TX_DIGEST" --json 2>/dev/null | jq -r '.checkpoint // empty')
  [[ -n "$PUBLISH_CHECKPOINT" && "$PUBLISH_CHECKPOINT" != "null" ]] && break
  sleep 2
done
if [[ -n "$PUBLISH_CHECKPOINT" ]]; then
  info "INDEXER_INITIAL_CHECKPOINT=$PUBLISH_CHECKPOINT  ← set this on the worker (.do/app.mainnet.yaml)"
else
  warn "could not resolve publish checkpoint; run: sui client tx-block $TX_DIGEST --json | jq .checkpoint"
fi

EXPLORER="https://suiscan.xyz/mainnet"
bold ""
bold "✓ kraterion published to sui MAINNET"
info "package  $EXPLORER/object/$PACKAGE_ID"
info "tx       $EXPLORER/tx/$TX_DIGEST"
info ""
info "NEXT: fund + bootstrap the reserve (with SUI_NETWORK=mainnet):"
info "  pnpm -F @kraterion/gateway bootstrap   # generates operator + indexer wallets, funds reserve"
info "  (then set INDEXER_INITIAL_CHECKPOINT above + rebuild @kraterion/shared)"
