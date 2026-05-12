import { createHash } from "node:crypto";

/**
 * RFC 7636 PKCE S256 verifier check.
 *
 * The client sends `code_challenge` at /authorize time (the base64url
 * SHA-256 hash of a secret `code_verifier`) and the matching
 * `code_verifier` at /token time. We re-hash the verifier and
 * constant-time-compare against the stored challenge.
 *
 * We require S256 — the spec permits `plain`, but the MCP-spec 2025-11
 * authorization profile mandates S256 (the OAuth-MCP guide hammers
 * this point home). Refusing `plain` keeps the surface tight.
 *
 * Returns true on match; false on any failure (length mismatch,
 * format error, etc.). Constant-time hashing means a malicious
 * "verifier" can't probe lengths through timing.
 */
export function verifyPkceS256(verifier: string, expectedChallenge: string): boolean {
  if (!verifier || !expectedChallenge) return false;
  // RFC 7636 §4.1: verifier MUST be 43–128 unreserved characters.
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;
  const computed = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return constantTimeStringEqual(computed, expectedChallenge);
}

/**
 * Hand-rolled constant-time string compare. We can't use
 * `crypto.timingSafeEqual` directly because the candidate strings may
 * have different lengths; the function rejects unequal-length inputs.
 * Constant-time compare across lengths is straightforward and avoids
 * leaking the challenge length.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}
