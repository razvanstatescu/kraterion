import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Account, Bucket, Project, SubWallet } from "@prisma/client";
import { Transaction } from "@mysten/sui/transactions";
import { KRATERION_PACKAGE_ID } from "@kraterion/kraterion-move-sdk";
import { BucketsService } from "../src/buckets/buckets.service.js";
import { PrepareTxService } from "../src/buckets/prepare/prepare.service.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";
import { GatewayAddressService } from "../src/sui/gateway-address.service.js";

/**
 * Round-trip + authz tests for the four `prepare-*` PTB builders.
 *
 * For every endpoint we:
 *   1. Build the unsigned PTB
 *   2. Re-instantiate via `Transaction.from(tx_json)` (the canonical
 *      client-side resume path the dashboard will use)
 *   3. Inspect the parsed Transaction's commands to assert it calls
 *      the expected Move function, against the expected package, with
 *      the expected arguments.
 * That confirms the wire format the dashboard receives is round-tripable
 * via the Mysten SDK without any custom decoding.
 */
describe("PrepareTxService — PTB build + authz", () => {
  const prisma = new PrismaService();
  const buckets = new BucketsService(prisma);
  const projects = new ProjectsService(prisma);
  // Stub out GatewayAddressService so the test doesn't need a real
  // bootstrapped sub-wallet row; the real one is exercised in the
  // smoke test against a live service.
  const FAKE_GATEWAY = "0x0000000000000000000000000000000000000000000000000000000000000abc";
  const gatewayStub = {
    get: async () => FAKE_GATEWAY,
  } as unknown as GatewayAddressService;
  const service = new PrepareTxService(buckets, projects, gatewayStub);

  let alice: { account: Account; project: Project; bucket: Bucket };
  let bob: { account: Account; project: Project; bucket: Bucket };
  let createdSubWallet: SubWallet | null = null;

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
    if (createdSubWallet) {
      await prisma.subWallet.delete({ where: { id: createdSubWallet.id } });
    }
    await prisma.$disconnect();
  });

  it("prepareCreate (with grant) builds create_grant_and_share_bucket", async () => {
    const res = await service.prepareCreate(alice.account.id, "0xalice", {
      projectId: alice.project.id,
      name: "phase3-create",
      encryptionMode: "private",
      grantApiAccess: true,
    });
    expect(res.expected.function).toBe("kraterion::create_grant_and_share_bucket");
    expect(res.expected.package_id).toBe(KRATERION_PACKAGE_ID);

    const tx = Transaction.from(res.tx_json);
    const data = tx.getData();
    const calls = data.commands.filter((c) => c.MoveCall);
    expect(calls).toHaveLength(1);
    const call = calls[0]!.MoveCall!;
    expect(call.package).toBe(KRATERION_PACKAGE_ID);
    expect(call.module).toBe("kraterion");
    expect(call.function).toBe("create_grant_and_share_bucket");
    expect(call.arguments.length).toBe(3); // name, api_addr, encryption_mode
  });

  it("prepareCreate (no grant) builds create_and_share_bucket", async () => {
    const res = await service.prepareCreate(alice.account.id, "0xalice", {
      projectId: alice.project.id,
      name: "phase3-create-nograntee",
      encryptionMode: "public-read",
      grantApiAccess: false,
    });
    expect(res.expected.function).toBe("kraterion::create_and_share_bucket");
    const tx = Transaction.from(res.tx_json);
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe("create_and_share_bucket");
    expect(call?.arguments.length).toBe(2); // name, encryption_mode
  });

  it("prepareCreate on someone else's project returns NotFound", async () => {
    await expect(
      service.prepareCreate(alice.account.id, "0xalice", {
        projectId: bob.project.id,
        name: "naughty",
        encryptionMode: "private",
        grantApiAccess: true,
      }),
    ).rejects.toMatchObject({ constructor: ControlPlaneError, code: "NotFound" });
  });

  it("prepareGrantApi builds grant_api_access against bucket object id", async () => {
    const res = await service.prepareGrantApi(alice.account.id, "0xalice", alice.bucket.id, {});
    expect(res.expected.function).toBe("kraterion::grant_api_access");
    const tx = Transaction.from(res.tx_json);
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe("grant_api_access");
    expect(call?.arguments.length).toBe(2); // bucket, api_addr
  });

  it("prepareGrantApi on someone else's bucket returns NotFound", async () => {
    await expect(
      service.prepareGrantApi(alice.account.id, "0xalice", bob.bucket.id, {}),
    ).rejects.toMatchObject({ code: "NotFound" });
  });

  it("prepareRevokeAll builds revoke_all_api_access", async () => {
    const res = await service.prepareRevokeAll(alice.account.id, "0xalice", alice.bucket.id);
    expect(res.expected.function).toBe("kraterion::revoke_all_api_access");
    const tx = Transaction.from(res.tx_json);
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe("revoke_all_api_access");
    expect(call?.arguments.length).toBe(1); // bucket
  });

  it("prepareVisibility builds set_bucket_visibility for a real flip", async () => {
    // alice.bucket starts at "private"; flip to public-read.
    const res = await service.prepareVisibility(alice.account.id, "0xalice", alice.bucket.id, {
      encryptionMode: "public-read",
    });
    expect(res.expected.function).toBe("kraterion::set_bucket_visibility");
    const tx = Transaction.from(res.tx_json);
    const call = tx.getData().commands.find((c) => c.MoveCall)?.MoveCall;
    expect(call?.function).toBe("set_bucket_visibility");
    expect(call?.arguments.length).toBe(2);
  });

  it("prepareVisibility rejects no-op flips with InvalidArgument", async () => {
    await expect(
      service.prepareVisibility(alice.account.id, "0xalice", alice.bucket.id, {
        encryptionMode: "private", // already private
      }),
    ).rejects.toMatchObject({ code: "InvalidArgument" });
  });

  it("does not pin shared-object versions or set sender — the dashboard fills those in", async () => {
    const res = await service.prepareCreate(alice.account.id, "0xalice-fake", {
      projectId: alice.project.id,
      name: "phase3-deferred",
      encryptionMode: "private",
      grantApiAccess: true,
    });
    const tx = Transaction.from(res.tx_json);
    const data = tx.getData();
    expect(data.sender).toBeFalsy();
    // expected.sender_hint is non-binding metadata — the wallet fills sender at sign time.
    expect(res.expected.sender_hint).toBe("0xalice-fake");
  });

  it("real GatewayAddressService surfaces InternalError when the sub-wallet row is missing", async () => {
    // Use a fresh service instance backed by a real GatewayAddressService
    // pointing at a Prisma where the row is intentionally absent. We
    // can't blow away the production sub-wallet, so validate the error
    // pathway by hand: instantiate the service and call get() with a
    // Prisma stub returning null.
    const stubPrisma = {
      subWallet: { findFirst: async () => null },
    } as unknown as PrismaService;
    const real = new GatewayAddressService(stubPrisma);
    await expect(real.get()).rejects.toMatchObject({
      constructor: ControlPlaneError,
      code: "InternalError",
    });
  });
});

async function seed(prisma: PrismaService, label: string, mode: "private" | "public-read") {
  const stamp = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Sui object/address ids must be 0x + exactly 64 lowercase hex chars.
  // Build deterministic-but-unique ones from a hash of the stamp.
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
