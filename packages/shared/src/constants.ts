/**
 * Network constants. Single source of truth for Walrus / Sui / Seal endpoints.
 * Update only here — every service imports from this module.
 */

export const NETWORK = {
  sui: "testnet",
  walrus: "testnet",
} as const;

/**
 * Sui testnet gRPC endpoint. Same host as the old (deactivated) JSON-RPC
 * endpoint; the
 * `SuiGrpcClient` default `GrpcWebFetchTransport` speaks gRPC-Web over it for
 * unary calls (verified working). The default transport is fine for unary
 * services; the worker indexer overrides it with `@grpc/grpc-js` for its
 * long-lived checkpoint stream.
 */
export const SUI_TESTNET_GRPC = "https://fullnode.testnet.sui.io:443";

/**
 * Sui testnet GraphQL endpoint, for `SuiGraphQLClient`. Only needed for
 * historical queries gRPC doesn't serve (e.g. `queryEvents`); not on any
 * hot path.
 */
export const SUI_TESTNET_GRAPHQL = "https://graphql.testnet.sui.io/graphql";

// === Walrus testnet (Architecture D — SDK + public upload-relay + public aggregator) ===

/** HTTP aggregator for blob reads. Public Mysten testnet endpoint. */
export const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

/** HTTP upload-relay for blob writes. Public Mysten testnet endpoint. */
export const WALRUS_UPLOAD_RELAY_URL = "https://upload-relay.testnet.walrus.space";

/**
 * The on-chain `walrus::system::System` shared object on testnet. Required as
 * a tx input for `register_blob`, `extend_blob`, `register_pooled_blob`, etc.
 * Sourced from `@mysten/walrus`'s `TESTNET_WALRUS_PACKAGE_CONFIG.systemObjectId`.
 */
export const WALRUS_SYSTEM_OBJECT_ID =
  "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af";

/**
 * The Walrus package's CURRENT published-at address on testnet (v3 at time of
 * writing — confirmed via `Published.toml` and the System object's `package_id`
 * field). Differs from `WAL_PACKAGE_ID` and from the package's original-id
 * (`0xd84704c1...`, the v1 address our Move.toml uses for type identity).
 *
 * We need this when reading on-chain modules via RPC (which does NOT follow
 * the upgrade chain — `sui_getNormalizedMoveModule(original_id, ...)` returns
 * the v1 surface). For tx submission, Sui resolves the upgrade chain
 * automatically; for introspection (admin tooling, calibration scripts), use
 * the published-at directly.
 *
 * The `storage_pool` module was introduced in v3 — check this constant on
 * startup if the gateway needs to assert pool support is live.
 */
export const WALRUS_PACKAGE_PUBLISHED_AT_TESTNET =
  "0x849e95d2718938d66c37fb91df76d72f78526c1864c339bac415ce8ecda2d8cc";

/** Walrus package version currently deployed on testnet (v3 ships storage_pool). */
export const WALRUS_PACKAGE_VERSION_TESTNET = 3;

/**
 * The Walrus staking pool on testnet. Some PTBs reference it; we don't yet,
 * but keep it here so SDK bumps don't surprise us.
 * Sourced from `TESTNET_WALRUS_PACKAGE_CONFIG.stakingPoolId`.
 */
export const WALRUS_STAKING_POOL_ID =
  "0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3";

/**
 * The WAL token's testnet package ID. Matches `[addresses].wal` in
 * `move/kraterion/Move.toml`. Several other "WAL Token" coins float
 * around testnet (faucet artifacts from unrelated packages) — only
 * coins of type `${WAL_PACKAGE_ID}::wal::WAL` are spendable by Walrus.
 */
export const WAL_PACKAGE_ID =
  "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a";

/** Fully-qualified Sui coin type for the canonical testnet WAL token. */
export const WAL_COIN_TYPE = `${WAL_PACKAGE_ID}::wal::WAL`;

/**
 * Legacy publisher URL field — kept for back-compat with any existing callers
 * that read it. We don't run a publisher; this is the public Mysten one,
 * documented as "rate-limited; for emergency only" by Walrus docs §10.4.
 */
export const WALRUS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";

// === Seal testnet — Decentralized Committee ===

/**
 * The on-chain Decentralized Seal Committee object for testnet. One trust
 * unit from the SDK's perspective; internally a 3-of-5 threshold across
 * geo-distributed operators (Mysten, Natsai, Overclock, NodeInfra,
 * Ruby Nodes). Configure SealClient with `[{ objectId: ..., weight: 1 }]`
 * and an SDK-side threshold of `1`.
 *
 * Sourced from https://github.com/MystenLabs/seal/blob/main/docs/content/Pricing.mdx
 * and https://blog.sui.io/introducing-decentralized-seal-key-server-testnet/.
 *
 * Fallback (if the committee is down): swap to a 2-of-3 of independent
 * open-mode servers — Mysten Labs server 1+2 and Ruby Nodes (object IDs
 * also in the Pricing doc). One-line config swap.
 */
export const SEAL_KEY_SERVERS: readonly { objectId: string; weight: number; name: string }[] = [
  {
    objectId: "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
    weight: 1,
    name: "Decentralized Committee (Mysten + Natsai + Overclock + NodeInfra + Ruby Nodes; 3-of-5 internal threshold)",
  },
];

/** SDK-side threshold for `SealClient`. With one decentralized committee, this is 1. */
export const SEAL_THRESHOLD = 1;

/** Mysten-operated trustless aggregator in front of the decentralized committee. */
export const SEAL_AGGREGATOR_URL = "https://seal-aggregator-testnet.mystenlabs.com";

// === Kraterion deployment ===

/** Kraterion Move package — populated after first publish. */
export const KRATERION_PACKAGE_ID = "0x6eabb85ec3085a8e8af32094d242eef5d063f510ae5d26cd241de680128036d3";

/** Captured at publish; needed for `sui client upgrade-package`. */
export const KRATERION_UPGRADE_CAP_ID = "0x8fa90d9fb9ed754dd513cb5aa64d62d183f6ee524b5161f5909f8d1ea59d55c0";

/**
 * Singleton PlatformReserve, spawned by the package's init function
 * at publish. Required as a tx input by every paid operation
 * (`register_blob_for_bucket`, `extend_blob_from_reserve`).
 */
export const KRATERION_RESERVE_ID = "0xee4628fb637eb7d05ff420d658b98eaebb00c523f7cf1c3ecf908b02982ac9f4";
