import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Account, Project } from "@prisma/client";
import { ApiKeysService } from "../src/api-keys/api-keys.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Authz boundary tests for `ApiKeysService`. Uses the real Postgres the
 * dev environment runs against (DATABASE_URL from .env). Each `describe`
 * creates two disjoint accounts so we can assert that one account cannot
 * mint, list, or revoke keys belonging to another.
 *
 * If you need to run this against a clean DB, `pnpm db:reset` first.
 */
describe("ApiKeysService — authz boundary", () => {
  const prisma = new PrismaService();
  const wrapping = new KeyWrappingService();
  const service = new ApiKeysService(prisma, wrapping);

  let alice: { account: Account; project: Project };
  let bob: { account: Account; project: Project };

  beforeAll(async () => {
    await prisma.$connect();
    alice = await seedAccount(prisma, "alice");
    bob = await seedAccount(prisma, "bob");
  });

  afterAll(async () => {
    // Best-effort cleanup; cascade delete on project removes keys.
    await prisma.apiKey.deleteMany({
      where: { project: { account_id: { in: [alice.account.id, bob.account.id] } } },
    });
    await prisma.project.deleteMany({
      where: { account_id: { in: [alice.account.id, bob.account.id] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [alice.account.id, bob.account.id] } },
    });
    await prisma.$disconnect();
  });

  it("mint returns the cleartext secret exactly once", async () => {
    const { apiKey, secret } = await service.createForProject(
      alice.account.id,
      alice.project.id,
      "test-key",
    );
    expect(secret).toMatch(/^[A-Za-z0-9x]{40}$/);
    expect(apiKey.access_key_id).toMatch(/^AKIA[A-Z2-7]{16}$/);
    // The wrapped secret must not equal the plaintext.
    expect(apiKey.secret_wrapped.toString("utf8")).not.toBe(secret);
    // Round-trip through the same wrapper must recover the secret.
    const unwrapped = wrapping.unwrap(apiKey.secret_wrapped).toString("utf8");
    expect(unwrapped).toBe(secret);
  });

  it("list omits secret_wrapped", async () => {
    const keys = await service.listForProject(alice.account.id, alice.project.id);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect((key as Record<string, unknown>).secret_wrapped).toBeUndefined();
    }
  });

  it("revoke flips revoked_at", async () => {
    const { apiKey } = await service.createForProject(
      alice.account.id,
      alice.project.id,
      "to-revoke",
    );
    expect(apiKey.revoked_at).toBeNull();
    const revoked = await service.revoke(alice.account.id, apiKey.id);
    expect(revoked.revoked_at).toBeInstanceOf(Date);
  });

  it("mint on someone else's project returns NotFound (no leak)", async () => {
    await expect(
      service.createForProject(alice.account.id, bob.project.id, "naughty"),
    ).rejects.toMatchObject({
      // Both shape (instanceof works because we control both ends).
      constructor: ControlPlaneError,
      code: "NotFound",
    });
  });

  it("list someone else's project returns NotFound", async () => {
    await expect(
      service.listForProject(alice.account.id, bob.project.id),
    ).rejects.toMatchObject({ code: "NotFound" });
  });

  it("revoke someone else's key returns NotFound", async () => {
    const { apiKey } = await service.createForProject(
      bob.account.id,
      bob.project.id,
      "bobs-key",
    );
    await expect(service.revoke(alice.account.id, apiKey.id)).rejects.toMatchObject({
      code: "NotFound",
    });
    const stillThere = await prisma.apiKey.findUnique({ where: { id: apiKey.id } });
    expect(stillThere?.revoked_at).toBeNull();
  });
});

async function seedAccount(prisma: PrismaService, label: string) {
  const stamp = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const account = await prisma.account.create({
    data: {
      email: `${stamp}@cp-test.kraterion.dev`,
      zklogin_sub: `dev:${stamp}`,
      sui_address: `0x${stamp.replace(/-/g, "").padEnd(64, "0").slice(0, 64)}`,
      status: "active",
    },
  });
  const project = await prisma.project.create({
    data: { account_id: account.id, name: `proj-${stamp}` },
  });
  return { account, project };
}
