#!/usr/bin/env bash
#
# setup-testnet.sh — publish the Kraterion Move package to Sui testnet,
# capture the resulting package ID + upgrade cap, and write them into
# packages/shared/src/constants.ts.
#
# Idempotent: if KRATERION_PACKAGE_ID is already populated in constants.ts,
# the script refuses to re-publish unless invoked with --force. Re-publishing
# orphans the previous package on-chain and is rarely what you want.
#
# Requires: sui CLI ≥ 1.63, jq, an active Sui testnet env with a funded
# deployer wallet (faucet is requested automatically if balance is zero).
#
# Usage:
#   scripts/setup-testnet.sh             # publish + update constants
#   scripts/setup-testnet.sh --force     # ignore existing package ID
#   scripts/setup-testnet.sh --dry-run   # build + estimate gas, don't publish

set -euo pipefail

# ---------- paths and constants ----------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOVE_DIR="$REPO_ROOT/move/kraterion"
CONSTANTS_FILE="$REPO_ROOT/packages/shared/src/constants.ts"
DEPLOY_ARCHIVE_DIR="$REPO_ROOT/deploy"
GAS_BUDGET="200000000"  # 0.2 SUI; publishes typically need 0.1–0.5

FORCE=0
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        --dry-run) DRY_RUN=1 ;;
        -h|--help)
            sed -n '3,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n -2
            exit 0
            ;;
        *) echo "unknown flag: $arg" >&2; exit 1 ;;
    esac
done

# ---------- pretty output ----------

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m  error:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- pre-flight ----------

bold "▸ pre-flight"
command -v sui >/dev/null || die "sui CLI not found in PATH (brew install sui)"
command -v jq  >/dev/null || die "jq not found in PATH (brew install jq)"
[[ -d "$MOVE_DIR" ]] || die "move package missing at $MOVE_DIR"
[[ -f "$CONSTANTS_FILE" ]] || die "constants file missing at $CONSTANTS_FILE"
info "sui $(sui --version | awk '{print $2}'), jq $(jq --version | sed 's/jq-//')"

# ---------- existing package id check ----------

EXISTING_PKG=$(grep -E '^export const KRATERION_PACKAGE_ID' "$CONSTANTS_FILE" \
    | sed -E 's/.*= "([^"]*)".*/\1/' || true)

if [[ -n "$EXISTING_PKG" && "$FORCE" -ne 1 && "$DRY_RUN" -ne 1 ]]; then
    die "KRATERION_PACKAGE_ID is already set in constants.ts ($EXISTING_PKG).
       Re-publishing orphans the existing package on-chain.
       Pass --force if you intentionally want to deploy a new package."
fi

# ---------- ensure testnet env ----------

bold "▸ network"
ACTIVE_ENV=$(sui client active-env 2>/dev/null || true)
if [[ "$ACTIVE_ENV" != "testnet" ]]; then
    info "switching to testnet (was: ${ACTIVE_ENV:-<unset>})"
    sui client switch --env testnet >/dev/null
fi
DEPLOYER=$(sui client active-address 2>/dev/null | tr -d '"')
[[ -n "$DEPLOYER" ]] || die "no active address — run 'sui client new-address ed25519' first"
info "active env:    testnet"
info "deployer addr: $DEPLOYER"

# ---------- ensure deployer is funded ----------

balance_mist() {
    sui client gas --json 2>/dev/null \
        | jq -r '[.[].mistBalance // .[].balance // 0 | tonumber] | add // 0'
}

BAL=$(balance_mist)
info "balance:       $BAL MIST"

if (( BAL < GAS_BUDGET )); then
    info "balance below gas budget — requesting faucet drip"
    for attempt in 1 2 3 4 5; do
        if sui client faucet 2>&1 | tee /tmp/kraterion-faucet.log | grep -q -i 'success\|requested'; then
            break
        fi
        warn "faucet attempt $attempt failed; backing off $((attempt * 30))s"
        sleep $((attempt * 30))
    done
    sleep 8  # let the faucet tx settle
    BAL=$(balance_mist)
    info "balance after faucet: $BAL MIST"
    (( BAL >= GAS_BUDGET )) || die "deployer still under-funded — try a manual drip from https://faucet.testnet.sui.io"
fi

# ---------- build ----------

bold "▸ build"
( cd "$MOVE_DIR" && sui move build >/dev/null )
info "move package builds clean"

# ---------- move tests ----------
# Defense in depth: never publish a contract whose unit tests are broken.

bold "▸ move tests"
if ! ( cd "$MOVE_DIR" && sui move test >/tmp/kraterion-move-test.log 2>&1 ); then
    cat /tmp/kraterion-move-test.log >&2
    die "sui move test failed — refusing to publish"
fi
PASSED=$(grep -c '\[ PASS' /tmp/kraterion-move-test.log || true)
info "$PASSED move unit tests passed"

