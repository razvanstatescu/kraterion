/**
 * Network constants. Single source of truth for Walrus / Sui / Seal endpoints.
 * Update only here — every service imports from this module.
 */

export const NETWORK = {
  sui: "testnet",
  walrus: "testnet",
} as const;

export const SUI_TESTNET_RPC = "https://fullnode.testnet.sui.io:443";

// Seal testnet key servers — Mysten public, 2-of-3.
// Concrete object IDs to be filled in from https://seal-docs.wal.app/Pricing
// before first PutObject ships.
export const SEAL_KEY_SERVERS: readonly string[] = [];

// Walrus testnet endpoints — fill in once a Mysten publisher/aggregator is up.
export const WALRUS_PUBLISHER_URL = "";
export const WALRUS_AGGREGATOR_URL = "";

// Kraterion Move package — populated after first publish.
export const KRATERION_PACKAGE_ID = "";
