# Control Plane

NestJS + Fastify. Session-authenticated CRUD for accounts, projects, buckets,
API keys, and usage. **Does not call Walrus or Sui directly** — except for
admin Move calls (`grant_api_access`, `revoke_all_api_access`).

See `/docs/implementation-plan.md` §3.1 for responsibilities, §5 for the data
model.

Runs on port 4001 in dev.
