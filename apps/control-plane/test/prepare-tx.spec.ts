import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account, Bucket, Project } from "@prisma/client";
import { KRATERION_PACKAGE_ID } from "@kraterion/kraterion-move-sdk";
import { BucketsService } from "../src/buckets/buckets.service.js";
import { PrepareTxService } from "../src/buckets/prepare/prepare.service.js";
import {
  type CreateSponsoredArgs,
  type SponsoredTx,
  SponsorshipService,
} from "../src/enoki/sponsorship.service.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";
import { GatewayAddressService } from "../src/sui/gateway-address.service.js";
import type { KnowledgeIndexerAddressService } from "../src/sui/knowledge-indexer-address.service.js";
import type { SuiClientService } from "../src/sui/sui-client.service.js";

/**
 * The Phase-4 prepare-* surface delegates to Enoki for sponsorship. These
 * tests stub `SponsorshipService.createSponsored` and assert:
 *   - the controller resolved authz before reaching out to Enoki;
 *   - the Move-call target locked into `allowedMoveCallTargets` is
 *     EXACTLY one entry, fully qualified to `KRATERION_PACKAGE_ID`;
 *   - the user's address is locked into `sender` (so Enoki can't
 *     gas-front for someone else's session);
 *   - the kind-bytes are non-empty base64 (cheap shape check — the
 *     Mysten BCS layer is exercised by upstream tests).
 */
