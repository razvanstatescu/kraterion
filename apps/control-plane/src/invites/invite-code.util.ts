/**
 * Invite-code format + generation.
 *
 * Codes are `KRT-XXXXXX`: the literal prefix `KRT-` plus six characters from an
 * unambiguous alphabet (no `0/O/1/I`) so codes read cleanly over the phone / in
 * a screenshot. 32^6 ≈ 1.07e9 combinations — collisions are vanishingly rare,
 * and the service still retries on the unique constraint.
 */

import { randomInt } from "node:crypto";

/** Unambiguous uppercase alphabet — omits 0, O, 1, I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BODY_LEN = 6;

export const INVITE_PREFIX = "KRT-";
/** Canonical shape of a fully-formed code. */
export const INVITE_CODE_REGEX = /^KRT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * Normalize user input to canonical form: trim, uppercase, and tolerate a
 * missing `KRT-` prefix or a lowercase one (people retype codes by hand).
 * Does NOT validate — call `isValidCodeFormat` after.
 */
export function normalizeCode(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s.startsWith(INVITE_PREFIX)) {
    // Accept a bare body ("ABC234") or a prefix without the dash ("KRTABC234").
    s = s.replace(/^KRT/, "");
    s = INVITE_PREFIX + s.replace(/^-/, "");
  }
  return s;
}

/** True if `code` is exactly `KRT-XXXXXX` over the allowed alphabet. */
export function isValidCodeFormat(code: string): boolean {
  return INVITE_CODE_REGEX.test(code);
}

/** Generate one random `KRT-XXXXXX` code (uniqueness enforced by the caller). */
export function generateCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LEN; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return INVITE_PREFIX + body;
}
