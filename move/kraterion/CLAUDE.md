# Kraterion Move Package

The on-chain centerpiece. Composes Walrus `SharedBlob` with Seal `seal_approve`
access control. Target ~400 lines.

See `/docs/implementation-plan.md` §4 for the full module spec, types, and
events. **Do not** implement gated mode (custom Move policies) — that's
post-hackathon.

After every ABI change, regenerate TS bindings in
`packages/kraterion-move-sdk` so the apps stay in sync.
