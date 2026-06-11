/**
 * Typed accessors for `NEXT_PUBLIC_*` env vars.
 *
 * Hard-fails at first read if a required var is missing — preferable to a
 * silent undefined later. Imports are tree-shakeable: pull only what you
 * need.
 *
 * IMPORTANT: every var is read as a *static* `process.env.NEXT_PUBLIC_*`
 * member expression. Next.js inlines `NEXT_PUBLIC_*` into the client bundle
 * only for static literal accesses — `process.env[name]` with a dynamic key
 * is NOT replaced, so in the browser it resolves to `undefined` and silently
 * falls back (e.g. to localhost in prod). Do not refactor these back into a
 * `process.env[name]` lookup.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Add it to apps/dashboard/.env.local (and to the Vercel project for deploys).`,
    );
  }
  return value;
}

function optional(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

export const env = {
  controlPlaneUrl: optional(process.env.NEXT_PUBLIC_CONTROL_PLANE_URL, "http://localhost:4001"),
  gatewayUrl: optional(process.env.NEXT_PUBLIC_GATEWAY_URL, "http://localhost:4002"),
  /**
   * Public Walrus aggregator — read-only HTTP endpoint that serves any
   * blob by its content-addressed `walrus_blob_id`. The dashboard uses
   * it to pull ciphertext for browser-side Seal decryption, bypassing
   * the gateway so the read survives platform API revocation.
   */
  walrusAggregatorUrl: optional(
    process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL,
    "https://aggregator.walrus-testnet.walrus.space",
  ),
  network: optional(process.env.NEXT_PUBLIC_SUI_NETWORK, "testnet") as "testnet" | "mainnet" | "devnet",
  /**
   * Read lazily — `getEnokiPublicKey()` only throws when an Enoki path is hit.
   * Pre-Phase-B pages that don't touch Enoki keep working even without it.
   */
  getEnokiPublicKey: () => required(process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY, "NEXT_PUBLIC_ENOKI_PUBLIC_KEY"),
  getGoogleClientId: () => required(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, "NEXT_PUBLIC_GOOGLE_CLIENT_ID"),
  /**
   * Stripe publishable key for inline `<PaymentElement />` on the
   * billing page. Read lazily — pre-B5 pages don't depend on Stripe
   * and shouldn't break if the key is missing.
   */
  getStripePublishableKey: () => required(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
} as const;
