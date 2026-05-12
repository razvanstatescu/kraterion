/**
 * Typed accessors for `NEXT_PUBLIC_*` env vars.
 *
 * Hard-fails at first read if a required var is missing — preferable to a
 * silent undefined later. Imports are tree-shakeable: pull only what you
 * need.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Add it to apps/dashboard/.env.local.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  controlPlaneUrl: optional("NEXT_PUBLIC_CONTROL_PLANE_URL", "http://localhost:4001"),
  gatewayUrl: optional("NEXT_PUBLIC_GATEWAY_URL", "http://localhost:4002"),
  /**
   * Public Walrus aggregator — read-only HTTP endpoint that serves any
   * blob by its content-addressed `walrus_blob_id`. The dashboard uses
   * it to pull ciphertext for browser-side Seal decryption, bypassing
   * the gateway so the read survives platform API revocation.
   */
  walrusAggregatorUrl: optional(
    "NEXT_PUBLIC_WALRUS_AGGREGATOR_URL",
    "https://aggregator.walrus-testnet.walrus.space",
  ),
  network: optional("NEXT_PUBLIC_SUI_NETWORK", "testnet") as "testnet" | "mainnet" | "devnet",
  /**
   * Read lazily — `getEnokiPublicKey()` only throws when an Enoki path is hit.
   * Pre-Phase-B pages that don't touch Enoki keep working even without it.
   */
  getEnokiPublicKey: () => required("NEXT_PUBLIC_ENOKI_PUBLIC_KEY"),
  getGoogleClientId: () => required("NEXT_PUBLIC_GOOGLE_CLIENT_ID"),
} as const;
