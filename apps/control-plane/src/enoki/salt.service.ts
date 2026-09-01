import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Deterministic zkLogin salt service (replaces Enoki's managed salt).
 *
 * A zkLogin Sui address is derived from `(iss, aud, sub) + user_salt`. The
 * salt is what makes the on-chain address unlinkable to the Google account,
 * so it must be (a) stable per user forever and (b) not derivable by anyone
 * without our secret. We derive it deterministically:
 *
 *   salt = low 128 bits of HMAC-SHA256(SEED, `${iss}|${aud}|${sub}`)
 *
 * Deterministic derivation means we never persist a salt table and the same
 * user always resolves to the same address. The seed (`ZKLOGIN_SALT_SEED`,
 * 32-byte hex) is a permanent platform secret — rotating it changes every
 * derived address, so it is chosen once at launch and never changed. Mirrors
 * the master-seed strategy Mysten's own salt server documents.
 */
@Injectable()
export class ZkLoginSaltService {
  private readonly seed: Buffer;

  constructor() {
    const hex = process.env["ZKLOGIN_SALT_SEED"] ?? "";
    // Boot-tolerant: an unset/invalid seed leaves the service unusable but
    // doesn't crash the process (same pattern as the other crypto secrets).
    this.seed = /^[0-9a-fA-F]{64}$/.test(hex)
      ? Buffer.from(hex, "hex")
      : Buffer.alloc(0);
  }

  isConfigured(): boolean {
    return this.seed.length === 32;
  }

  private requireSeed(): Buffer {
    if (this.seed.length !== 32) {
      throw new ControlPlaneError(
        "InternalError",
        "ZKLOGIN_SALT_SEED is not configured (expected 32-byte hex).",
      );
    }
    return this.seed;
  }

  /**
   * Derive the user's salt as a decimal string (a 128-bit value, the form
   * `@mysten/sui/zklogin`'s `jwtToAddress` / `genAddressSeed` expect).
   */
  deriveSalt(iss: string, aud: string, sub: string): string {
    const mac = createHmac("sha256", this.requireSeed())
      .update(`${iss}|${aud}|${sub}`)
      .digest();
    // Low 128 bits keep the salt < 2^128 as zkLogin requires.
    const salt128 = mac.subarray(0, 16);
    return BigInt(`0x${salt128.toString("hex")}`).toString(10);
  }
}
