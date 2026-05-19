import { describe, expect, it } from "vitest";
import { getSealClient } from "./index.js";

// Placeholder test so `vitest run` doesn't exit 1 on no-files-found at
// the repo level. The real Seal flow is exercised by the gateway's
// `smoke-encrypt-roundtrip.ts` end-to-end script (requires testnet
// keys + a Redis instance and isn't appropriate for unit-test runs).

describe("getSealClient", () => {
  it("returns the same instance on repeat calls (memoised)", () => {
    const a = getSealClient();
    const b = getSealClient();
    expect(a).toBe(b);
  });
});
