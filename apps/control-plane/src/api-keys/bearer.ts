import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Bearer API tokens (`kr_live_…` / `kr_test_…`) — the unified programmatic
 * credential consumed by the control plane (CRUD, agent chat, knowledge, MCP).
 *
 * Shape mirrors Stripe / OpenAI / Anthropic conventions:
 *   kr_<env>_<36 url-safe chars>
 *
 * The prefix encodes the issuing environment so a `kr_test_` token cannot
 * be replayed against a production deployment (`SUI_NETWORK=mainnet`) and
 * vice-versa. Only the SHA-256 hash is persisted — the cleartext token is
 * returned once at mint time and thrown away, so a DB compromise cannot
 * reveal any active tokens.
 *
 * SigV4 keys (`AKIA…`) still flow through `akia.ts` — they're a different
 * credential kind because the S3 protocol mandates an id+secret pair.
 */

export type Network = "testnet" | "mainnet";

// 62-char URL-safe alphabet. 36 chars → ~214 bits of entropy, which is
// well above the 128-bit floor and matches Stripe's current key strength.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BODY_LEN = 36;
const PREFIX_LIVE = "kr_live_";
const PREFIX_TEST = "kr_test_";

const BEARER_RE = /^kr_(live|test)_[A-Za-z0-9]{36}$/;

export function networkFromEnv(): Network {
  // SUI_NETWORK is shared with the sponsorship service. devnet rolls into
  // testnet — anything that isn't explicitly "mainnet" is treated as test.
  return process.env["SUI_NETWORK"] === "mainnet" ? "mainnet" : "testnet";
}

function prefixFor(network: Network): string {
  return network === "mainnet" ? PREFIX_LIVE : PREFIX_TEST;
}

export interface MintedBearerMaterial {
  /** Cleartext token, returned to the caller exactly once. */
  token: string;
  /** sha256(token), stored as ApiKey.token_hash for O(1) lookup. */
  hash: string;
  /** Cosmetic preview persisted to ApiKey.token_prefix for the dashboard. */
  display: string;
}

export function mintBearerToken(network: Network): MintedBearerMaterial {
  const prefix = prefixFor(network);
  const buf = randomBytes(BODY_LEN);
  let body = "";
  for (let i = 0; i < BODY_LEN; i++) {
    body += ALPHABET[buf[i]! % ALPHABET.length];
  }
  const token = `${prefix}${body}`;
  return {
    token,
    hash: hashBearer(token),
    display: `${prefix}${body.slice(0, 4)}…${body.slice(-4)}`,
  };
}

export function hashBearer(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeBearer(s: string): boolean {
  return BEARER_RE.test(s);
}

/** Returns the network a token claims to belong to, or null if malformed. */
export function networkOfToken(token: string): Network | null {
  if (token.startsWith(PREFIX_LIVE)) return "mainnet";
  if (token.startsWith(PREFIX_TEST)) return "testnet";
  return null;
}

/**
 * Constant-time hash comparison. We don't actually need this — token_hash
 * is the lookup key, so an attacker cannot probe it without already
 * knowing the full token — but using timingSafeEqual costs nothing and
 * makes the audit story trivial.
 */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
