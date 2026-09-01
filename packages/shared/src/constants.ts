/**
 * Network constants — single source of truth for Walrus / Sui / Seal.
 *
 * Everything is **network-aware**: the active network is read once from
 * `SUI_NETWORK` (server) or `NEXT_PUBLIC_SUI_NETWORK` (browser, inlined by
 * Next), defaulting to `testnet`. Set `SUI_NETWORK=mainnet` to flip every
 * endpoint/object id below to its mainnet value. Mainnet chain IDs were
 * sourced from `@mysten/walrus` `MAINNET_WALRUS_PACKAGE_CONFIG` and verified
 * against the live mainnet chain (2026-09-01).
 */

export type SuiNetwork = "testnet" | "mainnet";

function resolveNetwork(): SuiNetwork {
  const raw = (
    process.env.SUI_NETWORK ??
    process.env.NEXT_PUBLIC_SUI_NETWORK ??
    "testnet"
  ).toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}

/** The resolved active network. */
export const ACTIVE_NETWORK: SuiNetwork = resolveNetwork();
const MAINNET = ACTIVE_NETWORK === "mainnet";

export const NETWORK = { sui: ACTIVE_NETWORK, walrus: ACTIVE_NETWORK } as const;

// === Sui endpoints ===

/** Sui fullnode gRPC (gRPC-Web for unary; the worker overrides with grpc-js). */
export const SUI_GRPC_URL = MAINNET
  ? "https://fullnode.mainnet.sui.io:443"
  : "https://fullnode.testnet.sui.io:443";

/** Sui GraphQL — historical queries gRPC doesn't serve. Not on any hot path. */
export const SUI_GRAPHQL_URL = MAINNET
  ? "https://graphql.mainnet.sui.io/graphql"
  : "https://graphql.testnet.sui.io/graphql";

/** @deprecated network-neutral alias of {@link SUI_GRPC_URL}. */
export const SUI_TESTNET_GRPC = SUI_GRPC_URL;
/** @deprecated network-neutral alias of {@link SUI_GRAPHQL_URL}. */
export const SUI_TESTNET_GRAPHQL = SUI_GRAPHQL_URL;

// === Walrus (Architecture D — SDK + public upload-relay + public aggregator) ===

/** HTTP aggregator for blob reads. */
export const WALRUS_AGGREGATOR_URL = MAINNET
  ? "https://aggregator.walrus-mainnet.walrus.space"
  : "https://aggregator.walrus-testnet.walrus.space";

/** HTTP upload-relay for blob writes. */
export const WALRUS_UPLOAD_RELAY_URL = MAINNET
  ? "https://upload-relay.mainnet.walrus.space"
  : "https://upload-relay.testnet.walrus.space";

/** Legacy publisher URL — we don't run a publisher; Mysten's is emergency-only. */
export const WALRUS_PUBLISHER_URL = MAINNET
  ? "https://publisher.walrus-mainnet.walrus.space"
  : "https://publisher.walrus-testnet.walrus.space";

/**
 * `walrus::system::System` shared object. Required as a tx input for
 * `register_pooled_blob`, `extend_storage_pool`, etc.
 * Sourced from `@mysten/walrus` `*_WALRUS_PACKAGE_CONFIG.systemObjectId`.
 */
export const WALRUS_SYSTEM_OBJECT_ID = MAINNET
  ? "0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2"
  : "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af";

/**
 * Walrus staking pool. Sourced from `*_WALRUS_PACKAGE_CONFIG.stakingPoolId`.
 */
export const WALRUS_STAKING_POOL_ID = MAINNET
  ? "0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904"
  : "0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3";

/**
 * The Walrus package's CURRENT published-at (v3, ships `storage_pool`) — used
 * for RPC introspection (which doesn't follow the upgrade chain). Differs from
 * the package original-id used in `Move.toml` for type identity:
 *   testnet original-id `0xd84704c1…`; mainnet original-id `0xfdc88f7d…`.
 * Verified from the System object's `package_id` field on each network.
 */
export const WALRUS_PACKAGE_PUBLISHED_AT = MAINNET
  ? "0x98da433aa0139512c210597b1c5e3df6cd121d8d77f8652691bb66fadfc8aa1b"
  : "0x849e95d2718938d66c37fb91df76d72f78526c1864c339bac415ce8ecda2d8cc";
/** @deprecated network-neutral alias of {@link WALRUS_PACKAGE_PUBLISHED_AT}. */
export const WALRUS_PACKAGE_PUBLISHED_AT_TESTNET = WALRUS_PACKAGE_PUBLISHED_AT;

/** Walrus package version (v3 ships storage_pool) — same on both networks. */
export const WALRUS_PACKAGE_VERSION = 3;
/** @deprecated network-neutral alias of {@link WALRUS_PACKAGE_VERSION}. */
export const WALRUS_PACKAGE_VERSION_TESTNET = WALRUS_PACKAGE_VERSION;

