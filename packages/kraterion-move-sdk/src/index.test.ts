import { describe, expect, it } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const TESTNET_GRPC = "https://fullnode.testnet.sui.io:443";
const TESTNET_GRAPHQL = "https://graphql.testnet.sui.io/graphql";
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
    expect(EVENT_TYPE.pooledBlobRegistered).toBe(
      `${KRATERION_PACKAGE_ID}::events::KraterionPooledBlobRegistered`,
    );
    expect(EVENT_TYPE.bucketVisibilityChanged).toBe(
      `${KRATERION_PACKAGE_ID}::events::BucketVisibilityChanged`,
    );
  });

  it("exposes BCS schemas for every event", () => {
    expect(events.KraterionBucketCreated).toBeDefined();
    expect(events.KraterionVaultCreated).toBeDefined();
    expect(events.KraterionPooledBlobRegistered).toBeDefined();
    expect(events.KraterionPooledBlobCertified).toBeDefined();
    expect(events.KraterionPooledBlobDeleted).toBeDefined();
    expect(events.KraterionPoolExtended).toBeDefined();
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
    it("queries events on the deployed package via GraphQL", async () => {
      // JSON-RPC `queryEvents` → GraphQL `events` (Sui deprecated JSON-RPC —
      // see /docs/json-rpc-migration.md).
      const gql = new SuiGraphQLClient({ url: TESTNET_GRAPHQL, network: "testnet" });
      const res = await gql.query({
        query: `query($t: String!) {
          events(first: 1, filter: { type: $t }) { nodes { sender { address } } }
        }`,
        variables: { t: EVENT_TYPE.bucketCreated },
      });
      expect(res.data?.events).toBeDefined();
    });

    it("lists the package modules via gRPC MovePackageService", async () => {
      // JSON-RPC `getNormalizedMoveModulesByPackage` → gRPC
      // `MovePackageService.getPackage`.
      const grpc = new SuiGrpcClient({ network: "testnet", baseUrl: TESTNET_GRPC });
      const { response } = await grpc.movePackageService.getPackage({
        packageId: KRATERION_PACKAGE_ID,
      });
      const moduleNames = (response.package?.modules ?? [])
        .map((m) => m.name)
        .sort();
      expect(moduleNames).toEqual([
        "access",
        "events",
        "kraterion",
        "pool_vault",
        "reserve",
      ]);
    });
  },
);
