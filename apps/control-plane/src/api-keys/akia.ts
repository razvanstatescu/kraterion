import { randomBytes } from "node:crypto";

/**
 * AWS-style API key id generation. Verbatim copy of the helpers in
 * `apps/gateway/scripts/bootstrap-gateway.ts:53-67` so AKIAs minted here
 * are indistinguishable from the bootstrap script's.
 */

export function newAkia(): string {
  // "AKIA" + 16 chars from a base32-ish alphabet (A–Z + 2–7).
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const buf = randomBytes(16);
  let out = "AKIA";
  for (let i = 0; i < 16; i++) {
    out += alphabet[buf[i]! % alphabet.length];
  }
  return out;
}

export function newSecret(): string {
  // 40 base64-ish chars; matches the secret-length boto3 expects.
  return randomBytes(30).toString("base64").replace(/[+/=]/g, "x").slice(0, 40);
}
