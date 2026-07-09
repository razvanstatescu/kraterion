# Technical / architecture source material (code-grounded)

Mined 2026-07-09. Cited to `file:line`. Positioning: **verifiable runtime for AI agents**.

- **Deployed Move package (testnet):** `0x6eabb85ec3085a8e8af32094d242eef5d063f510ae5d26cd241de680128036d3` (`packages/shared/src/constants.ts:110`) — use this, not the older `0x73b1…` in some docs.
- **PlatformReserve singleton:** `0xee4628fb…` (`constants.ts:120`).

## ⚠️ Critical demo-reliability flag (validates recorded video)
Sui **retired the public testnet JSON-RPC endpoint the week of 2026-07-06** (mainnet follows ~2026-07-20). Only the worker **indexer** is on gRPC today; **every other server-side on-chain path** (gateway PUT/GET signing, session anchoring, grant/revoke, pool renewal) still builds a `SuiJsonRpcClient` → **currently broken on live public testnet** until the JSON-RPC→gRPC migration lands (`docs/json-rpc-migration.md`, status "research complete, **not executed**" as of 2026-07-09). Code paths are fully built; the transport under them is mid-migration.
→ **Record the demo against a migrated/self-hosted RPC, or narrate from a pre-captured anchor tx.** Do NOT attempt live on-chain writes on public testnet.

## 1. Architecture (for the "how it works" diagram)
Spine (bottom-up): **user-owned encrypted blobs on Walrus → knowledge/RAG over buckets → agents with their own endpoints + identities → on-chain session anchors on Sui.**

