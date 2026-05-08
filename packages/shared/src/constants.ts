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
export const KRATERION_PACKAGE_ID = "0x5dfc84a40e295ba2472e9d2ebd728ff58d133431976f8123c9466f09a3a464db";

// Captured at publish; needed for sui client upgrade-package.
export const KRATERION_UPGRADE_CAP_ID = "0x09b6cbd14416224bdc9694bf4b66219d630611f0b284ab029d8e05e0981be958";

// Singleton PlatformReserve, spawned by the package's init function
// at publish. Required as a tx input by every paid operation.
export const KRATERION_RESERVE_ID = "0x9d939ddb91d7379afaebd5c86c4470a6285638eb92e3e8f7a1a2df267cef5a5c";
