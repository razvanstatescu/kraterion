import { describe, expect, it } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import {
  EVENT_TYPE,
  KRATERION_PACKAGE_ID,
  events,
  kraterion,
  parseEvent,
} from "./index.js";

describe("@kraterion/kraterion-move-sdk", () => {
  it("re-exports the deployed package id", () => {
    expect(KRATERION_PACKAGE_ID).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("derives event type strings from the package id", () => {
    expect(EVENT_TYPE.bucketCreated).toBe(
      `${KRATERION_PACKAGE_ID}::events::KraterionBucketCreated`,
    );
    expect(EVENT_TYPE.objectCreated).toBe(
      `${KRATERION_PACKAGE_ID}::events::KraterionObjectCreated`,
    );
    expect(EVENT_TYPE.bucketVisibilityChanged).toBe(
      `${KRATERION_PACKAGE_ID}::events::BucketVisibilityChanged`,
    );
  });

  it("exposes BCS schemas for every event", () => {
    expect(events.KraterionBucketCreated).toBeDefined();
    expect(events.KraterionObjectCreated).toBeDefined();
    expect(events.KraterionObjectExtended).toBeDefined();
    expect(events.ApiAccessGranted).toBeDefined();
    expect(events.ApiAccessRevoked).toBeDefined();
    expect(events.BucketVisibilityChanged).toBeDefined();
  });

  it("builds a create_and_share_bucket PTB without throwing", () => {
    const tx = new Transaction();
    tx.add(
      kraterion.createAndShareBucket({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          name: Array.from(new TextEncoder().encode("smoke-test-bucket")),
          encryptionMode: 0,
        },
      }),
    );
    // Don't sign or submit — we're just verifying the binding builds.
    expect(tx.getData().commands.length).toBeGreaterThan(0);
  });

  it("parseEvent returns null for unknown event types", () => {
    expect(parseEvent({ type: "0x2::sui::SUI", bcs: "AA==" })).toBeNull();
  });
});

// Optional integration test against testnet. Skipped unless KRATERION_LIVE=1
// is set, since the test takes a real RPC round-trip and depends on testnet
// reachability.
describe.skipIf(process.env["KRATERION_LIVE"] !== "1")(
  "live testnet integration",
  () => {
    it("queryEvents on the deployed package returns 200", async () => {
      const client = new SuiJsonRpcClient({
        network: "testnet",
        url: getJsonRpcFullnodeUrl("testnet"),
      });
      const res = await client.queryEvents({
        query: { MoveEventType: EVENT_TYPE.bucketCreated },
        limit: 1,
      });
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("getNormalizedMoveModulesByPackage returns our three modules", async () => {
      const client = new SuiJsonRpcClient({
        network: "testnet",
        url: getJsonRpcFullnodeUrl("testnet"),
      });
      const modules = await client.getNormalizedMoveModulesByPackage({
        package: KRATERION_PACKAGE_ID,
      });
      expect(Object.keys(modules).sort()).toEqual([
        "access",
        "events",
        "kraterion",
        "reserve",
      ]);
    });
  },
);