# ---------- ts bindings sync ----------
# Defense in depth: regenerate TS bindings against the Move source we are
# about to publish, and run typecheck. This catches the case where someone
# forgot to run `pnpm generate` after editing Move and is about to ship a
# contract whose ABI doesn't match the bindings the apps consume.
#
# The generation is also wired into Turbo (turbo.json), so day-to-day this
# is redundant — but the publish path is the safety net.

bold "▸ ts bindings"
if ! pnpm --filter @kraterion/kraterion-move-sdk run generate >/tmp/kraterion-codegen.log 2>&1; then
    cat /tmp/kraterion-codegen.log >&2
    die "@kraterion/kraterion-move-sdk codegen failed"
fi
info "bindings generated from current Move source"

if ! pnpm --filter @kraterion/kraterion-move-sdk run typecheck >/tmp/kraterion-typecheck.log 2>&1; then
    cat /tmp/kraterion-typecheck.log >&2
    die "bindings or callers fail typecheck — refusing to publish"
fi
info "bindings typecheck clean"

# ---------- dry run path ----------

if [[ "$DRY_RUN" -eq 1 ]]; then
    bold "▸ dry-run publish (no broadcast)"
    ( cd "$MOVE_DIR" && sui client publish --dry-run --gas-budget "$GAS_BUDGET" "$MOVE_DIR" )
    bold "✓ dry-run complete"
    exit 0
fi

# ---------- publish ----------

bold "▸ publish"
mkdir -p "$DEPLOY_ARCHIVE_DIR"
RAW_LOG=$(mktemp /tmp/kraterion-publish.XXXXXX.json)
trap 'rm -f "$RAW_LOG"' EXIT

# Stderr carries the version-mismatch warning; only stdout is JSON.
if ! ( cd "$MOVE_DIR" && sui client publish --gas-budget "$GAS_BUDGET" --json "$MOVE_DIR" ) \
        2> >(grep -v 'warning' >&2) > "$RAW_LOG"; then
    cat "$RAW_LOG" >&2
    die "sui client publish failed"
fi

# Validate JSON; print snippet if it isn't.
if ! jq -e . "$RAW_LOG" >/dev/null 2>&1; then
    head -c 500 "$RAW_LOG" >&2
    die "sui client publish output is not valid JSON (see above)"
fi

STATUS=$(jq -r '.effects.status.status' "$RAW_LOG")
[[ "$STATUS" == "success" ]] || {
    jq -r '.effects.status.error // "(unknown error)"' "$RAW_LOG" >&2
    die "publish tx returned status: $STATUS"
}

