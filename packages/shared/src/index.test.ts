import { describe, expect, it } from "vitest";
import {
  WALRUS_PACKAGE_PUBLISHED_AT_TESTNET,
  WALRUS_PACKAGE_VERSION_TESTNET,
  WALRUS_SYSTEM_OBJECT_ID,
} from "./constants.js";

// Placeholder coverage so `vitest run` doesn't exit 1 at the repo level.
// The constants file has no runtime logic to test; smoke tests at the
// gateway level cover whether the IDs actually resolve to live objects.

describe("walrus testnet constants", () => {
  it("have well-formed 0x-prefixed Sui object IDs", () => {
    for (const id of [WALRUS_PACKAGE_PUBLISHED_AT_TESTNET, WALRUS_SYSTEM_OBJECT_ID]) {
      expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("pin the package to v3 or later (where storage_pool was introduced)", () => {
    expect(WALRUS_PACKAGE_VERSION_TESTNET).toBeGreaterThanOrEqual(3);
  });
});
