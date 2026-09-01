import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jwtToAddress } from "@mysten/sui/zklogin";
import { ApiKeysService } from "../src/api-keys/api-keys.service.js";
import { KeyWrappingService } from "../src/auth/key-wrapping.service.js";
import type { GoogleClaims, GoogleJwtService } from "../src/enoki/google-jwt.service.js";
import { ZkLoginSaltService } from "../src/enoki/salt.service.js";
import { ZkLoginService } from "../src/enoki/zklogin.service.js";
import { InvitesService } from "../src/invites/invites.service.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";

/**
 * Self-hosted zkLogin account-resolver tests (no Enoki). We stub the local
 * Google verifier so we don't need a live Google token; the contract verified:
 *   1. First sign-in creates `Account + Project + ApiKey` atomically and
 *      returns the secret exactly once, at the address derived from
 *      `jwtToAddress(jwt, salt)`.
 *   2. Repeat sign-ins for the same `sub` return the existing account with
 *      no new secret.
 *   3. If the derived address changes for an existing `zklogin_sub` (the
 *      salt-seed-rotation worst case), we 409 instead of mutating the row.
 *   4. A missing `email` claim fails at 400.
 *
 * JWT signature verification + malformed/expired/wrong-aud rejection now live
 * in `GoogleJwtService` and are covered by `scripts/zklogin-selfhost-probe.ts`.
 */
