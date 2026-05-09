/**
 * Env-AES key wrapping. Hackathon stand-in for KMS — same interface a
 * future `AwsKmsWrapper` will expose, so swapping is a one-liner.
 *
 * Wrapping format (for stored bytes):
 *   [ 12 bytes nonce | ciphertext | 16 bytes auth tag ]
 *
 * The master key is read from `KEY_WRAPPING_MASTER_KEY` (32 bytes,
 * hex-encoded). Same key required for both wrap and unwrap; rotating it
 * invalidates every wrapped value in the database. Verbatim copy of
 * `apps/gateway/src/auth/key-wrapping.ts` — both apps share the same
 * env var so secrets are interchangeable.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function loadMasterKey(): Buffer {
  const hex = process.env["KEY_WRAPPING_MASTER_KEY"];
  if (!hex) {
    throw new Error(
      "KEY_WRAPPING_MASTER_KEY env var is not set. Generate one with " +
        "`node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))'` " +
        "and add it to .env at the repo root.",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `KEY_WRAPPING_MASTER_KEY must decode to 32 bytes; got ${key.length}.`,
    );
  }
  return key;
}

export interface KeyWrapper {
  wrap(plaintext: Uint8Array): Buffer;
  unwrap(wrapped: Uint8Array): Buffer;
}

export class EnvKeyWrapper implements KeyWrapper {
  private readonly key: Buffer;

  constructor(masterKey?: Buffer) {
    this.key = masterKey ?? loadMasterKey();
  }

  wrap(plaintext: Uint8Array): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGO, this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, ciphertext, tag]);
  }

  unwrap(wrapped: Uint8Array): Buffer {
    const buf = Buffer.from(wrapped);
    if (buf.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error("Wrapped payload is too short to be valid.");
    }
    const nonce = buf.subarray(0, NONCE_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ciphertext = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGO, this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
