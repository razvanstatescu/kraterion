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