describe("ZkLoginService — self-hosted Google sign-in", () => {
  const prisma = new PrismaService();
  const projects = new ProjectsService(prisma);
  const wrapping = new KeyWrappingService();
  const apiKeys = new ApiKeysService(prisma, wrapping);

  const ISS = "https://accounts.google.com";
  const AUD = "test-client-id.apps.googleusercontent.com";

  function makeJwt(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8")
      .toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    // Signature is irrelevant here — GoogleJwtService (stubbed) verifies.
    return `${header}.${payload}.fake-signature`;
  }

  // Stub the local Google verifier: return the claims verbatim.
  function fakeGoogleJwt(claims: GoogleClaims): GoogleJwtService {
    return { verify: async () => claims } as unknown as GoogleJwtService;
  }

  // These tests exercise the resolver mechanics (address derivation, upsert,
  // 409-on-rotation), not the invite gate — so inject a gate-off stub. The
  // gate itself is covered in its own describe block below with the real
  // InvitesService.
  const gateOffInvites = { isEnabled: () => false } as unknown as InvitesService;

  // A deterministic salt service pinned to a specific seed.
  function saltWithSeed(seedHex: string): ZkLoginSaltService {
    process.env["ZKLOGIN_SALT_SEED"] = seedHex;
    return new ZkLoginSaltService();
  }
  const SEED_A = "a".repeat(64);
  const SEED_B = "b".repeat(64);

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

  it("first sign-in creates account, project, and a default API key at the derived address", async () => {
    const sub = `google-sub-${Date.now()}-${Math.random()}`;
    const email = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@kraterion.dev`;
    const claims: GoogleClaims = { sub, email, aud: AUD, iss: ISS, exp: Date.now() / 1000 + 3600 };
    const salt = saltWithSeed(SEED_A);
    const jwt = makeJwt(claims);
    const expectedAddr = jwtToAddress(jwt, salt.deriveSalt(ISS, AUD, sub), false);

    const service = new ZkLoginService(prisma, fakeGoogleJwt(claims), salt, projects, apiKeys, gateOffInvites);
    const res = await service.resolveOrCreate(jwt);
    seededAccountIds.push(res.account.id);

    expect(res.created).toBe(true);
    expect(res.account.email).toBe(email);
    expect(res.account.sui_address).toBe(expectedAddr);
    expect(res.project.name).toBe("default");
    expect(res.bootstrap_api_key?.access_key_id).toMatch(/^AKIA[A-Z2-7]{16}$/);
    expect(res.bootstrap_api_key?.secret).toMatch(/^[A-Za-z0-9x]{40}$/);

    const dbRow = await prisma.account.findUnique({ where: { id: res.account.id } });
    expect(dbRow?.zklogin_sub).toBe(sub);
  });

  it("repeat sign-ins for the same sub return the existing account, no new secret", async () => {
    const sub = `google-sub-repeat-${Date.now()}-${Math.random()}`;
    const email = `repeat-${Date.now()}@kraterion.dev`;
    const claims: GoogleClaims = { sub, email, aud: AUD, iss: ISS, exp: Date.now() / 1000 + 3600 };
    const salt = saltWithSeed(SEED_A);
    const jwt = makeJwt(claims);
    const service = new ZkLoginService(prisma, fakeGoogleJwt(claims), salt, projects, apiKeys, gateOffInvites);

    const first = await service.resolveOrCreate(jwt);
    seededAccountIds.push(first.account.id);
    expect(first.created).toBe(true);

    const second = await service.resolveOrCreate(jwt);
    expect(second.created).toBe(false);
    expect(second.account.id).toBe(first.account.id);
    expect(second.bootstrap_api_key).toBeUndefined();
  });

  it("returns 409 if the derived address changes for an existing sub (salt seed rotation)", async () => {
    const sub = `google-sub-rot-${Date.now()}`;
    const email = `rot-${Date.now()}@kraterion.dev`;
    const claims: GoogleClaims = { sub, email, aud: AUD, iss: ISS, exp: Date.now() / 1000 + 3600 };
    const jwt = makeJwt(claims);

    const first = await new ZkLoginService(
      prisma,
      fakeGoogleJwt(claims),
      saltWithSeed(SEED_A),
      projects,
      apiKeys,
      gateOffInvites,
    ).resolveOrCreate(jwt);
    seededAccountIds.push(first.account.id);

    // Same sub + jwt, different salt seed → different derived address → 409.
    const second = new ZkLoginService(
      prisma,
      fakeGoogleJwt(claims),
      saltWithSeed(SEED_B),
      projects,
      apiKeys,
      gateOffInvites,
    );
    await expect(second.resolveOrCreate(jwt)).rejects.toMatchObject({
      constructor: ControlPlaneError,
      code: "Conflict",
    });
  });

  it("rejects JWTs missing the `email` claim with 400 InvalidArgument", async () => {
    const sub = `google-no-email-${Date.now()}`;
    const claims = { sub, email: "", aud: AUD, iss: ISS, exp: Date.now() / 1000 + 3600 } as GoogleClaims;
    const service = new ZkLoginService(
      prisma,
      fakeGoogleJwt(claims),
      saltWithSeed(SEED_A),
      projects,
      apiKeys,
      gateOffInvites,
    );
    await expect(service.resolveOrCreate(makeJwt(claims))).rejects.toMatchObject({
      code: "InvalidArgument",
    });
  });
});

/**
 * Invite gate integration — the real InvitesService wired into first sign-up.
 * Verifies: a code is required, a valid code creates the account AND writes a
 * claim in the same transaction, and a bad code blocks account creation
 * entirely (no orphan row).
 */
describe("ZkLoginService — invite gate", () => {
  const prisma = new PrismaService();
  const projects = new ProjectsService(prisma);
  const apiKeys = new ApiKeysService(prisma, new KeyWrappingService());
  const invites = new InvitesService(prisma);

  const ISS = "https://accounts.google.com";
  const AUD = "test-client-id.apps.googleusercontent.com";
  const seededAccountIds: string[] = [];
  const seededCodes: string[] = [];
  let priorFlag: string | undefined;

  function jwtFor(claims: GoogleClaims): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${header}.${payload}.sig`;
  }
  function svc(claims: GoogleClaims): ZkLoginService {
    process.env["ZKLOGIN_SALT_SEED"] = "c".repeat(64);
    return new ZkLoginService(
      prisma,
      { verify: async () => claims } as unknown as GoogleJwtService,
      new ZkLoginSaltService(),
      projects,
      apiKeys,
      invites,
    );
  }
  function claims(tag: string): GoogleClaims {
    return {
      sub: `gate-${tag}-${Date.now()}-${Math.random()}`,
      email: `gate-${tag}-${Date.now()}@kraterion.dev`,
      aud: AUD,
      iss: ISS,
      exp: Date.now() / 1000 + 3600,
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    priorFlag = process.env["INVITE_SYSTEM_ENABLED"];
    process.env["INVITE_SYSTEM_ENABLED"] = "true";
  });

  afterAll(async () => {
    if (priorFlag === undefined) delete process.env["INVITE_SYSTEM_ENABLED"];
    else process.env["INVITE_SYSTEM_ENABLED"] = priorFlag;
    await prisma.inviteClaim.deleteMany({ where: { account_id: { in: seededAccountIds } } });
    await prisma.apiKey.deleteMany({ where: { project: { account_id: { in: seededAccountIds } } } });
    await prisma.project.deleteMany({ where: { account_id: { in: seededAccountIds } } });
    await prisma.account.deleteMany({ where: { id: { in: seededAccountIds } } });
    await prisma.inviteCode.deleteMany({ where: { code: { in: seededCodes } } });
    await prisma.$disconnect();
  });

  it("blocks sign-up with no code (Forbidden / invite_required)", async () => {
    const c = claims("nocode");
    await expect(svc(c).resolveOrCreate(jwtFor(c))).rejects.toMatchObject({
      code: "Forbidden",
      details: { reason: "invite_required" },
    });
    const orphan = await prisma.account.findUnique({ where: { zklogin_sub: c.sub } });
    expect(orphan).toBeNull();
  });

  it("blocks sign-up with an invalid code (InvalidArgument, no orphan account)", async () => {
    const c = claims("badcode");
    await expect(svc(c).resolveOrCreate(jwtFor(c), "KRT-ZZZZZZ")).rejects.toMatchObject({
      code: "InvalidArgument",
      details: { reason: "invite_invalid" },
    });
    expect(await prisma.account.findUnique({ where: { zklogin_sub: c.sub } })).toBeNull();
  });

  it("creates the account and records a claim in one transaction with a valid code", async () => {
    const [minted] = await invites.generate({ count: 1, maxClaims: 1, note: "spec" });
    seededCodes.push(minted!.code);

    const c = claims("good");
    const res = await svc(c).resolveOrCreate(jwtFor(c), minted!.code);
    seededAccountIds.push(res.account.id);

    expect(res.created).toBe(true);
    const claim = await prisma.inviteClaim.findUnique({ where: { account_id: res.account.id } });
    expect(claim).not.toBeNull();
    const code = await prisma.inviteCode.findUnique({ where: { code: minted!.code } });
    expect(code?.claim_count).toBe(1);
    // Code is now exhausted.
    expect((await invites.validate(minted!.code)).valid).toBe(false);
  });
});
