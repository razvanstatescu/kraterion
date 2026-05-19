#!/usr/bin/env bash
#
# hard-reset.sh — full storage-pool migration cutover.
#
# Wipes the Postgres database, publishes a fresh Kraterion Move package,
# rotates the gateway sub-wallets, deposits new WAL into the new
# `PlatformReserve`, and reseeds dev fixtures. Use only in development
# (testnet); MUST NOT run against any environment with production data.
#
# Sequence (per /docs/storage-pool-migration.md §5):
#   1. (Operator) Verify this is testnet — refuse if not.
#   2. (Operator) Confirm intent (or `--yes-i-know`).
#   3. `prisma migrate reset --force` — drops all tables.
#   4. `scripts/setup-testnet.sh --force` — publishes a fresh package.
#      The init function spawns a new `PlatformReserve`; the script
#      writes the new package + reserve IDs to
#      `packages/shared/src/constants.ts`.
#   5. `pnpm -F @kraterion/gateway bootstrap` — generates new sub-wallets
#      (api_decryption + knowledge_indexer), authorizes the gateway on
#      the reserve, funds the reserve with WAL.
#   6. (Optional) Run `scripts/walrus-pool-baseline.ts` smoke against the
#      new package to confirm the pool primitive still works.
#
# Stop services first if they're running — the reset will fail mid-step
# if the gateway or worker have open Postgres connections.
#
# Usage:
#   scripts/hard-reset.sh                  # interactive confirm
#   scripts/hard-reset.sh --yes-i-know     # non-interactive

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

YES=0
for arg in "$@"; do
    case "$arg" in
        --yes-i-know) YES=1 ;;
        -h|--help)
            sed -n '3,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n -2
            exit 0
            ;;
        *) echo "unknown flag: $arg" >&2; exit 1 ;;
    esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m  error:\033[0m %s\n' "$*" >&2; exit 1; }

bold "▸ pre-flight"

# Network safety — refuse if we somehow ended up pointing at mainnet.
# `sui client active-env` outputs the alias directly (clean), unlike
# `sui client envs` which renders a box-drawing table.
ACTIVE_ENV="$(sui client active-env 2>/dev/null | tr -d '[:space:]')"
info "active sui env: $ACTIVE_ENV"
case "$ACTIVE_ENV" in
    testnet|localnet) ;;
    *) die "hard-reset refuses to run against env '$ACTIVE_ENV' — testnet/localnet only." ;;
esac

# Postgres reachability — we'd rather fail here than mid-migration.
if ! docker compose --project-directory "$REPO_ROOT/infra/compose" -f "$REPO_ROOT/infra/compose/docker-compose.yml" ps postgres --status running --quiet 2>/dev/null | grep -q .; then
    warn "Postgres container doesn't look running. The reset will fail if there's no DB."
    warn "Start it: docker compose -f infra/compose/docker-compose.yml up -d postgres redis"
fi

# Open-connection guard — services holding connections will block the reset.
ACTIVE_CONNS=$(docker compose --project-directory "$REPO_ROOT/infra/compose" -f "$REPO_ROOT/infra/compose/docker-compose.yml" \
    exec -T postgres psql -U kraterion -d kraterion -t -c \
    "SELECT count(*) FROM pg_stat_activity WHERE datname='kraterion' AND state='active' AND pid <> pg_backend_pid();" \
    2>/dev/null | tr -d ' \n' || echo "?")
if [[ "$ACTIVE_CONNS" != "0" && "$ACTIVE_CONNS" != "?" ]]; then
    warn "$ACTIVE_CONNS active Postgres connection(s) detected — stop gateway/worker/control-plane first."
fi

# Confirm.
if [[ $YES -eq 0 ]]; then
    echo
    bold "This will:"
    info "  1. Drop the kraterion database (`prisma migrate reset --force`)"
    info "  2. Publish a fresh Kraterion Move package to testnet"
    info "  3. Rotate the gateway sub-wallets (old keys abandoned)"
    info "  4. Deposit new WAL into the new PlatformReserve"
    info "  5. Reseed dev fixtures"
    echo
    read -p "  Proceed? Type 'yes' to continue: " ans
    [[ "$ans" == "yes" ]] || die "aborted."
fi

# Step 1 — DB reset.
bold "▸ step 1/5: prisma migrate reset"
( cd "$REPO_ROOT" && pnpm prisma migrate reset --force )

# Step 2 — fresh Move publish.
# Sui CLI ≥1.66 tracks deployed packages in `Published.toml`; with the
# entry present, `sui client publish` refuses to re-publish. We're
# explicitly throwing away the old deployment, so wipe the file first.
PUBLISHED_TOML="$REPO_ROOT/move/kraterion/Published.toml"
if [[ -f "$PUBLISHED_TOML" ]]; then
    info "removing old Published.toml entry (forcing fresh publish)"
    rm -f "$PUBLISHED_TOML"
fi
bold "▸ step 2/5: setup-testnet.sh --force"
"$SCRIPT_DIR/setup-testnet.sh" --force

# CRITICAL: `setup-testnet.sh` updates `packages/shared/src/constants.ts`
# with the new package + reserve IDs. The bootstrap script imports those
# constants from `@kraterion/shared`, which resolves through the
# COMPILED `dist/` — not the source. If we don't rebuild here, bootstrap
# creates the bucket / authorizes callers / funds the reserve against
# the OLD (now-orphaned) package's IDs. Symptom: smoke runs fail with
# `CommandArgumentError TypeMismatch` because the bucket's on-chain
# type-tag still references the old package address.
bold "▸ rebuild @kraterion/shared + dependent generated bindings"
( cd "$REPO_ROOT" && pnpm turbo run build --filter @kraterion/shared --filter @kraterion/kraterion-move-sdk --force --output-logs=errors-only )

# Step 3 + 4 — bootstrap gateway (creates sub-wallets, authorizes them,
# funds the reserve with WAL).
bold "▸ steps 3-4/5: gateway bootstrap"
( cd "$REPO_ROOT" && pnpm -F @kraterion/gateway bootstrap )

# Step 5 — seed dev fixtures. The bootstrap script creates the test
# account/project/bucket; nothing further to do here unless we add
# pre-populated objects later.
bold "▸ step 5/5: dev fixtures (handled by bootstrap)"
info "  done — at least one Account, Project, and Bucket exist"

echo
bold "✓ hard reset complete"
info "next: pnpm -F @kraterion/gateway smoke   # full pool round-trip"
info "      pnpm -F @kraterion/gateway dev     # bring services up"
