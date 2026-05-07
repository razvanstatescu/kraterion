# Kraterion — Implementation Plan (v2, Final)

> **Project codename:** Kraterion (working name; finalize before public anything)
> **Pitch:** S3-compatible storage on Walrus where leaving the platform doesn't lose your files, and revoking the platform means we can't read them anymore. Every file is owned on-chain via SharedBlob, encrypted by default via Seal, and the platform's access is delegated — never custodial.
> **Target:** Sui Overflow 2026 — Walrus track. Tracks announce May 7, 2026. Expected build window: 6–8 weeks starting mid-May or early June.
> **Operator:** NanoSoft Technology SRL.
> **Author note:** This document is the single source of truth for the build. If something contradicts elsewhere, this file wins. It is written to be handed directly to Claude Code in chunks; each section can be delegated as an independent workstream.

---

## Table of contents

1. [Strategic context and what we're optimizing for](#1-strategic-context-and-what-were-optimizing-for)
2. [Product specification](#2-product-specification)
3. [System architecture](#3-system-architecture)
4. [The Move package — Kraterion on-chain](#4-the-move-package--kraterion-on-chain)
5. [Data model](#5-data-model)
6. [The S3 gateway — what to build, in order](#6-the-s3-gateway--what-to-build-in-order)
7. [Encryption and access control](#7-encryption-and-access-control)
8. [The renewal worker](#8-the-renewal-worker)
9. [Frontend specification](#9-frontend-specification)
10. [Walrus integration specifics](#10-walrus-integration-specifics)
11. [Economics and cost model](#11-economics-and-cost-model)
12. [Phased timeline (6 weeks)](#12-phased-timeline-6-weeks)
13. [Demo guidance](#13-demo-guidance)
14. [Submission and pitch deck](#14-submission-and-pitch-deck)
15. [Working with Claude Code](#15-working-with-claude-code)
16. [Future roadmap (post-hackathon)](#16-future-roadmap-post-hackathon)
17. [Open questions and risks](#17-open-questions-and-risks)
18. [References](#18-references)

---

## 1. Strategic context and what we're optimizing for

We are building a hackathon submission, not a production SaaS — yet. The same code base will become the production SaaS post-hackathon, but every scope decision must be made through the hackathon lens first.

**What we are optimizing for, in priority order:**

1. **A 90-second demo with two plot twists.** The demo is the product for judges. If a feature doesn't appear in the demo, it doesn't ship for the hackathon. Period.
2. **Depth on the SharedBlob + Seal mechanic.** This is our differentiator versus other "S3 on Walrus" submissions. Lean hard into "we don't own your files AND we can't read them once you revoke."
3. **Working S3 SDK compatibility for the happy path.** boto3, aws-cli, and rclone must work for upload/download/list. This is the credibility floor.
4. **A landing page and demo video that don't look like a hackathon project.** Polish here punches above its weight.
5. **Continuation — not throwaway code.** This becomes a real business. Build the foundations clean, even when cutting features.

**What we are explicitly not optimizing for:**

- Production scale, multi-region, HA
- Stripe payments and real billing — fake credits UI is fine
- Every S3 feature — multipart, versioning, ACLs, lifecycle, CORS all OUT
- Optimal cost structure — testnet WAL is free, ignore Quilt savings for now
- Self-custody mode (Tier 3) — only ship the delegated Sovereign + Seal model
- Caching layer — direct aggregator reads are fine for testnet workloads
- Range request optimization — skip; serve whole blob
- **Gated mode (Seal with custom Move policies)** — kept in the architecture as a future iteration, but not built for hackathon. Only `private` (Seal-encrypted, default) and `public-read` ship in v1.

**Strategic positioning vs other Walrus track submissions:**

Most "S3 on Walrus" entries will land on a custodial design with public files because it is simpler. Kraterion's wedge is the **three-primitive composition** (Sui + Walrus + Seal) used as the core mechanic, not as a sticker. The Walrus track brief in 2025 was explicitly about deep integration with programmable storage capabilities — Kraterion hits that brief with three Mysten primitives doing real work in concert.

Razvan's existing relationships with Glenn and Milana at the Walrus Foundation, the Inkray grant track record, and Storewave's win at Walrus Haulout are real signals that should be present in the pitch deck. Razvan also already shipped four `seal_approve_*` patterns in Inkray, which gives Kraterion a 6-month head start on Seal integration that judges will recognize.

---

## 2. Product specification

### 2.1 What the user sees

A signed-in user lands on a dashboard that looks like Vercel or Supabase Storage:

- **Sign-in:** "Continue with Google" via zkLogin. No seed phrases, no wallet UI by default.
- **Onboarding:** Pre-create a default project. Land directly on bucket creation.
- **Dashboard left nav:** Buckets · API Keys · Usage · Activity · Settings.
- **Bucket page:** File browser with drag-and-drop upload, file detail drawer, "On-chain details" expander (collapsed by default), per-file access mode badge (🔒 Private / 🌐 Public).
- **Per-bucket Funding Gauge:** Shows how long files are funded for ("Funded through Sep 2026").
- **API Keys page:** Generate, copy, rotate. Quickstart code snippets for boto3/aws-cli/rclone.
- **Activity page:** Recent uploads with Walruscan and Sui Explorer deep-links. This is where the on-chain story is visible for users who care.
- **Settings:** Cancel subscription, revoke API access (the two demo levers).

### 2.2 The S3 surface (hackathon scope)

Operations that MUST work end-to-end via boto3, aws-cli, rclone:

| Operation | Notes |
|---|---|
| `PutObject` | Bytes ≤ 13 GiB. Encrypts with Seal envelope (private mode default), wraps blob in SharedBlob. `x-amz-acl: public-read` header switches to public mode (no encryption). |
| `GetObject` | Whole-object only. Decrypts via gateway-side Seal if private mode. Range header silently ignored or 501. |
| `HeadObject` | Returns ETag, Content-Length, Last-Modified, Content-Type, x-amz-meta-kraterion-access (private/public). |
| `DeleteObject` | Soft delete (DB row); SharedBlob persists on-chain until funding runs out. |
| `ListObjectsV2` | Prefix + delimiter + ContinuationToken. Served from Postgres. |
| `ListBuckets` | DB query. |
| `CreateBucket` | DB row + on-chain `KraterionBucket` shared object created + `grant_api_access` for the platform's API decryption address. |
| `DeleteBucket` | Soft delete bucket; SharedBlobs persist. |

Operations that are out for hackathon:

- `CopyObject`, `CreateMultipartUpload` and family, presigned URLs, conditional requests, `PutObjectTagging`, lifecycle, CORS, versioning, gated-mode access policies.

If time permits in week 5, add presigned URLs (cheap to implement, useful for demo).

### 2.3 Auth flow

```
[Browser] click "Continue with Google"
    │
    │ OAuth flow with Google
    ▼
[Browser] receives JWT from Google
    │
    │ derives ephemeral keypair + ZK proof via @mysten/zklogin
    ▼
[Browser] POST /auth/zklogin { jwt, zk_proof, sui_address }
    │
    ▼
[API] verify ZK proof against Google JWKS, derive sui_address,
      upsert account by zklogin_sub, issue session JWT (HttpOnly cookie)
    │
    ▼
[Browser] redirect to /dashboard
```

### 2.4 SigV4 → internal authz

```
[boto3 client] PUT /bucket/key with Authorization: AWS4-HMAC-SHA256 ...
    │
    ▼
[Gateway] parse SigV4 → extract access_key_id
    │
    ▼
[Gateway] lookup api_keys by access_key_id (Redis cache, then Postgres)
    │
    │ if found, decrypt secret from KMS-wrapped value
    ▼
[Gateway] recompute signature; compare; reject 403 on mismatch
    │
    │ on success: load project_id from key, verify bucket belongs to project
    │
    │ ALSO check account.status — reject 403 if cancelled
    ▼
[Gateway] proceed to S3 operation handler
```

### 2.5 Storage and access modes

Two modes, set per-object via S3 ACL header on PutObject (default: private):

**`private` (default)** — File is encrypted with a fresh AES-256-GCM key. The AES key is encrypted with Seal under identity `[kraterion_pkg][bucket_id][object_uuid]`, gated by `seal_approve_private`. The encrypted envelope + ciphertext is uploaded to Walrus, then wrapped in a SharedBlob.

**`public-read`** — File is uploaded to Walrus unencrypted, wrapped in a SharedBlob. Anyone with the blob ID can read it. There's a public link route `/public/{bucket}/{key}` that resolves to the file via aggregator.

Both modes go through the same SharedBlob → on-chain ownership flow. The only difference is whether bytes are encrypted before upload.

Future iteration (not in hackathon): `gated` mode for custom Move access policies (allowlist, NFT-gated, subscription, time-locked). Architecture supports this — just don't ship the UI and templates yet.

### 2.6 The two plot twists

These are the two demo-defining moments. Both must work end-to-end by week 5.

**Twist 1 — Cancellation persistence:**
1. User uploads private files (Seal-encrypted).
2. User clicks "Cancel subscription" → `account.status = 'cancelled'`.
3. Gateway rejects all API key requests with 403.
4. SharedBlobs still exist on-chain. Funded for whatever runway exists.
5. User (or anyone) can fund SharedBlobs further via the `kraterion-cli` to keep them alive indefinitely.
6. Files don't disappear. The platform doesn't own them.

**Twist 2 — On-chain revocation:**
1. User uploads private files.
2. Demonstrates boto3 GetObject works (gateway decrypts via API key delegation).
3. User clicks "Revoke API access" → Sui transaction calls `revoke_all_api_access(bucket)`.
4. boto3 GetObject now fails with `KeyAccessRevoked` (gateway tries to decrypt, Seal `seal_approve_private` aborts because gateway's address is no longer in the bucket's API decryption list).
5. Dashboard browser access still works (browser does Seal decryption with user's zkLogin signature).
6. **Kraterion literally cannot decrypt these files anymore.** This is enforced by Seal's threshold key servers, not by Kraterion's policy.

This second twist is the strongest moment in the entire pitch. It's a guarantee no centralized cloud provider can technically make.

---

## 3. System architecture

```
                                 ┌──────────────────────────┐
                          ┌──────│   Next.js Dashboard      │
                          │ HTTPS│   app.kraterion.com      │
                          │      └──────────────────────────┘
                          │                 │
                          │                 │ REST + cookies
                          │                 ▼
                          │      ┌──────────────────────────┐
                          │      │   Control Plane API      │  NestJS
                          │      │   api.kraterion.com      │
                          │      │   - zkLogin auth         │
                          │      │   - buckets, keys        │
                          │      │   - usage rollups        │
                          │      └──────────┬───────────────┘
                          │                 │
                          │         ┌───────┴────────┐
                          │         ▼                ▼
   ┌──────────────────────────┐  ┌──────────┐  ┌───────────┐
   │   S3 Gateway             │◀─│ Postgres │◀─│  Redis    │
   │   s3.kraterion.com       │  │ metadata │  │  cache    │
   │   - SigV4                │  └──────────┘  └───────────┘
   │   - bucket/key routing   │       ▲              ▲
   │   - object handlers      │       │              │
   │   - Seal encrypt/decrypt │       │              │ SessionKey cache
   │   - KMS for API keys     │       │              │
   └──────────┬───────────────┘       │              │
              │                       │              │
              │                ┌──────┴──────────────┴─┐
              │                │  Renewal Worker       │
              │                │  - scan SharedBlobs   │
              │                │  - batch extend PTBs  │
              │                │  - top-up sub-wallets │
              │                └───────────────────────┘
              │
   ┌──────────┴────────────┐  ┌──────────────────────┐
   │  Walrus Publisher     │  │  Seal Key Servers    │
   │  testnet, JWT auth    │  │  (Mysten public, 2/3)│
   │  --n-clients 8        │  └──────────────────────┘
   └──────────┬────────────┘
              │
   ┌──────────┴────────────┐
   │  Walrus Aggregator    │
   │  testnet              │
   └──────────┬────────────┘
              │
              ▼
        Walrus testnet
```

### 3.1 Service responsibilities

| Service | Stack | Responsibilities |
|---|---|---|
| Dashboard | Next.js 16 + App Router + Tailwind + shadcn/ui | All UI; no business logic. Talks only to Control Plane API. Handles browser-side Seal decryption for dashboard file viewing. |
| Control Plane API | NestJS + Prisma | Session auth, account/project/bucket CRUD, API key issuance, usage queries. Does not call Walrus or Sui directly. Triggers `grant_api_access` and `revoke_all_api_access` Move calls. |
| S3 Gateway | NestJS + Prisma | SigV4 verification, S3 operations, calls Walrus publisher, calls Kraterion Move package on Sui, performs Seal envelope encryption on PutObject and Seal envelope decryption on GetObject. Loads per-account API decryption keys from KMS. |
| Renewal Worker | NestJS + BullMQ | Scans SharedBlobs near expiry, batch-extends, manages sub-wallet WAL/SUI balances. |
| Walrus Publisher | Mysten binary, JWT enabled | Single instance for hackathon. 8 sub-wallets. |
| Walrus Aggregator | Mysten binary | Single instance for hackathon. |
| Seal Key Servers | Public Mysten testnet (2-of-3) | Not run by us. Use object IDs from https://seal-docs.wal.app/Pricing. |
| Postgres | Postgres 16 (DigitalOcean managed) | Authoritative metadata. |
| Redis | Valkey (DigitalOcean managed) | API key cache, BullMQ backing, session store, **Seal SessionKey cache (per account)**. |
| KMS | DigitalOcean's secrets management or AWS KMS via NanoSoft | Wraps per-account API decryption keys. |

### 3.2 Why this split

- **Control plane vs gateway are split** because they have different scaling profiles (gateway is hot path, control plane is cold), different auth models (cookies vs SigV4), and different deploy cadences. Splitting now prevents a painful refactor at scale.
- **Worker is a separate process** because renewal is a long-running, CPU-light, network-heavy job that should never affect API latency.
- **Single Postgres for hackathon** — separate read replica is post-hackathon.

### 3.3 Repo layout (monorepo with Turborepo)

```
kraterion/
├── apps/
│   ├── dashboard/          # Next.js (app + browser-side Seal SDK)
│   ├── control-plane/      # NestJS
│   ├── gateway/            # NestJS
│   ├── worker/             # NestJS
│   └── landing/            # Next.js, separate so it can be statically deployed
├── packages/
│   ├── shared/             # Shared types, Zod schemas, Sui constants
│   ├── walrus-client/      # Wrapper around @mysten/walrus with our defaults
│   ├── seal-client/        # Wrapper around @mysten/seal with our defaults
│   ├── kraterion-move-sdk/      # Generated TS bindings for our Move package
│   └── ui/                 # shadcn components shared across dashboard + landing
├── move/
│   └── kraterion/               # Sui Move package
├── infra/
│   ├── docker/             # Dockerfiles for each service
│   ├── compose/            # docker-compose for local dev
│   └── terraform/          # DigitalOcean droplet + DB provisioning
├── scripts/
│   ├── setup-testnet.sh
│   ├── fund-sub-wallets.sh
│   ├── demo-cancel.sh      # demonstrates persistence after cancellation
│   └── demo-revoke.sh      # demonstrates revocation after grant removal
├── prisma/
│   └── schema.prisma
├── package.json
├── turbo.json
├── CLAUDE.md
└── README.md
```

### 3.4 Hosting

- **DigitalOcean droplets** for everything (Razvan's existing infra knowledge, lower egress than AWS).
- One droplet per service for hackathon (dashboard + control plane co-located on a single droplet is fine; gateway separate; worker separate; publisher and aggregator separate droplets each).
- Managed Postgres + Redis on DigitalOcean.
- Cloudflare in front for DNS, SSL, basic DDoS, Workers (post-hackathon).

---

## 4. The Move package — Kraterion on-chain

This is the technical centerpiece. It composes Walrus's `SharedBlob` with Seal's `seal_approve` access control, in ~400 lines of Move.

### 4.1 Modules

```
move/kraterion/
├── Move.toml
├── sources/
│   ├── kraterion.move           # main module: KraterionBucket, wrap_in_shared, etc.
│   ├── access.move         # seal_approve_private function
│   └── events.move         # on-chain events for indexing
└── tests/
    └── kraterion_tests.move
```

### 4.2 Core types and functions

```move
// sources/kraterion.move (specification — implementation by Claude Code)

module kraterion::kraterion {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::dynamic_field as df;
    use walrus::wal::WAL;
    use walrus::blob::Blob;
    use walrus::shared_blob::{Self, SharedBlob};
    use walrus::system::System;

    /// A user-owned bucket. Holds:
    /// - a funding pool of WAL used for renewing SharedBlobs
    /// - a list of addresses authorized to decrypt files via Seal API path
    public struct KraterionBucket has key {
        id: UID,
        owner: address,                          // user's Sui address (zkLogin or wallet)
        name: vector<u8>,
        funding_pool: Balance<WAL>,
        api_decryption_addresses: vector<address>,  // typically just the platform's API key address
        created_epoch: u32,
    }

    /// Metadata attached to each SharedBlob via dynamic field.
    public struct KraterionObjectMetadata has store {
        s3_key: vector<u8>,
        owner_address: address,
        bucket_id: ID,
        content_type: vector<u8>,
        encryption_mode: u8,    // 0 = private (Seal), 1 = public-read
        uploaded_at_ms: u64,
    }

    public fun create_bucket(name: vector<u8>, ctx: &mut TxContext): KraterionBucket { ... }

    public entry fun fund_bucket(
        bucket: &mut KraterionBucket,
        coin: Coin<WAL>,
    ) { balance::join(&mut bucket.funding_pool, coin::into_balance(coin)) }

    /// Add the platform's API decryption address to the bucket's authorized list.
    /// Called once at bucket creation by the user (via zkLogin).
    public entry fun grant_api_access(
        bucket: &mut KraterionBucket,
        api_addr: address,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == bucket.owner, ENotOwner);
        if (!vector::contains(&bucket.api_decryption_addresses, &api_addr)) {
            vector::push_back(&mut bucket.api_decryption_addresses, api_addr);
        }
    }

    /// One-call revocation: removes ALL platform API access.
    /// After this, only the user's wallet can decrypt files in this bucket.
    public entry fun revoke_all_api_access(
        bucket: &mut KraterionBucket,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == bucket.owner, ENotOwner);
        bucket.api_decryption_addresses = vector::empty();
    }

    /// Wrap an already-registered Blob into a SharedBlob, funded from this
    /// bucket's pool, with metadata attached as a dynamic field.
    public entry fun wrap_in_shared_blob(
        bucket: &mut KraterionBucket,
        blob: Blob,
        s3_key: vector<u8>,
        content_type: vector<u8>,
        encryption_mode: u8,
        initial_fund_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let funds = coin::from_balance(
            balance::split(&mut bucket.funding_pool, initial_fund_amount),
            ctx,
        );
        let mut shared = shared_blob::new_funded(blob, funds, ctx);
        let meta = KraterionObjectMetadata {
            s3_key,
            owner_address: bucket.owner,
            bucket_id: object::uid_to_inner(&bucket.id),
            content_type,
            encryption_mode,
            uploaded_at_ms: clock::timestamp_ms(clock),
        };
        df::add(&mut shared.id, b"kraterion:meta", meta);
        events::emit_object_created(...);
    }

    /// Renewal worker calls this to extend storage of a SharedBlob using
    /// its own jar funds.
    public entry fun extend_shared_blob(
        system: &mut System,
        shared: &mut SharedBlob,
        epochs_ahead: u32,
        ctx: &mut TxContext,
    ) {
        shared_blob::extend(system, shared, epochs_ahead, ctx);
    }
}
```

```move
// sources/access.move

module kraterion::access {
    use kraterion::kraterion::KraterionBucket;

    const EAccessDenied: u64 = 0;
    const EWrongBucket: u64 = 1;

    /// Seal access policy for private-mode files.
    /// Decryption is approved if the caller is:
    ///   - the bucket owner (user's wallet via zkLogin), OR
    ///   - an address on the bucket's api_decryption_addresses list (Kraterion's API key)
    ///
    /// `id` is the IBE identity bytes used at encryption time.
    /// Format: [kraterion_package_id][bucket_uuid_bytes][object_uuid_bytes]
    /// We verify that the caller is allowed to decrypt files belonging to the
    /// referenced bucket — we don't verify the object_uuid matches anything
    /// specific because the gateway controls identity generation.
    entry fun seal_approve_private(
        id: vector<u8>,
        bucket: &KraterionBucket,
        ctx: &TxContext,
    ) {
        // Sanity-check: id must reference this bucket's UID.
        assert_id_belongs_to_bucket(&id, bucket);

        let caller = ctx.sender();
        let is_owner = caller == bucket.owner;
        let is_api = vector::contains(&bucket.api_decryption_addresses, &caller);
        assert!(is_owner || is_api, EAccessDenied);
    }

    fun assert_id_belongs_to_bucket(id: &vector<u8>, bucket: &KraterionBucket) {
        // skip the package_id prefix (32 bytes), then verify bucket_uuid bytes match
        let bucket_id_bytes = object::uid_to_bytes(&bucket.id);
        // ... slice and compare ...
        assert!(/* slice matches */, EWrongBucket);
    }
}
```

### 4.3 Why the dynamic-field metadata pattern

Walrus's `SharedBlob` struct has no native field for "who is the actual owner" or "what S3 key is this" or "what's the encryption mode." Adding metadata via Sui dynamic fields is the canonical pattern (the same pattern Walrus uses for blob attributes, and the same pattern the Sui docs recommend for the Walrus indexer example). It's free to read off-chain via `getDynamicField`, and it doesn't bloat the core SharedBlob struct.

### 4.4 Events (for indexing)

```move
module kraterion::events {
    public struct KraterionObjectCreated has copy, drop {
        bucket_id: ID,
        shared_blob_id: ID,
        walrus_blob_id: u256,
        s3_key: vector<u8>,
        owner_address: address,
        encryption_mode: u8,
        funded_until_epoch: u32,
        timestamp_ms: u64,
    }

    public struct KraterionObjectExtended has copy, drop {
        shared_blob_id: ID,
        new_end_epoch: u32,
        funder: address,
        timestamp_ms: u64,
    }

    public struct ApiAccessRevoked has copy, drop {
        bucket_id: ID,
        owner: address,
        timestamp_ms: u64,
    }

    public struct ApiAccessGranted has copy, drop {
        bucket_id: ID,
        owner: address,
        granted_to: address,
        timestamp_ms: u64,
    }
}
```

The `ApiAccessRevoked` event is what makes the second demo twist verifiable on-chain. Judges (or anyone) can search for this event on Walruscan or Sui Explorer to confirm the revocation actually happened.

### 4.5 Audit

**Skip for hackathon.** Plan for one in Phase 1 mainnet (~$15–25k from Movebit, OtterSec, or Zellic). Document in README that the package is unaudited and intended for testnet only during the hackathon.

Critical reasoning for the audit: a bug in `seal_approve_private` could either lock users out (assertion fails when it should pass) or grant unauthorized access (assertion passes when it shouldn't). Both are bad. Mainnet must wait for an audit.

### 4.6 Reference contracts to study

- `walrus/sources/system/shared_blob.move` — the upstream `SharedBlob` struct and its public functions.
- `walrus/sources/blob.move` — the `Blob` struct.
- Inkray's `seal_approve_*` functions in Razvan's existing repo — the four patterns shipping in production give the canonical Move layout.
- Seal's example Move policies: https://github.com/MystenLabs/seal/tree/main/move
- Sui docs example: [Custom Indexer and Walrus](https://docs.sui.io/guides/developer/advanced/custom-indexer/indexer-walrus) — shows the dynamic-field-on-Blob metadata pattern.

---

## 5. Data model

Postgres schema. All migrations via Prisma.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Account {
  id              String   @id @default(uuid())
  email           String   @unique
  zklogin_sub     String   @unique
  sui_address     String   @unique
  status          String   @default("active")  // active | cancelled | suspended
  created_at      DateTime @default(now())

  projects        Project[]
  api_decryption_subwallet SubWallet? @relation("api_decryption_for_account")

  @@index([sui_address])
}

model Project {
  id              String   @id @default(uuid())
  account_id      String
  name            String
  default_region  String   @default("eu-central-1")
  created_at      DateTime @default(now())

  account         Account   @relation(fields: [account_id], references: [id])
  buckets         Bucket[]
  api_keys        ApiKey[]

  @@index([account_id])
}

model ApiKey {
  id              String    @id @default(uuid())
  project_id      String
  name            String
  access_key_id   String    @unique  // public, AWS-style "AKIA..."
  secret_wrapped  Bytes              // KMS-wrapped secret bytes
  last_used_at    DateTime?
  created_at      DateTime  @default(now())
  revoked_at      DateTime?

  project         Project   @relation(fields: [project_id], references: [id])

  @@index([project_id])
  @@index([access_key_id])
}

model Bucket {
  id                       String    @id @default(uuid())
  project_id               String
  name                     String
  region                   String    @default("eu-central-1")
  default_acl              String    @default("private")  // private | public-read
  // on-chain
  kraterion_bucket_object_id    String    @unique  // Sui object id of the KraterionBucket shared object
  api_access_granted       Boolean   @default(true)  // mirror of on-chain api_decryption_addresses
  funding_pool_wal_balance BigInt    @default(0)     // mirror of on-chain balance, periodic refresh
  // bookkeeping
  created_at               DateTime  @default(now())
  deleted_at               DateTime?

  project                  Project   @relation(fields: [project_id], references: [id])
  objects                  S3Object[]

  @@unique([project_id, name])
  @@index([project_id])
}

model S3Object {
  id                       String    @id @default(uuid())
  bucket_id                String
  s3_key                   String
  size_bytes               BigInt
  content_type             String?
  etag                     String              // MD5 hex (of plaintext)
  // Walrus binding
  walrus_blob_id           String              // u256 in URL-safe base64
  shared_blob_object_id    String    @unique   // Sui shared object id
  storage_end_epoch        Int
  // encryption / access
  encryption_mode          String              // private | public-read
  seal_identity            Bytes?              // [pkg_id][bucket_uuid][obj_uuid] used as IBE id (private only)
  encryption_envelope      Bytes?              // Seal-encrypted symmetric key (private only, ~200 bytes)
  // bookkeeping
  uploaded_at              DateTime  @default(now())
  deleted_at               DateTime?

  bucket                   Bucket    @relation(fields: [bucket_id], references: [id])

  @@unique([bucket_id, s3_key])  // soft-delete via deleted_at; latest version wins
  @@index([bucket_id, s3_key])
  @@index([storage_end_epoch])    // for renewal worker scans
}

model UsageEvent {
  id          BigInt   @id @default(autoincrement())
  project_id  String
  bucket_id   String?
  kind        String   // PUT | GET | HEAD | DELETE | LIST
  bytes_in    Int      @default(0)
  bytes_out   Int      @default(0)
  occurred_at DateTime @default(now())

  @@index([project_id, occurred_at])
}

model SubWallet {
  id                String    @id @default(uuid())
  sui_address       String    @unique
  mnemonic_wrapped  Bytes               // KMS-wrapped Ed25519 mnemonic
  role              String              // "publisher" | "renewal" | "api_decryption"
  account_id        String?   @unique   // set for "api_decryption" role; null otherwise
  // last-known balances; updated by health check
  sui_balance       BigInt    @default(0)
  wal_balance       BigInt    @default(0)
  last_topup_at     DateTime?

  account           Account?  @relation("api_decryption_for_account", fields: [account_id], references: [id])
}
```

### 5.1 Notes on the schema

- **`kraterion_bucket_object_id`** on `Bucket` ties the off-chain bucket row to the on-chain `KraterionBucket` shared object. Created at bucket creation; immutable.
- **`shared_blob_object_id`** on `S3Object` ties the metadata row to the on-chain `SharedBlob`. This is what the renewal worker scans.
- **`seal_identity` and `encryption_envelope`** are populated only for `private` mode files. The envelope is small (~200 bytes) but must be available at GetObject time for the gateway to decrypt.
- **`api_access_granted`** on `Bucket` mirrors the on-chain `api_decryption_addresses` list. The gateway checks this flag at the application layer for instant revocation enforcement (the on-chain change has up-to-seconds propagation lag through Seal key servers).
- **One `SubWallet` per account** for `api_decryption` role. This means a compromise of one account's KMS key doesn't compromise all accounts.
- **No `MultipartUpload` table** for hackathon — multipart is out of scope.
- **No `Versioning` columns** — also out of scope. `(bucket_id, s3_key)` is unique.
- **`UsageEvent` is partitioned by month** in production; for hackathon a single table is fine (testnet traffic is low).
- **Soft delete everywhere** — `deleted_at` on Bucket and S3Object. The on-chain SharedBlob persists regardless; this is the entire point.

---

## 6. The S3 gateway — what to build, in order

The gateway is the longest-tail piece and the highest-risk piece. SigV4 has many edge cases, every S3 SDK depends on subtle response-format details, and getting it wrong means the demo doesn't work. Build in tight rounds with test-driven verification against actual SDKs.

### 6.1 Round 1 — SigV4 + minimal happy path (Week 2 days 1–3)

**Goal:** boto3 can make a signed request, the gateway verifies it, returns a stub 200.

Implement:
- HTTP server with NestJS, Fastify adapter for performance.
- SigV4 verification middleware. Use the `aws4` npm package for signing primitives, but write the verification ourselves. **Reference implementation:** MinIO's Go verifier (https://github.com/minio/minio/blob/master/cmd/signature-v4.go) — port the algorithm to TS.
- Virtual-hosted-style URL parsing: `{bucket}.s3.kraterion.com` extracts bucket name from Host header; falls back to path-style `/s3/{bucket}/{key}`.
- Canonical S3 XML error response shape (see https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html). Critical that error code matches AWS (`SignatureDoesNotMatch`, `NoSuchBucket`, etc.) — SDKs branch on these.

**Test:**
```python
import boto3
client = boto3.client(
    's3',
    endpoint_url='https://s3.kraterion.com',
    aws_access_key_id='AKIATEST...',
    aws_secret_access_key='...',
    region_name='eu-central-1',
)
client.list_buckets()  # should return 200 with empty <Buckets/>
```

### 6.2 Round 2 — Storage operations, public mode first (Week 2 days 4–5)

Build the public-mode path first because it doesn't require Seal — fewer moving pieces, faster to verify.

1. **`CreateBucket`** —
   ```
   - DB insert (Bucket row)
   - Sui transaction:
       create_bucket(name)
       grant_api_access(bucket, platform_api_decryption_address)
   - Update Bucket.kraterion_bucket_object_id with returned object ID
   - Return 200 with empty body and `Location` header
   ```
2. **`ListBuckets`** — DB query.
3. **`DeleteBucket`** — soft delete. Reject if bucket has live objects.
4. **`PutObject` (public-read mode only for now)** — when `x-amz-acl: public-read` header present:
   ```
   - read body to memory (cap 13 GiB; reject 413 if larger)
   - compute MD5 (for ETag) and content length
   - call walrusClient.writeBlob(bytes, { epochs: 26, deletable: false, signer: publisher_subwallet })
       → returns { blobId, blobObjectId, storageEndEpoch }
   - call kraterion_move_sdk.wrap_in_shared_blob(
         bucket_object_id, blob_object_id, s3_key, content_type,
         encryption_mode=1, initial_fund_amount, signer: publisher_subwallet
     )
       → returns { sharedBlobObjectId, fundedUntilEpoch }
   - insert S3Object row with encryption_mode='public-read'
   - return 200 with ETag header
   ```
5. **`HeadObject`** — DB query, return headers.
6. **`GetObject` (public-read mode only)** — DB query for blob_id, fetch from Walrus aggregator, stream to client.
7. **`DeleteObject`** — soft delete. Return 204.
8. **`ListObjectsV2`** — DB query with prefix LIKE, delimiter handling, MaxKeys (default 1000), ContinuationToken (base64-encoded last key).

### 6.3 Round 3 — Private mode with Seal (Week 2 days 6–7 + Week 3 days 1–2)

Now wire in the encryption path. This is the trickiest section of the build. Implementation guidance is in section 7.

1. Per-account API decryption keypair generation (on first bucket creation).
2. KMS wrap/unwrap utilities.
3. PutObject for private mode (default when no ACL header).
4. SessionKey caching in Redis.
5. GetObject for private mode (decrypts via Seal).

### 6.4 Round 4 — Polish (Week 3 days 3–5)

- Custom user metadata via `x-amz-meta-*` headers → JSONB column, round-trip on GET/HEAD.
- `Content-Type`, `Content-Disposition`, `Content-Encoding`, `Cache-Control` pass-through.
- Public read URL: `GET /public/{bucket}/{key}` — no auth, fetches from aggregator. Only resolves for public-read files; returns 404 for private files.
- Optional: presigned URLs (GET), if time. Cheap and useful for the demo.

### 6.5 What to skip explicitly

- Multipart upload — return 501 with clear message
- Range requests — return whole object (silently for now; document)
- CopyObject — return 501
- Versioning — versioning headers ignored
- Tags, lifecycle, CORS — return 501 or 200 with no-op as appropriate
- Gated mode — schema allows `encryption_mode = 'gated'` for future, but no `seal_approve_*` Move templates ship in v1

### 6.6 Reference clients to test against

After each round, test with:
- `boto3` (Python) — most strictly compliant
- `aws-cli` — uses the AWS Java SDK under the hood
- `rclone` (`rclone copyto local-file remote:bucket/key`) — popular sync tool, exercises a lot of the API
- `@aws-sdk/client-s3` (Node v3) — what your customers will most likely use

If all four work for upload/download/list, you're at "S3 compatible" for hackathon purposes.

---

## 7. Encryption and access control

This section dives deep into the private-mode flow because it's the highest-novelty piece of the build and has subtle pieces that need to be right.

### 7.1 The architecture in one paragraph

Every private-mode file is encrypted with envelope encryption: a fresh AES-256-GCM key encrypts the bytes, and Seal encrypts the AES key under an IBE identity gated by the `seal_approve_private` Move policy. The encrypted AES key (the "envelope") plus the AES ciphertext is stored on Walrus. To decrypt, a caller proves they're either the bucket owner (user wallet) or on the bucket's API decryption list (Kraterion's per-account key). Decryption requires a SessionKey signed by the relevant party — user via browser for dashboard access, Kraterion via gateway-loaded KMS key for SDK access.

### 7.2 Setup that happens once per bucket

1. **User signs in** with zkLogin → has a `sui_address`.
2. **First bucket creation** also creates the user's per-account API decryption keypair if it doesn't exist. Generated server-side, mnemonic KMS-wrapped, stored in `SubWallet` table with role `api_decryption`. Gets its own `sui_address` ("the API decryption address").
3. **CreateBucket Move call** is a single PTB:
   ```
   tx.moveCall('kraterion::kraterion::create_bucket', [name])
   tx.moveCall('kraterion::kraterion::grant_api_access', [bucket, api_decryption_address])
   ```
   The user's zkLogin signs this. After commit, the on-chain `KraterionBucket` has `api_decryption_addresses = [api_decryption_address]`.

The user has now explicitly granted Kraterion permission to decrypt files in this bucket via the SDK path. This grant is on-chain, visible, and revocable.

### 7.3 PutObject (private mode)

```
1. Gateway verifies SigV4 → loads project, bucket, account.
2. Reads body to memory or scratch (cap 13 GiB).
3. Computes plaintext MD5 (this is the ETag returned to client).
4. Generates a random 32-byte AES-256-GCM key K (crypto.randomBytes).
5. Generates an object_uuid (uuidv4).
6. Constructs seal_identity:
     [kraterion_pkg_id_bytes (32)] ++ [bucket_uuid_bytes (16)] ++ [object_uuid_bytes (16)]
7. Calls sealClient.encrypt({
     threshold: 2,
     packageId: KRATERION_PACKAGE_ID,
     id: seal_identity,
     data: K,
   })
   → returns encryption_envelope (the Seal-encrypted K, ~200 bytes)
8. AES-GCM encrypts plaintext with K → ciphertext + auth_tag.
9. Concatenates: [envelope_length_4bytes][envelope][ciphertext+tag]
   → this is the bytes uploaded to Walrus.
10. Calls walrusClient.writeBlob(concatenated, { epochs: 26, deletable: false, signer: publisher })
    → returns { blobId, blobObjectId }
11. Calls kraterion::kraterion::wrap_in_shared_blob (with encryption_mode=0 for private)
    → returns { sharedBlobObjectId }
12. Inserts S3Object row:
    encryption_mode='private',
    seal_identity=seal_identity,
    encryption_envelope=encryption_envelope,
    walrus_blob_id, shared_blob_object_id, etc.
13. Zeroes K from memory.
14. Returns 200 with ETag.
```

The plaintext key K never leaves the gateway's RAM. It's used once and discarded. The only way to recover K later is to ask Seal's key servers to decrypt the envelope — which they only do if `seal_approve_private` succeeds.

### 7.4 GetObject (private mode) — SDK access path

```
1. Gateway verifies SigV4 → loads project, bucket, account, object metadata.
2. Checks bucket.api_access_granted in DB. If false (revoked):
   - return 403 with code 'KeyAccessRevoked' and message
     'API access was revoked for this bucket. Use the dashboard to download.'
3. Loads SubWallet for (account_id, role='api_decryption').
4. Decrypts mnemonic via KMS unwrap (in-memory only).
5. Derives Ed25519Keypair (api_decryption_keypair).
6. Cache-key for SessionKey: `seal:session:${account_id}:${kraterion_pkg_id}`.
7. If Redis has cached SessionKey for this account:
     → reuse it (signed personal message + TTL)
   Else:
     - Create new SessionKey scoped to KRATERION_PACKAGE_ID, ~1hr TTL.
     - Sign personal message with api_decryption_keypair.
     - Set the signature on the SessionKey.
     - Cache in Redis with matching TTL.
8. Build PTB:
   tx = new Transaction();
   tx.moveCall({
     target: '${KRATERION_PACKAGE_ID}::access::seal_approve_private',
     arguments: [
       tx.pure.vector('u8', s3_object.seal_identity),
       tx.object(bucket.kraterion_bucket_object_id),
     ],
   });
   txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
9. Fetches encrypted bytes from Walrus aggregator.
10. Parses envelope_length, envelope, ciphertext from bytes.
11. Calls sealClient.decrypt({ data: envelope, sessionKey, txBytes })
    → returns symmetric key K.
12. AES-GCM decrypts ciphertext with K (streamed if size warrants).
13. Streams plaintext to client.
14. Zeroes K from memory.
```

**Key servers behavior in step 11:** each of the 2-of-3 Seal key servers calls `dry_run_transaction_block` on a Sui full node, executing `seal_approve_private` against the current chain state. The function checks `caller == bucket.owner || caller in bucket.api_decryption_addresses`. Since `ctx.sender()` is the api_decryption_address (the address that signed the SessionKey) and that address is in the bucket's list, the assertion passes, and the key servers each return their share of the IBE-derived secret. The SDK reconstructs K from any 2 shares.

### 7.5 GetObject (private mode) — dashboard path

Different from SDK: the gateway does NOT decrypt. It proxies encrypted bytes to the browser, and the browser does Seal decryption with the user's zkLogin signature.

```
Browser:
1. User clicks "Download" on a private file.
2. Browser checks if SessionKey exists in memory (in IndexedDB or just session memory).
3. If not, creates one scoped to KRATERION_PACKAGE_ID (~1hr TTL):
   - Build personal-sign message (Seal SDK provides this).
   - Sign via zkLogin (no popup if zkLogin session is fresh).
   - Cache.
4. Calls dashboard API: GET /api/objects/${object_id}/encrypted
5. Gateway streams encrypted bytes (envelope + ciphertext) directly to browser.
6. Browser parses envelope.
7. Browser builds PTB calling seal_approve_private with the user's address as sender.
8. Browser calls sealClient.decrypt locally.
9. Browser AES-decrypts with K.
10. Browser triggers download of plaintext.
```

In this path, the gateway never sees the plaintext. End-to-end encrypted in the strict sense.

### 7.6 The "Revoke API access" flow

```
1. User clicks "Revoke API access" in bucket settings.
2. Confirmation modal:
   "This will mean SDK requests can no longer download files from this bucket.
    Files remain encrypted on-chain. You can still access them via the dashboard.
    [Cancel] [Revoke]"
3. On confirm: Control plane API issues a Sui transaction:
   tx.moveCall('kraterion::kraterion::revoke_all_api_access', [bucket])
   Signed by user's zkLogin.
4. Control plane sets bucket.api_access_granted = false in DB IMMEDIATELY
   (don't wait for Sui propagation; this is the instant-enforcement layer).
5. After Sui commit, the on-chain api_decryption_addresses is empty.
6. Next time gateway tries to decrypt:
   - DB check fails first → instant 403.
   - Even if gateway bypassed the DB check, Seal key servers would refuse
     because seal_approve_private would abort.
```

Two-layer enforcement (DB flag + on-chain) is intentional. The DB flag handles the "happens immediately" property customers expect. The on-chain enforcement is the durable, third-party-verifiable property that makes the demo claim true.

### 7.7 The "Cancel subscription" flow (twist 1, refresher)

```
1. User clicks "Cancel subscription" in account settings.
2. Confirmation modal:
   "Your subscription will be cancelled. Your files remain on-chain at your
    Sui address, funded by the WAL pools we already pre-paid. Anyone, including
    you, can fund them via the kraterion-cli to keep them alive indefinitely.
    [Cancel] [Confirm]"
3. account.status = 'cancelled' in DB.
4. Gateway rejects all subsequent API requests for this account with 403
   'AccountCancelled'.
5. SharedBlobs are NOT deleted, NOT unfunded.
6. User's existing zkLogin session is revoked (next dashboard load → /login).
```

Note: cancellation does NOT auto-revoke API access. They're independent levers. Cancel is "stop charging me, I'm leaving." Revoke is "Kraterion can't read these files anymore." A user might want one without the other.

### 7.8 Key servers to use

For hackathon: public Mysten Labs testnet key servers (free, listed at https://seal-docs.wal.app/Pricing). Configure 2-of-3 threshold using:
- Mysten testnet server 1
- Mysten testnet server 2
- One independent (Ruby Nodes or NodeInfra)

This is configured once in `packages/seal-client/src/index.ts`.

---

## 8. The renewal worker

The worker is what makes the SharedBlob story credible at scale. For the hackathon it has light load (low hundreds of files), but build it as if it had thousands so the architecture is the same as production.

### 8.1 Loops

Three independent BullMQ jobs, each on a schedule:

1. **Renewal scan** — every hour:
   - SQL: `SELECT * FROM s3_object WHERE storage_end_epoch <= current_epoch + 4 AND deleted_at IS NULL` (renew when ≤ 4 epochs / ~4 days on testnet remaining).
   - Group by `bucket_id` (so each PTB extends multiple SharedBlobs from the same bucket pool).
   - For each group, build a PTB:
     - For each object: `extend_shared_blob(system, shared_blob, epochs_ahead=10)`
     - One PTB can hold ~50 calls (gas-permitting).
   - Sign with renewal sub-wallet, submit, wait for confirmation.
   - Update `storage_end_epoch` in DB.

2. **Sub-wallet health check** — every 15 minutes:
   - For each `SubWallet`, query Sui RPC for current SUI and WAL balance.
   - Update DB.
   - Alert + auto-top-up when below thresholds.

3. **Bucket funding monitor** — every hour:
   - For each `Bucket`, compute the runway: how many more renewals can be funded from `funding_pool_wal_balance`.
   - If runway < 60 days: log warning.

### 8.2 Code shape

```typescript
// apps/worker/src/jobs/renewal-scan.job.ts (specification)

@Processor('renewal-scan')
export class RenewalScanProcessor {
  @Process()
  async handle(job: Job) {
    const currentEpoch = await this.walrusClient.getCurrentEpoch();
    const renewalThreshold = currentEpoch + 4;

    const due = await this.prisma.s3Object.findMany({
      where: { storage_end_epoch: { lte: renewalThreshold }, deleted_at: null },
      include: { bucket: true },
    });

    const grouped = groupBy(due, o => o.bucket_id);

    for (const [bucketId, objects] of Object.entries(grouped)) {
      await this.extendBatch(bucketId, objects, currentEpoch);
    }
  }

  private async extendBatch(bucketId: string, objects: S3Object[], currentEpoch: number) {
    const renewalWallet = await this.getRenewalWallet();
    const tx = new Transaction();

    for (const obj of objects.slice(0, 50)) {
      tx.moveCall({
        target: `${KRATERION_PACKAGE_ID}::kraterion::extend_shared_blob`,
        arguments: [
          tx.object(WALRUS_SYSTEM_OBJECT_ID),
          tx.object(obj.shared_blob_object_id),
          tx.pure.u32(10),
        ],
      });
    }

    const result = await this.suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: renewalWallet,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(`Renewal batch failed: ${JSON.stringify(result.effects?.status)}`);
    }

    await this.prisma.s3Object.updateMany({
      where: { id: { in: objects.map(o => o.id) } },
      data: { storage_end_epoch: currentEpoch + 10 },
    });
  }
}
```

### 8.3 Why this works on testnet

Walrus testnet epoch is **1 day** (vs 14 days mainnet). This is convenient for the hackathon:
- We can demo storage extension working in real time by setting `storage_end_epoch` deliberately close.
- The renewal worker runs visibly during the demo period — judges can verify it's not just code that exists.

---

## 9. Frontend specification

### 9.1 Stack

- Next.js 16 with App Router
- Tailwind + shadcn/ui (Razvan has used this on Inkray and other projects)
- `@mysten/dapp-kit` for Sui wallet support (Tier 3, post-hackathon)
- `@mysten/zklogin` for Google sign-in
- `@mysten/seal` for browser-side decryption
- TanStack Query for server state
- Zod for form validation

### 9.2 Page-by-page

#### `/` (landing page)

Separate Next.js app (`apps/landing`), statically generated, deployed independently.

#### `/login`

Single button: "Continue with Google." After auth, redirect to `/dashboard`.

#### `/dashboard`

Empty state for new users: "Create your first bucket" CTA.
For returning users: list of buckets with usage summary.

#### `/buckets`

List of buckets. Each row: name, file count, total size, funding-runway badge, default ACL badge (🔒 Private / 🌐 Public), API access status (granted / revoked).

#### `/buckets/[name]`

The main file browser:
- Top: bucket name, funding gauge, settings dropdown
- Drag-and-drop area
- File grid/list toggle, with: filename, size, uploaded date, access mode badge
- Per-file click → side drawer with details

#### `/buckets/[name]/file/[key]` (drawer)

```
┌─────────────────────────────────────────────────┐
│ vacation-photo.jpg                  [Download]  │
│ ─────────────────────────────────────────────── │
│ Size:           2.4 MB                          │
│ Type:           image/jpeg                      │
│ Uploaded:       Jun 14, 2026                    │
│ ETag:           "d41d8cd98f00b204..."           │
│                                                 │
│ Access:         🔒 Private                      │
│ Encryption:     Seal threshold (2-of-3)         │
│                                                 │
│ ▼ On-chain details                              │
│   Walrus blob ID  0x9a7f...3c2  [↗]            │
│   Sui object      0x2bf4...8d1  [↗]            │
│   Owner           0xabcd...1234 (you)           │
│   Storage until   Epoch 247 (~Sep 22, 2026)     │
│   Renewal status  Auto-funded by Kraterion           │
│                                                 │
│   Encryption identity                           │
│      [kraterion_pkg][bucket_uuid][obj_uuid]          │
│   Decryption policy                             │
│      seal_approve_private                       │
│   Authorized addresses                          │
│      0xabcd...1234 (you, via zkLogin)           │
│      0xkraterion...api  (Kraterion API)  [Revoke]         │
│                                                 │
└─────────────────────────────────────────────────┘
```

The "On-chain details" expander is collapsed by default. The two `[↗]` links go to Walruscan and Sui Explorer respectively.

#### `/keys`

Create / list / revoke API keys. On creation: modal with copy button + downloadable `.env` snippet + tabs for boto3, aws-cli, rclone code samples (auto-injected with the new key).

#### `/usage`

Storage GB, request count by kind, simple line charts (recharts). Faked or real data. Just needs to exist for the demo screenshot.

#### `/activity`

Reverse-chrono list of recent uploads + revocation events. Each row links to Walruscan + Sui Explorer.

#### `/settings`

Account info, danger zone with "Cancel subscription" button.

### 9.3 Critical demo flows in UI

**Cancel subscription (twist 1):**

```
[Settings] click "Cancel subscription"
    │
    ▼
modal: "Your subscription will be cancelled.
        Your files on-chain will persist as long as
        their funding lasts. After expiry, they'll be
        unfunded but still on-chain at your Sui address.
        ─────────────────────────────────────────────
        [Cancel] [Confirm cancellation]"
    │
    ▼
on confirm: PATCH /account/cancel
    account.status = 'cancelled'
    │
    ▼
dashboard banner: "Subscription cancelled.
                   Your files remain on-chain at <sui_address>.
                   Anyone (including you) can fund them via
                   kraterion-cli to keep them alive."
                   [View funding instructions]
```

**Revoke API access (twist 2):**

```
[Bucket settings] click "Revoke API access"
    │
    ▼
modal: "This will mean SDK requests can no longer
        download files from this bucket via boto3,
        aws-cli, etc. Files remain encrypted on-chain.
        You can still access them via the dashboard.
        ─────────────────────────────────────────────
        This change is enforced on-chain by Seal's
        threshold key servers. Even Kraterion cannot bypass it.
        ─────────────────────────────────────────────
        [Cancel] [Revoke]"
    │
    ▼
on confirm:
    1. Sui transaction: revoke_all_api_access(bucket)
    2. DB update: bucket.api_access_granted = false
    3. Show on-chain confirmation: "Tx 0x... [view ↗]"
    │
    ▼
bucket settings show:
    "API access: REVOKED (on-chain Tx 0x...)
     SDK requests will fail with KeyAccessRevoked.
     Restore API access? [Re-grant]"
```

### 9.4 UI tone and polish notes

- Default to dark mode. Most developer tools are dark; matches Vercel/Supabase visual language.
- Use shadcn defaults, avoid custom complex components for hackathon.
- Loading states with skeletons, not spinners.
- Empty states that explain what to do next, never blank pages.
- All copy in plain English. No "blob," "epoch," "WAL" in primary UI — those words live only in the "On-chain details" expander and the activity page.

---

## 10. Walrus integration specifics

### 10.1 SDK choice

Use `@mysten/walrus` (the official Mysten Labs TypeScript SDK) for direct programmatic access from the gateway.

```typescript
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { WalrusClient } from '@mysten/walrus';

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
const walrusClient = new WalrusClient({ network: 'testnet', suiClient });

// Write
const result = await walrusClient.writeBlob({
  blob: bytes,
  deletable: false,
  epochs: 26,
  signer: publisherKeypair,
});

// Read
const bytes = await walrusClient.readBlob({ blobId });
```

### 10.2 Why not just use the publisher HTTP API

For PUT, the SDK gives us direct control: we can register the Blob, then in the *same* PTB call our `wrap_in_shared_blob`. Doing this through a publisher HTTP endpoint would require a custom publisher fork. SDK is cleaner.

For GET, we use HTTP fetch from the gateway; lower complexity.

### 10.3 Sub-wallet management

Three sub-wallet types:
1. **Publisher wallet** (1 instance) — signs blob registration + wrap_in_shared_blob.
2. **Renewal wallet** (1 instance) — signs extend_shared_blob.
3. **API decryption wallets** (1 per account) — signs SessionKey for Seal decryption on SDK requests.

All stored as `SubWallet` rows with KMS-wrapped mnemonics.

For testnet:
- Get SUI from faucet: https://faucet.sui.io/
- Get WAL via `walrus get-wal` CLI command
- Pre-fund publisher and renewal wallets with ~10 SUI and ~50 WAL
- Per-account API decryption wallets need only a tiny SUI balance (no gas spent for SessionKey signing — that's just personal-message signing)

### 10.4 Walrus testnet specifics

- Epoch length: **1 day** (vs 14 days mainnet) — useful for demo
- Testnet WAL has no value
- Testnet may be wiped between releases — script must be re-runnable from scratch
- Public publisher: https://publisher.walrus-testnet.walrus.space (rate limited; for emergency only)
- Public aggregator: https://aggregator.walrus-testnet.walrus.space (use this for reads)

### 10.5 Network constants (testnet)

```typescript
// packages/shared/src/constants.ts
export const TESTNET = {
  SUI_RPC: 'https://fullnode.testnet.sui.io:443',
  WALRUS_AGGREGATOR: 'https://aggregator.walrus-testnet.walrus.space',
  WALRUS_PUBLISHER_INTERNAL: 'http://walrus-publisher.kraterion.internal:31415',
  WALRUS_SYSTEM_OBJECT_ID: '0x98ebc47370603fe81d9e15491b2f1443d619d1dab720d586e429ed233e1255c1',
  WALRUS_STAKING_POOL_ID: '0x20266a17b4f1a216727f3eef5772f8d486a9e3b5e319af80a5b75809c035561d',
  KRATERION_PACKAGE_ID: '0x...', // filled in after first publish
  ZKLOGIN_PROVER_URL: 'https://prover-dev.mystenlabs.com/v1',
  SEAL_KEY_SERVERS: [
    // 2-of-3 threshold; populate from https://seal-docs.wal.app/Pricing
    { objectId: '0x...', weight: 1 },
    { objectId: '0x...', weight: 1 },
    { objectId: '0x...', weight: 1 },
  ],
};
```

These IDs may shift over time — check `@mysten/walrus`'s and `@mysten/seal`'s defaults at build time.

---

## 11. Economics and cost model

### 11.1 Hackathon-period operating cost

| Line item | Cost |
|---|---|
| DigitalOcean droplet — dashboard + control plane (4GB) | $24/mo |
| DigitalOcean droplet — gateway (4GB) | $24/mo |
| DigitalOcean droplet — worker (2GB) | $12/mo |
| DigitalOcean droplet — Walrus publisher (4GB) | $24/mo |
| DigitalOcean droplet — Walrus aggregator (2GB) | $12/mo |
| Managed Postgres (1GB dev) | $15/mo |
| Managed Redis (1GB) | $15/mo |
| Domain (already owned, e.g., reuse one) or new (~$15/yr) | $1/mo |
| Cloudflare (free tier) | $0 |
| Sui RPC (public testnet) | $0 |
| Walrus testnet WAL (faucet) | $0 |
| Seal testnet key servers (Mysten public) | $0 |
| Monitoring (Axiom free tier) | $0 |
| **Total** | **~$127/mo** |

Funded out of NanoSoft / Razvan personal runway during the hackathon. Marginal beyond what's already running.

### 11.2 Post-hackathon production economics

For Sovereign-only model with Seal encryption:

**Pricing tiers (proposed, $/GB/month):**
- Free: 5 GB, 50k requests/mo, hard cap
- Pro: $19/mo for 200 GB included, $0.025/GB overage
- Scale: $99/mo for 2 TB, $0.020/GB overage
- Enterprise: custom

This is ~30–60% above R2 pricing, justified by:
- Sovereign persistence (the moat)
- Prepaid WAL funding for ~12 months of runway per file
- On-chain ownership infrastructure
- Sui gas overhead for renewal PTBs
- **End-to-end encryption with on-chain access control** (the new pitch line)

**Cost to serve 1 GB-month** at Pro tier:
- Walrus storage (subsidized): ~$0.0042
- Sui gas amortized over file lifecycle: ~$0.001
- Seal key server fees (mainnet): negligible
- Compute + DB + KMS amortized: ~$0.005
- Bandwidth amortized: ~$0.003
- Stripe fees: ~$0.0005
- **Total: ~$0.014/GB/mo**

At $0.025 overage pricing, ~44% gross margin. At $19 plan with 200 GB included, ~$2.80 net per active customer. Break-even at ~1500 paying Pro customers.

These numbers assume mainnet, post-hackathon. The hackathon doesn't deal with money.

---

## 12. Phased timeline (6 weeks)

Assumes build window starts mid-May to early June. Adjust dates after May 7 track announcement.

### Week 0 — Pre-build (now → tracks announce)

- [ ] Pre-register on Sui Overflow site
- [ ] Watch Sui Live Miami stream May 7 for track announcement
- [ ] Ping Glenn / Milana with one-line note on direction
- [x] Reserve domain (`kraterion.com`)
- [ ] Reserve `@kraterion` or similar X handle
- [ ] Provision testnet infrastructure (publisher, aggregator, sub-wallets)
- [ ] Brand kit: logo, color palette, typography
- [ ] Landing page wireframe
- [ ] Repo scaffold: monorepo with empty packages, CI green

**Important:** 2025 Sui Overflow rules required projects start *after* the official start date. Infra and brand work are fine; product code is not. Document timing transparently in the submission.

### Week 1 — Foundations

**Deliverables:**
- [ ] Monorepo with all apps scaffolded, builds clean
- [ ] Postgres schema and migrations (with encryption fields)
- [ ] zkLogin sign-in working end-to-end with Google
- [ ] Walrus testnet publisher + aggregator deployed and reachable
- [ ] Seal testnet key servers configured
- [ ] Move package skeleton compiling and passing `sui move test`:
  - `KraterionBucket` with `api_decryption_addresses` field
  - `create_bucket`, `grant_api_access`, `revoke_all_api_access`
  - `wrap_in_shared_blob`, `extend_shared_blob`
  - `seal_approve_private`
- [ ] First version of the package published to testnet, package ID recorded
- [ ] Sub-wallets funded with testnet SUI and WAL (publisher, renewal)
- [ ] KMS configured for per-account API decryption keys

**Claude Code prompts for this week:**
- "Scaffold a Turborepo monorepo with apps for `dashboard` (Next.js 16 App Router), `control-plane` (NestJS with Fastify), `gateway` (NestJS with Fastify), `worker` (NestJS with BullMQ), and `landing` (Next.js statically exported). Add packages for `shared`, `walrus-client`, `seal-client`, `kraterion-move-sdk`, and `ui` (shadcn). Configure ESLint, Prettier, TypeScript strict mode, and a single Prisma schema in the root."
- "Implement zkLogin auth flow in the dashboard and control-plane. Reference https://sdk.mystenlabs.com/zklogin. The control-plane verifies the ZK proof and issues an HttpOnly session cookie. Use Google as the only OAuth provider."
- "Implement the Kraterion Move package per /docs/implementation-plan.md section 4. Include the seal_approve_private function in the access module. Write Move tests for create_bucket, grant_api_access, revoke_all_api_access, wrap_in_shared_blob, and seal_approve_private (positive and negative cases)."

### Week 2 — Gateway and S3 ops (public mode → private mode)

**Deliverables:**
- [ ] SigV4 verification working (test with boto3)
- [ ] CreateBucket, ListBuckets, DeleteBucket end-to-end (DB + on-chain create_bucket + grant_api_access)
- [ ] PutObject (public mode) end-to-end
- [ ] GetObject (public mode), HeadObject, DeleteObject
- [ ] ListObjectsV2 with prefix and delimiter
- [ ] Per-account API decryption keypair generation on first bucket creation
- [ ] PutObject (private mode) with Seal envelope encryption
- [ ] GetObject (private mode) with Seal envelope decryption
- [ ] Test suite using boto3 covering all of the above

**Claude Code prompts for this week:**
- "Implement SigV4 verification middleware for the gateway in NestJS. Use `aws4` for primitives but write the verification logic. Match AWS's exact error response XML format. Write Jest tests against captured boto3 request fixtures."
- "Implement PutObject for public-read mode first per /docs/implementation-plan.md section 6.2. Verify with boto3."
- "Now implement PutObject and GetObject for private mode per section 7. The encryption is envelope-based: AES-256-GCM for the bytes, Seal for the AES key. Use @mysten/seal SDK. Cache SessionKeys in Redis with 1-hour TTL keyed by account_id."

### Week 3 — Dashboard and flow polish

**Deliverables:**
- [ ] Dashboard pages: buckets, file browser, API keys, settings
- [ ] Drag-drop upload (browser → gateway with session)
- [ ] On-chain details drawer per file with Walruscan + Sui Explorer links + encryption identity display
- [ ] Quickstart code snippet generator for boto3 / aws-cli / rclone
- [ ] API key creation modal with copy buttons
- [ ] Bucket funding gauge UI
- [ ] Cancel subscription flow (twist 1) end-to-end
- [ ] Public link route for public-read files
- [ ] CLI script `scripts/demo-cancel.sh`

### Week 4 — Renewal worker and revocation flow (twist 2)

**Deliverables:**
- [ ] Renewal scan worker on hourly cron
- [ ] Sub-wallet health check worker
- [ ] Bucket funding monitor worker
- [ ] **Revoke API access flow end-to-end**:
  - Dashboard button + confirmation modal
  - Control plane builds Sui PTB with `revoke_all_api_access`
  - DB flag set immediately
  - Gateway rejects subsequent SDK requests with `KeyAccessRevoked`
  - Browser-side decryption still works (independent path)
- [ ] CLI script `scripts/demo-revoke.sh`
- [ ] CLI script `scripts/fund-shared-blob.sh` (anyone can fund)
- [ ] Browser-side Seal decryption working (dashboard download path)

### Week 5 — Demo polish and landing page

**Deliverables:**
- [ ] Landing page live at root domain
- [ ] Demo video shot, edited, posted (90-120 seconds, see section 13)
- [ ] Pitch deck (10-12 slides per section 14)
- [ ] README with arch diagram, deploy instructions, demo links
- [ ] Public testnet deployment fully working, end-to-end
- [ ] First time through the full demo flow with a friend watching

### Week 6 — Hardening and submission

**Deliverables:**
- [ ] Bug bash from the friend's notes
- [ ] Edge cases: testnet wipe recovery, Sui RPC outage simulation
- [ ] Final demo video re-record with all polish
- [ ] HackerEarth submission complete
- [ ] Walrus Foundation grant application sent in parallel
- [ ] Soft post on X linking to landing page
- [ ] X Space pitch / 1-min ecosystem-channel post

---

## 13. Demo guidance

### 13.1 The demo video (90-120 seconds)

This is the single most important deliverable. Treat it like a product launch ad, not a code walkthrough. Practice 30+ times. Re-record at least 3 takes.

**Storyboard:**

```
[0:00–0:10] HOOK
Visual: black screen, text fades in
Text: "Two things every cloud storage provider does
       that you can't stop:
       1. Delete your files when you cancel.
       2. Read your files whenever they want."

[0:10–0:25] SETUP
Visual: cut to clean Kraterion dashboard, Google sign-in flow
Voiceover: "This is Kraterion. S3-compatible storage on Sui. We've fixed both."
[Sign in with Google → land on dashboard]

[0:25–0:40] S3 COMPATIBILITY
Visual: split screen — terminal on left, dashboard on right
Voiceover: "Use any S3 SDK. boto3, aws-cli, rclone. Files encrypted by default."
[paste 5-line boto3 snippet, run upload of a 10MB image]
[image appears in dashboard live, with thumbnail]

[0:40–0:55] ON-CHAIN INSPECTION
Visual: click on the file, drawer opens, expand "On-chain details"
Voiceover: "Under the hood, every file is a SharedBlob — owned by you on-chain.
            Encrypted with Seal — only authorized addresses can decrypt."
[click Walruscan link → SharedBlob visible]
[show "Authorized addresses: you, Kraterion API"]

[0:55–1:15] TWIST 1 — CANCELLATION PERSISTENCE
Visual: Settings → Cancel subscription, confirmation modal
Voiceover: "Watch what happens when I cancel."
[click confirm, banner appears]
[switch to terminal, run aws s3 ls → AccountCancelled error]
[but: open dashboard via kraterion-cli for funding]
[run kraterion-cli fund <shared_blob_id> 5 WAL → success]
Voiceover: "Files persist on-chain. Anyone can fund them.
            The platform doesn't own them — you do."

[1:15–1:50] TWIST 2 — ON-CHAIN REVOCATION
Visual: bucket settings → "Revoke API access"
Voiceover: "And one more thing."
[click Revoke, confirmation modal mentions Seal/threshold servers]
[Sui transaction confirmation, show Tx hash]
[show Walruscan event "ApiAccessRevoked"]

[switch to terminal]
[run aws s3 cp s3://bucket/photo.jpg ./local.jpg]
[error: KeyAccessRevoked]

Voiceover: "Now Kraterion can't decrypt your files.
            Not by mistake. Not by subpoena. Not by rogue employee.
            Sui and Seal enforce it.
            No cloud provider can technically make this guarantee."

[switch to dashboard]
[click Download on the same file]
[file downloads — browser decrypts with zkLogin]

Voiceover: "But you still can — your wallet still has access."

[1:50–2:00] CLOSE
Visual: cut to Kraterion logo
Text: "Kraterion.
       Storage that lives on-chain.
       Encryption that lives on-chain.
       Trust that doesn't live in our terms of service."

Text on screen: "kraterion.com · Sui Overflow 2026 · Walrus track"
```

### 13.2 Video tips

- **Cut every word that doesn't earn its place.** Voiceover should be ~150 words total.
- **Show, don't tell.** "Here's the transaction on Sui Explorer" → don't narrate, just show.
- **Captions on.** Many judges scrub videos at 1.5x with sound off — captions matter.
- **End on the hook, not the credits.** Last frame should be the URL, big.

### 13.3 What not to do in the demo

- **No talking heads.** Razvan's face is welcome on the pitch deck and X profile but not in the product demo.
- **No "let me explain how Walrus works" tutorial.** Judges know. Save it for the deck.
- **No flashy intro animation > 3 seconds.** Get to the hook fast.
- **No music.** Voice + clean UI is enough.
- **Don't mention "gated mode" or future iterations.** Stay focused on what ships.

### 13.4 Live demo for X Space (Walrus often does these)

If invited to do a live demo on an X Space:
- Same flow but expanded to 4-5 minutes
- Add: "Anyone can fund a SharedBlob — let me prove it. I'll send the SharedBlob ID to chat. Anyone with testnet WAL can extend it. Watch."
- For revocation: "I'll revoke API access live. Watch the boto3 fail in real-time."
- This converts viewers into participants. Strongest possible demo.

---

## 14. Submission and pitch deck

### 14.1 HackerEarth submission

- **Title:** Kraterion
- **Tagline:** "S3-compatible storage where leaving doesn't lose your files, and revoking means we can't read them anymore."
- **Track:** Walrus
- **Description (~250 words):** Lead with the three-primitive composition (Sui + Walrus + Seal), then S3 compatibility, then market positioning vs R2/B2.
- **Tech stack:** Sui Move, @mysten/walrus, @mysten/seal, @mysten/zklogin, NestJS, Next.js, PostgreSQL, Redis, DigitalOcean
- **GitHub link:** public repo, license MIT, README done
- **Demo video link:** YouTube unlisted or Loom
- **Live demo link:** the deployed app
- **Slides link:** Google Slides or Pitch.com (public link, not download)

### 14.2 Pitch deck — 11 slides

| # | Slide | Content |
|---|---|---|
| 1 | Title | Kraterion logo, tagline, Razvan name + role, Sui Overflow 2026 / Walrus track |
| 2 | Problem | "Cancel your S3 subscription, lose your files. Trust your S3 provider, hope they don't read them. Both are baked into how cloud storage works — including the 'decentralized' versions." |
| 3 | Insight | "Walrus shipped SharedBlob — a Sui object that wraps a blob with a fundable balance. Seal shipped on-chain access policies. Compose them: storage that survives cancellation AND can't be read by the platform. Almost no project has built a product on top of this composition." |
| 4 | Solution | Three guarantees: (1) Cancel us, files persist on-chain. (2) Revoke us, we can't read them. (3) Migrate to a competitor, files come with you. **Three guarantees no cloud storage provider can match.** |
| 5 | Demo | Embed video (or QR code linking to it). |
| 6 | Architecture | One diagram: Dashboard → Gateway (SigV4) → Walrus Publisher → SharedBlob on Sui + Seal envelope. Three primitives in one flow. |
| 7 | Why Walrus track | "We use SharedBlobs as the ownership primitive, Seal as the access-control primitive, and Sui as the policy substrate. Three Mysten primitives doing real work in concert. Razvan has shipped four `seal_approve_*` patterns in production at Inkray." |
| 8 | Roadmap | Mainnet beta · Stripe billing · **Gated mode (custom Move policies)** · Walrus Sites integration · Self-custody mode · Enterprise dedicated publishers. Show this is post-hackathon, real. |
| 9 | Track record | Inkray ($80K Walrus grant) · Storewave (Walrus Haulout winner) · CoinDrip (Sui Overflow 2025 winner) · 10+ Sui dev programs run · SuiDevHub founder. Photo of Razvan. |
| 10 | Ask | Walrus track top placement · Walrus Foundation continuation grant · Incubator slot. QR code to live demo. |
| 11 | Contact | Razvan handles + email + Kraterion URL. |

Each slide: ≤ 25 words of body text. The deck is a visual support to the pitch, not a document to read.

### 14.3 Walrus Foundation grant application (in parallel)

Submit via the Walrus Foundation grants form. Reference Inkray relationship. Tactical ask: $50–80K to fund Phase 1 mainnet beta, leveraging hackathon work. Position as continuation rather than new project — Foundation has already validated execution capacity.

---

## 15. Working with Claude Code

### 15.1 Setup

- **Use Claude Code in VS Code** (the integration is the most natural for a Next.js + NestJS monorepo).
- Set up a `CLAUDE.md` at the repo root with project context and conventions.
- Add per-app `CLAUDE.md` files in each app directory for local context.
- Use `git worktree` to run multiple agents in parallel on different workstreams.

### 15.2 The root `CLAUDE.md` template

```markdown
# Kraterion — Claude Code Context

## Project
Kraterion is an S3-compatible storage SaaS where every file is a Walrus SharedBlob
owned on-chain by the user, encrypted with Seal envelope encryption by default,
and the platform's decryption access is delegated via on-chain Move policy that
the user can revoke. Building for Sui Overflow 2026, Walrus track.

Read /docs/implementation-plan.md for the full spec. Always defer to that doc
when in doubt.

## Stack conventions
- TypeScript strict mode everywhere
- NestJS with Fastify adapter (not Express) for back-end services
- Next.js 16 App Router
- Prisma for DB; never write raw SQL except in migrations
- shadcn/ui for components; never install other UI libs
- Zod for runtime validation at API boundaries
- BullMQ for background jobs
- Vitest for tests (not Jest), tests co-located with source files
- Conventional commits

## Crypto / Sui / Walrus / Seal
- All crypto primitives via @mysten/seal and @mysten/walrus
- Never roll our own crypto
- AES key material must be in Buffer/Uint8Array only, never strings
- Zero key material from memory after use
- KMS-wrap any persistent secret keys; never store plaintext mnemonics
- SessionKeys cached in Redis with TTL matching the SessionKey TTL

## Style
- Prefer composition over inheritance
- Prefer explicit imports over barrel exports
- Pure functions where possible; side effects pushed to edges
- Comments only when intent is non-obvious; no doc-block bloat
- Error messages are user-facing; write them like product copy

## What not to do
- Don't add features not in /docs/implementation-plan.md without asking
- Don't introduce new dependencies without confirming
- Don't make commits with mixed concerns; split them
- Don't write defensive code that catches errors only to re-throw
- Don't add unit tests for trivial getters/setters
- Don't implement gated mode (custom Move policies) — that's post-hackathon

## Network
- Walrus testnet only for now
- Sui testnet only for now
- Seal testnet key servers (Mysten public, 2-of-3)
- Network constants in packages/shared/src/constants.ts
```

### 15.3 Workstream parallelization

Once the foundation (week 1) is complete, four parallel workstreams emerge. Each is a separate `git worktree`:

```bash
git worktree add ../kraterion-gateway feature/gateway
git worktree add ../kraterion-dashboard feature/dashboard
git worktree add ../kraterion-worker feature/worker
git worktree add ../kraterion-move feature/move-package
```

Run a Claude Code session in each worktree directory.

**Workstream prompts (one per agent at start):**

1. Gateway agent: "You are working on the S3 gateway in apps/gateway. Read /docs/implementation-plan.md sections 6, 7, and 10. Implement Round 1 (SigV4 + minimal happy path). Stop when boto3 ListBuckets returns an empty Buckets element."
2. Dashboard agent: "You are working on the dashboard in apps/dashboard. Read /docs/implementation-plan.md section 9. Implement /buckets list page first — empty state and create-bucket modal. Use shadcn/ui only."
3. Worker agent: "You are working on the renewal worker in apps/worker. Read /docs/implementation-plan.md section 8. Implement the renewal scan job with PTB batching."
4. Move agent: "You are working on the Move package in move/kraterion. Read /docs/implementation-plan.md section 4. Implement KraterionBucket with api_decryption_addresses, all the public functions, and seal_approve_private. Write Move tests."

Synchronize daily.

### 15.4 Specific Claude Code patterns Razvan should use

- **Plan-then-act:** start every session with "Read this section of the plan and write a 5-step plan before writing any code. I'll review the plan." Avoids 90% of misalignment.
- **Test-driven verification:** "After implementing, write a test that calls this from boto3 directly and shows the response."
- **Reject scope creep aggressively:** "I asked for X, you wrote X+Y. Revert Y."
- **Memory of conventions:** keep CLAUDE.md updated as conventions emerge.
- **Use `/compact` between major workstreams** to keep context window healthy.

### 15.5 What to do yourself, not delegate

- The 90-second demo video script and recording (creative judgment)
- The pitch deck (your voice, your face, your relationships matter)
- All product naming and copy (taste calls)
- Walrus Foundation outreach (relationship work)
- Final review of the Move package logic, especially `seal_approve_private` (security-critical, your name on it)

---

## 16. Future roadmap (post-hackathon)

What's intentionally cut from v1 but valuable for the v2 narrative and grant pitch:

### 16.1 Gated mode (custom Move policies)

The architecture already supports `encryption_mode = 'gated'`. Adding it post-hackathon means:
- Built-in policy templates: allowlist, NFT-gated, subscription, time-locked, payment-gated
- Customers can also point at their own Move package for fully custom logic
- UI for managing allowlists, NFT collection IDs, subscription terms
- Browser-side decryption supports multiple `seal_approve_*` functions

This is the "Sui-native programmability" headline differentiator. Not in v1, but slide 8 of the deck mentions it as the next step.

### 16.2 Self-custody mode

User holds their own Sui keypair (browser wallet, no zkLogin). They sign every renewal extension manually or run their own renewal cron. Kraterion becomes pure tooling, no custody. Probably <1% of customers but valuable as "we support full sovereignty."

### 16.3 Multipart upload

For files >13 GiB. Buffer parts in scratch (R2), assemble into single blob on Complete. Implementation pattern in original implementation plan section 6.3 (Option A buffer-and-merge).

### 16.4 Quilt rollup for small files

Auto-batch small (<10 MiB) files into rolling per-bucket Quilts. Critical for cost-effective small-file workloads at mainnet pricing.

### 16.5 Range reads + cache layer

Two-tier cache (NVMe + R2) in front of Walrus aggregator. Range slicing from cache. Required for video / large-file workloads.

### 16.6 Walrus Sites integration

"Publish bucket as static site" — one-click deployment of public-read content as a Walrus Site with `wal.app` subdomain. Custom domains via SuiNS.

### 16.7 Stripe + real billing

Tier upgrades, payment method management, invoice history. Fiat → WAL conversion handled internally.

### 16.8 Multi-region

Currently single-region (EU). Add US, APAC. Edge cache layer in each.

### 16.9 Audit log on Walrus

Every PUT/DELETE/REVOKE emits a Sui event. Index those events into a customer-facing audit log. **Eat our own dog food**: audit log itself stored on Walrus.

### 16.10 MCP server

Let AI agents read/write to buckets via MCP. Fits Razvan's existing experience and the agentic-storage trend.

---

## 17. Open questions and risks

### Open questions

1. **Final project name.** Kraterion is the working name. Pick before anything goes public.
2. **Default region naming.** "EU-Central" vs literal Walrus testnet identifiers — decide consistent UX label.
3. **Free tier limits post-hackathon.** Hard cap or fair-use? Recommend hard cap.
4. **Public link URL structure.** `kraterion.com/public/<bucket>/<key>` is the simplest. Could also use SuiNS subdomain mapping for vanity post-hackathon. Decide before week 5.
5. **When to file the Walrus Foundation grant.** Recommendation: week 5, before submission, referencing Inkray history.

### Risks (and mitigations)

| Risk | Likelihood | Mitigation |
|---|---|---|
| SigV4 implementation has bugs that break SDKs | Medium-high | Build Round 1 first, test with boto3 from day one, port MinIO's verifier |
| Seal envelope encryption has bugs | Medium | Use SDK only; test round-trip with all SDKs in week 2 |
| Walrus testnet is wiped during the build | Low-medium | Scripts that re-deploy from scratch in <30 minutes |
| Sui testnet RPC instability during demo | Medium | Backup RPC; pre-record fallback demo video |
| Move package has a bug in seal_approve_private | Low | Move tests covering positive + negative cases; manual review by Razvan in week 4 |
| A competitor announces an S3-on-Walrus project before deadline | Medium | Differentiate harder on Seal revocation ("we can't read them"); polish the second twist |
| Demo video quality is amateur | Medium | Re-record 3+ times; show to a friend; iterate |
| Run out of time on revocation flow (twist 2) | Medium | Land twist 1 by end of week 3; protect week 4 for revocation; cut anything else |
| Browser-side Seal decryption complexity blows up | Medium | Use SDK examples directly; if completely stuck by Friday week 4, fall back to "Kraterion decrypts and proxies" but still show the on-chain revocation invalidating SDK access |

---

## 18. References

### Walrus
- Official docs: https://docs.wal.app/
- TypeScript SDK: https://www.npmjs.com/package/@mysten/walrus
- SDK docs: https://sdk.mystenlabs.com/walrus
- SharedBlob source: https://github.com/MystenLabs/walrus-docs/blob/main/contracts/walrus/sources/system/shared_blob.move
- Cost calculator: https://costcalculator.wal.app
- Walruscan: https://walruscan.com/
- Awesome Walrus: https://github.com/MystenLabs/awesome-walrus

### Seal
- Official docs: https://seal-docs.wal.app/
- TypeScript SDK: https://www.npmjs.com/package/@mysten/seal
- Seal repo: https://github.com/MystenLabs/seal
- Design doc: https://github.com/MystenLabs/seal/blob/main/Design.md
- Move policy patterns: https://github.com/MystenLabs/seal/tree/main/move
- Key server pricing/config: https://seal-docs.wal.app/Pricing
- SealClient + SessionKey reference: https://deepwiki.com/MystenLabs/seal/4.1-sealclient-and-sessionkey

### Sui
- Sui docs: https://docs.sui.io/
- zkLogin SDK: https://sdk.mystenlabs.com/zklogin
- dapp-kit: https://sdk.mystenlabs.com/dapp-kit
- Sui Explorer: https://suiscan.xyz/
- Sui faucet: https://faucet.sui.io/
- Custom indexer + Walrus example: https://docs.sui.io/guides/developer/advanced/custom-indexer/indexer-walrus

### S3 compatibility
- AWS S3 API reference: https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html
- S3 error responses: https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
- SigV4 spec: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
- MinIO signature verifier (reference port): https://github.com/minio/minio/blob/master/cmd/signature-v4.go

### Hackathon
- Sui Overflow 2026: https://overflow.sui.io/
- Walrus Foundation grants: https://www.walrus.xyz/grants
- 2025 Overflow winners (for reference): https://blog.sui.io/2025-sui-overflow-hackathon-winners/

### Reference implementations (Razvan's prior work)
- Inkray's `seal_approve_*` patterns — direct port reference for Kraterion's `seal_approve_private`
- Inkray's Walrus integration — reference for envelope encryption patterns
