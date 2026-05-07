# Runbook

Solved problems, gotchas, and "if you see X, do Y" entries. **Grep here first**
when something breaks — there's a real chance you (or another Claude session)
already fixed it once.

**When to add an entry:** after solving any non-trivial bug, infra hiccup, or
dependency-version footgun that took more than ~10 minutes to figure out.
Even if the fix feels obvious in hindsight, the *symptom* is what future-you
will search for.

**Format:** symptom (what you see), cause (what's actually wrong), fix (the
exact action), date observed, where (component/file). Symptoms should be
greppable — paste the actual error string.

---

## Template

```markdown
## Symptom: <one line, paste the actual error string if there is one>

**Cause:** what is actually wrong, root cause not workaround.

**Fix:** the concrete steps. Commands, file paths, line numbers.

**Observed:** YYYY-MM-DD in <component / file / area>.

**Notes:** (optional) related decisions, gotchas, links.
```

---

## Symptom: `EADDRINUSE: address already in use :::3001` when starting the dashboard

**Cause:** A stale `next-server` process from a previous (Next.js 15-era)
website experiment was still listening. Survived the rename of
`kraterion-website` → `apps/landing` and the dashboard's port choice of 3001.

**Fix:**
```bash
lsof -i :3001 -sTCP:LISTEN          # find the PID
kill <PID>                          # SIGTERM is enough; -9 only if it ignores
```
If a brew-managed service brings it back, `brew services list | grep next` and
stop it from there.

**Observed:** 2026-05-07, port-conflict during initial monorepo setup.

**Notes:** Not Kraterion code — pure host-environment leftover. Kept here
because the symptom is generic and likely to recur during dev.

---

## Symptom: `sui client publish --dry-run` prints just `Error` with no detail

**Cause:** Sui CLI is older than the testnet server's protocol version. As of
2026-05-08, testnet runs server 1.71.x at protocol 123, while a Homebrew
install can lag (we saw 1.63.1 / protocol 106). The CLI prints
`[warning] CLI's protocol version is X, but the active network's protocol
version is Y` early in the run, but the dry-run RPC fails with no body.

**Fix:**
```bash
brew upgrade sui                 # match the server
sui --version                    # verify ≥ 1.71
sui client publish --dry-run --gas-budget 200000000 .
```
After upgrade, dry-run prints the full tx-effects table and exits cleanly.

**Observed:** 2026-05-08, first testnet publish of the Kraterion Move package.

**Notes:** A real publish (not `--dry-run`) may also fail under version skew.
Always upgrade the CLI before any deploy.

---

## Symptom: `sui move build` fails with `unpublished dependencies: Walrus, WAL`

**Cause:** Walrus's `contracts/walrus/Move.toml` carries placeholder
addresses (`walrus = "0x0"`, `wal = "0x0"`). The `contracts/` subtree is
the *source* of Walrus, not the *deployed* version. The `testnet-contracts/`
subtree of the Walrus repo holds the source paired with `Move.lock` files
that carry the real testnet deployment IDs.

**Fix:** in our `move/kraterion/Move.toml`, point Walrus at
`testnet-contracts/walrus` AND override the addresses explicitly:

```toml
[dependencies]
Walrus = { git = "https://github.com/MystenLabs/walrus.git", subdir = "testnet-contracts/walrus", rev = "testnet" }

[addresses]
walrus = "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66"
wal    = "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a"
```

Verify those addresses against `testnet-contracts/{walrus,wal}/Move.lock`'s
`original-published-id` fields; pick the entry whose `chain-id = "4c78adac"`
(current Sui testnet).

**Observed:** 2026-05-08, while wiring up the deploy script.

---
