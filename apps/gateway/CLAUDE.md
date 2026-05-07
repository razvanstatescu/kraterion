# S3 Gateway

NestJS + Fastify. The hot path: SigV4 verification, S3 operations, Walrus
publisher calls, Seal envelope encrypt/decrypt, on-chain SharedBlob wrap.
Loads per-account API decryption keys from KMS.

See `/docs/implementation-plan.md` §6 (round-by-round build), §7 (encryption
flows), and §10 (Walrus integration).

Runs on port 4002 in dev. Body limit is 13 GiB (Walrus per-blob ceiling).
