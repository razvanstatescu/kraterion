# Renewal Worker

NestJS + BullMQ. Scans SharedBlobs near expiry, batch-extends storage epochs
via PTBs, manages sub-wallet WAL/SUI balances. Long-running, network-heavy —
must never affect API latency.

See `/docs/implementation-plan.md` §8 for the loops and PTB shape.

Runs on port 4003 in dev (health endpoint only).