PACKAGE_ID=$(jq -r '.objectChanges[]? | select(.type=="published") | .packageId' "$RAW_LOG")
UPGRADE_CAP=$(jq -r '.objectChanges[]? | select(.type=="created" and .objectType=="0x2::package::UpgradeCap") | .objectId' "$RAW_LOG")
TX_DIGEST=$(jq -r '.digest' "$RAW_LOG")
GAS_COST=$(jq -r '
    .effects.gasUsed
    | (.computationCost|tonumber) + (.storageCost|tonumber) - (.storageRebate|tonumber)
' "$RAW_LOG")

# The package's `init` function spawns the singleton PlatformReserve and
# shares it. We extract its object ID from objectChanges by matching the
# fully-qualified type — the package ID is in the type so we resolve it
# inline. If the reserve module is renamed or the `init` is deleted, this
# will silently come back empty and we surface that explicitly below.
RESERVE_ID=$(jq -r --arg pkg "$PACKAGE_ID" '
    .objectChanges[]?
    | select(.type=="created" and .objectType==($pkg + "::reserve::PlatformReserve"))
    | .objectId
' "$RAW_LOG")

[[ -n "$PACKAGE_ID" && "$PACKAGE_ID" != "null" ]] || die "could not extract packageId from publish response"

info "package id:    $PACKAGE_ID"
info "upgrade cap:   ${UPGRADE_CAP:-(none captured)}"
info "reserve id:    ${RESERVE_ID:-(none captured)}"
info "tx digest:     $TX_DIGEST"
info "net gas cost:  $GAS_COST MIST"

# ---------- archive full response ----------

ARCHIVE_PATH="$DEPLOY_ARCHIVE_DIR/$(date +%Y-%m-%dT%H%M%S)-$TX_DIGEST.json"
cp "$RAW_LOG" "$ARCHIVE_PATH"
info "archived response → ${ARCHIVE_PATH#$REPO_ROOT/}"

# ---------- update constants.ts ----------

bold "▸ update packages/shared/src/constants.ts"

# Use a portable in-place sed (BSD vs GNU). The pattern is anchored to the
# exact line shape and uses `|` as the delimiter so the package ID's slashes
# (none, currently — but defensive) don't terminate the substitution.
TMP_CONSTANTS=$(mktemp)
sed -E "s|^(export const KRATERION_PACKAGE_ID = \")[^\"]*(\";.*)$|\1${PACKAGE_ID}\2|" \
    "$CONSTANTS_FILE" > "$TMP_CONSTANTS"
if ! grep -qE "KRATERION_PACKAGE_ID = \"${PACKAGE_ID}\";" "$TMP_CONSTANTS"; then
    rm -f "$TMP_CONSTANTS"
    die "failed to write KRATERION_PACKAGE_ID into constants.ts (line shape changed?)"
fi
mv "$TMP_CONSTANTS" "$CONSTANTS_FILE"
info "wrote KRATERION_PACKAGE_ID"

# Stash the upgrade cap as a sibling constant so the upgrade flow has it.
# Append once if it doesn't exist; replace in place if it does.
if grep -qE '^export const KRATERION_UPGRADE_CAP_ID' "$CONSTANTS_FILE"; then
    sed -E -i.bak "s|^(export const KRATERION_UPGRADE_CAP_ID = \")[^\"]*(\";.*)$|\1${UPGRADE_CAP}\2|" \
        "$CONSTANTS_FILE"
    rm -f "$CONSTANTS_FILE.bak"
else
    {
        echo ""
        echo "// Captured at publish; needed for sui client upgrade-package."
        echo "export const KRATERION_UPGRADE_CAP_ID = \"${UPGRADE_CAP}\";"
    } >> "$CONSTANTS_FILE"
fi
info "wrote KRATERION_UPGRADE_CAP_ID"

# Same pattern for the singleton PlatformReserve. Spawned by the package's
# `init` function at publish; every paid operation takes it as a tx input.
if [[ -n "$RESERVE_ID" && "$RESERVE_ID" != "null" ]]; then
    if grep -qE '^export const KRATERION_RESERVE_ID' "$CONSTANTS_FILE"; then
        sed -E -i.bak "s|^(export const KRATERION_RESERVE_ID = \")[^\"]*(\";.*)$|\1${RESERVE_ID}\2|" \
            "$CONSTANTS_FILE"
        rm -f "$CONSTANTS_FILE.bak"
    else
        {
            echo ""
            echo "// Singleton PlatformReserve, spawned by the package's init function"
            echo "// at publish. Required as a tx input by every paid operation."
            echo "export const KRATERION_RESERVE_ID = \"${RESERVE_ID}\";"
        } >> "$CONSTANTS_FILE"
    fi
    info "wrote KRATERION_RESERVE_ID"
else
    warn "no PlatformReserve created at publish — KRATERION_RESERVE_ID not updated. Did the package's init() function get removed?"
fi

# ---------- update .env (INDEXER_INITIAL_CHECKPOINT) ----------
#
# The indexer worker uses `INDEXER_INITIAL_CHECKPOINT` as its starting
# point when no cursor row exists in Postgres. Without it, a fresh
# worker boot defaults to checkpoint 0 and tries to backfill the
# entire chain history. We need it pinned to the publish checkpoint so
# the worker only backfills from this package's first event onward.
#
# Discover the publish checkpoint by querying the publish tx. We poll
# briefly because the fullnode's view of just-submitted tx → checkpoint
# can lag a few seconds.
PUBLISH_CHECKPOINT=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    PUBLISH_CHECKPOINT=$(sui client tx-block "$TX_DIGEST" --json 2>/dev/null \
        | jq -r '.checkpoint // empty')
    [[ -n "$PUBLISH_CHECKPOINT" && "$PUBLISH_CHECKPOINT" != "null" ]] && break
    sleep 2
done

ENV_FILE="$REPO_ROOT/.env"
if [[ -n "$PUBLISH_CHECKPOINT" && "$PUBLISH_CHECKPOINT" != "null" ]]; then
    bold "▸ update .env (INDEXER_INITIAL_CHECKPOINT)"
    if [[ -f "$ENV_FILE" ]] && grep -qE '^INDEXER_INITIAL_CHECKPOINT=' "$ENV_FILE"; then
        sed -E -i.bak "s|^INDEXER_INITIAL_CHECKPOINT=.*$|INDEXER_INITIAL_CHECKPOINT=${PUBLISH_CHECKPOINT}|" \
            "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
    else
        {
            echo ""
            echo "# Indexer's start point when no cursor row exists in Postgres."
            echo "# Set to the package publish checkpoint by setup-testnet.sh."
            echo "INDEXER_INITIAL_CHECKPOINT=${PUBLISH_CHECKPOINT}"
        } >> "$ENV_FILE"
    fi
    info "wrote INDEXER_INITIAL_CHECKPOINT=${PUBLISH_CHECKPOINT}"
else
    warn "could not resolve publish checkpoint; INDEXER_INITIAL_CHECKPOINT not updated"
    warn "set it manually after \`sui client tx-block ${TX_DIGEST} --json\` returns a checkpoint"
fi

# ---------- summary ----------

EXPLORER="https://suiscan.xyz/testnet"
bold ""
bold "✓ kraterion published to sui testnet"
info ""
info "package      $EXPLORER/object/$PACKAGE_ID"
info "tx           $EXPLORER/tx/$TX_DIGEST"
info "deployer     $EXPLORER/account/$DEPLOYER"
info ""
info "next: regenerate TS bindings for @kraterion/kraterion-move-sdk against the deployed ABI."
