import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Account, Bucket, Project, S3Object } from "@prisma/client";
import { BucketsService } from "../src/buckets/buckets.service.js";
import { decodeCursor, encodeCursor } from "../src/pagination/cursor.js";
import { serializeBucket, serializeObject } from "../src/buckets/serialize.js";
import { ControlPlaneError } from "../src/errors/control-plane-error.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Read-view tests for `BucketsService`. The indexer is the production
 * writer for `Bucket` and `S3Object` — for tests we insert rows
 * directly via Prisma so we can assert on the read path.
 */
describe("BucketsService — authz + pagination", () => {
  const prisma = new PrismaService();
  const service = new BucketsService(prisma);

  let alice: { account: Account; project: Project; buckets: Bucket[]; objects: S3Object[] };
  let bob: { account: Account; project: Project; bucket: Bucket };

  beforeAll(async () => {
    await prisma.$connect();
    alice = await seedFull(prisma, "alice", { bucketCount: 3, objectsPerBucket: 5 });
    bob = await seedBob(prisma, "bob");
  });

  afterAll(async () => {
    const accountIds = [alice.account.id, bob.account.id];
    await prisma.s3Object.deleteMany({
      where: { bucket: { project: { account_id: { in: accountIds } } } },
    });
    await prisma.bucket.deleteMany({
      where: { project: { account_id: { in: accountIds } } },
    });
    await prisma.project.deleteMany({ where: { account_id: { in: accountIds } } });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.$disconnect();
  });

  // === Buckets ===

  it("listForAccount returns only the caller's buckets", async () => {
    const page = await service.listForAccount(alice.account.id, {
      includeDeleted: false,
      limit: 50,
    });
    const ids = page.items.map((b) => b.id).sort();
    const expected = alice.buckets.map((b) => b.id).sort();
    expect(ids).toEqual(expected);
    expect(page.next_cursor).toBeNull();
  });

  it("paginates through buckets via opaque cursor", async () => {
    const first = await service.listForAccount(alice.account.id, {
      includeDeleted: false,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).toBeTruthy();

    const second = await service.listForAccount(alice.account.id, {
      includeDeleted: false,
      limit: 2,
      cursor: first.next_cursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.next_cursor).toBeNull();

    // No overlap, no missing rows.
    const seen = new Set([...first.items, ...second.items].map((b) => b.id));
    expect(seen.size).toBe(3);
  });

  it("rejects malformed cursor with 400 InvalidArgument", async () => {
    await expect(
      service.listForAccount(alice.account.id, {
        includeDeleted: false,
        limit: 10,
        cursor: "not-a-base64-payload!",
      }),
    ).rejects.toMatchObject({
      constructor: ControlPlaneError,
      code: "InvalidArgument",
    });
  });

  it("getOwned returns the caller's bucket", async () => {
    const bucket = await service.getOwned(alice.account.id, alice.buckets[0]!.id);
    expect(bucket.id).toBe(alice.buckets[0]!.id);
  });

  it("getOwned on someone else's bucket returns NotFound", async () => {
    await expect(service.getOwned(alice.account.id, bob.bucket.id)).rejects.toMatchObject({
      code: "NotFound",
    });
  });

  // === Objects ===

  it("listObjects returns only the requested bucket's objects", async () => {
    const targetBucket = alice.buckets[0]!;
    const page = await service.listObjects(alice.account.id, targetBucket.id, {
      includeDeleted: false,
      limit: 100,
    });
    expect(page.items.map((o) => o.bucket_id).every((id) => id === targetBucket.id)).toBe(true);
    expect(page.items.length).toBe(5);
  });

  it("listObjects honors prefix filter", async () => {
    const targetBucket = alice.buckets[0]!;
    const page = await service.listObjects(alice.account.id, targetBucket.id, {
      includeDeleted: false,
      limit: 100,
      prefix: "alice-bucket0/dir-A/",
    });
    expect(page.items.length).toBe(3);
    for (const o of page.items) {
      expect(o.s3_key.startsWith("alice-bucket0/dir-A/")).toBe(true);
    }
  });

  it("listObjects on someone else's bucket returns NotFound", async () => {
    await expect(
      service.listObjects(alice.account.id, bob.bucket.id, {
        includeDeleted: false,
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "NotFound" });
  });

  it("getObject crosses the bucket→project→account chain", async () => {
    const someAlice = alice.objects[0]!;
    const got = await service.getObject(alice.account.id, someAlice.id);
    expect(got.id).toBe(someAlice.id);

    // Bob can't read Alice's object even by id.
    await expect(service.getObject(bob.account.id, someAlice.id)).rejects.toMatchObject({
      code: "NotFound",
    });
  });

  // === Serialization ===

  it("serializeBucket stringifies BigInt and drops indexer provenance", () => {
    const json = serializeBucket(alice.buckets[0]!);
    expect(json).not.toHaveProperty("tx_digest");
    expect(json).not.toHaveProperty("event_payload");
    expect(typeof json.funding_pool_wal).toBe("string");
    // Round-trips through JSON without throwing.
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it("serializeObject base64-encodes seal_identity", () => {
    const json = serializeObject(alice.objects[0]!);
    expect(json.seal_identity_b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(typeof json.size_bytes).toBe("string");
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  // === Cursor codec ===

  it("encode/decode cursor round-trips and rejects bad payloads", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const tok = encodeCursor(id);
    expect(decodeCursor(tok).after).toBe(id);

    expect(() => decodeCursor("@@@invalid@@@")).toThrow();
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ v: 99, after: id }), "utf8").toString("base64url"))).toThrow();
  });
});

// === Seeding helpers ===

interface SeedOpts {
  bucketCount: number;
  objectsPerBucket: number;
}

async function seedFull(prisma: PrismaService, label: string, opts: SeedOpts) {
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

  const buckets: Bucket[] = [];
  const objects: S3Object[] = [];
  for (let b = 0; b < opts.bucketCount; b++) {
    const bucket = await prisma.bucket.create({
      data: {
        project_id: project.id,
        name: `bucket-${stamp}-${b}`,
        kraterion_bucket_object_id: `0x${b.toString(16).padStart(64, "0")}-${stamp}`,
        encryption_mode: b % 2 === 0 ? "private" : "public-read",
      },
    });
    buckets.push(bucket);

    for (let o = 0; o < opts.objectsPerBucket; o++) {
      const subdir = o < 3 ? "dir-A" : "dir-B";
      const key = `${label}-bucket${b}/${subdir}/file-${o}.bin`;
      const obj = await prisma.s3Object.create({
        data: {
          bucket_id: bucket.id,
          s3_key: key,
          size_bytes: BigInt(1024 * (o + 1)),
          content_type: "application/octet-stream",
          etag: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${o.toString().padStart(2, "0")}`,
          walrus_blob_id: `walrus-${b}-${o}-${stamp}`,
          shared_blob_object_id: `0xshared-${b}-${o}-${stamp}`,
          storage_end_epoch: 100 + o,
          seal_identity: Buffer.alloc(48, o),
        },
      });
      objects.push(obj);
    }
  }
  return { account, project, buckets, objects };
}

async function seedBob(prisma: PrismaService, label: string) {
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
  const bucket = await prisma.bucket.create({
    data: {
      project_id: project.id,
      name: `bucket-${stamp}-0`,
      kraterion_bucket_object_id: `0xbob-${stamp}`,
      encryption_mode: "private",
    },
  });
  return { account, project, bucket };
}