- **`apps/gateway` (S3 API, 4002)** — SigV4 auth (`auth/sigv4/sigv4.service.ts:56`). PUT → Seal-encrypt → Walrus upload-relay → PTBs `register_blob`+`certify_blob` into the project pool vault (`s3/objects.write.controller.ts:137`). Signs via a shared gateway operator sub-wallet + Redis gas-coin pool (`sui/gas-pool.service.ts:86`) — not Enoki.
- **`apps/control-plane` (4001)** — auth (zkLogin + `kr_*` bearer + embed tokens), agents CRUD + OpenAI-compatible chat, hybrid RAG `/search`, native MCP server, runs/replay + lineage, Stripe billing, "prepare" service building user-signed sponsored grant/revoke PTBs.
- **`apps/worker` (4003)** — three modules: **indexer**, **sessions** archiver, **embeddings** ingestion. (Pool renewal actually lives in control-plane `billing/pool-renewal.processor.ts`.)
- **`apps/dashboard` (3001)`, `apps/landing` (3000)** — Next.js 16.
- **Indexer = authoritative DB writer.** Consumes Sui **gRPC checkpoint stream** (`worker/src/indexer/run-loop.ts:155`) over tuned HTTP/2; decodes events → 11 handlers in one `prisma.$transaction`. Sole writer for `S3Object`, `PooledBlob`, `StoragePool`, `AgentSessionTrace`.
- **Packages:** `walrus-client` (upload-relay writes / aggregator reads), `seal-client` (SessionKey Redis cache), `object-bytes` (Walrus-fetch + Seal-decrypt), `kraterion-move-sdk` (generated PTB builders), `embeddings-client` (OpenAI `text-embedding-3-small` @1024d).

## 2. Verifiability mechanism (the differentiator) — TWO surfaces, be precise
### A. Session anchoring + replay (server-side, hash-vs-chain) — THE HEADLINE, fully wired
1. Agent turns buffer into Postgres (`AgentSession`+`AgentInvocation`: `cited_hashes`, `retrieval_snapshot`, `seed`, `system_fingerprint`) — `agents/session.service.ts:48`.
2. 60s sweeper CAS `open→flushing`, enqueues BullMQ job (`worker/src/sessions/session-sweeper.service.ts:76`).
3. `build-session-trace.ts:114` → **deterministic canonical JSON** (sorted keys; full values hashed) → **SHA-256 = on-chain `trace_hash`** (`:144`).
4. Trace **Seal-encrypted** (identity `bucket_uid(32)||session_uuid(16)`), uploaded to Walrus → **PTB1** = tip + `register_blob` + `anchor_session`; **PTB2** = `certify_blob` (`session-archive.ts:346`). (v1 = Seal only, **no gzip**.)
5. `anchor_session` emits **`KraterionSessionAnchored`** { `trace_hash`, `walrus_blob_id`, `seal_identity`, `session_id`, `agent_id`, `invocation_count` } (`pool_vault.move:434`, `events.move:195`). **Tx digest = replay handle.**
6. Indexer `SessionAnchoredHandler` upserts `AgentSessionTrace`.

**Verify/replay:** `GET /v1/runs/:txDigest/replay` (`runs.controller.ts:28`) → read Walrus ciphertext → Seal-decrypt → **compare `sha256(plaintext)` to on-chain `trace_hash`; mismatch = tamper** (`runs.service.ts:202`). `?rerun=true` re-issues turns w/ same seed → `system_fingerprint_matched` (`replay.ts:157`). Also `GET /v1/runs/:txDigest/lineage` → OpenLineage graph.
**Judge can verify:** open anchor tx on explorer → `KraterionSessionAnchored.trace_hash` + `walrus_blob_id`; platform can't alter trace without breaking the hash match.
**Replay fidelity caveats (be honest):** tools short-circuited (captured output replayed); **retrieval NOT re-run** (chunk text not in trace → placeholder context); OpenAI-only, non-streaming.

### B. Verifiable RAG retrieval (client-side) — the weaker/older layer
Every chunk carries `content_hash` = SHA-256 of plaintext (`knowledge.service.ts:47`). Index manifest archived to Walrus (`manifest_walrus_blob_id`). `/search` returns hashes + blob ids. **Control-plane does NOT check vs chain** — the browser "Verify" button / MCP `kraterion_get_manifest` does.
→ **Pitch: lead with A** (novel, hash-anchored, replayable). Mention B as retrieval-provenance feeding lineage. **Never claim you verify the LLM computed correctly** — verification stops at retrieval, tool I/O, memory, trace integrity (`kraterion-strategy-v3.md:195`).

## 3. Agents as a resource
- **Per-agent sub-wallet:** on create, gen `Ed25519Keypair`, **KMS-wrap seed**, store `SubWallet{sui_address, role:"agent"}` in same tx (`agents/agents.service.ts:183`). ✅ built.
- **OpenAI-compatible endpoint:** `POST /v1/agents/:id/chat/completions`, stock wire shape + `kraterion` extension (citations/tool_calls), SSE streaming + bounded tool loop, BYOK OpenAI key (Kraterion never resells inference). ✅ built.
- **Native MCP server:** stateless Streamable-HTTP; dual auth OAuth 2.1 + PKCE JWT and `kr_*` bearer; RFC 9728 + DCR (7591) + AS metadata (8414). **7 tools:** list_buckets, list_objects, search, invoke_agent, read_object, write_object, get_manifest. ✅ built.
- **MemWal memory:** agent-side catalog has **8** tools (+`memory_remember`/`memory_recall`), NOT exposed over MCP. ⚠️ present in catalog; live wiring unconfirmed — verify before demoing.
- **Replayable sessions:** open only when agent has ≥1 bucket; force-flush endpoint exists. ✅ built.
- **Grant/revoke:** control-plane builds Enoki-**sponsored** PTBs the **user signs** from dashboard. Move only exposes `revoke_all_api_access`, so **per-agent revoke is emulated** (revoke_all + re-grant survivors, `prepare.service.ts:237`). Chain = source of truth. Today app-level agent "revoke" is a DB status flip; wiring on-chain revoke onto it is a documented follow-up. Agent sub-wallet is NOT in S3 write path (writes use gateway key).

## 4. Why Sui / Walrus / Seal (exact primitives)
- **Walrus `StoragePool` + `PooledBlob`** (migrated off standalone `SharedBlob`, May 2026): one `KraterionPoolVault` wraps a `storage_pool::StoragePool` per project (`pool_vault.move:52`); each upload `register_blob`→`register_pooled_blob`→`certify_blob`. Many small files amortize the per-blob metadata floor. **Agent traces reuse this exact write path** — a trace is just another `PooledBlob` (same renewal economics). Reads GET from public aggregator; writes via upload-relay (tip ≤ ~0.01 WAL).
- **Seal threshold IBE + `seal_approve`:** testnet **Decentralized Committee** (SDK threshold 1; internally 3-of-5 across Mysten/Natsai/Overclock/NodeInfra/Ruby — `constants.ts:93`; NOT "2-of-3 Mysten"). Committee dry-runs Move `seal_approve(id, bucket, ctx)` (`access.move:30`): public→anyone; private→owner or address in `api_decryption_addresses`; identity's first 32 bytes prefix-matched to bucket UID (`access.move:55`).
- **Sui object ownership + revocable policy + anchors:** `KraterionBucket` = **shared object**, owner = `ctx.sender()` (`kraterion.move:48`). Kill-switch: `revoke_all_api_access` clears ACL (`:164`) and `pool_vault::revoke_all` sets `platform_authorized=false` → every platform mutation aborts `ERevoked` (`pool_vault.move:482`). Since `seal_approve` reads the same ACL, **key servers (not platform) enforce revocation** — Kraterion literally cannot decrypt after revoke.
- **Why only on Sui:** revocation guarantee needs (a) durable storage the platform doesn't own (Walrus), (b) threshold decryption gated by on-chain state (Seal+`seal_approve`), (c) a shared mutable policy object the user flips in one signed tx (Sui Move). Session anchor rides the same rails → tamper-evident replayable log that can't be forged after the fact (Langfuse/LangSmith structurally can't offer this — `kraterion-strategy-v3.md:57`).

## 5. gRPC migration (pitch angle)
- **From** JSON-RPC (`SuiJsonRpcClient`) **to** gRPC Core API (`SuiGrpcClient`, `@mysten/sui/grpc`). Forced: Sui retired public testnet JSON-RPC week of 2026-07-06 (mainnet ~07-20); no fallback.
- **Done:** worker indexer on gRPC in prod — `subscribeCheckpoints` over hardened HTTP/2 w/ keepalives; subscribe stream = BCS cursor heartbeat, each checkpoint re-hydrated via unary `getCheckpoint` (streaming + unary, no polling).
- **Not done:** shared client factories (`getSuiClient()`, `getSuiClientForSeal()`) still return JSON-RPC → gateway signing, control-plane reads, worker archive, billing renewal on dead transport. It's a transport swap inside the installed SDK (`@mysten/sui@2.16.2`), ~2–4 days; real work = BCS response-shape rewrites.
- **Pitch line:** "We already run the highest-throughput path — a live gRPC checkpoint indexer with keepalive-tuned streaming — on Sui's new Core API, ahead of the July 2026 JSON-RPC sunset." (Don't claim the whole stack is migrated.)

## 6. Move package surface (on-chain proof surface)
5 modules → generated 1:1 TS PTB-builders (`kraterion-move-sdk/src/generated/`).
- **`kraterion`:** `KraterionBucket{owner,name,encryption_mode,api_decryption_addresses,created_epoch}` (shared). Fns: `create_and_share_bucket`, `create_grant_and_share_bucket`, `grant_api_access`, `revoke_all_api_access`, `set_bucket_visibility`.
- **`access`:** `entry fun seal_approve(id, bucket, ctx)`.
- **`pool_vault`:** `KraterionPoolVault{pool,created_by,project_id,platform_authorized}`. Fns: `create_vault`, `register_blob`, `certify_blob`, `delete_blob`, `extend`, `resize_grow/shrink`, **`anchor_session`** (`:434`, the centerpiece), `revoke_all`.
- **`reserve`:** singleton `PlatformReserve{admin,authorized_callers,wal_balance}` (init-spawned). `fund`/`withdraw`/`authorize_caller`/`pull_wal`.
- **Events:** BucketCreated, ApiAccessGranted/Revoked, VisibilityChanged, VaultCreated/Revoked, PooledBlobRegistered/Certified/Deleted, PoolExtended/Resized, reserve events, and **`KraterionSessionAnchored`** (the money event).

## 7. Demo script (recorded video; agent-runtime story)
Any live on-chain write fails on public testnet until the gRPC migration lands — record against migrated/self-hosted RPC or narrate a pre-captured anchor tx.
1. **KB setup (0:00–0:40):** upload PDFs via boto3/aws-cli → toggle Knowledge on the bucket. ✅ (PUT signing needs migrated client to land on-chain).
2. **Point agent at bucket (0:40–1:50):** OpenAI SDK to `/chat/completions` OR Claude Desktop/Cursor over MCP (`kraterion_invoke_agent`/`kraterion_search`). Show streaming + tool call + cited `[chunk N]`. ✅ (verify MemWal if demoing memory).
3. **Anchor + proof (1:50–2:40):** end session → worker canonical trace → SHA-256 → Seal → Walrus → `anchor_session`. Open anchor tx on explorer → point at `KraterionSessionAnchored.trace_hash` + `walrus_blob_id`. ✅ built (emission gated on RPC migration).
4. **Replay (2:40–3:20):** `GET /v1/runs/:txDigest/replay` → pulls trace, Seal-decrypts, confirms `sha256==trace_hash` ("couldn't be forged after the fact"). Optional `?rerun=true`; show `/lineage` graph. ✅ verify mode wired (rerun has documented gaps).
5. **Revoke on-chain (3:20–4:00, the closer):** user signs `revoke_all_api_access` / `pool_vault::revoke_all` (sponsored PTB) → re-run agent / S3 GET → Seal decrypt **fails** (committee `seal_approve` aborts). "One transaction. We're cryptographically locked out — data stays, owned by you." ✅ Move+Seal built.

**Honest boundaries for the script:** verification covers retrieval provenance, tool I/O, memory ops, trace integrity — NOT that the LLM computed correctly. RAG-chunk verify = client-side; session-trace verify = server-side hash-vs-chain. Traces Seal-encrypted, not gzipped in v1.
