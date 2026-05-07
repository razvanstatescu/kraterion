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
export const KRATERION_PACKAGE_ID = "0x853ceaa163da9b14ba7d7f11d6f7aa42a0f41bd441ca66e9fb8bff106dc818f5";

// Captured at publish; needed for sui client upgrade-package.
export const KRATERION_UPGRADE_CAP_ID = "0x68e76518d28d36165c28c91f964eebc608ba18f8aed05eec09a67316fdee596d";
