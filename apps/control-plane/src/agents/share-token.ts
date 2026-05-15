import { createHash, randomBytes } from "node:crypto";
import { networkFromEnv, type Network } from "../api-keys/bearer.js";

/**
 * P6 — Share tokens for the embeddable chat widget.
 *
 * Shape mirrors `kr_live_…` / `kr_test_…` bearer API keys but with a
 * distinct prefix so the auth guard can route them to a different
 * resolver and the dashboard can tell at a glance "this credential
 * lives on a customer's website, not in their CI."
 *
 *   kr_share_live_<36 url-safe chars>   — mainnet deployments
 *   kr_share_test_<36 url-safe chars>   — testnet + devnet (default)
 *
 * Storage policy (same as bearer):
 *   - We persist `sha256(token)` only. Cleartext leaves the server
 *     once in the mint response and is never retrievable.
 *   - Hash, network, prefix-preview, and per-token caps live in
 *     `AgentShareToken`. Daily counters in `ShareTokenUsageDay`.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BODY_LEN = 36; // ~214 bits entropy, matches the bearer strength
const PREFIX_LIVE = "kr_share_live_";
const PREFIX_TEST = "kr_share_test_";

const SHARE_TOKEN_RE = /^kr_share_(live|test)_[A-Za-z0-9]{36}$/;

export interface MintedShareToken {
  /** Cleartext token — returned exactly once at mint time. */
  token: string;
  /** sha256(token) — primary lookup key stored in `token_hash`. */
  hash: string;
  /** Cosmetic preview persisted to `token_prefix` for the dashboard
   *  ("kr_share_test_aB3…X9Z"). */
  display: string;
  /** Network the token claims to belong to; mirrors current env. */
  network: Network;
}

export function mintShareToken(): MintedShareToken {
  const network = networkFromEnv();
  const prefix = network === "mainnet" ? PREFIX_LIVE : PREFIX_TEST;
  const buf = randomBytes(BODY_LEN);
  let body = "";
  for (let i = 0; i < BODY_LEN; i++) {
    body += ALPHABET[buf[i]! % ALPHABET.length];
  }
  const token = `${prefix}${body}`;
  return {
    token,
    hash: hashShareToken(token),
    display: `${prefix}${body.slice(0, 4)}…${body.slice(-4)}`,
    network,
  };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeShareToken(s: string): boolean {
  return SHARE_TOKEN_RE.test(s);
}

export function networkOfShareToken(token: string): Network | null {
  if (token.startsWith(PREFIX_LIVE)) return "mainnet";
  if (token.startsWith(PREFIX_TEST)) return "testnet";
  return null;
}

/**
 * UTC date in `YYYY-MM-DD` shape — the cap-bucket key used by
 * `ShareTokenUsageDay`. Deterministic across processes, no timezone
 * footguns.
 */
export function utcDay(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
