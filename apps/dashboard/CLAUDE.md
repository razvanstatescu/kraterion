@AGENTS.md

This is the Kraterion **dashboard** (signed-in console). UI only — no business logic.
Talks to the Control Plane API for CRUD and to the Gateway for object data. Handles
browser-side Seal decryption when previewing private files.

See `/docs/implementation-plan.md` §9 for the page-by-page spec.

Runs on port 3001 in dev (landing owns 3000).
