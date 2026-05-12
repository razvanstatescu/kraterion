/**
 * Env-AES key wrapping for worker-side use.
 *
 * Identical implementation to the gateway's
 * `apps/gateway/src/auth/key-wrapping.ts`. The two copies share the same
 * `KEY_WRAPPING_MASTER_KEY` so values wrapped by the gateway bootstrap
 * unwrap cleanly here. Promoting this to a shared workspace package is
 * tracked as a post-K0 follow-up — for now duplication is intentional
 * and trivially small.
 *
 * Wrapping format (for stored bytes):
 *   [ 12 bytes nonce | ciphertext | 16 bytes auth tag ]
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function loadMasterKey(): Buffer {
  const hex = process.env["KEY_WRAPPING_MASTER_KEY"];
  if (!hex) {
    throw new Error(
      "KEY_WRAPPING_MASTER_KEY env var is not set. The worker reads the same " +
        "master key the gateway uses — copy the value from your root .env.",
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
