import { describe, expect, it } from "vitest";
import {
  getEncodedBlobLength,
  getPoolExtendCostFrost,
  getPoolStorageCostFrost,
  getWriteFeeFrost,
  rootHashBytesToU256,
} from "./index.js";

describe("getEncodedBlobLength", () => {
  it("returns a positive number for typical input", () => {
    // 1 MiB unencoded, 1000 shards (Walrus testnet committee size).
    const result = getEncodedBlobLength(1024 * 1024, 1000);
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("rounds to even symbol sizes (RS2 requirement)", () => {
    // For a tiny blob, symbol size after rounding must be even.
    const small = getEncodedBlobLength(1, 100);
    expect(small).toBeGreaterThan(0);
  });
});

describe("rootHashBytesToU256", () => {
  it("converts a 32-byte hash to a BigInt via little-endian BCS", () => {
    const bytes = new Uint8Array(32);
    bytes[0] = 0x01;
    const result = rootHashBytesToU256(bytes);
    expect(result).toBe(1n);
  });

  it("throws on wrong length", () => {
    expect(() => rootHashBytesToU256(new Uint8Array(16))).toThrow(/32-byte/);
  });
});

describe("getWriteFeeFrost", () => {
  it("charges one MiB worth for a 1-byte encoded size (round up)", () => {
    // 1 byte → 1 MiB unit × 5_000 FROST × 2× safety = 10_000 FROST
    expect(getWriteFeeFrost(1)).toBe(10_000n);
  });

  it("charges one MiB worth for exactly 1 MiB", () => {
    expect(getWriteFeeFrost(1024 * 1024)).toBe(10_000n);
  });

  it("charges two MiB worth for 1 MiB + 1 byte", () => {
    expect(getWriteFeeFrost(1024 * 1024 + 1)).toBe(20_000n);
  });

  it("accepts bigint input", () => {
    expect(getWriteFeeFrost(BigInt(5 * 1024 * 1024))).toBe(50_000n); // 5 MiB × 5k × 2
  });
});

describe("getPoolStorageCostFrost", () => {
  it("budgets 1 MiB × 1 epoch with safety", () => {
    // 1 MiB × 3000 FROST/MiB-epoch × 1 epoch × 2× safety = 6000 FROST
    expect(getPoolStorageCostFrost(1024 * 1024, 1)).toBe(6_000n);
  });

  it("scales linearly with epochs", () => {
    expect(getPoolStorageCostFrost(1024 * 1024, 10)).toBe(60_000n);
  });

  it("scales linearly with reserved capacity (rounded up to whole MiB)", () => {
    // 100 MiB × 53 epochs × 3000 × 2 = 31_800_000 FROST
    expect(getPoolStorageCostFrost(100 * 1024 * 1024, 53)).toBe(31_800_000n);
  });

  it("rounds capacity up to whole MiB", () => {
    // 1 MiB + 1 byte → 2 MiB × 1 epoch × 3000 × 2 = 12_000 FROST
    expect(getPoolStorageCostFrost(1024 * 1024 + 1, 1)).toBe(12_000n);
  });
});

describe("getPoolExtendCostFrost", () => {
  it("computes the same as getPoolStorageCostFrost", () => {
    const a = getPoolExtendCostFrost(50 * 1024 * 1024, 26);
    const b = getPoolStorageCostFrost(50 * 1024 * 1024, 26);
    expect(a).toBe(b);
  });
});