/**
 * WAL token package id. Must match `[addresses].wal` in `move/kraterion/Move.toml`.
 * Only coins of type `${WAL_PACKAGE_ID}::wal::WAL` are spendable by Walrus.
 * Mainnet verified via `coinMetadata` (symbol WAL, decimals 9).
 */
export const WAL_PACKAGE_ID = MAINNET
  ? "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59"
  : "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a";

/** Fully-qualified Sui coin type for the canonical WAL token. */
export const WAL_COIN_TYPE = `${WAL_PACKAGE_ID}::wal::WAL`;

// === Seal — decentralized committee ===

/**
 * On-chain Seal committee object. Configure `SealClient` with
 * `[{ objectId, weight: 1 }]` + SDK threshold 1; the committee's own internal
 * threshold (mainnet: 5-of-8) is served by the aggregator endpoint below.
 * Mainnet committee verified on-chain (`key_server::KeyServer`, V2 committee,
 * members: Mysten, Natsai, NodeInfra, Ruby Nodes, Overclock, H2ONodes,
 * Triton, Unconfirmed). Permissionless — no package registration needed.
 */
export const SEAL_KEY_SERVERS: readonly { objectId: string; weight: number; name: string }[] = MAINNET
  ? [
      {
        objectId: "0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595",
        weight: 1,
        name: "Seal Mainnet Committee (8 operators, 5-of-8 internal threshold)",
      },
    ]
  : [
      {
        objectId: "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
        weight: 1,
        name: "Decentralized Committee (testnet; 3-of-5 internal)",
      },
    ];

/** SDK-side threshold for `SealClient`. One committee → 1. */
export const SEAL_THRESHOLD = 1;

/**
 * Aggregator endpoint in front of the committee. On mainnet this is Mysten's
 * gated aggregator: every request must carry the API key as the HTTP header
 * `SEAL_API_KEY_NAME: SEAL_API_KEY` (see `seal-client`). Matches the working
 * inkray mainnet config. Testnet's aggregator is open (no key).
 */
export const SEAL_AGGREGATOR_URL = MAINNET
  ? "https://seal-aggregator-mainnet.mystenlabs.com"
  : "https://seal-aggregator-testnet.mystenlabs.com";

/**
 * HTTP header name the mainnet aggregator expects the API key under. Enoki
 * issues these keys; inkray's working setup uses `x-api-key`. Overridable via
 * `SEAL_API_KEY_NAME` env. Empty on testnet (open aggregator).
 */
export const SEAL_API_KEY_NAME = MAINNET
  ? (process.env.SEAL_API_KEY_NAME ?? "x-api-key")
  : "";

// === Kraterion deployment (per-network; mainnet trio written by setup-mainnet.sh) ===

export const KRATERION_PACKAGE_ID_TESTNET =
  "0x6eabb85ec3085a8e8af32094d242eef5d063f510ae5d26cd241de680128036d3";
export const KRATERION_UPGRADE_CAP_ID_TESTNET =
  "0x8fa90d9fb9ed754dd513cb5aa64d62d183f6ee524b5161f5909f8d1ea59d55c0";
export const KRATERION_RESERVE_ID_TESTNET =
  "0xee4628fb637eb7d05ff420d658b98eaebb00c523f7cf1c3ecf908b02982ac9f4";

// Filled by `scripts/setup-mainnet.sh` after the mainnet publish. Empty until
// then — mainnet on-chain ops fail loudly (by design) until published.
export const KRATERION_PACKAGE_ID_MAINNET = "0xcd9329e9693fecbcdb1d505d537e007c08d08f77dc65094cf149bc3018ce3396";
export const KRATERION_UPGRADE_CAP_ID_MAINNET = "0x724ef6a057c7146c68dbbf5e59ed20dfeee8c4c985dc507bc93892fec1d799ee";
export const KRATERION_RESERVE_ID_MAINNET = "0x6759a74f0bdaf5aa245790fef85dc06bc480bcec804bf286760bf026bb8ff132";

/** Kraterion Move package (active network). */
export const KRATERION_PACKAGE_ID = MAINNET
  ? KRATERION_PACKAGE_ID_MAINNET
  : KRATERION_PACKAGE_ID_TESTNET;

/** Upgrade cap (active network). Needed for `sui client upgrade`. */
export const KRATERION_UPGRADE_CAP_ID = MAINNET
  ? KRATERION_UPGRADE_CAP_ID_MAINNET
  : KRATERION_UPGRADE_CAP_ID_TESTNET;

/** Singleton PlatformReserve (active network) — tx input for every paid op. */
export const KRATERION_RESERVE_ID = MAINNET
  ? KRATERION_RESERVE_ID_MAINNET
  : KRATERION_RESERVE_ID_TESTNET;
