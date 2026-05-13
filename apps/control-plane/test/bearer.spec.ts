import { describe, expect, it } from "vitest";
import {
  hashBearer,
  hashesEqual,
  looksLikeBearer,
  mintBearerToken,
  networkOfToken,
} from "../src/api-keys/bearer.js";

/**
 * Unit tests for the bearer-token primitives. Pure functions — no
 * Prisma, no Nest DI, no env mocking beyond the local `networkFromEnv`
 * helper which is exercised indirectly via `mintBearerToken`.
 */
describe("bearer token helpers", () => {
  it("mints a testnet token with the kr_test_ prefix and 36-char body", () => {
    const { token, hash, display } = mintBearerToken("testnet");
    expect(token.startsWith("kr_test_")).toBe(true);
    expect(token).toMatch(/^kr_test_[A-Za-z0-9]{36}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(display.startsWith("kr_test_")).toBe(true);
    expect(display).toContain("…");
  });

  it("mints a mainnet token with the kr_live_ prefix", () => {
    const { token } = mintBearerToken("mainnet");
    expect(token).toMatch(/^kr_live_[A-Za-z0-9]{36}$/);
  });

  it("hashBearer is deterministic and produces the same hash as mintBearerToken", () => {
    const { token, hash } = mintBearerToken("testnet");
    expect(hashBearer(token)).toBe(hash);
    expect(hashBearer(token)).toBe(hashBearer(token));
  });

  it("two consecutive mints produce different tokens (entropy sanity check)", () => {
    const a = mintBearerToken("testnet");
    const b = mintBearerToken("testnet");
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("looksLikeBearer recognises well-formed prefixes and rejects everything else", () => {
    const { token } = mintBearerToken("testnet");
    expect(looksLikeBearer(token)).toBe(true);
    expect(looksLikeBearer(mintBearerToken("mainnet").token)).toBe(true);

    expect(looksLikeBearer("")).toBe(false);
    expect(looksLikeBearer("AKIA1234567890ABCDEF")).toBe(false);
    expect(looksLikeBearer("eyJhbGciOiJIUzI1NiJ9.xxx.yyy")).toBe(false);
    // body too short
    expect(looksLikeBearer("kr_test_aBcD")).toBe(false);
    // unknown env tag
    expect(looksLikeBearer("kr_prod_" + "a".repeat(36))).toBe(false);
    // colon-format (the old MCP K3a shape) must NOT match
    expect(looksLikeBearer("AKIAEXAMPLE:secret_part")).toBe(false);
  });

  it("networkOfToken parses the prefix correctly", () => {
    expect(networkOfToken("kr_live_" + "a".repeat(36))).toBe("mainnet");
    expect(networkOfToken("kr_test_" + "a".repeat(36))).toBe("testnet");
    expect(networkOfToken("garbage")).toBeNull();
    expect(networkOfToken("eyJ.abc.def")).toBeNull();
  });

  it("hashesEqual returns true for identical hashes, false otherwise", () => {
    const h1 = hashBearer("kr_test_" + "a".repeat(36));
    const h2 = hashBearer("kr_test_" + "a".repeat(36));
    const h3 = hashBearer("kr_test_" + "b".repeat(36));
    expect(hashesEqual(h1, h2)).toBe(true);
    expect(hashesEqual(h1, h3)).toBe(false);
    expect(hashesEqual(h1, h1.slice(0, -2))).toBe(false);
  });
});
