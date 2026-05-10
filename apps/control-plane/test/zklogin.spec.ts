import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiKeysService } from "../src/api-keys/api-keys.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import type { EnokiClientService } from "../src/enoki/enoki-client.service.js";
import { ZkLoginService } from "../src/enoki/zklogin.service.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";

/**
 * Phase-4 Google-zkLogin tests. We stub Enoki's `getZkLogin` so we don't
 * need a live Enoki account; the contract verified is:
 *   1. First sign-in creates `Account + Project + ApiKey` atomically and
 *      returns the secret exactly once.
 *   2. Repeat sign-ins for the same `sub` return the existing account
 *      with no new secret.
 *   3. If Enoki returns a different Sui address for an existing
 *      `zklogin_sub` (impossible in practice, but the salt-rotation
 *      worst case), we 409 instead of silently mutating the row.
 *   4. Malformed / missing claims fail at 400 before Enoki is consulted.
 */
describe("ZkLoginService — Enoki-backed Google sign-in", () => {
  const prisma = new PrismaService();
  const projects = new ProjectsService(prisma);
  const wrapping = new KeyWrappingService();
  const apiKeys = new ApiKeysService(prisma, wrapping);

  function makeJwt(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8")
      .toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    // Signature is irrelevant — Enoki verifies, we only decode.
    return `${header}.${payload}.fake-signature`;
  }

  function fakeEnoki(addr: string): EnokiClientService {
    const client = {
      getZkLogin: async () => ({
        address: addr,
        publicKey: "fakepub",
        salt: "fakesalt",
      }),
    };
    return {
      isConfigured: () => true,
      require: () => client as unknown as ReturnType<EnokiClientService["require"]>,
    } as unknown as EnokiClientService;
  }

  const seededAccountIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (seededAccountIds.length) {
      await prisma.apiKey.deleteMany({
        where: { project: { account_id: { in: seededAccountIds } } },
      });
      await prisma.project.deleteMany({
        where: { account_id: { in: seededAccountIds } },
      });
      await prisma.account.deleteMany({ where: { id: { in: seededAccountIds } } });
    }
    await prisma.$disconnect();
  });

  it("first sign-in creates account, project, and a default API key", async () => {
    const sub = `google-sub-${Date.now()}-${Math.random()}`;
    const email = `phase4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kraterion.dev`;
    const addr = "0x" + "1".padStart(64, "0");
    const enoki = fakeEnoki(addr);
    const service = new ZkLoginService(prisma, enoki, projects, apiKeys);

    const jwt = makeJwt({ sub, email, aud: "google", exp: Date.now() / 1000 + 3600 });
    const res = await service.resolveOrCreate(jwt);

    seededAccountIds.push(res.account.id);

    expect(res.created).toBe(true);
    expect(res.account.email).toBe(email);
    expect(res.account.sui_address).toBe(addr);
    expect(res.project.name).toBe("default");
    expect(res.bootstrap_api_key?.access_key_id).toMatch(/^AKIA[A-Z2-7]{16}$/);
    expect(res.bootstrap_api_key?.secret).toMatch(/^[A-Za-z0-9x]{40}$/);

    // Sanity: the account's zklogin_sub matches the JWT.
    const dbRow = await prisma.account.findUnique({ where: { id: res.account.id } });
    expect(dbRow?.zklogin_sub).toBe(sub);
  });

  it("repeat sign-ins for the same sub return the existing account, no new secret", async () => {
    const sub = `google-sub-repeat-${Date.now()}-${Math.random()}`;
    const email = `repeat-${Date.now()}@kraterion.dev`;
    const addr = "0x" + "2".padStart(64, "0");
    const enoki = fakeEnoki(addr);
    const service = new ZkLoginService(prisma, enoki, projects, apiKeys);

    const jwt = makeJwt({ sub, email });
    const first = await service.resolveOrCreate(jwt);
    seededAccountIds.push(first.account.id);
    expect(first.created).toBe(true);

    const second = await service.resolveOrCreate(jwt);
    expect(second.created).toBe(false);
    expect(second.account.id).toBe(first.account.id);
    expect(second.bootstrap_api_key).toBeUndefined();
  });

  it("returns 409 if Enoki ever returns a different address for an existing sub", async () => {
    const sub = `google-sub-rot-${Date.now()}`;
    const email = `rot-${Date.now()}@kraterion.dev`;
    const addr1 = "0x" + "3".padStart(64, "0");
    const addr2 = "0x" + "4".padStart(64, "0");

    const first = await new ZkLoginService(prisma, fakeEnoki(addr1), projects, apiKeys)
      .resolveOrCreate(makeJwt({ sub, email }));
    seededAccountIds.push(first.account.id);

    const second = new ZkLoginService(prisma, fakeEnoki(addr2), projects, apiKeys);
    await expect(second.resolveOrCreate(makeJwt({ sub, email }))).rejects.toMatchObject({
      constructor: ControlPlaneError,
      code: "Conflict",
    });
  });

  it("rejects JWTs missing the `sub` claim with 400 InvalidArgument", async () => {
    const service = new ZkLoginService(prisma, fakeEnoki("0x" + "5".padStart(64, "0")), projects, apiKeys);
    await expect(
      service.resolveOrCreate(makeJwt({ email: "no-sub@kraterion.dev" })),
    ).rejects.toMatchObject({ code: "InvalidArgument" });
  });

  it("rejects JWTs missing the `email` claim with 400 InvalidArgument", async () => {
    const service = new ZkLoginService(prisma, fakeEnoki("0x" + "6".padStart(64, "0")), projects, apiKeys);
    await expect(
      service.resolveOrCreate(makeJwt({ sub: "google-no-email" })),
    ).rejects.toMatchObject({ code: "InvalidArgument" });
  });

  it("rejects malformed JWTs (not three dot-separated parts) with 400", async () => {
    const service = new ZkLoginService(prisma, fakeEnoki("0x" + "7".padStart(64, "0")), projects, apiKeys);
    await expect(service.resolveOrCreate("not-a-jwt")).rejects.toMatchObject({
      code: "InvalidArgument",
    });
  });
});
