#!/usr/bin/env bash
# Download + verify the zkLogin Groth16 proving key for the self-hosted prover.
# The key lives in git-LFS in sui-foundation/zklogin-ceremony-contributions.
# ~588 MB. This is the MAIN ceremony key — used for both testnet and mainnet;
# the `-test` key is insecure dev-only and won't verify on-chain.
set -euo pipefail
cd "$(dirname "$0")"

EXPECT_SHA=6a78c7d4c33e88f0d1b43b5e3a5ae8e42581de445f32c15d975f347e3ec0bab1

command -v git-lfs >/dev/null 2>&1 || {
  echo "git-lfs is required (macOS: brew install git-lfs · Debian: apt-get install -y git-lfs)" >&2
  exit 1
}

mkdir -p zkey
rm -rf .ceremony
echo "▸ cloning ceremony repo (LFS smudge skipped) …"
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 -q \
  https://github.com/sui-foundation/zklogin-ceremony-contributions.git .ceremony
cd .ceremony
echo "▸ git lfs pull zkLogin-main.zkey (~588 MB) …"
git lfs pull --include "zkLogin-main.zkey"

GOT=$(sha256sum zkLogin-main.zkey | awk '{print $1}')
if [[ "$GOT" != "$EXPECT_SHA" ]]; then
  echo "✗ sha256 mismatch: got $GOT" >&2
  exit 1
fi
cp zkLogin-main.zkey ../zkey/zkLogin.zkey
cd ..
rm -rf .ceremony
echo "✓ zkey installed → zkey/zkLogin.zkey ($(du -h zkey/zkLogin.zkey | cut -f1)), sha256 OK"