describe("PrepareTxService — Enoki-sponsored PTB build + authz", () => {
  const prisma = new PrismaService();
  const buckets = new BucketsService(prisma);
  const projects = new ProjectsService(prisma);
  const FAKE_GATEWAY = "0x" + "ab".repeat(32);
  const gatewayStub = { get: async () => FAKE_GATEWAY } as unknown as GatewayAddressService;
  const FAKE_KNOWLEDGE_INDEXER = "0x" + "cd".repeat(32);
  const knowledgeIndexerStub = {
    get: async () => FAKE_KNOWLEDGE_INDEXER,
  } as unknown as KnowledgeIndexerAddressService;
  // Stub SuiClient: the prepare path calls `tx.build({ client, onlyTransactionKind: true })`,
  // and the SDK's resolver hits `client.core.getObjects` to fill in shared-object versions.
  // We stub that call to return a synthetic Shared owner so tests don't need a live RPC.
  const fakeCore = {
    // The Mysten resolver checks `client.core?.resolveTransactionPlugin()`
    // first; returning undefined makes it fall back to its default
    // resolver (which calls `getObjects` below).
    resolveTransactionPlugin: () => undefined,
    async getObjects({ objectIds }: { objectIds: string[] }) {
      return {
        objects: objectIds.map((id) => ({
          objectId: id,
          version: "1",
          digest: "11111111111111111111111111111111",
          owner: {
            $kind: "Shared" as const,
            Shared: { initialSharedVersion: "1" },
          },
        })),
      };
    },
  };
  const sui = { get: () => ({ core: fakeCore }) } as unknown as SuiClientService;

  const sponsorCalls: CreateSponsoredArgs[] = [];
  const sponsorshipStub = {
    isConfigured: () => true,
    createSponsored: vi.fn(async (args: CreateSponsoredArgs): Promise<SponsoredTx> => {
      sponsorCalls.push(args);
      return {
        digest: `digest-${sponsorCalls.length}`,
        bytes: "QkNTLUJZVEVT", // base64("BCS-BYTES")
      };
    }),
    executeSponsored: vi.fn(async () => ({ digest: "x" })),
  } as unknown as SponsorshipService;

  const service = new PrepareTxService(
    buckets,
    projects,
    gatewayStub,
    knowledgeIndexerStub,
    prisma,
    sui,
    sponsorshipStub,
  );

  let alice: { account: Account; project: Project; bucket: Bucket };
  let bob: { account: Account; project: Project; bucket: Bucket };

  beforeAll(async () => {
    await prisma.$connect();
    alice = await seed(prisma, "alice", "private");
    bob = await seed(prisma, "bob", "private");
  });

  afterAll(async () => {
    const ids = [alice.account.id, bob.account.id];
    await prisma.bucket.deleteMany({ where: { project: { account_id: { in: ids } } } });
    await prisma.project.deleteMany({ where: { account_id: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sponsorCalls.length = 0;
  });

  it("prepareCreate (with grant) sponsors create_grant_and_share_bucket", async () => {
    const aliceAddr = alice.account.sui_address;
    const res = await service.prepareCreate(alice.account.id, aliceAddr, {
      projectId: alice.project.id,
      name: "phase4-create",
      encryptionMode: "private",
      grantApiAccess: true,
    });
    expect(res.expected.function).toBe(`${KRATERION_PACKAGE_ID}::kraterion::create_grant_and_share_bucket`);
    expect(res.expected.sender).toBe(aliceAddr);
    expect(res.expected.sponsored_by).toBe("kraterion");
    expect(res.expected.allowed_move_call_targets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::create_grant_and_share_bucket`,
    ]);
    expect(res.digest).toBe("digest-1");
    expect(res.bytes.length).toBeGreaterThan(0);

    expect(sponsorCalls).toHaveLength(1);
    const sent = sponsorCalls[0]!;
    expect(sent.sender).toBe(aliceAddr);
    expect(sent.allowedMoveCallTargets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::create_grant_and_share_bucket`,
    ]);
    expect(typeof sent.transactionKindBytes).toBe("string");
    // base64 of >0 bytes; rough check.
    expect(sent.transactionKindBytes).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("prepareCreate (no grant) sponsors create_and_share_bucket only", async () => {
    const res = await service.prepareCreate(alice.account.id, alice.account.sui_address, {
      projectId: alice.project.id,
      name: "phase4-nograntee",
      encryptionMode: "public-read",
      grantApiAccess: false,
    });
    expect(res.expected.function).toBe(`${KRATERION_PACKAGE_ID}::kraterion::create_and_share_bucket`);
    expect(sponsorCalls[0]!.allowedMoveCallTargets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::create_and_share_bucket`,
    ]);
  });

  it("prepareCreate on someone else's project returns NotFound and never calls Enoki", async () => {
    await expect(
      service.prepareCreate(alice.account.id, alice.account.sui_address, {
        projectId: bob.project.id,
        name: "naughty",
        encryptionMode: "private",
        grantApiAccess: true,
      }),
    ).rejects.toMatchObject({ constructor: ControlPlaneError, code: "NotFound" });
    expect(sponsorCalls).toHaveLength(0);
  });

  it("prepareGrantApi locks Move-call target to grant_api_access", async () => {
    const res = await service.prepareGrantApi(
      alice.account.id,
      alice.account.sui_address,
      alice.bucket.id,
      {},
    );
    expect(res.expected.function).toBe(`${KRATERION_PACKAGE_ID}::kraterion::grant_api_access`);
    expect(sponsorCalls[0]!.allowedMoveCallTargets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::grant_api_access`,
    ]);
  });

  it("prepareGrantApi on someone else's bucket returns NotFound", async () => {
    await expect(
      service.prepareGrantApi(alice.account.id, alice.account.sui_address, bob.bucket.id, {}),
    ).rejects.toMatchObject({ code: "NotFound" });
    expect(sponsorCalls).toHaveLength(0);
  });

  it("prepareRevokeAll locks Move-call target to revoke_all_api_access", async () => {
    const res = await service.prepareRevokeAll(
      alice.account.id,
      alice.account.sui_address,
      alice.bucket.id,
    );
    expect(res.expected.function).toBe(`${KRATERION_PACKAGE_ID}::kraterion::revoke_all_api_access`);
    expect(sponsorCalls[0]!.allowedMoveCallTargets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::revoke_all_api_access`,
    ]);
  });

  it("prepareVisibility locks Move-call target to set_bucket_visibility on a real flip", async () => {
    const res = await service.prepareVisibility(
      alice.account.id,
      alice.account.sui_address,
      alice.bucket.id,
      { encryptionMode: "public-read" }, // alice.bucket starts private
    );
    expect(res.expected.function).toBe(`${KRATERION_PACKAGE_ID}::kraterion::set_bucket_visibility`);
    expect(sponsorCalls[0]!.allowedMoveCallTargets).toEqual([
      `${KRATERION_PACKAGE_ID}::kraterion::set_bucket_visibility`,
    ]);
  });

  it("prepareVisibility rejects no-op flips with InvalidArgument and never calls Enoki", async () => {
    await expect(
      service.prepareVisibility(
        alice.account.id,
        alice.account.sui_address,
        alice.bucket.id,
        { encryptionMode: "private" },
      ),
    ).rejects.toMatchObject({ code: "InvalidArgument" });
    expect(sponsorCalls).toHaveLength(0);
  });

  it("never includes more than one Move-call target in the per-request allow-list", async () => {
    // Run all four PTB builders, then assert each call's allow-list is exactly 1 entry.
    await service.prepareCreate(alice.account.id, alice.account.sui_address, {
      projectId: alice.project.id,
      name: "phase4-allowlist-1",
      encryptionMode: "private",
      grantApiAccess: true,
    });
    await service.prepareCreate(alice.account.id, alice.account.sui_address, {
      projectId: alice.project.id,
      name: "phase4-allowlist-2",
      encryptionMode: "private",
      grantApiAccess: false,
    });
    await service.prepareGrantApi(alice.account.id, alice.account.sui_address, alice.bucket.id, {});
    await service.prepareRevokeAll(alice.account.id, alice.account.sui_address, alice.bucket.id);
    for (const call of sponsorCalls) {
      expect(call.allowedMoveCallTargets).toHaveLength(1);
      expect(call.allowedMoveCallTargets[0]!.startsWith(KRATERION_PACKAGE_ID + "::")).toBe(true);
    }
  });
});

import { beforeEach } from "vitest";

async function seed(prisma: PrismaService, label: string, mode: "private" | "public-read") {
  const stamp = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const hash = (suffix: string) => {
    const hex = Buffer.from(`${stamp}-${suffix}`, "utf8").toString("hex").padStart(64, "0").slice(-64);
    return `0x${hex}`;
  };
  const account = await prisma.account.create({
    data: {
      email: `${stamp}@cp-test.kraterion.dev`,
      zklogin_sub: `dev:${stamp}`,
      sui_address: hash("acct"),
      status: "active",
    },
  });
  const project = await prisma.project.create({
    data: { account_id: account.id, name: `proj-${stamp}` },
  });
  const bucket = await prisma.bucket.create({
    data: {
      project_id: project.id,
      name: `bucket-${stamp}`,
      kraterion_bucket_object_id: hash("bucket"),
      encryption_mode: mode,
    },
  });
  return { account, project, bucket };
}
